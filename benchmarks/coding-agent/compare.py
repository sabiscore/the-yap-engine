#!/usr/bin/env python3
"""Compare two coding-agent benchmark result files without collapsing them to one score."""

from __future__ import annotations

import argparse
import json
from pathlib import Path


def load(path: Path) -> dict:
    with path.open(encoding="utf-8") as fh:
        return json.load(fh)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("baseline", type=Path)
    parser.add_argument("candidate", type=Path)
    args = parser.parse_args()

    base = load(args.baseline)
    cand = load(args.candidate)

    def metric(obj: dict, key: str) -> float:
        return float(obj.get("summary", {}).get(key, 0.0))

    rows = [
        ("pass_rate", metric(base, "pass_rate"), metric(cand, "pass_rate")),
        ("first_pass_rate", metric(base, "first_pass_rate"), metric(cand, "first_pass_rate")),
        ("tool_call_success_rate", metric(base, "tool_call_success_rate"), metric(cand, "tool_call_success_rate")),
        ("validation_failure_rate", metric(base, "validation_failure_rate"), metric(cand, "validation_failure_rate")),
        ("mean_latency_ms", metric(base, "mean_latency_ms"), metric(cand, "mean_latency_ms")),
        ("min_available_mb", metric(base, "min_available_mb"), metric(cand, "min_available_mb")),
        ("max_resident_model_mb", metric(base, "max_resident_model_mb"), metric(cand, "max_resident_model_mb")),
    ]

    print("metric                         baseline        candidate        delta")
    print("-" * 74)
    for name, b, c in rows:
        print(f"{name:30} {b:12.2f} {c:15.2f} {c-b:12.2f}")

    print("\nModel:")
    print(f"  baseline:  {base.get('model')}")
    print(f"  candidate: {cand.get('model')}")
    print("\nThis report is descriptive. Promotion remains a separate engineering gate.")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
