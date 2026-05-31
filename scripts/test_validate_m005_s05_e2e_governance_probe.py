#!/usr/bin/env python3
"""Test fixtures for M005 S05 e2e governance probe validator."""

from __future__ import annotations

import json
import os
import sys
import tempfile
import unittest
from pathlib import Path

# Add repo root to path for importing validator
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from scripts.validate_m005_s05_e2e_governance_probe import (
    SCHEMA_VERSION,
    BLOCKER_ARTIFACT_TYPE,
    PASSING_ARTIFACT_TYPE,
    PHASE,
    validate,
    _write_audit,
)


class TestValidateM005S05(unittest.TestCase):
    def _write(self, data: dict) -> Path:
        fd, path = tempfile.mkstemp(suffix=".json")
        with os.fdopen(fd, "w") as f:
            json.dump(data, f)
        return Path(path)

    def _base_evidence(self, artifact_type: str = BLOCKER_ARTIFACT_TYPE, passing: bool = False) -> dict:
        return {
            "schema_version": SCHEMA_VERSION,
            "artifact_type": artifact_type,
            "phase": PHASE,
            "generated_at": "2024-01-01T00:00:00Z",
            "passing": passing,
            "capability_promotions": [],
            "env_discovery": {
                "GITHUB_TOKEN": {"present": False, "description": "GitHub token", "value_redacted": None},
                "PAPERCLIP_API_KEY": {"present": False, "description": "Paperclip API key", "value_redacted": None},
            },
            "no_core_modification": {
                "method": "Simulated adapters only",
                "files_modified": [],
                "core_source_patched": False,
                "paperclip_core_patched": False,
                "direct_db_mutation": False,
                "private_internal_imports": False,
            },
            "safety": {
                "plaintext_secrets_requested_or_logged": False,
                "unsupported_paths_used": [],
                "max_paperclip_mutations": 0,
                "runner_exit_policy": "exit_zero_for_valid_proof_or_valid_fail_closed_blocker",
            },
        }

    def _smoke_ok(self, key: str) -> dict:
        return {"ok": True}

    # Fixture 1: passing mission intake proof
    def test_passing_mission_intake(self):
        evidence = self._base_evidence(PASSING_ARTIFACT_TYPE, True)
        evidence["mission_intake_smoke"] = self._smoke_ok("mission_intake")
        evidence["branch_policy_smoke"] = self._smoke_ok("branch_policy")
        evidence["hitl_gates_smoke"] = self._smoke_ok("hitl_gates")
        evidence["qa_review_smoke"] = self._smoke_ok("qa_review")
        evidence["circuit_breaker_smoke"] = self._smoke_ok("circuit_breaker")
        evidence["div6_pr_smoke"] = self._smoke_ok("div6_pr")
        evidence["capability_promotions"] = ["workflow.mission_intake"]
        path = self._write(evidence)
        errors, classification = validate(path)
        self.assertEqual(errors, [])
        self.assertEqual(classification, "passing")

    # Fixture 2: passing HITL gates proof
    def test_passing_hitl_gates(self):
        evidence = self._base_evidence(PASSING_ARTIFACT_TYPE, True)
        for key in ("mission_intake_smoke", "branch_policy_smoke", "hitl_gates_smoke", "qa_review_smoke", "circuit_breaker_smoke", "div6_pr_smoke"):
            evidence[key] = self._smoke_ok(key)
        evidence["capability_promotions"] = ["workflow.hitl_gates", "workflow.branch_policy"]
        path = self._write(evidence)
        errors, classification = validate(path)
        self.assertEqual(errors, [])
        self.assertEqual(classification, "passing")

    # Fixture 3: fail-closed blocker missing GitHub token
    def test_blocker_missing_github_token(self):
        evidence = self._base_evidence(BLOCKER_ARTIFACT_TYPE, False)
        evidence["blocker_reason"] = "missing_github_token"
        evidence["blocker_codes"] = ["missing_github_token"]
        for key in ("mission_intake_smoke", "branch_policy_smoke", "hitl_gates_smoke", "qa_review_smoke", "circuit_breaker_smoke", "div6_pr_smoke"):
            evidence[key] = {"ok": False}
        path = self._write(evidence)
        errors, classification = validate(path)
        self.assertEqual(errors, [])
        self.assertEqual(classification, "blocker")

    # Fixture 4: fail-closed blocker missing Paperclip auth
    def test_blocker_missing_paperclip_auth(self):
        evidence = self._base_evidence(BLOCKER_ARTIFACT_TYPE, False)
        evidence["blocker_reason"] = "missing_paperclip_api_key"
        evidence["blocker_codes"] = ["missing_paperclip_api_key"]
        for key in ("mission_intake_smoke", "branch_policy_smoke", "hitl_gates_smoke", "qa_review_smoke", "circuit_breaker_smoke", "div6_pr_smoke"):
            evidence[key] = {"ok": False}
        path = self._write(evidence)
        errors, classification = validate(path)
        self.assertEqual(errors, [])
        self.assertEqual(classification, "blocker")

    # Fixture 5: fail-closed blocker branch policy violation
    def test_blocker_branch_policy_violation(self):
        evidence = self._base_evidence(BLOCKER_ARTIFACT_TYPE, False)
        evidence["blocker_reason"] = "branch_policy_smoke_failed"
        evidence["blocker_codes"] = ["branch_policy_smoke_failed"]
        evidence["branch_policy_smoke"] = {"ok": False}
        for key in ("mission_intake_smoke", "hitl_gates_smoke", "qa_review_smoke", "circuit_breaker_smoke", "div6_pr_smoke"):
            evidence[key] = {"ok": False}
        path = self._write(evidence)
        errors, classification = validate(path)
        self.assertEqual(errors, [])
        self.assertEqual(classification, "blocker")

    # Fixture 6: fail-closed blocker QA review fail
    def test_blocker_qa_review_fail(self):
        evidence = self._base_evidence(BLOCKER_ARTIFACT_TYPE, False)
        evidence["blocker_reason"] = "qa_review_smoke_failed"
        evidence["blocker_codes"] = ["qa_review_smoke_failed"]
        evidence["qa_review_smoke"] = {"ok": False}
        for key in ("mission_intake_smoke", "branch_policy_smoke", "hitl_gates_smoke", "circuit_breaker_smoke", "div6_pr_smoke"):
            evidence[key] = {"ok": False}
        path = self._write(evidence)
        errors, classification = validate(path)
        self.assertEqual(errors, [])
        self.assertEqual(classification, "blocker")

    # Fixture 7: fail-closed blocker Circuit Breaker OPEN unresolved
    def test_blocker_circuit_breaker_open(self):
        evidence = self._base_evidence(BLOCKER_ARTIFACT_TYPE, False)
        evidence["blocker_reason"] = "circuit_breaker_smoke_failed"
        evidence["blocker_codes"] = ["circuit_breaker_smoke_failed"]
        evidence["circuit_breaker_smoke"] = {"ok": False}
        for key in ("mission_intake_smoke", "branch_policy_smoke", "hitl_gates_smoke", "qa_review_smoke", "div6_pr_smoke"):
            evidence[key] = {"ok": False}
        path = self._write(evidence)
        errors, classification = validate(path)
        self.assertEqual(errors, [])
        self.assertEqual(classification, "blocker")

    # Fixture 8: unredacted secrets in diagnostics
    def test_unredacted_secrets_rejected(self):
        evidence = self._base_evidence(BLOCKER_ARTIFACT_TYPE, False)
        evidence["blocker_reason"] = "missing_github_token"
        evidence["blocker_codes"] = ["missing_github_token"]
        evidence["diagnostics"] = {"message": "token=ghp_abcdefghijklmnopqrstuvwxyz0123456789"}
        for key in ("mission_intake_smoke", "branch_policy_smoke", "hitl_gates_smoke", "qa_review_smoke", "circuit_breaker_smoke", "div6_pr_smoke"):
            evidence[key] = {"ok": False}
        path = self._write(evidence)
        errors, classification = validate(path)
        self.assertTrue(any("secret" in e.lower() or "redacted" in e.lower() for e in errors), f"Expected secret redaction error, got {errors}")
        self.assertEqual(classification, "invalid")

    # Fixture 9: malformed timestamp
    def test_malformed_timestamp_rejected(self):
        evidence = self._base_evidence(BLOCKER_ARTIFACT_TYPE, False)
        evidence["generated_at"] = "not-a-timestamp"
        evidence["blocker_reason"] = "missing_github_token"
        evidence["blocker_codes"] = ["missing_github_token"]
        for key in ("mission_intake_smoke", "branch_policy_smoke", "hitl_gates_smoke", "qa_review_smoke", "circuit_breaker_smoke", "div6_pr_smoke"):
            evidence[key] = {"ok": False}
        path = self._write(evidence)
        errors, classification = validate(path)
        self.assertTrue(any("timestamp" in e.lower() for e in errors), f"Expected timestamp error, got {errors}")
        self.assertEqual(classification, "invalid")

    # Fixture 10: unsupported paths used
    def test_unsupported_paths_rejected(self):
        evidence = self._base_evidence(BLOCKER_ARTIFACT_TYPE, False)
        evidence["blocker_reason"] = "missing_github_token"
        evidence["blocker_codes"] = ["missing_github_token"]
        evidence["safety"]["unsupported_paths_used"] = ["/admin/secrets", "/api/internal"]
        for key in ("mission_intake_smoke", "branch_policy_smoke", "hitl_gates_smoke", "qa_review_smoke", "circuit_breaker_smoke", "div6_pr_smoke"):
            evidence[key] = {"ok": False}
        path = self._write(evidence)
        errors, classification = validate(path)
        self.assertTrue(any("unsupported" in e.lower() for e in errors), f"Expected unsupported paths error, got {errors}")
        self.assertEqual(classification, "invalid")

    # Fixture 11: capability promotion in blocker artifact
    def test_capability_promotion_in_blocker_rejected(self):
        evidence = self._base_evidence(BLOCKER_ARTIFACT_TYPE, False)
        evidence["blocker_reason"] = "missing_github_token"
        evidence["blocker_codes"] = ["missing_github_token"]
        evidence["capability_promotions"] = ["workflow.mission_intake"]
        for key in ("mission_intake_smoke", "branch_policy_smoke", "hitl_gates_smoke", "qa_review_smoke", "circuit_breaker_smoke", "div6_pr_smoke"):
            evidence[key] = {"ok": False}
        path = self._write(evidence)
        errors, classification = validate(path)
        self.assertTrue(any("capability_promotions" in e for e in errors), f"Expected capability promotion error, got {errors}")
        self.assertEqual(classification, "invalid")

    # Fixture 12: CLI write-audit closeout
    def test_write_audit_closeout(self):
        evidence = self._base_evidence(BLOCKER_ARTIFACT_TYPE, False)
        evidence["blocker_reason"] = "missing_github_token"
        evidence["blocker_codes"] = ["missing_github_token"]
        for key in ("mission_intake_smoke", "branch_policy_smoke", "hitl_gates_smoke", "qa_review_smoke", "circuit_breaker_smoke", "div6_pr_smoke"):
            evidence[key] = {"ok": False}
        path = self._write(evidence)
        errors, classification = validate(path)
        self.assertEqual(errors, [])

        audit_path = Path(tempfile.mktemp(suffix=".json"))
        _write_audit(audit_path, Path("."), path, errors, classification)
        audit = json.loads(audit_path.read_text())
        self.assertEqual(audit["schema_version"], "m005-s05-e2e-governance-closeout/v1")
        self.assertEqual(audit["classification"], "blocker")
        self.assertTrue(audit["passed"])
        self.assertEqual(audit["diagnostics"]["error_count"], 0)


if __name__ == "__main__":
    unittest.main(verbosity=2)
