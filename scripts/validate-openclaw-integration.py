#!/usr/bin/env python3
"""Static validation for the OpenClaw reference integration.

This intentionally avoids importing OpenClaw. It checks repository-owned
invariants and prevents accidental weakening of the local-first boundary.
"""
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CONFIG = ROOT / "integrations/openclaw/config.json5"
DIRECTIVE = ROOT / "docs/OPENCLAW-SWARMXQ-APEX17-DIRECTIVE.md"
SKILLS = ROOT / "integrations/openclaw/skills"
REQUIRED_SKILLS = {
    "swarmx-creative-director",
    "swarmx-virality-critic",
    "swarmx-doctor",
    "swarmx-vision-storyboard",
    "swarmx-virality-cheatbook",
}
REQUIRED_STRINGS = (
    'baseUrl: "http://127.0.0.1:11434"',
    'primary: "ollama/qwen3:8b"',
    'fallbacks: ["ollama/qwen3:4b"]',
    'primary: "ollama/qwen3-vl:4b"',
    'localModelLean: true',
    'mode: "non-main"',
    'profile: "coding"',
    '"browser"',
    '"web_search"',
    '"gateway"',
    'maxConcurrent: 1',
)
FORBIDDEN_DIRECT_RUNTIME = (
    "ollama serve",
    "OLLAMA_NUM_PARALLEL=2",
    "OLLAMA_NUM_PARALLEL=3",
)


def main() -> int:
    errors: list[str] = []
    config = CONFIG.read_text(encoding="utf-8")
    directive = DIRECTIVE.read_text(encoding="utf-8")

    for needle in REQUIRED_STRINGS:
        if needle not in config:
            errors.append(f"missing OpenClaw config invariant: {needle}")

    for needle in FORBIDDEN_DIRECT_RUNTIME:
        if needle in config or needle in directive:
            errors.append(f"forbidden runtime override found: {needle}")

    if "ModelOrchestrator" not in directive:
        errors.append("directive must name ModelOrchestrator as the production inference authority")
    if "SINGLE-7B" not in directive:
        errors.append("directive must preserve SINGLE-7B")
    if "production deploy" not in directive.lower():
        errors.append("directive must retain human-gated production deployment")

    for name in REQUIRED_SKILLS:
        if not (SKILLS / name / "SKILL.md").is_file():
            errors.append(f"missing OpenClaw skill: {name}")

    # The reference config is JSON5, so strict JSON parsing is intentionally not used.
    if "apiKey:" in config and 'apiKey: "ollama-local"' not in config:
        errors.append("unexpected Ollama credential material in reference config")

    print(json.dumps({"ok": not errors, "errors": errors}, indent=2))
    return 0 if not errors else 2


if __name__ == "__main__":
    raise SystemExit(main())
