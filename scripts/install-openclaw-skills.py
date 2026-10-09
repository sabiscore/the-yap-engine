#!/usr/bin/env python3
"""Safely install the reviewed repository OpenClaw skills into the managed skill root.

The default invocation validates the repository skill package without touching the
operator's OpenClaw state. --install adds missing skills only and refuses to
overwrite divergent operator-managed content. --check-installed verifies an
already-installed package. Runtime discovery still has to be confirmed with the
installed OpenClaw CLI.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE_ROOT = ROOT / "integrations" / "openclaw" / "skills"
REQUIRED_SKILLS = (
    "swarmx-creative-director",
    "swarmx-virality-critic",
    "swarmx-doctor",
    "swarmx-vision-storyboard",
    "swarmx-virality-cheatbook",
)
MAX_SKILL_BYTES = 40_000
NAME_RE = re.compile(r"^name:\s*([a-zA-Z0-9._-]+)\s*$", re.MULTILINE)
DESCRIPTION_RE = re.compile(r"^description:\s*\S.*$", re.MULTILINE)


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def load_skill(name: str) -> tuple[Path, bytes]:
    directory = SOURCE_ROOT / name
    skill_file = directory / "SKILL.md"
    if directory.is_symlink() or skill_file.is_symlink():
        raise ValueError(f"{name}: source skill paths must not be symlinks")
    resolved_dir = directory.resolve(strict=True)
    resolved_file = skill_file.resolve(strict=True)
    if resolved_dir.parent != SOURCE_ROOT.resolve(strict=True):
        raise ValueError(f"{name}: source skill directory escaped the approved root")
    if resolved_file.parent != resolved_dir or not resolved_file.is_file():
        raise ValueError(f"{name}: SKILL.md must be a regular file inside its skill directory")
    content = resolved_file.read_bytes()
    if len(content) > MAX_SKILL_BYTES:
        raise ValueError(f"{name}: SKILL.md exceeds OpenClaw's configured 40,000-byte ceiling")
    text = content.decode("utf-8")
    if not text.startswith("---\n"):
        raise ValueError(f"{name}: missing YAML frontmatter")
    _, separator, frontmatter_tail = text[4:].partition("\n---")
    if not separator:
        raise ValueError(f"{name}: unterminated YAML frontmatter")
    frontmatter = frontmatter_tail.split("\n", 1)[0] if False else text[4:].split("\n---", 1)[0]
    match = NAME_RE.search(frontmatter)
    if not match or match.group(1) != name:
        actual = match.group(1) if match else "missing"
        raise ValueError(f"{name}: frontmatter name must match directory name (found {actual})")
    if not DESCRIPTION_RE.search(frontmatter):
        raise ValueError(f"{name}: frontmatter description is required")
    return resolved_file, content


def state_skills_root() -> Path:
    configured = os.environ.get("OPENCLAW_STATE_DIR", "").strip()
    state_root = Path(configured).expanduser() if configured else Path.home() / ".openclaw"
    return state_root.resolve() / "skills"


def verify_source() -> list[dict[str, str]]:
    records: list[dict[str, str]] = []
    for name in REQUIRED_SKILLS:
        _, content = load_skill(name)
        records.append({"name": name, "sha256": sha256(content), "state": "source_valid"})
    return records


def check_installed(records: list[dict[str, str]], skills_root: Path) -> list[str]:
    errors: list[str] = []
    for record in records:
        target_dir = skills_root / record["name"]
        target_file = target_dir / "SKILL.md"
        if target_dir.is_symlink() or target_file.is_symlink():
            errors.append(f"{record['name']}: installed skill path must not be a symlink")
            continue
        try:
            content = target_file.read_bytes()
        except OSError:
            errors.append(f"{record['name']}: not installed at {target_file}")
            continue
        if sha256(content) != record["sha256"]:
            errors.append(f"{record['name']}: installed SKILL.md differs from the repository-approved copy")
    return errors


def install_missing(records: list[dict[str, str]], skills_root: Path) -> tuple[list[str], list[str]]:
    installed: list[str] = []
    errors: list[str] = []
    if skills_root.is_symlink():
        return installed, ["managed skills root must not be a symlink"]
    skills_root.mkdir(parents=True, exist_ok=True)
    resolved_root = skills_root.resolve(strict=True)

    for record in records:
        name = record["name"]
        source_file, content = load_skill(name)
        target_dir = skills_root / name
        target_file = target_dir / "SKILL.md"
        if target_dir.is_symlink() or target_file.is_symlink():
            errors.append(f"{name}: target skill path must not be a symlink")
            continue
        try:
            target_dir.mkdir(exist_ok=True)
            if target_dir.resolve(strict=True).parent != resolved_root:
                errors.append(f"{name}: target directory escaped the managed skills root")
                continue
            if target_file.exists():
                if target_file.read_bytes() == content:
                    installed.append(f"{name}: already current")
                else:
                    errors.append(f"{name}: existing managed SKILL.md differs; inspect and reconcile it manually (not overwritten)")
                continue
            # Exclusive creation ensures an existing operator file is never overwritten.
            try:
                with target_file.open("xb") as handle:
                    handle.write(content)
            except FileExistsError:
                current = target_file.read_bytes()
                if current == content:
                    installed.append(f"{name}: already current")
                else:
                    errors.append(f"{name}: target appeared during install and differs; not overwritten")
                continue
            installed.append(f"{name}: installed (sha256 {record['sha256']})")
        except OSError as error:
            errors.append(f"{name}: install failed ({type(error).__name__})")
    return installed, errors


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--install", action="store_true", help="install missing skills into OPENCLAW_STATE_DIR/skills or ~/.openclaw/skills")
    mode.add_argument("--check-installed", action="store_true", help="verify installed skill bytes match repository sources")
    args = parser.parse_args()

    try:
        records = verify_source()
    except (OSError, UnicodeError, ValueError) as error:
        print(json.dumps({"ok": False, "errors": [str(error)]}, indent=2))
        return 2

    result: dict[str, object] = {"ok": True, "skills": records}
    errors: list[str] = []
    skills_root = state_skills_root()

    if args.check_installed:
        errors.extend(check_installed(records, skills_root))
        result["operation"] = "check_installed"
        result["destination"] = str(skills_root)
    elif args.install:
        installed, install_errors = install_missing(records, skills_root)
        errors.extend(install_errors)
        result["operation"] = "install_missing_only"
        result["destination"] = str(skills_root)
        result["results"] = installed
    else:
        result["operation"] = "source_check_only"

    result["ok"] = not errors
    if errors:
        result["errors"] = errors
    print(json.dumps(result, indent=2))
    return 0 if not errors else 2


if __name__ == "__main__":
    raise SystemExit(main())
