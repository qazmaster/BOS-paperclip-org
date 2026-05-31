from __future__ import annotations

import shutil
import sys
import tempfile
import unittest
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_DIR))

import validate_handoff


SAMPLE_TERMS = {
    "README.md": "v1.4.1 BOS_Light_v1_4_1_CANONICAL_ORG.md python3 scripts/validate_handoff.py",
    "00_START_HERE_FOR_NEW_AI_AGENT.md": "v1.4.1 SKILL_HCO_ROUTING_CONTROL.md validation",
    "HANDOFF_PROMPT_FOR_NEW_AI_AGENT.md": "v1.4.1 A12-A20 validate_handoff.py",
    "BOS_M002_DEVELOPMENT_HANDOFF.md": "Canonical doctrine update v1.4.1",
    "HANDOFF_REAL_PAPERCLIP_IMPORT_TEST.md": "Canonical doctrine update v1.4.1 A12-A20",
    "docs/BOS_Light_v1_4_1_CANONICAL_ORG.md": "Div1.HCO Div6.External Package inventory",
    "docs/BOS_Light_v1_4_1_Function_Migration_Matrix.md": "v1.4.1 Div5 Div6",
    "docs/BOS_Light_v1_4_1_Tool_Permission_Matrix.md": "external Div3 Div6",
    "docs/BOS_Light_v1_4_1_Data_Contracts.md": "RoutingRequest ExternalIoRequest TrustLevel",
    "docs/BOS_Light_v1_4_1_Acceptance_Tests_A12_A20.md": "A12 A20 acceptance",
    "skills/SKILL_HCO_ROUTING_CONTROL.md": "Div1.HCO external IO Failure behavior",
    "skills/SKILL_EXTERNAL_IO_GATEWAY.md": "Div6.External quarantine Failure behavior",
    "skills/SKILL_KNOWLEDGE_QUARANTINE.md": "Div5 quarantine Failure behavior",
    "skills/SKILL_DIV5_AUTORESEARCH.md": "Div5 external Failure behavior",
    "skills/SKILL_AGENT_STAFFING_AND_HATS.md": "staffing hats Failure behavior",
    "skills/SKILL_CIRCUIT_BREAKER_HCO.md": "circuit Div1.HCO Failure behavior",
    "skills/SKILL_TREASURY_BUDGET_ACCESS.md": "Div3 budget Failure behavior",
}


class ValidateHandoffTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tempdir = Path(tempfile.mkdtemp(prefix="validate-handoff-test-"))
        for rel in validate_handoff.REQUIRED_FILES:
            if rel == "MANIFEST.md":
                continue
            path = self.tempdir / rel
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(SAMPLE_TERMS.get(rel, f"sample content for {rel}\n"), encoding="utf-8")
        (self.tempdir / "MANIFEST.md").write_text(validate_handoff.build_manifest(self.tempdir), encoding="utf-8")

    def tearDown(self) -> None:
        shutil.rmtree(self.tempdir)

    def test_valid_fixture_passes(self) -> None:
        self.assertEqual(validate_handoff.validate(self.tempdir), [])

    def test_missing_v141_file_is_reported_explicitly(self) -> None:
        target = self.tempdir / "skills/SKILL_EXTERNAL_IO_GATEWAY.md"
        target.unlink()
        errors = validate_handoff.validate(self.tempdir)
        self.assertIn("Missing required file: skills/SKILL_EXTERNAL_IO_GATEWAY.md", errors)

    def test_stale_manifest_hash_is_reported_explicitly(self) -> None:
        target = self.tempdir / "docs/BOS_Light_v1_4_1_CANONICAL_ORG.md"
        target.write_text("Div1.HCO Div6.External Package inventory changed\n", encoding="utf-8")
        errors = validate_handoff.validate(self.tempdir)
        self.assertTrue(
            any(error.startswith("Stale manifest: docs/BOS_Light_v1_4_1_CANONICAL_ORG.md sha256 mismatch") for error in errors),
            errors,
        )

    def test_entrypoint_without_v141_pointer_is_reported(self) -> None:
        target = self.tempdir / "README.md"
        target.write_text("old handoff only\n", encoding="utf-8")
        # Keep manifest current to isolate stale content detection.
        (self.tempdir / "MANIFEST.md").write_text(validate_handoff.build_manifest(self.tempdir), encoding="utf-8")
        errors = validate_handoff.validate(self.tempdir)
        self.assertIn("Stale or incomplete content: README.md is missing term 'v1.4.1'", errors)

    def test_build_manifest_skips_symlink_escape(self) -> None:
        outside = self.tempdir.parent / "outside-secret-like-file.txt"
        outside.write_text("outside file must not be hashed\n", encoding="utf-8")
        try:
            link = self.tempdir / "docs" / "outside-link.txt"
            link.symlink_to(outside)
            manifest = validate_handoff.build_manifest(self.tempdir)
            self.assertNotIn("docs/outside-link.txt", manifest)
        finally:
            outside.unlink(missing_ok=True)

    def test_required_file_symlink_is_reported(self) -> None:
        outside = self.tempdir.parent / "outside-readme.md"
        outside.write_text(SAMPLE_TERMS["README.md"], encoding="utf-8")
        try:
            target = self.tempdir / "README.md"
            target.unlink()
            target.symlink_to(outside)
            errors = validate_handoff.validate(self.tempdir)
            self.assertIn("Required file must not be a symlink: README.md", errors)
        finally:
            outside.unlink(missing_ok=True)


if __name__ == "__main__":
    unittest.main()
