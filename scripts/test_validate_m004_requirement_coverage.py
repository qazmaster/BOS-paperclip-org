#!/usr/bin/env python3
"""Fixture coverage for scripts/validate_m004_requirement_coverage.py.

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
VALIDATOR_PATH = SCRIPT_DIR / "validate_m004_requirement_coverage.py"

SPEC = importlib.util.spec_from_file_location("validate_m004_requirement_coverage", VALIDATOR_PATH)
assert SPEC is not None and SPEC.loader is not None
validator = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(validator)

GENERATED_AT = "2026-05-31T11:05:00Z"


class FixtureRoot:
    def __enter__(self) -> Path:
        self.tmp = tempfile.TemporaryDirectory()
        root = Path(self.tmp.name)
        final_text = "R012 R013 R014 R015 R016 are validated and covered by M004/S05 evidence."
        self.write_text(root, Path("docs/m004-summary.md"), final_text + "\n")
        self.write_text(root, Path("docs/s05-summary.md"), final_text + "\n")
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


def citation(path: str = "docs/m004-summary.md", validation_class: str = "Contract") -> dict[str, Any]:
    problem_kinds = {
        "Contract": "contract_drift",
        "Integration": "requirement_closeout_coverage",
        "Operational": "fresh_regression_proof",
        "UAT": "reviewer_readable_closeout",
    }
    return {
        "path": path,
        "validation_class": validation_class,
        "problem_kind": problem_kinds[validation_class],
        "note": f"Fixture {validation_class} citation preserves M004 S06 traceability without promotion.",
    }


def owner_provenance(rid: str) -> dict[str, Any]:
    if rid == "R015":
        return {
            "origin": "m004_originated",
            "existing_primary_owner_text": "M004-originated requirement with primary owning slice M004-osbua3.",
            "owner_normalized_to_s06": False,
            "owner_reconciliation": "S06 preserves R015 as M004-originated and records only coverage evidence.",
        }
    return {
        "origin": "inherited",
        "existing_primary_owner_text": f"{rid} inherited primary owner text preserved from prior M004 context.",
        "owner_normalized_to_s06": False,
        "owner_reconciliation": "S06 records coverage evidence only and does not reassign inherited ownership.",
    }


def requirement_record(rid: str) -> dict[str, Any]:
    record = {
        "requirement_id": rid,
        "status": "validated",
        "coverage_status": "covered",
        "requirement_class": validator.ALLOWED_REQUIREMENT_CLASSES[rid],
        "canonical_requirement_text": f"{rid} canonical fixture requirement text long enough to validate the bounded field without relying on repository requirements files.",
        "primary_owner_provenance": owner_provenance(rid),
        "m004_disposition": "covered_in_m004",
        "runtime_proof_claimed": rid == "R016",
        "live_runtime_capability_promoted": False,
        "coverage_summary": f"M004 covers {rid} through local S05 closeout evidence, repository documentation, proof logs, and reviewer-readable summaries while S06 only records traceability metadata.",
        "evidence_citations": [
            citation("docs/contract.md", "Contract"),
            citation("docs/s05-summary.md", "Integration"),
            citation("runtime-evidence/proof.stdout", "Operational"),
            citation("docs/m004-summary.md", "UAT"),
        ],
    }
    if rid == "R016":
        record["runtime_proof_boundary"] = (
            "Repository-local conservative runtime posture proof only; this is not live capability promotion."
        )
    return record


def valid_ledger() -> dict[str, Any]:
    return {
        "schema_version": validator.SCHEMA_VERSION,
        "artifact_type": validator.ARTIFACT_TYPE,
        "generated_at": GENERATED_AT,
        "milestone": "M004-osbua3",
        "slice": "S06",
        "validation_round": 1,
        "source_of_truth": "Seeded from local M004 and S05 closeout artifacts for temporary fixture validation.",
        "inputs": {
            "m004_summary_path": "docs/m004-summary.md",
            "s05_summary_path": "docs/s05-summary.md",
        },
        "requirements": [requirement_record(rid) for rid in validator.REQUIRED_REQUIREMENT_IDS],
        "safety": {
            "traceability_only": True,
            "requirements_validated": True,
            "requirements_covered": True,
            "required_requirement_ids": list(validator.REQUIRED_REQUIREMENT_IDS),
            "ownership_normalized_to_s06": False,
            "r015_m004_originated_preserved": True,
            "inherited_owner_provenance_preserved": True,
            "requirements_broadened": False,
            "success_criteria_broadened": False,
            "runtime_proof_boundary_preserved": True,
            "live_runtime_capability_promoted": False,
            "no_capability_promotions": True,
            "capability_promotions": [],
            "blocker_evidence_promoted": False,
            "network_access_required": False,
            "local_json_only": True,
            "secret_like_values_copied": False,
            "plaintext_credentials_logged": False,
        },
    }


def write_ledger(root: Path, payload: dict[str, Any]) -> Path:
    FixtureRoot.write_json(root, validator.DEFAULT_LEDGER_PATH, payload)
    return root / validator.DEFAULT_LEDGER_PATH


class ValidateM004RequirementCoverageTests(unittest.TestCase):
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

    def test_missing_r016_fails(self) -> None:
        with FixtureRoot() as root:
            payload = valid_ledger()
            payload["requirements"] = [record for record in payload["requirements"] if record["requirement_id"] != "R016"]
            errors, classification = validator.validate(write_ledger(root, payload), root=root)
            self.assertEqual("invalid", classification)
            self.assertTrue(any("missing requirement IDs: R016" in error for error in errors), errors)

    def test_extra_r999_fails(self) -> None:
        with FixtureRoot() as root:
            payload = valid_ledger()
            extra = deepcopy(payload["requirements"][0])
            extra["requirement_id"] = "R999"
            payload["requirements"].append(extra)
            errors, classification = validator.validate(write_ledger(root, payload), root=root)
            self.assertEqual("invalid", classification)
            joined = "\n".join(errors)
            self.assertIn("unknown requirement ID", joined)
            self.assertIn("unexpected requirement IDs: R999", joined)

    def test_wrong_status_fails(self) -> None:
        with FixtureRoot() as root:
            payload = valid_ledger()
            payload["requirements"][0]["status"] = "active"
            errors, classification = validator.validate(write_ledger(root, payload), root=root)
            self.assertEqual("invalid", classification)
            self.assertTrue(any("status" in error and "must be validated" in error for error in errors), errors)

    def test_missing_coverage_fails(self) -> None:
        with FixtureRoot() as root:
            payload = valid_ledger()
            payload["requirements"][0]["coverage_status"] = "partial"
            payload["requirements"][0]["coverage_summary"] = ""
            errors, classification = validator.validate(write_ledger(root, payload), root=root)
            self.assertEqual("invalid", classification)
            joined = "\n".join(errors)
            self.assertIn("coverage_status", joined)
            self.assertIn("coverage_summary", joined)

    def test_r015_owner_drift_fails(self) -> None:
        with FixtureRoot() as root:
            payload = valid_ledger()
            r015 = next(record for record in payload["requirements"] if record["requirement_id"] == "R015")
            r015["primary_owner_provenance"]["origin"] = "inherited"
            errors, classification = validator.validate(write_ledger(root, payload), root=root)
            self.assertEqual("invalid", classification)
            self.assertTrue(any("R015 must remain M004-originated" in error for error in errors), errors)

    def test_inherited_owner_normalization_fails(self) -> None:
        with FixtureRoot() as root:
            payload = valid_ledger()
            r012 = next(record for record in payload["requirements"] if record["requirement_id"] == "R012")
            r012["primary_owner_provenance"]["origin"] = "s06_originated"
            r012["primary_owner_provenance"]["owner_normalized_to_s06"] = True
            errors, classification = validator.validate(write_ledger(root, payload), root=root)
            self.assertEqual("invalid", classification)
            joined = "\n".join(errors)
            self.assertIn("inherited requirement must keep inherited origin", joined)
            self.assertIn("S06 must not normalize ownership to itself", joined)

    def test_missing_validation_class_fails_with_diagnostic_shape(self) -> None:
        with FixtureRoot() as root:
            payload = valid_ledger()
            payload["requirements"][0]["evidence_citations"] = [
                citation("docs/contract.md", "Contract"),
                citation("docs/s05-summary.md", "Integration"),
                citation("runtime-evidence/proof.stdout", "Operational"),
            ]
            errors, classification = validator.validate(write_ledger(root, payload), root=root)
            self.assertEqual("invalid", classification)
            joined = "\n".join(errors)
            self.assertIn("[R012][Integration]", joined)
            self.assertIn("[runtime-evidence/M004-S06-requirement-coverage.json]", joined)
            self.assertIn("[coverage_gap]", joined)
            self.assertIn("missing validation classes: UAT", joined)

    def test_malformed_citation_reports_requirement_class_path_and_problem_kind(self) -> None:
        with FixtureRoot() as root:
            payload = valid_ledger()
            payload["requirements"][0]["evidence_citations"][0] = {
                "path": "docs/broken.md",
                "validation_class": "Smoke",
                "problem_kind": "unknown",
                "note": "short",
            }
            errors, classification = validator.validate(write_ledger(root, payload), root=root)
            self.assertEqual("invalid", classification)
            joined = "\n".join(errors)
            self.assertIn("[R012][Contract][docs/broken.md][contract_drift]", joined)
            self.assertIn("invalid validation class", joined)
            self.assertIn("invalid problem kind", joined)

    def test_capability_promotion_fails(self) -> None:
        with FixtureRoot() as root:
            payload = valid_ledger()
            payload["requirements"][0]["live_runtime_capability_promoted"] = True
            payload["safety"]["capability_promotions"] = ["paperclip.live.surface"]
            errors, classification = validator.validate(write_ledger(root, payload), root=root)
            self.assertEqual("invalid", classification)
            joined = "\n".join(errors)
            self.assertIn("S06 is traceability-only", joined)
            self.assertIn("runtime capability promotions are forbidden", joined)

    def test_bad_boolean_flags_fail(self) -> None:
        with FixtureRoot() as root:
            payload = valid_ledger()
            payload["safety"]["traceability_only"] = "true"
            payload["safety"]["network_access_required"] = "false"
            errors, classification = validator.validate(write_ledger(root, payload), root=root)
            self.assertEqual("invalid", classification)
            joined = "\n".join(errors)
            self.assertIn("safety.traceability_only", joined)
            self.assertIn("safety.network_access_required", joined)

    def test_secret_like_diagnostics_fail_without_value_echo(self) -> None:
        with FixtureRoot() as root:
            payload = valid_ledger()
            payload["diagnostics"] = {"raw": "Authorization: Bearer abcdefghijklmnopqrstuvwxyz"}
            errors, classification = validator.validate(write_ledger(root, payload), root=root)
            self.assertEqual("invalid", classification)
            joined = "\n".join(errors)
            self.assertIn("secret-like string value is not redacted", joined)
            self.assertNotIn("abcdefghijklmnopqrstuvwxyz", joined)

    def test_db_backed_text_does_not_trigger_secret_false_positive(self) -> None:
        with FixtureRoot() as root:
            payload = valid_ledger()
            payload["notes"] = "DB-backed completion and surface-specific runtime evidence are ordinary prose, not sk tokens."
            errors, classification = validator.validate(write_ledger(root, payload), root=root)
            self.assertEqual([], errors)
            self.assertEqual("coverage_ledger", classification)

    def test_malformed_ledger_json_fails_closed(self) -> None:
        with FixtureRoot() as root:
            target = root / validator.DEFAULT_LEDGER_PATH
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text("{not-json", encoding="utf-8")
            errors, classification = validator.validate(validator.DEFAULT_LEDGER_PATH, root=root)
            self.assertEqual("invalid", classification)
            self.assertTrue(any("malformed JSON" in error for error in errors), errors)

    def test_duplicate_json_keys_fail_closed(self) -> None:
        with FixtureRoot() as root:
            target = root / validator.DEFAULT_LEDGER_PATH
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(
                '{"schema_version":"one","schema_version":"two","requirements":[]}',
                encoding="utf-8",
            )
            errors, classification = validator.validate(validator.DEFAULT_LEDGER_PATH, root=root)
            self.assertEqual("invalid", classification)
            self.assertTrue(any("duplicate JSON key" in error for error in errors), errors)

    def test_duplicate_requirement_ids_fail(self) -> None:
        with FixtureRoot() as root:
            payload = valid_ledger()
            payload["requirements"].append(deepcopy(payload["requirements"][0]))
            errors, classification = validator.validate(write_ledger(root, payload), root=root)
            self.assertEqual("invalid", classification)
            self.assertTrue(any("duplicate requirement ID" in error for error in errors), errors)

    def test_missing_ledger_file_fails_closed(self) -> None:
        with FixtureRoot() as root:
            errors, classification = validator.validate(validator.DEFAULT_LEDGER_PATH, root=root)
            self.assertEqual("invalid", classification)
            self.assertTrue(any("missing JSON file" in error for error in errors), errors)

    def test_write_audit_records_failure_visibility_and_load_profile(self) -> None:
        with FixtureRoot() as root:
            ledger_path = write_ledger(root, valid_ledger())
            audit_path = Path("runtime-evidence/audit.json")
            exit_code = validator.main([
                "--root",
                str(root),
                "--ledger",
                str(ledger_path),
                "--phase",
                "ledger",
                "--write-audit",
                str(audit_path),
            ])
            self.assertEqual(0, exit_code)
            audit = json.loads((root / audit_path).read_text(encoding="utf-8"))
            self.assertTrue(audit["passed"])
            self.assertTrue(audit["failure_visibility"]["diagnostics_include_requirement_id"])
            self.assertFalse(audit["load_profile"]["network_access"])
            self.assertFalse(audit["load_profile"]["subprocesses"])
            self.assertEqual(list(validator.REQUIRED_REQUIREMENT_IDS), audit["posture"]["required_requirements"])
            self.assertFalse(audit["posture"]["runtime_capability_promotions_allowed"])

    def test_final_audit_records_failed_sanitized_diagnostics(self) -> None:
        with FixtureRoot() as root:
            payload = valid_ledger()
            secret_value = "Authorization: Bearer abcdefghijklmnopqrstuvwxyz"
            payload["diagnostics"] = {"raw": secret_value}
            ledger_path = write_ledger(root, payload)
            audit_path = Path("runtime-evidence/final-audit.json")
            exit_code = validator.main([
                "--root",
                str(root),
                "--ledger",
                str(ledger_path),
                "--phase",
                "final",
                "--write-audit",
                str(audit_path),
            ])
            self.assertEqual(1, exit_code)
            audit_text = (root / audit_path).read_text(encoding="utf-8")
            self.assertNotIn("abcdefghijklmnopqrstuvwxyz", audit_text)
            audit = json.loads(audit_text)
            self.assertFalse(audit["passed"])
            self.assertEqual("invalid", audit["classification"])
            self.assertGreater(audit["diagnostics"]["error_count"], 0)
            self.assertTrue(any("secret-like string value is not redacted" in error for error in audit["diagnostics"]["errors"]))
            self.assertEqual("final", audit["phase"])


if __name__ == "__main__":
    unittest.main()
