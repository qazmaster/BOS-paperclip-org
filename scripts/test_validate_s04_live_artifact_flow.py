#!/usr/bin/env python3
"""Fixture tests for scripts/validate_s04_live_artifact_flow.py."""

from __future__ import annotations

import copy
import importlib.util
import json
import subprocess
import tempfile
import unittest
from pathlib import Path

SCRIPT_PATH = Path(__file__).resolve().parent / "validate_s04_live_artifact_flow.py"
SPEC = importlib.util.spec_from_file_location("validate_s04_live_artifact_flow", SCRIPT_PATH)
assert SPEC is not None and SPEC.loader is not None
validator = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(validator)


FAMILIES = ("BPI", "Blueprint", "Betting Table", "Eval Gate", "Circuit Breaker")


def valid_evidence() -> dict:
    family_map = {
        family: {
            "present": True,
            "surfaces": ["document", "comment"],
            "readback_refs": ["DOC-1", "COM-1"],
            "readback_hashes": ["a" * 64, "b" * 64],
            "snippet": f"## BOS {family} Evidence",
        }
        for family in FAMILIES
    }
    return {
        "schema_version": validator.SCHEMA_VERSION,
        "artifact_type": validator.PASSING_ARTIFACT_TYPE,
        "phase": "live",
        "generated_at": "2026-05-29T04:00:00Z",
        "inputs": {
            "base_url": "http://127.0.0.1:3131",
            "companyId": "company-1",
            "issueId": "ISS-1",
            "auth_token_env": "<redacted>",
            "auth_header_name": "<redacted>",
        },
        "runtime": {"version": "2026.5.29", "build": "abc123"},
        "company_issue_context": {"companyId": "company-1", "issueId": "ISS-1", "title": "BOS Light S04 sandbox"},
        "artifact_refs": {"issue": "ISS-1", "document": "DOC-1", "comments": ["COM-1"], "native_approval": None},
        "readbacks": {
            "issue": {"kind": "issue", "ref": "ISS-1", "status_code": 200, "ok": True, "sha256": None, "snippet": "BOS Light S04 sandbox"},
            "document": {"kind": "document", "ref": "DOC-1", "status_code": 200, "ok": True, "sha256": "a" * 64, "snippet": "## BOS BPI Evidence\n## BOS Blueprint Evidence"},
            "comments": [
                {"kind": "comment", "ref": "COM-1", "status_code": 200, "ok": True, "sha256": "b" * 64, "snippet": "## BOS Betting Table Evidence\n## BOS Eval Gate Evidence\n## BOS Circuit Breaker Evidence"}
            ],
        },
        "artifact_families": family_map,
        "side_effect_counts": {
            "issues_created": 1,
            "documents_created": 1,
            "comments_created": 1,
            "approval_requests_created": 0,
            "activity_logs_written": 0,
            "hermes_runs_started": 0,
            "gsd_pi_runs_started": 0,
        },
        "no_go_guards": {
            "hermes": {
                "system": "S02.Hermes",
                "evidence_ref": "runtime-evidence/M002-S02-hermes-smoke.json",
                "source_schema_version": "s02-hermes-smoke/v1",
                "source_artifact_type": "fail-closed-blocker",
                "source_phase": "agent-smoke",
                "result_json_bos_present": False,
                "status": "blocked",
                "no_go": True,
                "execution_allowed": False,
                "propagated_blocker": True,
                "reason": "missing_result_json_bos",
            },
            "gsd_pi": {
                "system": "S03.GSD-Pi",
                "evidence_ref": "runtime-evidence/M002-S03-gsdpi-smoke.json",
                "source_schema_version": "s03-gsdpi-smoke/v1",
                "source_artifact_type": "fail-closed-blocker",
                "source_phase": "execute",
                "bos_adapter_result_present": False,
                "status": "blocked",
                "no_go": True,
                "execution_allowed": False,
                "propagated_blocker": True,
                "reason": "gsdpi_local_execution_not_attempted_registration_blocked",
            },
        },
        "diagnostics": [
            {"phase": "runtime.health", "status_code": 200, "bounded_response_text": "ok", "malformed_json_reason": None, "timeout_ms": None, "fallback_used": False, "message": "Paperclip health readback"},
            {"phase": "documents.native", "status_code": 201, "bounded_response_text": None, "malformed_json_reason": None, "timeout_ms": None, "fallback_used": False, "message": "document created"},
        ],
        "no_core_modification": {
            "method": "Supported Paperclip HTTP issue/document/comment endpoints only; no Paperclip core source patch, private module import, or direct database write.",
            "files_modified": [],
            "core_source_patched": False,
            "direct_db_mutation": False,
            "private_module_import": False,
        },
        "invariants": {
            "no_core_patch": True,
            "no_direct_db_access": True,
            "no_secret_diagnostics": True,
            "no_native_approval": True,
            "no_activity_events": True,
            "hermes_execution_attempted": False,
            "gsd_pi_execution_attempted": False,
        },
    }


def valid_blocker() -> dict:
    evidence = valid_evidence()
    evidence["artifact_type"] = validator.BLOCKER_ARTIFACT_TYPE
    evidence["blocker_reason"] = "document_creation_failed"
    evidence["readbacks"]["document"]["ok"] = False
    evidence["readbacks"]["document"]["sha256"] = None
    return evidence


def write_evidence(root: Path, evidence: dict | str) -> Path:
    path = root / "evidence.json"
    if isinstance(evidence, str):
        path.write_text(evidence, encoding="utf-8")
    else:
        path.write_text(json.dumps(evidence, indent=2), encoding="utf-8")
    return path


class S04LiveArtifactFlowValidatorTests(unittest.TestCase):
    def validate_fixture(self, evidence: dict | str, phase: str | None = None):
        with tempfile.TemporaryDirectory() as tmp:
            path = write_evidence(Path(tmp), evidence)
            return validator.validate(path, phase_override=phase)

    def assertInvalidContains(self, evidence: dict | str, expected: str, phase: str | None = "final") -> None:
        errors, classification = self.validate_fixture(evidence, phase)
        self.assertEqual("invalid", classification)
        self.assertIn(expected, "\n".join(errors))

    def test_valid_final_evidence_passes(self):
        errors, classification = self.validate_fixture(valid_evidence(), phase="final")
        self.assertEqual([], errors)
        self.assertEqual("passing", classification)

    def test_live_phase_accepts_valid_blocker_as_diagnostic_only(self):
        errors, classification = self.validate_fixture(valid_blocker(), phase="live")
        self.assertEqual([], errors)
        self.assertEqual("blocker", classification)

    def test_final_rejects_blocker_or_fallback_only_claim(self):
        self.assertInvalidContains(valid_blocker(), "final S04 validation requires live-evidence", phase="final")

    def test_rejects_missing_document_readback(self):
        evidence = valid_evidence()
        evidence["readbacks"]["document"] = {}
        self.assertInvalidContains(evidence, "readbacks.document")

    def test_rejects_missing_artifact_family(self):
        evidence = valid_evidence()
        del evidence["artifact_families"]["Eval Gate"]
        self.assertInvalidContains(evidence, "artifact_families.Eval Gate")

    def test_rejects_native_approval_overclaim(self):
        evidence = valid_evidence()
        evidence["side_effect_counts"]["approval_requests_created"] = 1
        self.assertInvalidContains(evidence, "approval_requests_created")

    def test_rejects_hermes_passing_claim_without_s04_no_go(self):
        evidence = valid_evidence()
        evidence["no_go_guards"]["hermes"]["source_artifact_type"] = "smoke-evidence"
        evidence["no_go_guards"]["hermes"]["result_json_bos_present"] = True
        evidence["no_go_guards"]["hermes"]["execution_allowed"] = True
        evidence["no_go_guards"]["hermes"]["no_go"] = False
        self.assertInvalidContains(evidence, "Hermes execution no-go")

    def test_rejects_gsdpi_passing_claim_without_s04_no_go(self):
        evidence = valid_evidence()
        evidence["no_go_guards"]["gsd_pi"]["source_artifact_type"] = "smoke-evidence"
        evidence["no_go_guards"]["gsd_pi"]["bos_adapter_result_present"] = True
        evidence["no_go_guards"]["gsd_pi"]["execution_allowed"] = True
        evidence["no_go_guards"]["gsd_pi"]["no_go"] = False
        self.assertInvalidContains(evidence, "GSD-Pi execution no-go")

    def test_rejects_secret_like_values(self):
        evidence = valid_evidence()
        evidence["diagnostics"][0]["bounded_response_text"] = "Bearer abcdefghijklmnopqrstuvwxyz leaked"
        self.assertInvalidContains(evidence, "secret-like string value is not redacted")

    def test_rejects_core_db_private_mutation_claims(self):
        evidence = valid_evidence()
        evidence["no_core_modification"]["direct_db_mutation"] = True
        self.assertInvalidContains(evidence, "direct_db_mutation")
        evidence = valid_evidence()
        evidence["no_core_modification"]["private_module_import"] = True
        self.assertInvalidContains(evidence, "private_module_import")
        evidence = valid_evidence()
        evidence["no_core_modification"]["core_source_patched"] = True
        self.assertInvalidContains(evidence, "core_source_patched")

    def test_rejects_malformed_json(self):
        self.assertInvalidContains("{not json", "malformed JSON", phase="final")

    def test_rejects_missing_runtime_build(self):
        evidence = valid_evidence()
        evidence["runtime"]["build"] = "unknown"
        self.assertInvalidContains(evidence, "runtime.build")

    def test_cli_accepts_phase_and_evidence_options(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = write_evidence(Path(tmp), valid_evidence())
            result = subprocess.run(
                ["python3", str(SCRIPT_PATH), "--phase", "final", "--evidence", str(path)],
                text=True,
                capture_output=True,
                check=False,
            )
        self.assertEqual(result.returncode, 0, result.stderr)


if __name__ == "__main__":
    unittest.main()
