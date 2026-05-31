#!/usr/bin/env python3
"""Fixture tests for scripts/validate_m003_s04_live_decision_artifact_readback.py."""

from __future__ import annotations

import copy
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

SCRIPT_PATH = Path(__file__).resolve().parent / "validate_m003_s04_live_decision_artifact_readback.py"
SPEC = importlib.util.spec_from_file_location("validate_m003_s04_live_decision_artifact_readback", SCRIPT_PATH)
assert SPEC is not None and SPEC.loader is not None
validator = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(validator)


def valid_evidence() -> dict:
    return {
        "schema_version": validator.SCHEMA_VERSION,
        "artifact_type": validator.PASSING_ARTIFACT_TYPE,
        "phase": "live",
        "generated_at": "2026-05-31T00:00:00Z",
        "inputs": {"base_url": "http://127.0.0.1:3131", "companyId": "company-1", "issueId": "ISS-1", "auth_token_env": "PAPERCLIP_API_KEY", "auth_header_name": "<redacted>", "trusted_origin": "http://127.0.0.1:3131"},
        "runtime": {"version": "2026.5.31", "build": "abc123"},
        "company_issue_context": {"companyId": "company-1", "issueId": "ISS-1", "title": "BOS M003 S04 sandbox"},
        "decision_artifact": {"decision_id": "decision_m003_s04_live_readback", "decided_by": "Div7.MissionControl", "diagnostics_sanitized": True, "native_approval_mutated": False, "selected_surface": "documents.native", "markdown_sha256": "a" * 64},
        "selected_surface": "documents.native",
        "artifact_ref": "paperclip://issues/ISS-1/documents/DOC-1",
        "readback_status": "ok",
        "content_hash": "a" * 64,
        "bounded_snippet": "# BOS Decision Record",
        "artifact_refs": {"document": "DOC-1", "comments": [], "markdown_fallback": "markdown-only://issues/ISS-1/decisions/decision_m003_s04_live_readback", "native_approval": None},
        "readbacks": {"documents": [{"kind": "document", "ref": "DOC-1", "status_code": 200, "ok": True, "sha256": "a" * 64, "expected_sha256": "a" * 64, "hash_match": True, "snippet": "# BOS Decision Record"}], "comments": []},
        "side_effect_counts": {"issues_created": 1, "documents_created": 1, "comments_created": 0, "approval_requests_created": 0, "activity_logs_written": 0, "hermes_runs_started": 0, "gsd_pi_runs_started": 0, "plugin_actions_invoked": 0},
        "capability_claims": {"native_approval": False, "activity_log": False, "hermes": False, "gsd_pi": False, "plugin_actions": False, "unsupported_capability_promoted": False},
        "fallback": {"reason": None, "deterministic_ref": "markdown-only://issues/ISS-1/decisions/decision_m003_s04_live_readback", "artifact_id": "markdown-only:ISS-1:decisions:decision_m003_s04_live_readback", "live_proof": False},
        "diagnostics": [{"phase": "documents.read", "status_code": 200, "bounded_response_text": None, "malformed_json_reason": None, "timeout_ms": None, "fallback_used": False, "message": "document readback attempted"}],
        "invariants": {"decided_by": "Div7.MissionControl", "diagnostics_sanitized": True, "native_approval_mutated": False, "no_secret_diagnostics": True, "hermes_execution_attempted": False, "gsd_pi_execution_attempted": False},
    }


def valid_blocker() -> dict:
    evidence = valid_evidence()
    evidence["artifact_type"] = validator.BLOCKER_ARTIFACT_TYPE
    evidence["selected_surface"] = "markdown-only"
    evidence["artifact_ref"] = evidence["fallback"]["deterministic_ref"]
    evidence["readback_status"] = "blocked_preflight"
    evidence["content_hash"] = None
    evidence["bounded_snippet"] = None
    evidence["blocker_reason"] = "missing_auth_token_env"
    evidence["readbacks"] = {"documents": [], "comments": []}
    evidence["artifact_refs"]["document"] = None
    evidence["fallback"]["reason"] = "missing_auth_token_env"
    return evidence


def write_evidence(root: Path, evidence: dict | str) -> Path:
    path = root / "evidence.json"
    path.write_text(evidence if isinstance(evidence, str) else json.dumps(evidence, indent=2), encoding="utf-8")
    return path


class M003S04LiveReadbackValidatorTests(unittest.TestCase):
    def validate_fixture(self, evidence: dict | str):
        with tempfile.TemporaryDirectory() as tmp:
            return validator.validate(write_evidence(Path(tmp), evidence))

    def assertInvalidContains(self, evidence: dict | str, expected: str) -> None:
        errors, classification = self.validate_fixture(evidence)
        self.assertEqual("invalid", classification)
        self.assertIn(expected, "\n".join(errors))

    def test_valid_live_evidence_passes(self):
        errors, classification = self.validate_fixture(valid_evidence())
        self.assertEqual([], errors)
        self.assertEqual("passing", classification)

    def test_valid_fail_closed_blocker_passes(self):
        errors, classification = self.validate_fixture(valid_blocker())
        self.assertEqual([], errors)
        self.assertEqual("blocker", classification)

    def test_rejects_missing_successful_native_readback(self):
        evidence = valid_evidence()
        evidence["readbacks"]["documents"][0]["hash_match"] = False
        self.assertInvalidContains(evidence, "live-evidence requires at least one successful native")

    def test_rejects_missing_blocker_reason(self):
        evidence = valid_blocker()
        del evidence["blocker_reason"]
        self.assertInvalidContains(evidence, "blocker_reason")

    def test_rejects_secret_like_values(self):
        evidence = valid_evidence()
        evidence["diagnostics"][0]["bounded_response_text"] = "Bearer abcdefghijklmnopqrstuvwxyz leaked"
        self.assertInvalidContains(evidence, "secret-like string value is not redacted")

    def test_rejects_native_approval_or_plugin_action_side_effects(self):
        evidence = valid_evidence()
        evidence["side_effect_counts"]["approval_requests_created"] = 1
        self.assertInvalidContains(evidence, "approval_requests_created")
        evidence = valid_evidence()
        evidence["side_effect_counts"]["plugin_actions_invoked"] = 1
        self.assertInvalidContains(evidence, "plugin_actions_invoked")

    def test_rejects_unsupported_capability_promotion(self):
        evidence = valid_evidence()
        evidence["capability_claims"]["unsupported_capability_promoted"] = True
        self.assertInvalidContains(evidence, "unsupported_capability_promoted")

    def test_rejects_markdown_fallback_as_live_proof(self):
        evidence = valid_blocker()
        evidence["fallback"]["live_proof"] = True
        self.assertInvalidContains(evidence, "fallback.live_proof")

    def test_rejects_malformed_json_file(self):
        self.assertInvalidContains("{bad", "malformed JSON")

    def test_main_accepts_final_mode_evidence_flag(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = write_evidence(Path(tmp), valid_blocker())
            self.assertEqual(0, validator.main(["--evidence", str(path), "--phase", "final"]))


if __name__ == "__main__":
    unittest.main()
