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
DIRECTIVE_APEX21 = ROOT / "docs/OPENCLAW-SWARMXQ-APEX21-DIRECTIVE.md"
DIRECTIVE_APEX17 = ROOT / "docs/OPENCLAW-SWARMXQ-APEX17-DIRECTIVE.md"
SKILLS = ROOT / "integrations/openclaw/skills"
BRIDGE = ROOT / "integrations/openclaw/swarmx-bridge.ts"
BRIDGE_TESTS = ROOT / "apps/swarmx-api/__tests__/openclaw-bridge.test.ts"
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
BRIDGE_REQUIRED_STRINGS = (
    "validateVideoJobRequest",
    'loadEnv().SWARMX_API_URL',
    'readSecretEnv("SWARMX_VIDEO_API_TOKEN")',
    "AbortController",
    'redirect: "error"',
    "MAX_RESPONSE_BYTES",
    "MAX_WAIT_TIMEOUT_MS",
    "readManifestFromConfiguredRoot",
    "clientRequestId",
)
BRIDGE_TEST_REQUIRED_STRINGS = (
    "adds stable idempotency",
    "create requires auth",
    "streaming response limit",
    "times out a stalled API request",
    "outside configured artifact/export roots",
)

FORBIDDEN_DIRECT_RUNTIME = (
    "ollama serve",
    "OLLAMA_NUM_PARALLEL=2",
    "OLLAMA_NUM_PARALLEL=3",
)


def main() -> int:
    errors: list[str] = []
    config = CONFIG.read_text(encoding="utf-8")

    for needle in REQUIRED_STRINGS:
        if needle not in config:
            errors.append(f"missing OpenClaw config invariant: {needle}")

    for needle in FORBIDDEN_DIRECT_RUNTIME:
        if needle in config:
            errors.append(f"forbidden runtime override found in config: {needle}")

    if not BRIDGE.is_file():
        errors.append("missing bounded OpenClaw-to-SwarmXQ bridge")
    else:
        bridge = BRIDGE.read_text(encoding="utf-8")
        for needle in BRIDGE_REQUIRED_STRINGS:
            if needle not in bridge:
                errors.append(f"bounded bridge is missing a required safety contract: {needle}")
        if 'process.env["SWARMX_VIDEO_API_TOKEN"]' in bridge:
            errors.append("bridge must use readSecretEnv() for the video write token")

    if not BRIDGE_TESTS.is_file():
        errors.append("missing OpenClaw bridge regression tests")
    else:
        bridge_tests = BRIDGE_TESTS.read_text(encoding="utf-8")
        for needle in BRIDGE_TEST_REQUIRED_STRINGS:
            if needle not in bridge_tests:
                errors.append(f"missing OpenClaw bridge regression coverage: {needle}")

    directives_to_check = [p for p in (DIRECTIVE_APEX21, DIRECTIVE_APEX17) if p.is_file()]
    if not directives_to_check:
        errors.append("no OpenClaw directive found in docs/")

    for directive_path in directives_to_check:
        directive = directive_path.read_text(encoding="utf-8")
        for needle in FORBIDDEN_DIRECT_RUNTIME:
            if needle in directive:
                errors.append(f"forbidden runtime override found in {directive_path.name}: {needle}")

        if "ModelOrchestrator" not in directive:
            errors.append(f"{directive_path.name} must name ModelOrchestrator as the production inference authority")
        if "SINGLE-7B" not in directive and "heavyweight local inference" not in directive.lower():
            errors.append(f"{directive_path.name} must preserve SINGLE-7B / serialized heavyweight inference")
        if "production deploy" not in directive.lower() and "deployment" not in directive.lower():
            errors.append(f"{directive_path.name} must retain human-gated production deployment")

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
