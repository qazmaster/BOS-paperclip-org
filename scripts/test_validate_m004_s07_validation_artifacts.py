#!/usr/bin/env python3
"""Fixture coverage for scripts/validate_m004_s07_validation_artifacts.py.

The tests use temporary fixture roots only and do not read local .gsd,
.planning, .audits, or other ignored planning paths from the repository.
"""

from __future__ import annotations

import importlib.util
import json
import tempfile
import unittest
from pathlib import Path
from typing import Any

SCRIPT_DIR = Path(__file__).resolve().parent
VALIDATOR_PATH = SCRIPT_DIR / "validate_m004_s07_validation_artifacts.py"

SPEC = importlib.util.spec_from_file_location("validate_m004_s07_validation_artifacts", VALIDATOR_PATH)
assert SPEC is not None and SPEC.loader is not None
validator = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(validator)

GENERATED_AT = "2026-05-31T12:15:00Z"


class FixtureRoot:
    def __enter__(self) -> Path:
        self.tmp = tempfile.TemporaryDirectory()
        root = Path(self.tmp.name)
        self.write_default_package(root)
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

    def write_default_package(self, root: Path) -> None:
        self.write_text(root, validator.ROADMAP_PATH, roadmap_text())
        self.write_text(root, validator.CONTEXT_PATH, context_text())
        self.write_text(root, validator.ASSESSMENT_PATH, assessment_text())
        self.write_text(root, validator.S07_ASSESSMENT_PATH, s07_assessment_text())
        self.write_json(root, validator.INVENTORY_PATH, inventory_payload())
        self.write_json(root, validator.S06_LEDGER_PATH, s06_ledger_payload())
        self.write_json(root, validator.S06_AUDIT_PATH, s06_audit_payload())


def requirement_sentence() -> str:
    return "R012 R013 R014 R015 R016"


def boundary_sentence() -> str:
    return (
        "Div6.External is the only external-world IO owner; "
        "Div5.QualificationsLibraryLearning quarantines and sanitizes raw evidence; "
        "Div1.HCO owns routing/control; Div3.Treasury owns paid or credentialed grant routing; "
        "Paperclip runtime capability remains conservative and fallback-only."
    )


def citation_sentence() -> str:
    return (
        "Required citations include runtime-evidence/M004-S06-requirement-coverage.json, "
        "runtime-evidence/M004-S06-coverage-validation.json, and "
        "runtime-evidence/M004-S07-validation-artifacts-audit.json."
    )


def roadmap_text() -> str:
    rows = "\n".join(
        f"| {sid}: Fixture Slice | Producer evidence for {sid} and {requirement_sentence()} | S07 validation restoration | local docs and runtime-evidence paths | {boundary_sentence()} |"
        for sid in ("S01", "S02", "S03", "S04", "S05", "S06", "S07")
    )
    return f"""# M004-osbua3 Fixture Roadmap

## Boundary Map

This Boundary Map is populated for restored validation artifacts. {boundary_sentence()} {citation_sentence()}

| Producer | Boundary Produced | Primary Consumers | Local Evidence | Closeout Notes |
|---|---|---|---|---|
{rows}
"""


def context_text() -> str:
    return f"""# M004-osbua3 Context

S07 restores validation evidence artifacts for {requirement_sentence()} as traceability-only surfaces. {boundary_sentence()}

S06 evidence remains authoritative. {citation_sentence()} S07 does not re-own R012-R016 and does not promote live Paperclip capability.
"""


def assessment_text() -> str:
    return f"""# M004-osbua3 Assessment

## Requirement Assessment for R012-R016

{requirement_sentence()} remain covered by S06 evidence. {citation_sentence()} {boundary_sentence()}

## No Promotion Rule

Repository-local proof is not live Paperclip runtime proof, and S07 only restores reviewer-readable artifacts.
"""


def s07_assessment_text() -> str:
    return f"""# S07 Assessment

## Evidence Inputs

{citation_sentence()} The restored package traces {requirement_sentence()} and consumes S05/S06 proof only.

## Security Posture

{boundary_sentence()} S07 requires no network, no credentials, no runtime service, and no raw external evidence payloads.

## Final Validator Must Prove

The final audit should be written to runtime-evidence/M004-S07-validation-artifacts-audit.json and keep runtime capability promotion disabled.
"""


def final_validation_text() -> str:
    return f"""# Milestone Validation: M004-osbua3

## MV01 — Success Criteria Checklist

PASS. {requirement_sentence()} are traceable through S06 and S07 artifacts. {citation_sentence()}

## MV02 — Slice Delivery Audit

PASS. S07 restored the artifact package without runtime promotion. {boundary_sentence()}

## MV03 — Cross-Slice Integration

PASS. Boundary Map producer/consumer rows are populated from S01 through S07.

## MV04 — Requirement Coverage

PASS. R012, R013, R014, R015, and R016 remain represented by S06 evidence and S07 traceability.

## Verification Classes

Contract, Integration, Operational, and UAT evidence are represented. Live Paperclip surfaces remain unvalidated unless future proof exists.
"""


def inventory_payload() -> dict[str, Any]:
    return {
        "schema_version": "m004-s07-restored-artifact-inventory/v1",
        "artifact_type": "restored-artifact-inventory",
        "milestone": "M004-osbua3",
        "slice": "S07",
        "task": "T01",
        "purpose": f"Restored artifact inventory for {requirement_sentence()} with traceability only.",
        "restored_artifacts": [
            {"path": str(validator.ROADMAP_PATH), "restoration": "Boundary Map populated.", "validation_class": "Contract"},
            {"path": str(validator.CONTEXT_PATH), "restoration": "Context restored.", "validation_class": "UAT"},
            {"path": str(validator.ASSESSMENT_PATH), "restoration": "Assessment restored.", "validation_class": "UAT"},
            {"path": str(validator.S07_ASSESSMENT_PATH), "restoration": "S07 assessment restored.", "validation_class": "Integration"},
        ],
        "evidence_sources": [
            {"path": "runtime-evidence/M004-S06-requirement-coverage.json", "role": "S06 ledger."},
            {"path": "runtime-evidence/M004-S06-coverage-validation.json", "role": "S06 final audit."},
        ],
        "required_requirements": list(validator.REQUIRED_REQUIREMENT_IDS),
        "boundary_posture": {
            "div6_external_only_external_io": True,
            "div5_quarantine_sanitization_required": True,
            "div1_hco_routing_control_required": True,
            "div3_treasury_paid_or_credentialed_grants_required": True,
            "traceability_only": True,
            "requirements_reowned_by_s07": False,
            "requirements_status_changed_by_s07": False,
            "runtime_capability_promotions_allowed": False,
            "live_paperclip_capability_promoted": False,
            "network_access_required": False,
            "plaintext_credentials_allowed": False,
        },
    }


def s06_ledger_payload() -> dict[str, Any]:
    return {
        "schema_version": "m004-s06-requirement-coverage/v1",
        "artifact_type": "requirement-coverage-ledger",
        "generated_at": GENERATED_AT,
        "milestone": "M004-osbua3",
        "slice": "S06",
        "requirements": [
            {
                "requirement_id": rid,
                "status": "validated",
                "coverage_status": "covered",
                "live_runtime_capability_promoted": False,
                "coverage_summary": "Fixture S06 coverage summary for restored S07 validation artifacts.",
            }
            for rid in validator.REQUIRED_REQUIREMENT_IDS
        ],
        "safety": {
            "required_requirement_ids": list(validator.REQUIRED_REQUIREMENT_IDS),
            "traceability_only": True,
            "live_runtime_capability_promoted": False,
            "runtime_capability_promotions_allowed": False,
            "network_access_required": False,
        },
    }


def s06_audit_payload() -> dict[str, Any]:
    return {
        "schema_version": "m004-s06-requirement-coverage-validation/v1",
        "artifact_type": "validator-audit",
        "generated_at": GENERATED_AT,
        "milestone": "M004-osbua3",
        "slice": "S06",
        "phase": "final",
        "classification": "final_ready",
        "passed": True,
        "diagnostics": {"error_count": 0, "errors": []},
        "load_profile": {
            "network_access": False,
            "subprocesses": False,
            "complexity": "fixture",
        },
        "posture": {
            "required_requirements": list(validator.REQUIRED_REQUIREMENT_IDS),
            "traceability_only": True,
            "runtime_capability_promotions_allowed": False,
            "plaintext_credentials_allowed": False,
        },
    }


class ValidateM004S07ValidationArtifactsTests(unittest.TestCase):
    def test_accepts_valid_artifact_phase(self) -> None:
        with FixtureRoot() as root:
            errors, classification = validator.validate(root=root, phase="artifact")
            self.assertEqual([], errors)
            self.assertEqual("artifact_ready", classification)

    def test_accepts_valid_final_phase_when_validation_artifact_exists(self) -> None:
        with FixtureRoot() as root:
            FixtureRoot.write_text(root, validator.FINAL_VALIDATION_PATH, final_validation_text())
            errors, classification = validator.validate(root=root, phase="final")
            self.assertEqual([], errors)
            self.assertEqual("final_ready", classification)

    def test_empty_boundary_map_fails_closed(self) -> None:
        with FixtureRoot() as root:
            FixtureRoot.write_text(root, validator.ROADMAP_PATH, "# Roadmap\n\n## Boundary Map\n\nNot provided\n")
            errors, classification = validator.validate(root=root, phase="artifact")
            self.assertEqual("invalid", classification)
            joined = "\n".join(errors)
            self.assertIn("boundary_map_empty", joined)
            self.assertIn(str(validator.ROADMAP_PATH), joined)

    def test_missing_context_doc_fails_closed(self) -> None:
        with FixtureRoot() as root:
            (root / validator.CONTEXT_PATH).unlink()
            errors, classification = validator.validate(root=root, phase="artifact")
            self.assertEqual("invalid", classification)
            joined = "\n".join(errors)
            self.assertIn("missing text file", joined)
            self.assertIn(str(validator.CONTEXT_PATH), joined)

    def test_missing_r014_reference_fails(self) -> None:
        with FixtureRoot() as root:
            for path in validator.RESTORED_MARKDOWN_PATHS:
                text = (root / path).read_text(encoding="utf-8").replace("R014", "RXXX")
                FixtureRoot.write_text(root, path, text)
            payload = inventory_payload()
            payload["required_requirements"] = [rid for rid in validator.REQUIRED_REQUIREMENT_IDS if rid != "R014"]
            FixtureRoot.write_json(root, validator.INVENTORY_PATH, payload)
            errors, classification = validator.validate(root=root, phase="artifact")
            self.assertEqual("invalid", classification)
            joined = "\n".join(errors)
            self.assertIn("R014", joined)
            self.assertIn("requirement_trace_gap", joined)

    def test_missing_s06_evidence_citation_fails(self) -> None:
        with FixtureRoot() as root:
            for path in validator.RESTORED_MARKDOWN_PATHS:
                text = (root / path).read_text(encoding="utf-8").replace(
                    "runtime-evidence/M004-S06-requirement-coverage.json",
                    "runtime-evidence/missing-ledger.json",
                )
                FixtureRoot.write_text(root, path, text)
            payload = inventory_payload()
            payload["evidence_sources"] = [
                item
                for item in payload["evidence_sources"]
                if item["path"] != "runtime-evidence/M004-S06-requirement-coverage.json"
            ]
            FixtureRoot.write_json(root, validator.INVENTORY_PATH, payload)
            errors, classification = validator.validate(root=root, phase="artifact")
            self.assertEqual("invalid", classification)
            self.assertTrue(any("M004-S06-requirement-coverage.json" in error for error in errors), errors)
            self.assertTrue(any("evidence_citation_missing" in error for error in errors), errors)

    def test_capability_promotion_language_fails(self) -> None:
        with FixtureRoot() as root:
            text = context_text() + "\nlive_runtime_capability_promoted: true\n"
            FixtureRoot.write_text(root, validator.CONTEXT_PATH, text)
            errors, classification = validator.validate(root=root, phase="artifact")
            self.assertEqual("invalid", classification)
            joined = "\n".join(errors)
            self.assertIn("capability_promotion", joined)
            self.assertIn(str(validator.CONTEXT_PATH), joined)

    def test_malformed_s06_audit_json_fails_closed(self) -> None:
        with FixtureRoot() as root:
            target = root / validator.S06_AUDIT_PATH
            target.write_text("{not-json", encoding="utf-8")
            errors, classification = validator.validate(root=root, phase="artifact")
            self.assertEqual("invalid", classification)
            self.assertTrue(any("malformed JSON" in error for error in errors), errors)
            self.assertTrue(any(str(validator.S06_AUDIT_PATH) in error for error in errors), errors)

    def test_secret_like_values_fail_without_echo(self) -> None:
        with FixtureRoot() as root:
            secret_value = "Authorization: Bearer abcdefghijklmnopqrstuvwxyz"
            FixtureRoot.write_text(root, validator.S07_ASSESSMENT_PATH, s07_assessment_text() + "\n" + secret_value + "\n")
            errors, classification = validator.validate(root=root, phase="artifact")
            self.assertEqual("invalid", classification)
            joined = "\n".join(errors)
            self.assertIn("secret-like text value is not redacted", joined)
            self.assertNotIn("abcdefghijklmnopqrstuvwxyz", joined)

    def test_missing_final_validation_artifact_fails_in_final_phase(self) -> None:
        with FixtureRoot() as root:
            errors, classification = validator.validate(root=root, phase="final")
            self.assertEqual("invalid", classification)
            self.assertTrue(any(str(validator.FINAL_VALIDATION_PATH) in error for error in errors), errors)

    def test_write_audit_records_diagnostics_posture_and_load_profile(self) -> None:
        with FixtureRoot() as root:
            exit_code = validator.main([
                "--root",
                str(root),
                "--phase",
                "artifact",
                "--write-audit",
                "runtime-evidence/audit.json",
            ])
            self.assertEqual(0, exit_code)
            audit = json.loads((root / "runtime-evidence/audit.json").read_text(encoding="utf-8"))
            self.assertTrue(audit["passed"])
            self.assertEqual("artifact_ready", audit["classification"])
            self.assertFalse(audit["load_profile"]["network_access"])
            self.assertFalse(audit["load_profile"]["subprocesses"])
            self.assertEqual(list(validator.REQUIRED_REQUIREMENT_IDS), audit["posture"]["required_requirements"])
            self.assertFalse(audit["posture"]["runtime_capability_promotions_allowed"])
            self.assertIn(str(validator.FINAL_VALIDATION_PATH), audit["required_artifacts"])

    def test_failed_audit_is_sanitized(self) -> None:
        with FixtureRoot() as root:
            FixtureRoot.write_text(
                root,
                validator.S07_ASSESSMENT_PATH,
                s07_assessment_text() + "\nAuthorization: Bearer abcdefghijklmnopqrstuvwxyz\n",
            )
            exit_code = validator.main([
                "--root",
                str(root),
                "--phase",
                "artifact",
                "--write-audit",
                "runtime-evidence/failure-audit.json",
            ])
            self.assertEqual(1, exit_code)
            audit_text = (root / "runtime-evidence/failure-audit.json").read_text(encoding="utf-8")
            self.assertNotIn("abcdefghijklmnopqrstuvwxyz", audit_text)
            audit = json.loads(audit_text)
            self.assertFalse(audit["passed"])
            self.assertGreater(audit["diagnostics"]["error_count"], 0)


if __name__ == "__main__":
    unittest.main()
