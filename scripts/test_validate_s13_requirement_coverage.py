#!/usr/bin/env python3
"""Fixture coverage for scripts/validate_s13_requirement_coverage.py.

The tests use temporary fixture roots only and do not read .gsd or other local
planning paths from the repository.
"""

from __future__ import annotations

import importlib.util
import json
import tempfile
import unittest
from copy import deepcopy
from pathlib import Path
from typing import Any

SCRIPT_DIR = Path(__file__).resolve().parent
VALIDATOR_PATH = SCRIPT_DIR / "validate_s13_requirement_coverage.py"

SPEC = importlib.util.spec_from_file_location("validate_s13_requirement_coverage", VALIDATOR_PATH)
assert SPEC is not None and SPEC.loader is not None
validator = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(validator)

GENERATED_AT = "2026-05-30T08:00:00Z"


class FixtureRoot:
    def __enter__(self) -> Path:
        self.tmp = tempfile.TemporaryDirectory()
        root = Path(self.tmp.name)
        self.write_json(root, validator.DEFAULT_S12_DISPOSITION_PATH, s12_disposition())
        self.write_json(root, validator.DEFAULT_S12_CLOSEOUT_PATH, s12_closeout())
        self.write_text(root, Path("docs/context.md"), "R012 R013 R014 R015 remain out of scope with no-promotion posture.\n")
        self.write_text(root, Path("docs/assessment.md"), "M002 preserves S12 approved_rescope and no-promotion.\n")
        self.write_text(root, Path("docs/uat.md"), "UAT readability confirms R012-R015 coverage notes.\n")
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


def s12_disposition() -> dict[str, Any]:
    return {
        "schema_version": "s12-runtime-proof-or-rescope/v1",
        "artifact_type": "runtime-proof-or-approved-rescope",
        "generated_at": GENERATED_AT,
        "milestone": "M002",
        "slice": "S12",
        "outcome": "approved_rescope",
        "approved_rescope": {
            "approval_source": {"type": "milestone_context_assessment", "reference": "fixture", "approved_at": GENERATED_AT},
            "requirement_ids": ["R009", "R010", "R011"],
            "success_criteria": {"deferred": ["future proof deferred"], "narrowed": ["no promotion"]},
            "blocker_citations": [
                {"surface": "hermes", "code": "blocked", "evidence_path": "runtime-evidence/hermes.json"},
                {"surface": "gsdpi", "code": "blocked", "evidence_path": "runtime-evidence/gsdpi.json"},
            ],
            "no_capability_promotions": True,
        },
        "no_promotion": {
            "blocker_evidence_promoted": False,
            "requirements_broadened": False,
            "success_criteria_broadened": False,
            "unsupported_promotions": [],
        },
        "diagnostics": {"redacted": True, "error_count": 0, "errors": []},
    }


def s12_closeout() -> dict[str, Any]:
    return {
        "schema_version": "s12-runtime-proof-or-rescope-validation/v1",
        "artifact_type": "validator-audit",
        "generated_at": GENERATED_AT,
        "milestone": "M002",
        "slice": "S12",
        "classification": "approved_rescope",
        "passed": True,
        "diagnostics": {"error_count": 0, "errors": []},
    }


def citation(path: str = "docs/context.md", validation_class: str = "Operational") -> dict[str, Any]:
    problem_kind = "operational_posture" if validation_class == "Operational" else "documentation_mismatch"
    if validation_class == "Contract":
        problem_kind = "contract_drift"
    if validation_class == "UAT":
        problem_kind = "uat_readability"
    return {
        "path": path,
        "validation_class": validation_class,
        "problem_kind": problem_kind,
        "note": "Fixture citation preserves no-scope-change coverage without runtime proof.",
    }


def requirement_record(rid: str) -> dict[str, Any]:
    return {
        "requirement_id": rid,
        "status": "active",
        "requirement_class": validator.ALLOWED_REQUIREMENT_CLASSES[rid],
        "canonical_requirement_text": validator.REQUIRED_REQUIREMENTS[rid],
        "primary_owning_slice": validator.REQUIRED_OWNER_SLICE,
        "m002_disposition": "out_of_scope_for_m002",
        "runtime_proof_claimed": False,
        "evidence_citations": [
            citation("docs/context.md", "Contract"),
            citation("runtime-evidence/M002-S12-runtime-proof-or-rescope.json", "Operational"),
            citation("docs/uat.md", "UAT"),
        ],
    }


def valid_ledger() -> dict[str, Any]:
    return {
        "schema_version": validator.SCHEMA_VERSION,
        "artifact_type": validator.ARTIFACT_TYPE,
        "generated_at": GENERATED_AT,
        "milestone": "M002",
        "slice": "S13",
        "validation_round": 1,
        "source_of_truth": "Seeded from the canonical active R012-R015 text in the GSD requirements store context embedded in S13/T01.",
        "inputs": {
            "s12_runtime_proof_or_rescope_path": str(validator.DEFAULT_S12_DISPOSITION_PATH),
            "s12_validation_closeout_path": str(validator.DEFAULT_S12_CLOSEOUT_PATH),
            "m002_context_path": "docs/context.md",
            "m002_assessment_path": "docs/assessment.md",
            "s11_uat_path": "docs/uat.md",
        },
        "requirements": [requirement_record(rid) for rid in sorted(validator.REQUIRED_REQUIREMENTS)],
        "safety": {
            "preserves_s12_approved_rescope": True,
            "s12_disposition_path": str(validator.DEFAULT_S12_DISPOSITION_PATH),
            "s12_validation_closeout_path": str(validator.DEFAULT_S12_CLOSEOUT_PATH),
            "no_capability_promotions": True,
            "blocker_evidence_promoted": False,
            "requirements_broadened": False,
            "success_criteria_broadened": False,
            "plaintext_credentials_logged": False,
            "capability_promotions": [],
        },
    }


def write_ledger(root: Path, payload: dict[str, Any]) -> Path:
    FixtureRoot.write_json(root, validator.DEFAULT_LEDGER_PATH, payload)
    return root / validator.DEFAULT_LEDGER_PATH


class ValidateS13RequirementCoverageTests(unittest.TestCase):
    def test_accepts_valid_ledger_phase(self) -> None:
        with FixtureRoot() as root:
            errors, classification = validator.validate(write_ledger(root, valid_ledger()), root=root, phase="ledger")
            self.assertEqual([], errors)
            self.assertEqual("coverage_ledger", classification)

    def test_accepts_valid_final_phase_when_fixture_docs_are_synced(self) -> None:
        with FixtureRoot() as root:
            errors, classification = validator.validate(write_ledger(root, valid_ledger()), root=root, phase="final")
            self.assertEqual([], errors)
            self.assertEqual("final_ready", classification)

    def test_missing_r015_fails(self) -> None:
        with FixtureRoot() as root:
            payload = valid_ledger()
            payload["requirements"] = [record for record in payload["requirements"] if record["requirement_id"] != "R015"]
            errors, classification = validator.validate(write_ledger(root, payload), root=root)
            self.assertEqual("invalid", classification)
            self.assertTrue(any("missing requirement IDs: R015" in error for error in errors), errors)

    def test_wrong_owner_fails_contract_diagnostic(self) -> None:
        with FixtureRoot() as root:
            payload = valid_ledger()
            payload["requirements"][0]["primary_owning_slice"] = "M002"
            errors, classification = validator.validate(write_ledger(root, payload), root=root)
            self.assertEqual("invalid", classification)
            self.assertTrue(any("primary_owning_slice" in error and "contract_drift" in error for error in errors), errors)

    def test_runtime_capability_promotion_fails(self) -> None:
        with FixtureRoot() as root:
            payload = valid_ledger()
            payload["safety"]["capability_promotions"] = ["hermes.execution"]
            payload["requirements"][0]["m002_disposition"] = "validated_by_m002_runtime"
            payload["requirements"][0]["runtime_proof_claimed"] = True
            errors, classification = validator.validate(write_ledger(root, payload), root=root)
            self.assertEqual("invalid", classification)
            joined = "\n".join(errors)
            self.assertIn("runtime capability promotions are forbidden", joined)
            self.assertIn("must not claim M002 runtime validation", joined)

    def test_unknown_extra_requirement_fails(self) -> None:
        with FixtureRoot() as root:
            payload = valid_ledger()
            extra = deepcopy(payload["requirements"][0])
            extra["requirement_id"] = "R999"
            payload["requirements"].append(extra)
            errors, classification = validator.validate(write_ledger(root, payload), root=root)
            self.assertEqual("invalid", classification)
            self.assertTrue(any("unknown requirement ID" in error for error in errors), errors)

    def test_missing_s12_approved_rescope_blocks(self) -> None:
        with FixtureRoot() as root:
            broken_s12 = s12_disposition()
            broken_s12.pop("approved_rescope")
            FixtureRoot.write_json(root, validator.DEFAULT_S12_DISPOSITION_PATH, broken_s12)
            errors, classification = validator.validate(write_ledger(root, valid_ledger()), root=root)
            self.assertEqual("blocked", classification)
            self.assertTrue(any("missing S12 approved_rescope block" in error for error in errors), errors)

    def test_secret_like_diagnostics_fail_without_value_echo(self) -> None:
        with FixtureRoot() as root:
            payload = valid_ledger()
            payload["diagnostics"] = {"raw": "Authorization: Bearer abcdefghijklmnopqrstuvwxyz"}
            errors, classification = validator.validate(write_ledger(root, payload), root=root)
            self.assertEqual("invalid", classification)
            joined = "\n".join(errors)
            self.assertIn("secret-like string value is not redacted", joined)
            self.assertNotIn("abcdefghijklmnopqrstuvwxyz", joined)

    def test_malformed_ledger_json_fails_closed(self) -> None:
        with FixtureRoot() as root:
            target = root / validator.DEFAULT_LEDGER_PATH
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text("{not-json", encoding="utf-8")
            errors, classification = validator.validate(validator.DEFAULT_LEDGER_PATH, root=root)
            self.assertEqual("invalid", classification)
            self.assertTrue(any("malformed JSON" in error for error in errors), errors)

    def test_duplicate_requirement_ids_fail(self) -> None:
        with FixtureRoot() as root:
            payload = valid_ledger()
            payload["requirements"].append(deepcopy(payload["requirements"][0]))
            errors, classification = validator.validate(write_ledger(root, payload), root=root)
            self.assertEqual("invalid", classification)
            self.assertTrue(any("duplicate requirement ID" in error for error in errors), errors)

    def test_invalid_validation_class_names_fail(self) -> None:
        with FixtureRoot() as root:
            payload = valid_ledger()
            payload["requirements"][0]["evidence_citations"][0]["validation_class"] = "Smoke"
            errors, classification = validator.validate(write_ledger(root, payload), root=root)
            self.assertEqual("invalid", classification)
            self.assertTrue(any("invalid validation class" in error for error in errors), errors)

    def test_requirement_text_drift_names_requirement(self) -> None:
        with FixtureRoot() as root:
            payload = valid_ledger()
            payload["requirements"][0]["canonical_requirement_text"] = "drifted"
            errors, classification = validator.validate(write_ledger(root, payload), root=root)
            self.assertEqual("invalid", classification)
            self.assertTrue(any("[R012]" in error and "requirement text drifted" in error for error in errors), errors)

    def test_write_audit_records_failure_visibility(self) -> None:
        with FixtureRoot() as root:
            ledger_path = write_ledger(root, valid_ledger())
            audit_path = Path("runtime-evidence/audit.json")
            exit_code = validator.main(["--root", str(root), "--ledger", str(ledger_path), "--phase", "ledger", "--write-audit", str(audit_path)])
            self.assertEqual(0, exit_code)
            audit = json.loads((root / audit_path).read_text(encoding="utf-8"))
            self.assertTrue(audit["passed"])
            self.assertTrue(audit["failure_visibility"]["diagnostics_include_requirement_id"])


if __name__ == "__main__":
    unittest.main()
