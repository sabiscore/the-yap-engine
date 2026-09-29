"""
swarmx.llm — Triadic Model Dispatch Engine
================================================

Maps agent roles → model assignments per routing.yaml / swarmx.defaults.yaml.

Triad:
  phi4-mini      — Orchestrator    · routing, classification, fast evaluation
  deepseek-r1:7b — Reasoning Engine · planning, architecture, logic chains
  qwen2.5-coder  — Execution Engine · code generation, tool-use, agentic tasks

v4.2 CHANGES vs v4.1:
  [LLM-NEW-01] with_retry() exponential backoff decorator applied to
               _ollama_generate and _ollama_generate_stream — handles transient
               URLError, TimeoutError, ConnectionError with configurable
               max_retries=3 and base_backoff=1.0s (doubles per attempt)
  [LLM-ENH-09] GenerateResult extended with retry_count, vram_warning, and
               quant_level fields — surfaced in telemetry and JSON output
  [LLM-ENH-10] _load_vertical_config() loader reads configs/verticals/*.yaml
               for per-vertical constraint overrides; _detect_vertical_context()
               merges loaded config into vertical constraint injection

v4.1 CHANGES vs v4.0:
  [FIX-01] _compress_prompt() section-key detection: strip trailing colon before
           lookup — prevents TASK / PLAN sections from falling through to PREAMBLE
           bucket when written as "TASK:" in prompts
  [FIX-02] _proposer_solver_loop() now guards n_candidates ≥ 1 and returns early
           with a deterministic fallback if evaluator.rank_outputs() raises — stops
           silent empty-string returns swallowed by upstream callers
  [FIX-03] generate() inject_mcp guard used set comprehension over frozenset which
           silently excluded aliases (perf-optimizer vs performance-optimizer);
           now uses `role_l in _CODE_ROLES` which already normalises via frozenset
  [FIX-04] _ollama_generate_stream() did not record latency or write telemetry —
           only _ollama_generate() did. Latency recording now happens in stream path
  [FIX-05] _cache_key() used sha256[:24] which is 24 hex chars (96-bit); promoted
           to [:32] (128-bit) to reduce collision probability in shared cache dirs
  [FIX-06] _ESCALATION_CHAIN had no key for bare "deepseek-r1" (without ":7b" tag);
           added alias entry so models pulled without tag still resolve correctly
  [FIX-07] deterministic_response() cut prompt at word 24 but str.split() on a
           multi-line prompt produced unstable digests; now takes first 120 chars
  [FIX-08] prompt_for_task() converted task.__dict__ which fails on dataclasses
           using __slots__; uses dataclasses.asdict() with fallback to __dict__
  [FIX-09] _detect_vertical_context() FIRS/CBN regex matched too broadly on stack
           keys; narrowed to explicit token list so unrelated payloads don't trigger
  [ENH-01] GenerateResult gains `cache_key` field — allows callers to invalidate
           specific entries without iterating the whole cache directory
  [ENH-02] _load_memory_digest() now respects routing.yaml memory_injection.max_age_hours
           when SWARM_HOME has a routing.yaml; silently falls back to 24h default
  [ENH-03] _adversarial_critique() now sets num_predict=256 (was unbounded in
           _ollama_generate default 4096) — keeps critic passes fast / deterministic
  [ENH-04] Added `tool-agent` and `refactor-agent` to _CODE_ROLES frozenset (added
           to triadic_dispatch in routing.yaml v4.0 but missing from llm.py set)
  [ENH-05] Added `zk-architect`, `ml-ops-engineer`, `compliance-auditor` to
           _REASON_ROLES frozenset (same gap — in routing.yaml, absent in llm.py)
  [ENH-06] Streaming path now passes top_p to Ollama options (was missing)
  [ENH-07] _detect_vertical_context() adds Effect-TS / effect stack signal so
           TaxBridge prompts that reference effect-ts get fintech constraints
  [ENH-08] New helper generate_batch() for parallel non-blocking fan-out across
           multiple prompts (uses concurrent.futures.ThreadPoolExecutor) — required
           by cmd_solve tournament path that calls code model N times sequentially
"""

from __future__ import annotations

import concurrent.futures
import hashlib
import json
import os
import time
from collections.abc import Callable
from dataclasses import dataclass, field
from functools import wraps
from pathlib import Path
from typing import Any
from urllib import request
from urllib.error import URLError

import structlog

from .config import SwarmConfig
from .providers.gemini import enabled_for_role as gemini_enabled_for_role, generate as gemini_generate

_log = structlog.get_logger("swarmx.llm")


# ── Retry decorator (v4.2 [LLM-NEW-01]) ─────────────────────────────────────
def with_retry(max_retries: int = 3, base_backoff: float = 1.0):
    """Exponential backoff retry for transient Ollama network errors.

    Retries on URLError, TimeoutError, ConnectionError only.
    Hard failures (e.g. bad JSON, empty model) propagate immediately.
    backoff = base_backoff * 2^attempt (1s, 2s, 4s for default settings).
    """
    def decorator(func: Callable) -> Callable:
        @wraps(func)
        def wrapper(*args: Any, **kwargs: Any) -> Any:
            last_exc: Exception | None = None
            for attempt in range(max_retries + 1):
                try:
                    return func(*args, **kwargs)
                except (URLError, TimeoutError, ConnectionError) as exc:
                    last_exc = exc
                    if attempt == max_retries:
                        break
                    sleep_time = base_backoff * (2 ** attempt)
                    _log.warning(
                        "llm.retry",
                        attempt=attempt + 1,
                        max_retries=max_retries,
                        exc_type=type(exc).__name__,
                        exc=str(exc),
                        sleep_s=round(sleep_time, 1),
                    )
                    time.sleep(sleep_time)
            raise last_exc  # type: ignore[misc]
        return wrapper
    return decorator


# ── Result dataclass (v4.0 [LLM-10] · extended v4.2 [LLM-ENH-09]) ──────────
@dataclass
class GenerateResult:
    """Structured result from a generate() call."""
    text: str
    model_used: str
    role: str
    elapsed_ms: int
    escalation_path: list[str] = field(default_factory=list)
    skill_tags: list[str] = field(default_factory=list)
    fitness_score: float = 0.0
    from_cache: bool = False
    adversarial_critique: str = ""
    cache_key: str = ""          # [ENH-01] expose for targeted cache invalidation
    retry_count: int = 0         # [LLM-ENH-09] v4.2 — retries consumed before success
    vram_warning: bool = False   # [LLM-ENH-09] v4.2 — True if VRAM near ceiling
    quant_level: str = "unknown" # [LLM-ENH-09] v4.2 — model quantisation hint

    def __str__(self) -> str:
        return self.text


@dataclass
class ModelChoice:
    name: str
    kind: str
    reason: str


# ── Response cache (v4.0 [LLM-12]) ──────────────────────────────────────────
_CACHE_ENABLED = os.environ.get("SWARM_LLM_CACHE", "0") == "1"
_CACHE_TTL_S   = int(os.environ.get("SWARM_LLM_CACHE_TTL", "3600"))


def _cache_key(model: str, prompt: str) -> str:
    # [FIX-05] promoted from 24 to 32 hex chars (128-bit) for lower collision rate
    digest = hashlib.sha256(f"{model}::{prompt}".encode()).hexdigest()[:32]
    return digest


def _cache_get(key: str, home: Path) -> str | None:
    if not _CACHE_ENABLED:
        return None
    cache_dir = home / "llm_cache"
    cache_file = cache_dir / f"{key}.json"
    if not cache_file.exists():
        return None
    try:
        d = json.loads(cache_file.read_text())
        age = time.time() - d.get("ts", 0)
        if age > _CACHE_TTL_S:
            cache_file.unlink(missing_ok=True)
            return None
        return d.get("response", "")
    except Exception:
        return None


def _cache_set(key: str, response: str, home: Path) -> None:
    if not _CACHE_ENABLED:
        return
    try:
        cache_dir = home / "llm_cache"
        cache_dir.mkdir(parents=True, exist_ok=True)
        (cache_dir / f"{key}.json").write_text(
            json.dumps({"ts": time.time(), "response": response}),
            encoding="utf-8",
        )
    except Exception:
        pass


def cache_invalidate(cache_key_str: str, home: Path | None = None) -> bool:
    """Invalidate a specific cache entry by its key string. Returns True if deleted."""
    home = home or Path(os.environ.get("SWARM_HOME", Path.home() / ".swarmx"))
    cache_file = home / "llm_cache" / f"{cache_key_str}.json"
    if cache_file.exists():
        try:
            cache_file.unlink(missing_ok=True)
            return True
        except Exception:
            return False
    return False


# ── Rolling P95 latency tracker (v4.0 [LLM-03]) ─────────────────────────────
_LATENCY_HISTORY: dict[str, list[float]] = {}


def _latency_window() -> int:
    """
    Read the rolling latency window size from bundle defaults.

    Authoritative source: configs/swarmx.defaults.yaml observability.latency_window
    (default 50, same as orchestration/orchestrator.py).

    [FIX] Replaces the hardcoded _LATENCY_WINDOW = 20 constant that diverged
    from the orchestration layer (config-driven at 50), creating a split
    observation window where the same P95 latency stat would differ by 2.5x
    depending on which execution path was used.
    """
    try:
        from .config import _bundle_defaults
        val = _bundle_defaults().get("observability", {}).get("latency_window", 50)
        return max(1, int(val))
    except Exception:
        return 50


_LATENCY_WINDOW: int = _latency_window()

def _record_latency(model: str, elapsed_ms: float) -> None:
    hist = _LATENCY_HISTORY.setdefault(model, [])
    hist.append(elapsed_ms)
    if len(hist) > _LATENCY_WINDOW:
        hist.pop(0)


def _p95_latency(model: str) -> float:
    hist = _LATENCY_HISTORY.get(model, [])
    if not hist:
        return 0.0
    s = sorted(hist)
    return s[int(len(s) * 0.95)]


# ── Role → model mapping ──────────────────────────────────────────────────────
_CODE_ROLES: frozenset[str] = frozenset({
    "backend-engineer", "data-engineer", "frontend-architect", "design-critic",
    "security-reviewer", "performance-optimizer", "release-manager",
    "refactor-agent",   # [ENH-04] was missing from v4.0
    "tool-agent",       # [ENH-04] was missing from v4.0
    "test-generator", "mcp-toolsmith", "benchmark-analyst", "prompt-architect",
    "qa-evaluator", "producer", "reviewer", "skill-developer", "skill-librarian",
    "skill-curator", "environment-governor", "perf-optimizer",
})

_REASON_ROLES: frozenset[str] = frozenset({
    "strategist", "chief-architect", "workflow-composer", "risk-sentinel",
    "research-analyst", "evaluator", "tournament-judge", "context-researcher",
    "subagent-coordinator", "evolver", "security-auditor", "incident-commander",
    "zk-architect",      # [ENH-05] was missing from v4.0
    "ml-ops-engineer",   # [ENH-05] was missing from v4.0
    "compliance-auditor",# [ENH-05] was missing from v4.0
})

_ROUTER_ROLES: frozenset[str] = frozenset({
    "memory-curator", "workflow-router", "skill-sentinel", "skill-check",
})


def local_models(cfg: SwarmConfig | None = None) -> dict[str, str]:
    cfg = cfg or SwarmConfig()
    return {
        "router":  cfg.model_fast,
        "reason":  cfg.model_reason,
        "code":    cfg.model_code,
        "default": cfg.model or cfg.model_code or cfg.model_fast,
    }


def choose_model(
    role: str,
    task: str,
    risk: str | None = None,
    cfg: SwarmConfig | None = None,
) -> ModelChoice:
    """Select model from role name and task keywords.

    Priority:
      1. Explicit SWARM_MODEL override
      2. Risk escalation (high/critical → reasoning engine)
      3. Role-based dispatch from triadic_dispatch catalog
      4. Task keyword signals
      5. Default: Phi-4-mini
    """
    cfg    = cfg or SwarmConfig()
    role_l = role.lower()
    task_l = task.lower()
    risk_l = (risk or "").lower()

    if cfg.model and role_l not in _ROUTER_ROLES:
        return ModelChoice(cfg.model, "default", "explicit model override")

    if risk_l in {"high", "critical"} and role_l not in _CODE_ROLES:
        return ModelChoice(
            cfg.model_reason, "reason",
            "high-risk task → reasoning engine for safety planning",
        )

    if role_l in _CODE_ROLES or any(k in task_l for k in (
        "implement", "patch", "refactor", "architecture", "frontend", "backend",
        "security", "performance", "release", "benchmark", "prompt", "incident",
        "code", "build", "deploy", "test", "fix", "debug", "scaffold", "generate",
        "schema", "migration", "webhook", "middleware", "plugin", "component",
        "tool_call", "mcp", "agentic", "instrument", "circuit",
    )):
        return ModelChoice(
            cfg.model_code, "code",
            "deep generation / structured code task → qwen-worker",  # [V5.9-FIX-01]
        )

    if role_l in _REASON_ROLES or any(k in task_l for k in (
        "plan", "strategy", "reason", "analyse", "analyze", "design",
        "evaluate", "decide", "compare", "risk", "logic", "research",
        "architecture", "causal", "simulate", "propose", "audit",
        "compliance", "zk", "ml_design",
    )):
        return ModelChoice(
            cfg.model_reason, "reason",
            "planning / logic chain task → deepseek-reasoner",  # [V5.9-FIX-01]
        )

    return ModelChoice(cfg.model_fast, "router", "routing / summary / default → phi4-fast")  # [V5.9-FIX-01]


def choose_model_for_task(task: Any, cfg: SwarmConfig | None = None) -> ModelChoice:
    """Select model for a TaskItem, honouring the planner's model_hint when set."""
    cfg  = cfg or SwarmConfig()
    hint = getattr(task, "model_hint", None)
    if hint == "code":
        return ModelChoice(cfg.model_code,   "code",   "model_hint=code → qwen-worker")       # [V5.9-FIX-01]
    if hint == "reason":
        return ModelChoice(cfg.model_reason, "reason", "model_hint=reason → deepseek-reasoner")  # [V5.9-FIX-01]
    if hint in {"router", "fast"}:
        return ModelChoice(cfg.model_fast,   "router", "model_hint=router → phi4-fast")       # [V5.9-FIX-01]
    owner  = getattr(task, "owner",  "") or ""
    detail = getattr(task, "detail", "") or ""
    risk   = getattr(getattr(task, "risk", None), "value", None)
    return choose_model(owner, detail, risk=risk, cfg=cfg)


# ── Per-model configuration ───────────────────────────────────────────────────
# Model keys include both the short Ollama tag (e.g., "phi4-mini") and the
# longer variants that appear when GGUF files are registered via Modelfile or
# direct Ollama pull.  Lookup uses startswith() so any prefix match resolves.
#
# GGUF file → expected Ollama tag mapping (from ~/llm-local/gguf/):
#   microsoft_Phi-4-mini-instruct-Q8_0.gguf  → phi4-mini  (or phi4-mini-instruct)
#   DeepSeek-R1-Distill-Qwen-7B-Q5_K_M.gguf → deepseek-r1:7b
#   Qwen2.5-Coder-7B-Instruct-Q5_K_M.gguf   → qwen2.5-coder  (or qwen2.5-coder:7b)
_MODEL_TEMPERATURES: dict[str, float] = {
    # Canonical tags (V5.9+) — [V5.9-FIX-01]
    "phi4-fast":                        0.20,
    "phi4-worker":                      0.20,
    "deepseek-reasoner":                0.40,
    "deepseek-critic":                  0.40,
    "qwen-worker":                      0.15,
    "qwen-supervisor":                  0.15,
    # Legacy aliases (V5.8 and earlier)
    # Phi-4-mini variants (microsoft_Phi-4-mini-instruct-Q8_0.gguf)
    "phi4-mini":                        0.20,
    "phi4-mini-instruct":               0.20,
    "phi4:mini":                        0.20,
    "microsoft-phi4-mini-instruct":     0.20,  # alias when GGUF registered with microsoft_ prefix
    "microsoft_phi-4-mini-instruct":    0.20,
    # DeepSeek-R1 variants
    "deepseek-r1":                 0.40,
    "deepseek-r1:7b":              0.40,
    "deepseek-r1-distill-qwen:7b": 0.40,
    "deepseek-r1-distill-qwen-7b": 0.40,
    # Qwen2.5-Coder variants
    "qwen2.5-coder":               0.15,
    "qwen2.5-coder:7b":            0.15,
    "qwen2.5-coder:7b-instruct":   0.15,
    "qwen2.5-coder-7b-instruct":   0.15,
}
_MODEL_TOP_P: dict[str, float] = {
    # Canonical tags (V5.9+) — [V5.9-FIX-01]
    "phi4-fast":                        0.90,
    "phi4-worker":                      0.90,
    "deepseek-reasoner":                0.92,
    "deepseek-critic":                  0.92,
    "qwen-worker":                      0.95,
    "qwen-supervisor":                  0.95,
    # Legacy aliases
    # Phi-4-mini variants (microsoft_Phi-4-mini-instruct-Q8_0.gguf)
    "phi4-mini":                        0.90,
    "phi4-mini-instruct":               0.90,
    "phi4:mini":                        0.90,
    "microsoft-phi4-mini-instruct":     0.90,
    "microsoft_phi-4-mini-instruct":    0.90,
    # DeepSeek-R1 variants
    "deepseek-r1":                 0.92,
    "deepseek-r1:7b":              0.92,
    "deepseek-r1-distill-qwen:7b": 0.92,
    "deepseek-r1-distill-qwen-7b": 0.92,
    # Qwen2.5-Coder variants
    "qwen2.5-coder":               0.95,
    "qwen2.5-coder:7b":            0.95,
    "qwen2.5-coder:7b-instruct":   0.95,
    "qwen2.5-coder-7b-instruct":   0.95,
}
_MODEL_TIMEOUTS: dict[str, int] = {
    # Canonical tags (V5.9+) — [V5.9-FIX-01]
    "phi4-fast":                        30,
    "phi4-worker":                      30,
    "deepseek-reasoner":                300,
    "deepseek-critic":                  300,
    "qwen-worker":                      120,
    "qwen-supervisor":                  120,
    # Legacy aliases
    # Phi-4-mini — always-on orchestrator, fast (microsoft_Phi-4-mini-instruct-Q8_0.gguf)
    "phi4-mini":                        30,
    "phi4-mini-instruct":               30,
    "phi4:mini":                        30,
    "microsoft-phi4-mini-instruct":     30,
    "microsoft_phi-4-mini-instruct":    30,
    # DeepSeek-R1 — chain-of-thought, extended timeout
    "deepseek-r1":                 300,
    "deepseek-r1:7b":              300,
    "deepseek-r1-distill-qwen:7b": 300,
    "deepseek-r1-distill-qwen-7b": 300,
    # Qwen2.5-Coder — code generation, 2 min ceiling
    "qwen2.5-coder":               120,
    "qwen2.5-coder:7b":            120,
    "qwen2.5-coder:7b-instruct":   120,
    "qwen2.5-coder-7b-instruct":   120,
}
_MODEL_CTX_WINDOW: dict[str, int] = {
    # Canonical tags (V5.9+) — [V5.9-FIX-01]
    "phi4-fast":                        4096,
    "phi4-worker":                      4096,
    "deepseek-reasoner":                8192,
    "deepseek-critic":                  8192,
    "qwen-worker":                      8192,
    "qwen-supervisor":                  8192,
    # Legacy aliases
    # Phi-4-mini — 4K safe production ceiling (model supports 131072 natively)
    # (microsoft_Phi-4-mini-instruct-Q8_0.gguf)
    "phi4-mini":                        4096,
    "phi4-mini-instruct":               4096,
    "phi4:mini":                        4096,
    "microsoft-phi4-mini-instruct":     4096,
    "microsoft_phi-4-mini-instruct":    4096,
    # DeepSeek-R1:7B — 8K context
    "deepseek-r1":                 8192,
    "deepseek-r1:7b":              8192,
    "deepseek-r1-distill-qwen:7b": 8192,
    "deepseek-r1-distill-qwen-7b": 8192,
    # Qwen2.5-Coder:7B — 8K context
    "qwen2.5-coder":               8192,
    "qwen2.5-coder:7b":            8192,
    "qwen2.5-coder:7b-instruct":   8192,
    "qwen2.5-coder-7b-instruct":   8192,
}
_DEFAULT_TEMPERATURE = 0.20
_DEFAULT_TOP_P       = 0.92
_DEFAULT_TIMEOUT     = 120
_DEFAULT_CTX         = 4096


def _model_temperature(model: str) -> float:
    name = model.lower()
    for k, v in _MODEL_TEMPERATURES.items():
        if name == k or name.startswith(k):
            return v
    return _DEFAULT_TEMPERATURE


def _model_top_p(model: str) -> float:
    name = model.lower()
    for k, v in _MODEL_TOP_P.items():
        if name == k or name.startswith(k):
            return v
    return _DEFAULT_TOP_P


def _model_timeout(model: str, caller_timeout: int = 0) -> int:
    if caller_timeout > 0:
        return caller_timeout
    name = model.lower()
    for k, v in _MODEL_TIMEOUTS.items():
        if name == k or name.startswith(k):
            return v
    return _DEFAULT_TIMEOUT


def _model_ctx_window(model: str) -> int:
    name = model.lower()
    for k, v in _MODEL_CTX_WINDOW.items():
        if name == k or name.startswith(k):
            return v
    return _DEFAULT_CTX


# ── Escalation chain ──────────────────────────────────────────────────────────
_ESCALATION_CHAIN: dict[str, list[str]] = {
    # Phi-4-mini variants (microsoft_Phi-4-mini-instruct-Q8_0.gguf)
    "phi4-mini":                        ["phi4-mini", "deepseek-r1:7b", "qwen2.5-coder"],
    "phi4-mini-instruct":               ["phi4-mini", "deepseek-r1:7b", "qwen2.5-coder"],
    "phi4:mini":                        ["phi4-mini", "deepseek-r1:7b", "qwen2.5-coder"],
    "microsoft-phi4-mini-instruct":     ["phi4-mini", "deepseek-r1:7b", "qwen2.5-coder"],
    "microsoft_phi-4-mini-instruct":    ["phi4-mini", "deepseek-r1:7b", "qwen2.5-coder"],
    # DeepSeek-R1 variants (DeepSeek-R1-Distill-Qwen-7B-Q5_K_M.gguf)
    "deepseek-r1":                 ["deepseek-r1:7b", "qwen2.5-coder", "phi4-mini"],  # [FIX-06] bare alias
    "deepseek-r1:7b":              ["deepseek-r1:7b", "qwen2.5-coder", "phi4-mini"],
    "deepseek-r1-distill-qwen:7b": ["deepseek-r1:7b", "qwen2.5-coder", "phi4-mini"],
    "deepseek-r1-distill-qwen-7b": ["deepseek-r1:7b", "qwen2.5-coder", "phi4-mini"],
    # Qwen2.5-Coder variants (Qwen2.5-Coder-7B-Instruct-Q5_K_M.gguf)
    "qwen2.5-coder":               ["qwen2.5-coder", "deepseek-r1:7b", "phi4-mini"],
    "qwen2.5-coder:7b":            ["qwen2.5-coder", "deepseek-r1:7b", "phi4-mini"],
    "qwen2.5-coder:7b-instruct":   ["qwen2.5-coder", "deepseek-r1:7b", "phi4-mini"],
    "qwen2.5-coder-7b-instruct":   ["qwen2.5-coder", "deepseek-r1:7b", "phi4-mini"],
}


def _escalation_chain_for(model: str) -> list[str]:
    name = model.lower()
    for k, chain in _ESCALATION_CHAIN.items():
        if name == k or name.startswith(k):
            return chain
    return [model, "phi4-fast", "deepseek-reasoner", "qwen-worker"]  # [V5.9-FIX-01]


# ── Governance: per-tier output token ceiling ─────────────────────────────────
# [V5.9-ENH-05] Enforce governance.token_ceilings from config so no model tier
# produces unbounded output. Tier key matched by model tag prefix.
_TIER_KEY_MAP: tuple[tuple[str, str], ...] = (
    ("phi4-fast",          "fast"),
    ("phi4-mini",          "fast"),
    ("phi4-worker",        "worker"),
    ("qwen-worker",        "worker"),
    ("qwen-supervisor",    "supervisor"),
    ("deepseek-reasoner",  "reasoner"),
    ("deepseek-r1",        "reasoner"),
    ("deepseek-critic",    "critic"),
)

_DEFAULT_TOKEN_CEILINGS: dict[str, int] = {
    "fast":       512,
    "worker":    1024,
    "supervisor": 1536,
    "reasoner":  4096,
    "critic":    2048,
}


def _token_ceiling_for(model: str) -> int:
    """Return the governance token ceiling for a model (num_predict cap)."""
    try:
        from .config import _cfg  # local import to avoid circular at module load
        ceilings: dict = _cfg("governance", "token_ceilings", default=_DEFAULT_TOKEN_CEILINGS) or {}
    except Exception:
        ceilings = _DEFAULT_TOKEN_CEILINGS

    name = model.lower()
    for prefix, tier_key in _TIER_KEY_MAP:
        if name == prefix or name.startswith(prefix):
            ceiling = ceilings.get(tier_key)
            if ceiling is not None:
                return int(ceiling)
            return _DEFAULT_TOKEN_CEILINGS.get(tier_key, 4096)
    return int(ceilings.get("reasoner", 4096))


# ── Telemetry ─────────────────────────────────────────────────────────────────
def _emit_dispatch_telemetry(
    model: str,
    status: str,
    elapsed_ms: int,
    event: str = "dispatch",
    extra: dict[str, Any] | None = None,
) -> None:
    try:
        home = Path(os.environ.get("SWARM_HOME", Path.home() / ".swarmx"))
        log_dir = home / "controller"
        log_dir.mkdir(parents=True, exist_ok=True)
        ts = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        record: dict[str, Any] = {
            "ts": ts, "event": event, "model": model,
            "status": status, "elapsed_ms": elapsed_ms, "source": "llm.py",
        }
        if extra:
            record.update(extra)
        with open(log_dir / "dispatch.jsonl", "a", encoding="utf-8") as f:
            f.write(json.dumps(record) + "\n")
    except Exception:
        pass

    # [V5.9-ENH-05] Also persist to SQLite so build_v5_metrics() llm_routing_by_tier
    # counts are populated. Never blocks — any error is silently swallowed.
    try:
        from .storage import store_dispatch_telemetry  # lazy import to avoid circular
        _sqlite_home = Path(os.environ.get("SWARM_HOME", Path.home() / ".swarmx"))
        store_dispatch_telemetry(_sqlite_home, {
            "selected_model": model,
            "latency_ms": elapsed_ms,
            "event": event,
            **(extra or {}),
        })
    except Exception:
        pass


# ── Prompt compression (v4.0 [LLM-05]) ───────────────────────────────────────
def _compress_prompt(prompt: str, max_chars: int = 12000) -> str:
    """Trim prompt to fit within context window while preserving T1/T2 signals.

    Strategy:
    1. Split into sections (CONTEXT:, TASK:, PLAN:, etc.)
    2. Preserve TASK and PLAN sections fully (T1 signals)
    3. Trim CONTEXT and MEMORY sections from the middle (T3/T4)
    4. Ensure total stays under max_chars
    """
    if len(prompt) <= max_chars:
        return prompt

    lines = prompt.splitlines()
    sections: dict[str, list[str]] = {}
    current_section = "PREAMBLE"

    # [FIX-01] Strip trailing colon before matching section headers
    _KNOWN_SECTIONS = {"CONTEXT", "TASK", "PLAN", "MEMORY", "DOMAIN CONSTRAINTS"}
    for line in lines:
        # Normalise: strip trailing colon so "TASK:" → "TASK"
        upper = line.strip().upper().rstrip(":")
        if upper in _KNOWN_SECTIONS:
            current_section = upper
        sections.setdefault(current_section, []).append(line)

    # Priority: TASK > PLAN > DOMAIN CONSTRAINTS > PREAMBLE > CONTEXT > MEMORY
    priority_order = ["TASK", "PLAN", "DOMAIN CONSTRAINTS", "PREAMBLE", "CONTEXT", "MEMORY"]
    result_parts: list[str] = []
    budget = max_chars

    for section in priority_order:
        content = "\n".join(sections.get(section, []))
        if not content:
            continue
        if len(content) <= budget:
            result_parts.append(content)
            budget -= len(content)
        else:
            # Truncate this section to fit
            truncated = content[:budget - 50] + "\n[... compressed for context window ...]"
            result_parts.append(truncated)
            break

    return "\n\n".join(result_parts)


# ── Skill injection (v4.0 [LLM-08]) ──────────────────────────────────────────
def _load_skill_fragments(
    role: str,
    task: str,
    cfg: SwarmConfig | None = None,
) -> tuple[str, list[str]]:
    """Load matching skill fragments from the skill library.

    Returns (system_fragment, skill_tags_used).
    """
    cfg = cfg or SwarmConfig()
    home = Path(os.environ.get("SWARM_HOME", Path.home() / ".swarmx"))
    skill_dirs = [
        home / "skills",
        Path(os.environ.get("SWARM_ROOT", ".")) / "skills",
    ]
    task_lower = task.lower()
    role_lower = role.lower()
    fragments: list[str] = []
    tags: list[str] = []

    for skill_dir in skill_dirs:
        if not skill_dir.is_dir():
            continue
        for skill_file in sorted(skill_dir.glob("*.md"))[:10]:
            try:
                content = skill_file.read_text(encoding="utf-8")
                # Match by skill name or keywords
                skill_name = skill_file.stem.lower().replace("-", " ")
                if any(kw in task_lower or kw in role_lower
                       for kw in skill_name.split()):
                    # Extract first 300 chars as fragment
                    fragments.append(f"[Skill:{skill_file.stem}]\n{content[:300]}")
                    tags.append(skill_file.stem)
            except Exception:
                continue
        if fragments:
            break  # Use first matching skill dir

    if not fragments:
        return "", []

    return "\n\nSKILL LIBRARY CONTEXT:\n" + "\n---\n".join(fragments[:3]), tags


# ── MCP tool manifest injection (v4.0 [LLM-09]) ──────────────────────────────
def _load_mcp_tools(cfg: SwarmConfig | None = None) -> str:
    """Load available MCP tool names from .swarmx/tooling/ manifests."""
    home = Path(os.environ.get("SWARM_HOME", Path.home() / ".swarmx"))
    tooling_dir = home / "tooling"
    if not tooling_dir.is_dir():
        return ""
    tools: list[str] = []
    for mfile in sorted(tooling_dir.glob("*.json"))[:20]:
        try:
            d = json.loads(mfile.read_text())
            name = d.get("name") or mfile.stem
            url  = d.get("url") or d.get("endpoint") or ""
            tools.append(f"  - {name}: {url}")
        except Exception:
            continue
    if not tools:
        return ""
    return "\n\nAVAILABLE MCP TOOLS:\n" + "\n".join(tools)


# ── Memory digest injection (v4.0 [LLM-04] MemEvolve) ───────────────────────
def _load_memory_digest(cfg: SwarmConfig | None = None, max_lines: int = 10) -> str:
    """Load recent cross-run memory digest for MemEvolve context injection.

    [ENH-02] Respects routing.yaml memory_injection.max_age_hours when present.
    """
    home = Path(os.environ.get("SWARM_HOME", Path.home() / ".swarmx"))

    # Resolve max_age from routing.yaml if available
    max_age_hours = 24
    routing_yaml = Path(os.environ.get("SWARM_ROOT", ".")) / "configs" / "routing.yaml"
    if routing_yaml.exists():
        try:
            import yaml  # lazy — only needed if file present
            cfg_yaml = yaml.safe_load(routing_yaml.read_text()) or {}
            max_age_hours = (
                cfg_yaml.get("memory_injection", {}).get("max_age_hours", 24)
            )
            max_lines = (
                cfg_yaml.get("memory_injection", {}).get("max_lines", max_lines)
            )
        except Exception:
            pass

    memory_dir = home / "memory"
    if not memory_dir.is_dir():
        return ""
    mem_files = sorted(memory_dir.glob("*.jsonl"), key=lambda p: p.stat().st_mtime, reverse=True)
    if not mem_files:
        return ""

    # [ENH-02] Skip files older than max_age_hours
    import time as _t
    now_ts = _t.time()
    fresh_files = [
        p for p in mem_files
        if (now_ts - p.stat().st_mtime) < (max_age_hours * 3600)
    ]
    if not fresh_files:
        return ""

    lines: list[str] = []
    try:
        with open(fresh_files[0], encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line:
                    try:
                        d = json.loads(line)
                        summary = d.get("summary") or d.get("lesson") or d.get("content", "")
                        if summary:
                            lines.append(f"  • {str(summary)[:120]}")
                    except Exception:
                        pass
                if len(lines) >= max_lines:
                    break
    except Exception:
        return ""
    if not lines:
        return ""
    return "\n\nCROSS-RUN MEMORY (MemEvolve):\n" + "\n".join(lines)


# ── Adversarial self-check (v4.0 [LLM-11]) ───────────────────────────────────
def _adversarial_critique(
    response: str,
    prompt: str,
    model: str,
    cfg: SwarmConfig | None = None,
    timeout: int = 30,
) -> str:
    """Run a lightweight dual-axis adversarial self-check.

    Axis A: correctness + completeness + simplicity
    Axis B: mutation pressure (hostile optimizer resilience)

    Uses Phi-4-mini for fast critique. Returns critique string.
    Silently returns "" on failure — never blocks main path.
    """
    cfg = cfg or SwarmConfig()
    critique_prompt = (
        f"You are an adversarial critic. Evaluate this AI response:\n\n"
        f"ORIGINAL TASK (first 300 chars): {prompt[:300]}\n\n"
        f"RESPONSE TO CRITIQUE (first 600 chars): {response[:600]}\n\n"
        f"Axis A — Correctness/Completeness/Simplicity: What assumption is most likely wrong? "
        f"What edge case is unhandled? Is there a simpler version?\n"
        f"Axis B — Mutation Pressure: Is there ambiguity a hostile optimizer could exploit? "
        f"Does this hold if the most uncertain input is wrong?\n\n"
        f"Respond in ≤4 bullet points. Be ruthlessly concise."
    )
    try:
        return _ollama_generate(
            cfg.model_fast,
            critique_prompt,
            timeout=timeout,
            temperature=0.10,
            keep_alive=60,
            num_predict=256,  # [ENH-03] cap critic at 256 tokens — was 4096 default
        )
    except Exception:
        return ""


# ── Dr. Zero proposer-solver loop (v4.0 [LLM-06]) ───────────────────────────
def _proposer_solver_loop(
    prompt: str,
    model: str,
    system: str | None = None,
    timeout: int = 120,
    temperature: float | None = None,
    top_p: float | None = None,
    keep_alive: int = 0,
    n_candidates: int = 2,
) -> tuple[str, float]:
    """Generate N candidate responses and select fittest via rank_outputs().

    Data-free: no labelled training data required (Dr. Zero pattern).
    Returns (best_response, fitness_score).

    [FIX-02] Guards against n_candidates < 1 and evaluator exceptions.
    """
    from . import evaluator  # lazy import to avoid circular

    # [FIX-02] Guard: at least 1 candidate required
    n_candidates = max(1, n_candidates)

    candidates: list[dict[str, Any]] = []
    for i in range(n_candidates):
        # Slight temperature variation per candidate for diversity
        cand_temp = (temperature or _model_temperature(model)) + (i * 0.05)
        try:
            resp = _ollama_generate(
                model, prompt,
                system=system,
                timeout=timeout,
                temperature=min(cand_temp, 0.99),
                top_p=top_p,
                keep_alive=keep_alive,
            )
            if resp:  # [FIX-02] skip empty responses
                candidates.append({"output": resp, "candidate_id": i, "model": model})
        except Exception:
            continue

    if not candidates:
        # [FIX-02] Explicit fallback instead of silent empty string
        fallback = deterministic_response(prompt, model)
        return fallback, 0.0

    try:
        result = evaluator.rank_outputs(candidates)
    except Exception:
        # [FIX-02] evaluator failure → return first candidate
        return candidates[0]["output"], 0.5

    winner = result.get("winner") or {}
    best_output = winner.get("candidate", {}).get("output", "")
    fitness     = winner.get("total", 0.0)

    if not best_output:
        best_output = candidates[0]["output"]
        fitness = 0.5

    return best_output, fitness


# ── RoboPhD tournament (v4.0 [LLM-07]) ──────────────────────────────────────
def _tournament_generate(
    prompt: str,
    models: list[str],
    system: str | None = None,
    timeout: int = 120,
    keep_alive: int = 0,
) -> tuple[str, str, float]:
    """Multi-island tournament: each model is an island, fittest output wins.

    Returns (best_response, winning_model, fitness_score).
    """
    from . import evaluator  # lazy import

    candidates: list[dict[str, Any]] = []
    for model in models:
        try:
            t0 = time.monotonic()
            resp = _ollama_generate(
                model, prompt,
                system=system,
                timeout=timeout,
                temperature=_model_temperature(model),
                top_p=_model_top_p(model),
                keep_alive=keep_alive,
            )
            elapsed_ms = int((time.monotonic() - t0) * 1000)
            _record_latency(model, elapsed_ms)
            candidates.append({"output": resp, "model": model, "elapsed_ms": elapsed_ms})
        except Exception:
            continue

    if not candidates:
        return "", models[0] if models else "", 0.0

    result = evaluator.rank_outputs(candidates)
    winner = result.get("winner") or {}
    best_cand = winner.get("candidate", {})
    return best_cand.get("output", ""), best_cand.get("model", ""), winner.get("total", 0.0)


# ── Batch parallel generation (v4.1 [ENH-08]) ────────────────────────────────
def generate_batch(
    prompts: list[str],
    model: str,
    system: str | None = None,
    timeout: int = 120,
    cfg: SwarmConfig | None = None,
    max_workers: int = 3,
) -> list[GenerateResult]:
    """Fan-out generate() across multiple prompts in parallel.

    Uses ThreadPoolExecutor — Ollama is I/O bound so threads are appropriate.
    Results are returned in the same order as the input prompts.
    max_workers capped at 3 to respect 8 GB RAM discipline (only one heavy model
    should be loaded at a time; parallelism is meaningful only for Phi-4-mini).
    """
    _cfg = cfg or SwarmConfig()
    max_workers = min(max_workers, 3)

    def _call(p: str) -> GenerateResult:
        return generate(p, model=model, system=system, timeout=timeout, cfg=_cfg)

    with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as pool:
        futures = [pool.submit(_call, p) for p in prompts]
        return [f.result() for f in futures]


# ── Core HTTP dispatch ────────────────────────────────────────────────────────
@with_retry(max_retries=3, base_backoff=1.0)  # [LLM-NEW-01] transient error resilience
def _ollama_generate(
    model: str,
    prompt: str,
    system: str | None = None,
    timeout: int = 120,
    temperature: float | None = None,
    top_p: float | None = None,
    keep_alive: int = 0,
    num_predict: int = 4096,
) -> str:
    """Generate a response via the Ollama HTTP API."""
    # [V5.9-ENH-05] Apply governance token ceiling — caller's num_predict is
    # capped to the configured tier ceiling so no model produces unbounded output.
    _ceiling = _token_ceiling_for(model)
    num_predict = min(num_predict, _ceiling)

    home = Path(os.environ.get("SWARM_HOME", Path.home() / ".swarmx"))

    # Cache check
    ck = _cache_key(model, prompt)
    cached = _cache_get(ck, home)
    if cached is not None:
        return cached

    url = (
        os.environ.get("OLLAMA_HOST", "http://localhost:11434").rstrip("/")
        + "/api/generate"
    )
    effective_temp  = temperature if temperature is not None else _model_temperature(model)
    effective_top_p = top_p if top_p is not None else _model_top_p(model)

    payload: dict[str, Any] = {
        "model":      model,
        "prompt":     prompt,
        "stream":     False,
        "keep_alive": keep_alive,
        "options": {
            "temperature": effective_temp,
            "top_p":       effective_top_p,
            "num_predict": num_predict,
            "num_ctx":     _model_ctx_window(model),  # enforce context window from config
        },
    }
    if system:
        payload["system"] = system

    data = json.dumps(payload).encode("utf-8")
    req  = request.Request(
        url, data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    t0 = time.monotonic()
    with request.urlopen(req, timeout=timeout) as resp:
        body = json.loads(resp.read().decode("utf-8"))
    elapsed_ms = int((time.monotonic() - t0) * 1000)

    response_text = body.get("response", "").strip()

    # Record latency + cache
    _record_latency(model, elapsed_ms)
    _cache_set(ck, response_text, home)

    return response_text


@with_retry(max_retries=3, base_backoff=1.0)  # [LLM-NEW-01] transient error resilience
def _ollama_generate_stream(
    model: str,
    prompt: str,
    callback: Callable[[str], None],
    system: str | None = None,
    timeout: int = 120,
    temperature: float | None = None,
    top_p: float | None = None,  # [ENH-06] now accepted and passed through
    keep_alive: int = 0,
) -> str:
    """Streaming generation with per-token callback (v4.0 [LLM-02]).

    Returns the full accumulated response text.
    [FIX-04] Now records latency and emits telemetry (was missing in v4.0).
    [LLM-NEW-01] v4.2: wrapped in @with_retry for transient connection faults.
    """
    url = (
        os.environ.get("OLLAMA_HOST", "http://localhost:11434").rstrip("/")
        + "/api/generate"
    )
    effective_temp  = temperature if temperature is not None else _model_temperature(model)
    effective_top_p = top_p if top_p is not None else _model_top_p(model)  # [ENH-06]

    payload: dict[str, Any] = {
        "model":      model,
        "prompt":     prompt,
        "stream":     True,
        "keep_alive": keep_alive,
        "options":    {
            "temperature": effective_temp,
            "top_p":       effective_top_p,  # [ENH-06]
            "num_ctx":     _model_ctx_window(model),  # enforce context window from config
        },
    }
    if system:
        payload["system"] = system

    data = json.dumps(payload).encode("utf-8")
    req  = request.Request(
        url, data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    full_response = ""
    t0 = time.monotonic()  # [FIX-04] start timer before streaming begins

    with request.urlopen(req, timeout=timeout) as resp:
        for raw_line in resp:
            line = raw_line.decode("utf-8").strip()
            if not line:
                continue
            try:
                chunk = json.loads(line)
                token = chunk.get("response", "")
                if token:
                    callback(token)
                    full_response += token
                if chunk.get("done"):
                    break
            except Exception:
                continue

    # [FIX-04] Record latency and emit telemetry for streaming path
    elapsed_ms = int((time.monotonic() - t0) * 1000)
    _record_latency(model, elapsed_ms)
    _emit_dispatch_telemetry(model, "success", elapsed_ms, event="stream_dispatch")

    return full_response


def _detect_quant_level(model: str) -> str:
    """Infer quantisation tier from model tag or GGUF filename convention.

    Returns one of: Q8_0 | Q5_K_M | Q4_K_M | Q4_0 | fp16 | unknown
    Used to populate GenerateResult.quant_level for telemetry.
    """
    name = model.lower()
    for marker in ("q8_0", "q5_k_m", "q5_k", "q4_k_m", "q4_k", "q4_0", "fp16", "f16"):
        if marker in name:
            return marker.upper()
    # Infer from known GGUF filenames for the triad
    if "phi4-mini" in name or "phi4:mini" in name or (
        "microsoft" in name and "phi" in name
    ):
        return "Q8_0"    # microsoft_Phi-4-mini-instruct-Q8_0.gguf
    if "deepseek-r1" in name:
        return "Q5_K_M"  # DeepSeek-R1-Distill-Qwen-7B-Q5_K_M.gguf
    if "qwen2.5-coder" in name:
        return "Q5_K_M"  # Qwen2.5-Coder-7B-Instruct-Q5_K_M.gguf
    return "unknown"


def deterministic_response(prompt: str, model: str) -> str:
    """Fallback when all escalation candidates are exhausted.

    Returns a stable, non-empty string seeded from the prompt digest so
    callers always receive a usable (if minimal) response rather than an
    empty string or NameError.  [FIX-07] Uses first 120 chars for stable
    digest — str.split() on multi-line prompts produced unstable hashes.
    """
    digest = prompt[:120].replace("\n", " ").strip()
    return (
        f"[deterministic:{model}] Proposed next action: inspect the repo, "
        f"implement the smallest safe improvement, and validate it. "
        f"Context digest: {digest}"
    )


# ── Main generate() ──────────────────────────────────────────────────────────
def generate(
    prompt: str,
    model: str | None = None,
    system: str | None = None,
    provider: str | None = None,
    timeout: int = 0,
    cfg: SwarmConfig | None = None,
    keep_alive: int = 0,
    role: str = "",
    # v4.0 new params
    use_proposer_solver: bool = False,
    use_tournament: bool = False,
    use_adversarial_check: bool = False,
    inject_skills: bool = True,
    inject_memory: bool = True,
    inject_mcp: bool = False,
    compress_prompt: bool = True,
    stream_callback: Callable[[str], None] | None = None,
    extra_context: dict[str, Any] | None = None,
) -> GenerateResult:
    """Generate from the configured LLM provider with full v4.1 feature set.

    Returns GenerateResult (not just str) for full metadata access.
    For backward compatibility: str(result) returns the text.
    """
    _cfg      = cfg or SwarmConfig()
    provider  = (provider or _cfg.provider or "ollama").lower()
    model     = model or _cfg.model or _cfg.model_code or _cfg.model_fast or "phi4-mini"
    escalation_path: list[str] = []

    if provider in {"deterministic", "mock", "local"}:
        text = deterministic_response(prompt, model)
        return GenerateResult(text=text, model_used=model, role=role, elapsed_ms=0)

    # Optional Gemini routing is role-scoped and fail-closed. If Gemini is
    # unavailable, the normal local Ollama escalation chain remains authoritative.
    if gemini_enabled_for_role(role):
        gemini_model = os.environ.get("SWARMX_GEMINI_MODEL", "").strip()
        try:
            t0 = time.monotonic()
            text = gemini_generate(
                model=gemini_model,
                prompt=prompt,
                system=system,
                timeout=int(os.environ.get("SWARMX_GEMINI_TIMEOUT_MS", "45000")) / 1000,
                max_output_tokens=int(os.environ.get("SWARMX_GEMINI_MAX_OUTPUT_TOKENS", "1024")),
                temperature=_model_temperature(model),
            )
            elapsed_ms = int((time.monotonic() - t0) * 1000)
            _record_latency("gemini:" + gemini_model, elapsed_ms)
            return GenerateResult(
                text=text,
                model_used="gemini:" + gemini_model,
                role=role,
                elapsed_ms=elapsed_ms,
                escalation_path=["gemini:" + gemini_model],
                cache_key=_cache_key("gemini:" + gemini_model, prompt),
                quant_level="provider-managed",
            )
        except Exception as exc:
            _log.warning(
                "llm.gemini_fallback",
                role=role,
                model=gemini_model,
                exc_type=type(exc).__name__,
                exc=str(exc),
            )

    # Build system prompt enrichments
    system_parts: list[str] = []
    skill_tags: list[str] = []

    if inject_skills and role:
        skill_frag, skill_tags = _load_skill_fragments(role, prompt, _cfg)
        if skill_frag:
            system_parts.append(skill_frag)

    if inject_memory:
        mem_digest = _load_memory_digest(_cfg)
        if mem_digest:
            system_parts.append(mem_digest)

    # [FIX-03] use `role_l in _CODE_ROLES` — consistent with frozenset membership check
    role_l = role.lower()
    if inject_mcp and role_l in _CODE_ROLES:
        mcp_tools = _load_mcp_tools(_cfg)
        if mcp_tools:
            system_parts.append(mcp_tools)

    if extra_context:
        ctx_lines = [f"  {k}: {v}" for k, v in extra_context.items()]
        system_parts.append("EXTRA CONTEXT:\n" + "\n".join(ctx_lines))

    effective_system = (system or "") + ("\n".join(system_parts) if system_parts else "")
    if not effective_system:
        effective_system = None  # type: ignore[assignment]

    # Compress prompt if needed
    if compress_prompt:
        prompt = _compress_prompt(prompt, max_chars=_model_ctx_window(model) * 3)

    # Compute cache key for result metadata [ENH-01]
    ck = _cache_key(model, prompt)

    # Tournament mode
    if use_tournament:
        all_models = [_cfg.model_code, _cfg.model_reason, _cfg.model_fast]
        all_models = [m for m in all_models if m]
        t0 = time.monotonic()
        text, winning_model, fitness = _tournament_generate(
            prompt, all_models,
            system=effective_system,
            timeout=_model_timeout(model, timeout),
            keep_alive=keep_alive,
        )
        elapsed_ms = int((time.monotonic() - t0) * 1000)
        _emit_dispatch_telemetry(winning_model, "success", elapsed_ms,
                                  extra={"tournament": True})
        result = GenerateResult(
            text=text, model_used=winning_model, role=role,
            elapsed_ms=elapsed_ms, escalation_path=[winning_model],
            skill_tags=skill_tags, fitness_score=fitness, cache_key=ck,
            quant_level=_detect_quant_level(winning_model),
        )
        if use_adversarial_check and text:
            result.adversarial_critique = _adversarial_critique(text, prompt, winning_model, _cfg)
        return result

    # Standard escalation chain
    chain    = _escalation_chain_for(model)
    t_total  = time.monotonic()

    for candidate in chain:
        effective_timeout = _model_timeout(candidate, timeout)
        escalation_path.append(candidate)
        t_start = time.monotonic()
        try:
            if stream_callback is not None:
                text = _ollama_generate_stream(
                    candidate, prompt,
                    callback=stream_callback,
                    system=effective_system,
                    timeout=effective_timeout,
                    temperature=_model_temperature(candidate),
                    top_p=_model_top_p(candidate),  # [ENH-06]
                    keep_alive=keep_alive,
                )
                fitness = 0.0
                # [FIX-04] streaming path already records latency internally
            elif use_proposer_solver:
                text, fitness = _proposer_solver_loop(
                    prompt, candidate,
                    system=effective_system,
                    timeout=effective_timeout,
                    temperature=_model_temperature(candidate),
                    top_p=_model_top_p(candidate),
                    keep_alive=keep_alive,
                )
            else:
                text = _ollama_generate(
                    candidate, prompt,
                    system=effective_system,
                    timeout=effective_timeout,
                    temperature=_model_temperature(candidate),
                    top_p=_model_top_p(candidate),
                    keep_alive=keep_alive,
                )
                fitness = 0.0

            elapsed_ms = int((time.monotonic() - t_start) * 1000)
            if stream_callback is None:  # [FIX-04] avoid double-recording for stream path
                _record_latency(candidate, elapsed_ms)
                _emit_dispatch_telemetry(candidate, "success", elapsed_ms)

            if candidate != model:
                _log.warning("llm.model_escalation", requested=model, used=candidate)

            result = GenerateResult(
                text=text, model_used=candidate, role=role,
                elapsed_ms=int((time.monotonic() - t_total) * 1000),
                escalation_path=escalation_path, skill_tags=skill_tags,
                fitness_score=fitness, cache_key=ck,
                quant_level=_detect_quant_level(candidate),
            )
            if use_adversarial_check and text:
                result.adversarial_critique = _adversarial_critique(
                    text, prompt, candidate, _cfg, timeout=30)
            return result

        except Exception as exc:
            elapsed_ms = int((time.monotonic() - t_start) * 1000)
            if stream_callback is None:
                _record_latency(candidate, elapsed_ms)
                _emit_dispatch_telemetry(candidate, "error", elapsed_ms)
            _log.error("llm.generate_error", provider=provider, model=candidate, exc_type=type(exc).__name__, exc=str(exc))
            continue

    _log.warning("llm.all_candidates_exhausted", model=model)
    text = deterministic_response(prompt, model)
    return GenerateResult(
        text=text, model_used=model, role=role,
        elapsed_ms=int((time.monotonic() - t_total) * 1000),
        escalation_path=escalation_path, skill_tags=skill_tags,
        fitness_score=0.0, cache_key=ck,
    )


# ── Prompt builder ────────────────────────────────────────────────────────────
def prompt_for_task(
    task: dict[str, Any] | Any,
    plan: dict[str, Any],
    repo_summary: dict[str, Any] | None = None,
    memory_summary: dict[str, Any] | None = None,
) -> str:
    """Build a structured prompt for a task, injecting Scar vertical signals."""
    # [FIX-08] Use dataclasses.asdict() for dataclass instances, fallback to __dict__
    if isinstance(task, dict):
        task_map = task
    else:
        try:
            import dataclasses
            if dataclasses.is_dataclass(task):
                task_map = dataclasses.asdict(task)
            else:
                task_map = getattr(task, "__dict__", {})
        except Exception:
            task_map = getattr(task, "__dict__", {})

    repo_summary   = repo_summary or {}
    memory_summary = memory_summary or {}
    task_skills    = ", ".join(task_map.get("skill_tags", []) or [])
    plan_notes     = " | ".join(plan.get("notes", []) or [])
    frameworks     = ", ".join(plan.get("frameworks", []) or [])
    approval       = "yes" if plan.get("approval_required") else "no"

    mem_digest = {
        k: v for k, v in memory_summary.items()
        if k in {"memories", "kind_counts", "top_tags", "latest_kind", "latest_summary"}
    } if memory_summary else {}

    vertical_ctx = _detect_vertical_context(repo_summary, plan)

    return (
        "You are an autonomous agent in a bounded production swarm.\n"
        f"Task: {task_map.get('title', '')}\n"
        f"Owner: {task_map.get('owner', '')}\n"
        f"Detail: {task_map.get('detail', '')}\n"
        f"Risk: {task_map.get('risk', 'low')}\n"
        f"Skill tags: {task_skills}\n"
        f"Workflow: {plan.get('workflow', '')}\n"
        f"Stack: {', '.join(plan.get('stack', []) or [])}\n"
        f"Framework preferences: {frameworks}\n"
        f"Approval required: {approval}\n"
        f"Plan notes: {plan_notes}\n"
        f"Known repo signals: {json.dumps(repo_summary, ensure_ascii=False)}\n"
        f"Cross-run memory digest: {json.dumps(mem_digest, ensure_ascii=False)}\n"
        f"{vertical_ctx}"
        "Return a concise implementation plan, execution steps, risks, and validation checks."
    )


def _detect_vertical_context(
    repo_summary: dict[str, Any],
    plan: dict[str, Any],
) -> str:
    """Inject Scar's vertical-specific context into prompts.

    [FIX-09] Narrowed TaxBridge token list to avoid false positives.
    [ENH-07] Effect-TS stack signal triggers fintech constraints for TaxBridge.
    [LLM-ENH-10] v4.2: merges per-vertical YAML config overrides when present.
    """
    stack_str = " ".join(str(v) for v in repo_summary.values()).lower()
    stack_str += " " + " ".join(plan.get("stack", [])).lower()

    lines: list[str] = []

    # [FIX-09] Explicit token match instead of broad substring match
    _taxbridge_tokens = {"taxbridge", "nrs", "firs", "cbn", "ndpc", "nibss",
                         "paystack", "remita", "e-invoice", "invoice-irn", "effect-ts"}
    if any(tok in stack_str.split() or tok in stack_str for tok in _taxbridge_tokens):
        # [LLM-ENH-10] Load per-vertical config overrides
        vert_cfg = _load_vertical_config("taxbridge")
        extra_constraints = vert_cfg.get("extra_constraints", [])
        base = (
            "VERTICAL [TaxBridge · NRS Compliance]:\n"
            "  · All monetary values: Prisma Decimal, never float\n"
            "  · NRS e-invoice fields: IRN, FIRS TIN, BVN/KYC tier required\n"
            "  · Webhook verification: SHA-512 HMAC (Paystack standard)\n"
            "  · Idempotency keys on all payment mutations\n"
            "  · NDPC data residency: PII must stay in Nigeria-region storage\n"
            "  · NRS Phase-2 deadline: flag any schema gap immediately\n"
        )
        if extra_constraints:
            for constraint in extra_constraints:
                base += f"  · {constraint}\n"
        lines.append(base)

    if any(sig in stack_str for sig in ("sabiscore", "ml observ", "sports intel", "otel", "opentelemetry")):
        vert_cfg = _load_vertical_config("sabiscore")
        extra_constraints = vert_cfg.get("extra_constraints", [])
        base = (
            "VERTICAL [SabiScore · ML Observability]:\n"
            "  · OpenTelemetry spans on all ML pipeline stages\n"
            "  · Model performance metrics: precision/recall logged per prediction\n"
            "  · BullMQ job tracing: job_id → span_id correlation required\n"
        )
        if extra_constraints:
            for constraint in extra_constraints:
                base += f"  · {constraint}\n"
        lines.append(base)

    if any(sig in stack_str for sig in ("hashablanca", "zk", "zero-knowledge", "blockchain", "zkp")):
        vert_cfg = _load_vertical_config("hashablanca")
        extra_constraints = vert_cfg.get("extra_constraints", [])
        base = (
            "VERTICAL [Hashablanca · ZK Infrastructure]:\n"
            "  · ZK proof generation: never expose witness data in logs\n"
            "  · Circuit constraints must be formally verified before deploy\n"
            "  · Key management: HSM-backed, never in-process\n"
            "  · Commitment schemes: use Pedersen or Poseidon, not SHA-256 for ZK paths\n"
        )
        if extra_constraints:
            for constraint in extra_constraints:
                base += f"  · {constraint}\n"
        lines.append(base)

    if any(sig in stack_str for sig in ("fintech", "banking", "wallet", "payment", "kyc")):
        lines.append(
            "VERTICAL [Generic Fintech · Compliance]:\n"
            "  · PII fields: encrypted at rest (AES-256-GCM minimum)\n"
            "  · Audit log: append-only, tamper-evident\n"
            "  · Rate limiting: per-user per-endpoint (not just global)\n"
        )

    if not lines:
        return ""

    return "\nDOMAIN CONSTRAINTS (must honour in all output):\n" + "".join(lines) + "\n"


# ── Vertical config loader (v4.2 [LLM-ENH-10]) ───────────────────────────────
def _load_vertical_config(vertical: str) -> dict[str, Any]:
    """Load per-vertical constraint overrides from configs/verticals/<vertical>.yaml.

    Returns empty dict if file is absent or unparseable — callers should always
    apply defaults and treat the loaded config as an additive overlay only.
    """
    root = Path(os.environ.get("SWARM_ROOT", "."))
    cfg_path = root / "configs" / "verticals" / f"{vertical.lower()}.yaml"
    if not cfg_path.exists():
        return {}
    try:
        import yaml  # lazy — only if verticals config dir exists
        loaded = yaml.safe_load(cfg_path.read_text(encoding="utf-8")) or {}
        return loaded if isinstance(loaded, dict) else {}
    except Exception:
        return {}
