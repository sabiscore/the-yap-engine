"""Bounded Google Gemini adapter for optional agent routing.

Secrets are read only from GEMINI_API_KEY at call time. Provider limits,
model context, and quota policy are configuration concerns rather than
hard-coded assumptions.
"""

from __future__ import annotations

import json
import os
from urllib import request


class GeminiUnavailable(RuntimeError):
    """Raised when Gemini is not explicitly enabled/configured."""


def configured_roles() -> set[str]:
    return {
        item.strip().lower()
        for item in os.environ.get(
            "SWARMX_GEMINI_ROLES", "trend-discovery,scriptwriting"
        ).split(",")
        if item.strip()
    }


def enabled_for_role(role: str) -> bool:
    return (
        os.environ.get("SWARMX_GEMINI_ENABLED", "0") == "1"
        and bool(os.environ.get("GEMINI_API_KEY", "").strip())
        and bool(os.environ.get("SWARMX_GEMINI_MODEL", "").strip())
        and role.strip().lower() in configured_roles()
    )


def generate(
    *,
    model: str,
    prompt: str,
    system: str | None = None,
    timeout: int = 45,
    max_output_tokens: int = 1024,
    temperature: float | None = None,
) -> str:
    api_key = os.environ.get("GEMINI_API_KEY", "").strip()
    if not api_key:
        raise GeminiUnavailable("GEMINI_API_KEY is not configured")

    base_url = os.environ.get(
        "SWARMX_GEMINI_API_URL",
        "https://generativelanguage.googleapis.com/v1beta",
    ).rstrip("/")
    url = f"{base_url}/models/{model}:generateContent?key={api_key}"

    contents = [{"role": "user", "parts": [{"text": prompt}]}]
    payload: dict[str, object] = {"contents": contents}
    if system:
        payload["systemInstruction"] = {"parts": [{"text": system}]}

    generation_config: dict[str, object] = {
        "maxOutputTokens": max(1, int(max_output_tokens)),
    }
    if temperature is not None:
        generation_config["temperature"] = temperature
    payload["generationConfig"] = generation_config

    req = request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with request.urlopen(req, timeout=max(1, int(timeout))) as response:
        body = json.loads(response.read().decode("utf-8"))

    candidates = body.get("candidates") or []
    if not candidates:
        raise RuntimeError("Gemini returned no candidates")

    parts = (candidates[0].get("content") or {}).get("parts") or []
    text = "".join(
        str(part.get("text", ""))
        for part in parts
        if isinstance(part, dict)
    ).strip()
    if not text:
        raise RuntimeError("Gemini returned an empty response")
    return text
