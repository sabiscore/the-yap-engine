"""Regression tests for the non-destructive OpenClaw managed-skill installer."""
from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path

SCRIPTS_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SCRIPTS_DIR))

import importlib.util  # noqa: E402

INSTALLER_PATH = SCRIPTS_DIR / "install-openclaw-skills.py"
SPEC = importlib.util.spec_from_file_location("install_openclaw_skills", INSTALLER_PATH)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError("Could not load managed-skill installer for tests")
installer = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = installer
SPEC.loader.exec_module(installer)


class ManagedSkillInstallerTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory(prefix="openclaw-skill-installer-")
        self.skills_root = Path(self.temp_dir.name) / "state" / "skills"
        self.records = installer.verify_source()

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def test_repository_skill_package_has_five_valid_sources(self) -> None:
        self.assertEqual(
            {record["name"] for record in self.records},
            set(installer.REQUIRED_SKILLS),
        )
        self.assertEqual(len(self.records), 5)
        self.assertTrue(all(len(record["sha256"]) == 64 for record in self.records))

    def test_install_is_idempotent_and_installed_bytes_match_source(self) -> None:
        installed, errors = installer.install_missing(self.records, self.skills_root)
        self.assertEqual(errors, [])
        self.assertEqual(len(installed), 5)
        self.assertEqual(installer.check_installed(self.records, self.skills_root), [])

        second_install, second_errors = installer.install_missing(self.records, self.skills_root)
        self.assertEqual(second_errors, [])
        self.assertTrue(all("already current" in record for record in second_install))
        self.assertEqual(installer.check_installed(self.records, self.skills_root), [])

    def test_divergent_operator_managed_skill_is_never_overwritten(self) -> None:
        _, first_errors = installer.install_missing(self.records, self.skills_root)
        self.assertEqual(first_errors, [])
        target = self.skills_root / installer.REQUIRED_SKILLS[0] / "SKILL.md"
        original = target.read_bytes()
        operator_copy = original + b"\n# Operator-local customization\n"
        target.write_bytes(operator_copy)

        installed, errors = installer.install_missing(self.records, self.skills_root)
        self.assertEqual(target.read_bytes(), operator_copy)
        self.assertTrue(any("not overwritten" in error for error in errors))
        self.assertTrue(any(installer.REQUIRED_SKILLS[0] in error for error in errors))
        self.assertTrue(installed)

    def test_check_installed_reports_missing_files_without_creating_them(self) -> None:
        errors = installer.check_installed(self.records, self.skills_root)
        self.assertEqual(len(errors), 5)
        self.assertFalse(self.skills_root.exists())


if __name__ == "__main__":
    unittest.main()
