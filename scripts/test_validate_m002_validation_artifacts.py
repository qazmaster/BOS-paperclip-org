#!/usr/bin/env python3
"""Fixture coverage for scripts/validate_m002_validation_artifacts.py."""

from __future__ import annotations

import importlib.util
import json
import tempfile
import unittest
from pathlib import Path
from typing import Any

SCRIPT_PATH = Path(__file__).resolve().parent / "validate_m002_validation_artifacts.py"
SPEC = importlib.util.spec_from_file_location("validate_m002_validation_artifacts", SCRIPT_PATH)
assert SPEC is not None and SPEC.loader is not None
validator = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(validator)

GENERATED_AT = "2026-05-30T05:00:00Z"


def valid_context() -> str:
    return """# M002 Context

S09 and S10 are the current closeout source of truth for validation artifacts.
S01 is historical baseline evidence and is superseded for closeout by S09/S10.
Hermes execution remains fail-closed and unpromoted.
GSD-Pi execution remains fail-closed and unpromoted.
Fail-closed blocker evidence is blocker evidence rather than runtime proof.
R009 remains preserved. R010 remains preserved. R011 remains preserved.
"""


def valid_assessment() -> str:
    return """# M002 Assessment

The current closeout source is S09/S10. S01 is historical and superseded for
closeout. Hermes execution remains fail-closed and unpromoted. GSD-Pi execution
remains fail-closed and unpromoted. Fail-closed blocker evidence is not runtime
proof. R009 remains intact. R010 remains intact. R011 remains intact.
"""


def valid_s09_assessment() -> str:
    return """# S09 Assessment

S09 is the current closeout artifact reconciliation source. Hermes and GSD-Pi
runtime execution stay fail-closed and unpromoted. R009 remains preserved; R010
remains preserved; R011 remains preserved. No runtime capability is promoted.
"""


def valid_s10_assessment() -> str:
    return """# S10 Assessment

S10 is the current closeout source for runtime posture. S01 is historical
baseline evidence superseded for closeout. Hermes execution remains fail-closed
and unpromoted. GSD-Pi execution remains fail-closed and unpromoted. Fail-closed
blocker evidence is not runtime proof. R009 remains intact. R010 remains intact.
R011 remains intact.
"""


def requirement_scope() -> dict[str, Any]:
    return {
        "schema_version": "s10-requirement-scope-resolution/v1",
        "artifact_type": "requirement-scope-resolution",
        "generated_at": GENERATED_AT,
        "proof_posture": {
            "hermes": {
                "evidence_path": "runtime-evidence/M002-S10-hermes-runtime-execution-proof.json",
                "artifact_type": "fail-closed-blocker",
                "passing": False,
                "capability_promoted": False,
                "reason": "No bounded runtime invocation started.",
            },
            "gsdpi": {
                "evidence_path": "runtime-evidence/M002-S10-gsdpi-runtime-execution-proof.json",
                "artifact_type": "fail-closed-blocker",
                "passing": False,
                "capability_promoted": False,
                "reason": "No BosAdapterResult exists.",
            },
        },
        "requirement_resolution": {
            "R009": {"covered_by_existing_requirement": True, "requirement_update_used": False},
            "R010": {"covered_by_existing_requirement": True, "requirement_update_used": False},
            "R011": {"covered_by_existing_requirement": True, "requirement_update_used": False},
        },
    }


def s10_closeout() -> dict[str, Any]:
    return {
        "schema_version": "s10-runtime-execution-closeout/v1",
        "artifact_type": "validator-audit",
        "classification": "final",
        "generated_at": GENERATED_AT,
        "passed": True,
        "diagnostics": {"error_count": 0, "errors": []},
        "posture": {
            "capability_promotions_require_passing_s10_proof": True,
            "fail_closed_rows_must_cite_s10_evidence": True,
            "unsupported_boundaries_rejected": True,
            "plaintext_credential_values_allowed": False,
            "paperclip_core_or_direct_database_mutation_allowed": False,
        },
    }


def capability_matrix(extra: dict[str, Any] | None = None, rows: list[dict[str, Any]] | None = None) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "schema_version": "fixture",
        "plugin_key": "bos-light",
        "guardrail": "Hermes and GSD-Pi execution remain fail-closed and unpromoted unless S10 proof passes.",
        "capabilities": rows
        if rows is not None
        else [
            {
                "key": "issues.native",
                "status": "confirmed",
                "paperclip_surface_name": "Native issue API",
                "evidence_source": "S04 native proof only; it does not confirm Hermes or GSD-Pi execution.",
            }
        ],
    }
    if extra:
        payload.update(extra)
    return payload


class FixtureRoot:
    def __enter__(self) -> Path:
        self.tmp = tempfile.TemporaryDirectory()
        root = Path(self.tmp.name)
        self.write_text(root, Path(".gsd/milestones/M002/M002-CONTEXT.md"), valid_context())
        self.write_text(root, Path(".gsd/milestones/M002/M002-ASSESSMENT.md"), valid_assessment())
        self.write_text(root, Path(".gsd/milestones/M002/slices/S09/S09-ASSESSMENT.md"), valid_s09_assessment())
        self.write_text(root, Path(".gsd/milestones/M002/slices/S10/S10-ASSESSMENT.md"), valid_s10_assessment())
        self.write_json(root, Path("runtime-evidence/M002-S10-requirement-scope-resolution.json"), requirement_scope())
        self.write_json(root, Path("runtime-evidence/M002-S10-runtime-execution-closeout.json"), s10_closeout())
        self.write_json(root, Path("plugin-bos-light/capabilities.paperclip-runtime.json"), capability_matrix())
        return root

    def __exit__(self, exc_type, exc, tb) -> None:
        self.tmp.cleanup()

    @staticmethod
    def write_text(root: Path, path: Path, text: str) -> None:
        target = root / path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(text, encoding="utf-8")

    @staticmethod
    def write_json(root: Path, path: Path, payload: dict[str, Any]) -> None:
        FixtureRoot.write_text(root, path, json.dumps(payload, indent=2, sort_keys=True) + "\n")


class ValidateM002ValidationArtifactsTests(unittest.TestCase):
    def test_success_and_cli_audit_write(self) -> None:
        with FixtureRoot() as root:
            errors, checked = validator.validate(root)
            self.assertEqual([], errors)
            self.assertEqual(7, len(checked))

            audit_path = Path("runtime-evidence/M002-S11-validation-artifact-repair.json")
            exit_code = validator.main(["--root", str(root), "--write-audit", str(audit_path)])
            self.assertEqual(0, exit_code)
            payload = json.loads((root / audit_path).read_text(encoding="utf-8"))
            self.assertEqual(validator.SCHEMA_VERSION, payload["schema_version"])
            self.assertTrue(payload["passed"])
            self.assertEqual(0, payload["diagnostics"]["error_count"])
            self.assertEqual(7, len(payload["checked_paths"]))

    def test_missing_required_artifact_fails(self) -> None:
        with FixtureRoot() as root:
            (root / ".gsd/milestones/M002/slices/S09/S09-ASSESSMENT.md").unlink()
            errors, _checked = validator.validate(root)
            self.assertTrue(any("S09-ASSESSMENT.md" in error and "missing" in error for error in errors), errors)

    def test_empty_required_artifact_fails(self) -> None:
        with FixtureRoot() as root:
            FixtureRoot.write_text(root, Path(".gsd/milestones/M002/slices/S10/S10-ASSESSMENT.md"), "\n")
            errors, _checked = validator.validate(root)
            self.assertTrue(any("S10-ASSESSMENT.md" in error and "empty" in error for error in errors), errors)

    def test_absent_s01_supersession_fails(self) -> None:
        with FixtureRoot() as root:
            replacement = "# Context\nS09 and S10 are current closeout sources. Hermes execution remains fail-closed and unpromoted. GSD-Pi execution remains fail-closed and unpromoted. Fail-closed blocker evidence is not runtime proof. R009 remains preserved. R010 remains preserved. R011 remains preserved.\n"
            FixtureRoot.write_text(root, Path(".gsd/milestones/M002/M002-CONTEXT.md"), replacement)
            FixtureRoot.write_text(root, Path(".gsd/milestones/M002/M002-ASSESSMENT.md"), replacement)
            FixtureRoot.write_text(root, Path(".gsd/milestones/M002/slices/S10/S10-ASSESSMENT.md"), replacement)
            errors, _checked = validator.validate(root)
            self.assertTrue(any("docs.posture.s01" in error for error in errors), errors)

    def test_runtime_proof_overclaim_fails(self) -> None:
        with FixtureRoot() as root:
            text = valid_assessment() + "\nHermes runtime execution confirmed from fail-closed blocker evidence.\n"
            FixtureRoot.write_text(root, Path(".gsd/milestones/M002/M002-ASSESSMENT.md"), text)
            errors, _checked = validator.validate(root)
            self.assertTrue(any("runtime_overclaim" in error for error in errors), errors)

    def test_missing_s10_audit_pass_state_fails(self) -> None:
        with FixtureRoot() as root:
            payload = s10_closeout()
            payload["passed"] = False
            payload["diagnostics"] = {"error_count": 1, "errors": ["redacted failure"]}
            FixtureRoot.write_json(root, Path("runtime-evidence/M002-S10-runtime-execution-closeout.json"), payload)
            errors, _checked = validator.validate(root)
            joined = "\n".join(errors)
            self.assertIn("passed", joined)
            self.assertIn("diagnostics", joined)

    def test_non_empty_capability_promotions_fail_without_passing_s10_proof(self) -> None:
        with FixtureRoot() as root:
            FixtureRoot.write_json(
                root,
                Path("plugin-bos-light/capabilities.paperclip-runtime.json"),
                capability_matrix(extra={"capability_promotions": ["hermes.execution"]}),
            )
            errors, _checked = validator.validate(root)
            self.assertTrue(any("capability promotion requires passing S10" in error for error in errors), errors)

    def test_secret_looking_content_fails_without_leaking_value(self) -> None:
        with FixtureRoot() as root:
            FixtureRoot.write_text(root, Path(".gsd/milestones/M002/M002-CONTEXT.md"), valid_context() + "\nAuthorization: Bearer abcdefghijklmnop\n")
            errors, _checked = validator.validate(root)
            self.assertTrue(any("secret-like text value" in error for error in errors), errors)
            self.assertFalse(any("abcdefghijklmnop" in error for error in errors), errors)

    def test_malformed_json_fails_closed(self) -> None:
        with FixtureRoot() as root:
            FixtureRoot.write_text(root, Path("runtime-evidence/M002-S10-requirement-scope-resolution.json"), "{not json\n")
            errors, _checked = validator.validate(root)
            self.assertTrue(any("malformed JSON" in error for error in errors), errors)

    def test_confirmed_runtime_execution_row_requires_passing_proof(self) -> None:
        with FixtureRoot() as root:
            rows = [
                {
                    "key": "gsdpi.execution",
                    "status": "confirmed",
                    "paperclip_surface_name": "GSD-Pi runtime execution",
                    "evidence_source": "Confirmed from unavailable-route diagnostics.",
                }
            ]
            FixtureRoot.write_json(root, Path("plugin-bos-light/capabilities.paperclip-runtime.json"), capability_matrix(rows=rows))
            errors, _checked = validator.validate(root)
            self.assertTrue(any("confirmed gsdpi execution requires passing S10" in error for error in errors), errors)


if __name__ == "__main__":
    unittest.main()
