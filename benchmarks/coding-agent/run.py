#!/usr/bin/env python3
"""Bounded local Ollama coding-agent benchmark.

The model only receives read/search/write tools plus a fixed validation tool.
Each case executes inside a temporary fixture workspace.
"""
from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import tempfile
import threading
import time
import urllib.request
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
CASES = Path(__file__).with_name("cases.jsonl")


def http_json(base: str, path: str, payload: dict[str, Any] | None = None, timeout: int = 120) -> dict[str, Any]:
    data = None if payload is None else json.dumps(payload).encode()
    req = urllib.request.Request(
        base.rstrip("/") + path,
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST" if data else "GET",
    )
    with urllib.request.urlopen(req, timeout=timeout) as response:
        return json.loads(response.read().decode())


def load_cases() -> list[dict[str, Any]]:
    return [json.loads(x) for x in CASES.read_text(encoding="utf-8").splitlines() if x.strip()]


def safe_path(root: Path, relative: str) -> Path:
    candidate = (root / relative).resolve()
    if candidate != root.resolve() and root.resolve() not in candidate.parents:
        raise ValueError(f"path escapes benchmark workspace: {relative}")
    return candidate


def mem_available_mb() -> float | None:
    try:
        for line in Path("/proc/meminfo").read_text().splitlines():
            if line.startswith("MemAvailable:"):
                return round(int(line.split()[1]) / 1024, 2)
    except (FileNotFoundError, ValueError):
        return None
    return None


def ollama_ps(base: str) -> list[dict[str, Any]]:
    try:
        return http_json(base, "/api/ps", timeout=10).get("models", [])
    except Exception:
        return []


class Sampler:
    def __init__(self, base: str) -> None:
        self.base = base
        self.min_mem: float | None = None
        self.max_resident_mb = 0.0
        self.stop = threading.Event()
        self.thread = threading.Thread(target=self._sample, daemon=True)

    def _sample(self) -> None:
        while not self.stop.is_set():
            mem = mem_available_mb()
            resident = sum(float(m.get("size", 0)) / (1024 * 1024) for m in ollama_ps(self.base))
            if mem is not None:
                self.min_mem = mem if self.min_mem is None else min(self.min_mem, mem)
            self.max_resident_mb = max(self.max_resident_mb, resident)
            self.stop.wait(0.25)

    def start(self) -> None:
        self.thread.start()

    def close(self) -> None:
        self.stop.set()
        self.thread.join(timeout=2)


def validation(case: dict[str, Any], workspace: Path) -> tuple[bool, str]:
    logs: list[str] = []
    for command in case["validation"]:
        proc = subprocess.run(
            command,
            cwd=workspace,
            shell=True,
            text=True,
            capture_output=True,
            timeout=30,
            env={**os.environ, "PYTHONPATH": str(workspace)},
        )
        logs.append(f"$ {command}\n{proc.stdout}{proc.stderr}")
        if proc.returncode:
            return False, "\n".join(logs)
    return True, "\n".join(logs)


def tools() -> list[dict[str, Any]]:
    def fn(name: str, description: str, properties: dict[str, Any], required: list[str]) -> dict[str, Any]:
        return {"type": "function", "function": {"name": name, "description": description,
                "parameters": {"type": "object", "properties": properties, "required": required}}}
    return [
        fn("list_files", "List files in the fixture workspace.", {"prefix": {"type": "string"}}, []),
        fn("read_file", "Read a UTF-8 file in the fixture workspace.", {"path": {"type": "string"}}, ["path"]),
        fn("search_repo", "Find files containing a literal string.", {"query": {"type": "string"}}, ["query"]),
        fn("write_file", "Write a UTF-8 file inside the fixture workspace.", {"path": {"type": "string"}, "content": {"type": "string"}}, ["path", "content"]),
        fn("run_validation", "Run the case's fixed validation commands. Accepts no command text.", {}, []),
    ]


def call_tool(name: str, args: dict[str, Any], root: Path, case: dict[str, Any]) -> str:
    if name == "list_files":
        prefix = str(args.get("prefix", ""))
        return json.dumps(sorted(str(p.relative_to(root)) for p in root.rglob("*") if p.is_file() and str(p.relative_to(root)).startswith(prefix)))
    if name == "read_file":
        return safe_path(root, str(args["path"])).read_text(encoding="utf-8")
    if name == "search_repo":
        query = str(args["query"])
        found = []
        for p in root.rglob("*"):
            if not p.is_file() or p.stat().st_size > 256_000:
                continue
            try:
                if query in p.read_text(encoding="utf-8"):
                    found.append(str(p.relative_to(root)))
            except UnicodeDecodeError:
                pass
        return json.dumps(found)
    if name == "write_file":
        p = safe_path(root, str(args["path"]))
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(str(args["content"]), encoding="utf-8")
        return json.dumps({"ok": True})
    if name == "run_validation":
        ok, output = validation(case, root)
        return json.dumps({"ok": ok, "output": output[-12000:]})
    raise ValueError(f"unknown tool: {name}")


def prompt(case: dict[str, Any]) -> str:
    return f"""You are a constrained local coding agent working in an isolated fixture.

Task: {case["task"]}

Success condition: {case["success"]}

Rules:
- Inspect before editing.
- Make the smallest correct change.
- Preserve public APIs.
- Do not add dependencies or unrelated files.
- Use the provided tools; never invent tool results.
- Run the fixed validation command before finishing.
- If validation fails, make one focused correction.
- Stop after the task passes or after 8 tool rounds.
"""


def run_case(model: str, base: str, case: dict[str, Any], timeout: int) -> dict[str, Any]:
    root = Path(tempfile.mkdtemp(prefix="swarmx-bench-"))
    for rel, content in case["files"].items():
        p = safe_path(root, rel)
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(content, encoding="utf-8")

    messages: list[dict[str, Any]] = [{"role": "system", "content": prompt(case)}]
    rounds = calls = errors = malformed = validation_runs = validation_failures = 0
    first_pass: bool | None = None
    final_text = ""
    started = time.perf_counter()
    sampler = Sampler(base)
    sampler.start()
    try:
        while rounds < 8:
            rounds += 1
            response = http_json(base, "/api/chat", {
                "model": model,
                "messages": messages,
                "tools": tools(),
                "stream": False,
                "options": {"temperature": 0, "num_ctx": 6144, "num_predict": 1536},
            }, timeout)
            message = response.get("message", {})
            final_text = message.get("content", "") or ""
            calls_now = message.get("tool_calls") or []
            if not calls_now:
                break
            messages.append(message)
            for call in calls_now:
                calls += 1
                fn = call.get("function") or {}
                name = fn.get("name")
                args = fn.get("arguments", {})
                if isinstance(args, str):
                    try:
                        args = json.loads(args)
                    except json.JSONDecodeError:
                        malformed += 1
                        errors += 1
                        messages.append({"role": "tool", "tool_name": name or "unknown", "content": json.dumps({"error": "invalid JSON arguments"})})
                        continue
                if not isinstance(args, dict) or not name:
                    malformed += 1
                    errors += 1
                    messages.append({"role": "tool", "tool_name": name or "unknown", "content": json.dumps({"error": "malformed tool call"})})
                    continue
                try:
                    result = call_tool(name, args, root, case)
                    if name == "run_validation":
                        validation_runs += 1
                        ok = bool(json.loads(result).get("ok"))
                        if first_pass is None:
                            first_pass = ok
                        validation_failures += int(not ok)
                except Exception as exc:
                    errors += 1
                    result = json.dumps({"error": str(exc)})
                messages.append({"role": "tool", "tool_name": name, "content": result})

        passed, output = validation(case, root)
        if first_pass is None:
            first_pass = passed
        if validation_runs == 0:
            validation_runs = 1
        return {
            "id": case["id"], "model": model, "pass": passed, "first_pass": bool(first_pass),
            "tool_rounds": rounds, "tool_calls": calls, "tool_errors": errors,
            "malformed_tool_calls": malformed, "validation_runs": validation_runs,
            "validation_failures": validation_failures, "latency_ms": round((time.perf_counter()-started)*1000, 2),
            "prompt_eval_count": response.get("prompt_eval_count", 0), "eval_count": response.get("eval_count", 0),
            "eval_duration_ns": response.get("eval_duration", 0), "final_response": final_text[-8000:],
            "validation": output[-12000:], "min_available_mb": sampler.min_mem,
            "max_resident_model_mb": round(sampler.max_resident_mb, 2),
        }
    finally:
        sampler.close()
        shutil.rmtree(root, ignore_errors=True)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", required=True)
    parser.add_argument("--base-url", default=os.environ.get("OLLAMA_HOST", "http://127.0.0.1:11434"))
    parser.add_argument("--case", action="append")
    parser.add_argument("--repeat", type=int, default=1)
    parser.add_argument("--timeout", type=int, default=300)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()

    cases = load_cases()
    if args.case:
        selected = set(args.case)
        cases = [c for c in cases if c["id"] in selected]
    if not cases:
        raise SystemExit("No benchmark cases selected.")

    model_meta = http_json(args.base_url, "/api/show", {"name": args.model}, timeout=30)
    results = []
    for repeat in range(max(args.repeat, 1)):
        for case in cases:
            result = run_case(args.model, args.base_url, case, args.timeout)
            result["repeat"] = repeat + 1
            results.append(result)
            print(f'{case["id"]}: {"PASS" if result["pass"] else "FAIL"} {result["latency_ms"]:.0f}ms tools={result["tool_calls"]}')

    n = len(results)
    passed = sum(bool(r["pass"]) for r in results)
    first = sum(bool(r["first_pass"]) for r in results)
    total_tools = sum(r["tool_calls"] for r in results)
    malformed = sum(r["malformed_tool_calls"] for r in results)
    mems = [r["min_available_mb"] for r in results if r["min_available_mb"] is not None]
    payload = {
        "schema_version": 1,
        "timestamp_utc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "git_head": subprocess.run(["git","rev-parse","HEAD"], cwd=ROOT, text=True, capture_output=True).stdout.strip(),
        "model": model, "base_url": args.base_url, "model_show": model_meta,
        "summary": {
            "cases": n, "pass_rate": passed/n, "first_pass_rate": first/n,
            "tool_call_success_rate": 1-(malformed/total_tools) if total_tools else 1.0,
            "validation_failure_rate": sum(r["validation_failures"] for r in results)/n,
            "mean_latency_ms": sum(r["latency_ms"] for r in results)/n,
            "min_available_mb": min(mems) if mems else None,
            "max_resident_model_mb": max(r["max_resident_model_mb"] for r in results),
        },
        "results": results,
    }
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    print(json.dumps(payload["summary"], indent=2))
    return 0 if passed == n else 2


if __name__ == "__main__":
    raise SystemExit(main())
