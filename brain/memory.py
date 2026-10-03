"""
brain/memory — SwarmX V6.0 Brain Memory
=========================================
Lightweight JSONL memory store for the brain/ module layer.

CHANGES V5.9 vs V5.6:
  [FIX-01] _maybe_compact() atomic: write to .tmp then rename.
  [FIX-02] store() guarded with asyncio.Lock for concurrent async writers.
  [ENH-01] TTL-aware search(): stale entries skipped.
  [ENH-02] load_all() optional since_ts filter.
  [ENH-03] stats() returns entry count, disk bytes, oldest/newest timestamps.

CHANGES V6.0 (new):
  [FIX-03] asyncio.Lock initialization hardened: Lock is now created inside
    _get_lock() only if an event loop is running; falls back to threading.Lock
    for sync callers. The previous code created asyncio.Lock() at module import
    time, which in Python 3.10+ emits a DeprecationWarning when no loop is
    running and in 3.12+ raises RuntimeError in some configurations.
  [ENH-04] store_async() accepts optional `tags` list for future tag-based
    search, stored as metadata without breaking JSONL schema compatibility.
"""

from __future__ import annotations

import asyncio
import json
import os
import threading
import time
from pathlib import Path
from typing import Any

MAX_ENTRIES        = int(os.environ.get("SWARM_MEMORY_MAX_ENTRIES", "500"))
MEMORY_TTL_SECONDS = float(os.environ.get("SWARM_MEMORY_TTL_SECONDS", "0"))  # 0 = no TTL
def _get_memory_dir() -> Path:
    swarm_home = os.environ.get("SWARM_HOME")
    if swarm_home:
        return Path(swarm_home) / "memory"
    home_swarmx = Path.home() / ".swarmx"
    try:
        if home_swarmx.exists() and os.access(home_swarmx, os.W_OK):
            return home_swarmx / "memory"
        if not home_swarmx.exists() and os.access(Path.home(), os.W_OK):
            return home_swarmx / "memory"
    except Exception:
        pass
    repo_root = Path(__file__).resolve().parents[1]
    return repo_root / ".swarmx" / "memory"


def _get_memory_file() -> Path:
    return _get_memory_dir() / "brain_memory.jsonl"


# [FIX-03] Dual-mode locking:
#   async context → asyncio.Lock (created lazily inside a running loop)
#   sync context  → threading.Lock (always available)
_ASYNC_LOCK: asyncio.Lock | None = None
_SYNC_LOCK = threading.Lock()


def _get_async_lock() -> asyncio.Lock:
    """Return the module asyncio.Lock, creating it lazily inside the running loop."""
    global _ASYNC_LOCK
    if _ASYNC_LOCK is None:
        # Safe to create inside a running event loop only
        try:
            asyncio.get_running_loop()
        except RuntimeError as e:
            raise RuntimeError(
                "store_async() must be called from within an async context."
            ) from e
        _ASYNC_LOCK = asyncio.Lock()
    return _ASYNC_LOCK


def _ensure_dir() -> None:
    _get_memory_dir().mkdir(parents=True, exist_ok=True)


def store(
    task: str,
    result: str,
    improved: str | None = None,
    tags: list[str] | None = None,
) -> None:
    """
    Append a memory record. Auto-compacts when MAX_ENTRIES is exceeded.

    Sync-safe — uses threading.Lock. For async callers, prefer store_async().
    """
    _ensure_dir()
    record: dict[str, Any] = {
        "ts":       round(time.time(), 1),
        "task":     task[:500],
        "result":   result[:1000],
        "improved": improved[:500] if improved else None,
    }
    if tags:
        record["tags"] = tags[:10]  # [ENH-04] persist tags as metadata

    with _SYNC_LOCK:
        try:
            with open(_get_memory_file(), "a", encoding="utf-8") as f:
                f.write(json.dumps(record) + "\n")
            _maybe_compact()
        except Exception:
            pass


async def store_async(
    task: str,
    result: str,
    improved: str | None = None,
    tags: list[str] | None = None,
) -> None:
    """[FIX-03] Async-safe store — uses asyncio.Lock created inside the event loop."""
    lock = _get_async_lock()
    async with lock:
        # Offload file I/O to thread pool — keeps event loop unblocked
        await asyncio.to_thread(store, task, result, improved, tags)


def _maybe_compact() -> None:
    """
    [FIX-01] Atomic compact: write to .tmp then rename.
    Eliminates partial-write data loss on process kill mid-compact.
    """
    try:
        mem_dir = _get_memory_dir().resolve()
        mem_file = (mem_dir / "brain_memory.jsonl").resolve()
        if not mem_file.is_relative_to(mem_dir) or not mem_file.exists():
            return
        lines = mem_file.read_text(encoding="utf-8").splitlines()
        if len(lines) <= MAX_ENTRIES:
            return
        keep = lines[-MAX_ENTRIES:]
        tmp = (mem_dir / "brain_memory.jsonl.tmp").resolve()
        if not tmp.is_relative_to(mem_dir):
            return
        with open(tmp, "w", encoding="utf-8") as f:
            f.write("\n".join(keep) + "\n")
        os.replace(tmp, mem_file)  # atomic on POSIX
    except Exception:
        pass


def load_all(
    limit: int = 100,
    since_ts: float | None = None,
) -> list[dict[str, Any]]:
    """
    Return the most recent `limit` memory entries.

    [ENH-02] Optional `since_ts` filter: only return entries after the given
    Unix timestamp. Useful for evolution cycle replay.
    """
    _ensure_dir()
    try:
        lines = _get_memory_file().read_text(encoding="utf-8").splitlines()
        records: list[dict[str, Any]] = []
        for line in reversed(lines):
            line = line.strip()
            if not line:
                continue
            try:
                rec = json.loads(line)
            except Exception:
                continue
            if since_ts is not None and rec.get("ts", 0) < since_ts:
                continue
            records.append(rec)
            if len(records) >= limit:
                break
        return records
    except Exception:
        return []


def search(query: str, top_k: int = 3) -> list[dict[str, Any]]:
    """
    Linear scan for keyword-matching memory entries.
    Returns the `top_k` most recently stored relevant records.

    [ENH-01] TTL filter: when MEMORY_TTL_SECONDS > 0, entries older than
    the TTL are excluded from results to avoid stale context injection.
    """
    q_lower  = query.lower()
    keywords = [w for w in q_lower.split() if len(w) > 3]
    if not keywords:
        return load_all(top_k)

    ttl_cutoff = (time.time() - MEMORY_TTL_SECONDS) if MEMORY_TTL_SECONDS > 0 else 0.0

    matches: list[dict[str, Any]] = []
    for record in load_all(limit=200):
        if ttl_cutoff and record.get("ts", 0) < ttl_cutoff:
            continue
        haystack = f"{record.get('task', '')} {record.get('result', '')}".lower()
        if any(kw in haystack for kw in keywords):
            matches.append(record)
            if len(matches) >= top_k:
                break
    return matches


def stats() -> dict[str, Any]:
    """
    [ENH-03] Return compact store stats for health checks and TUI.
    Returns: {entry_count, disk_bytes, oldest_ts, newest_ts}
    """
    _ensure_dir()
    try:
        mem_file = _get_memory_file()
        text  = mem_file.read_text(encoding="utf-8")
        lines = [line for line in text.splitlines() if line.strip()]
        tss: list[float] = []
        for line in lines:
            try:
                rec = json.loads(line)
                ts  = rec.get("ts")
                if ts:
                    tss.append(float(ts))
            except Exception:
                pass
        return {
            "entry_count": len(lines),
            "disk_bytes":  mem_file.stat().st_size if mem_file.exists() else 0,
            "oldest_ts":   min(tss) if tss else None,
            "newest_ts":   max(tss) if tss else None,
        }
    except Exception:
        return {"entry_count": 0, "disk_bytes": 0, "oldest_ts": None, "newest_ts": None}


def clear() -> None:
    """Remove all stored memory (for testing / maintenance)."""
    try:
        mem_file = _get_memory_file()
        if mem_file.exists():
            mem_file.unlink()
    except Exception:
        pass


def __getattr__(name: str) -> Any:
    if name == "MEMORY_DIR":
        return _get_memory_dir()
    if name == "MEMORY_FILE":
        return _get_memory_file()
    raise AttributeError(f"module '{__name__}' has no attribute '{name}'")
