#!/usr/bin/env python3
"""Fixture tests for scripts/validate_s02_hermes_smoke.py."""

from __future__ import annotations

import copy
import importlib.util
import json
import subprocess
import tempfile
import unittest
from pathlib import Path

SCRIPT_PATH = Path(__file__).resolve().parent / "validate_s02_hermes_smoke.py"
SPEC = importlib.util.spec_from_file_location("validate_s02_hermes_smoke", SCRIPT_PATH)
assert SPEC is not None and SPEC.loader is not None
validator = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(validator)


REPORT = """# Paperclip Live Validation Report

The S02 boundary references hermes_local and expected resultJson.bos output.
Safe smoke tasks require no approvals and no terminal toolset.

Execution-time secret materialization remains blocked with Missing Authentication header.
No Paperclip core source, package code, or database rows were patched directly.
Approvals created | `0`
This is not passing smoke proof.
"""

HEALTH = """# Runtime Capability Health

There is no live Paperclip runtime evidence captured in this fixture.
See plugin-bos-light/capabilities.paperclip-runtime.json for current posture.

T03 remains blocked by execution-time secret materialization.
Do not treat the S02 Hermes adapter as a passing runtime execution surface.
"""


def matrix(status: str = "unvalidated") -> dict:
    return {
        "schema_version": "0.1-test",
        "plugin_key": "bos-light",
        "capabilities": [
            {
                "key": "plugin.runtime.version_build",
                "status": status,
                "paperclip_surface_name": "Version/build",
                "evidence_source": "Fixture evidence.",
            },
            {
                "key": "plugin.runtime.registration",
                "status": "unvalidated",
                "paperclip_surface_name": "Plugin registration",
                "evidence_source": "Fixture evidence.",
            },
            {
                "key": "approvals.native",
                "status": "unvalidated",
                "paperclip_surface_name": "Native approvals",
                "evidence_source": "Fixture evidence.",
            },
        ],
    }


def valid_agent_smoke() -> dict:
    return {
        "schema_version": validator.SCHEMA_VERSION,
        "artifact_type": validator.PASSING_ARTIFACT_TYPE,
        "phase": "agent-smoke",
        "generated_at": "2026-05-29T04:00:00Z",
        "paperclip": {"version": "canary/v2026.525.0", "build": "60efa38"},
        "adapter": {
            "adapterType": "hermes_local",
            "registry_readback": {"adapterType": "hermes_local", "builtin": True},
            "testEnvironment": {"status": "pass", "details": "Hermes CLI available."},
        },
        "agent": {
            "companyId": "company-1",
            "agentId": "agent-1",
            "config": {"adapterType": "hermes_local", "name": "BOS Hermes Smoke"},
            "readback": {"id": "agent-1", "adapterType": "hermes_local"},
        },
        "run": {
            "runId": "run-1",
            "wakeCounts": {"before": 3, "after": 4, "delta": 1},
            "approvalCounts": {"before": 2, "after": 2, "created": 0},
            "resultJson": {
                "bos": {
                    "schemaVersion": "1.0",
                    "runId": "run-1",
                    "issueId": "BOS-2",
                    "division": "Div1.Executive",
                    "role": "safe-smoke",
                    "status": "succeeded",
                    "summary": "Harmless smoke task completed.",
                }
            },
        },
        "no_core_modification": {
            "method": "Supported Paperclip API/browser-authenticated endpoints only; no source patch or direct DB write.",
            "files_modified": [],
            "core_source_patched": False,
            "direct_db_mutation": False,
        },
    }


def valid_environment() -> dict:
    return {
        "schema_version": validator.SCHEMA_VERSION,
        "artifact_type": validator.PASSING_ARTIFACT_TYPE,
        "phase": "environment",
        "generated_at": "2026-05-29T04:00:00+00:00",
        "paperclip": {"version": "canary/v2026.525.0", "build": "60efa38"},
        "adapter": {
            "adapterType": "hermes_local",
            "registry_readback": {"adapterType": "hermes_local"},
            "testEnvironment": {"status": "pass", "output": "ok"},
        },
    }


def valid_blocker() -> dict:
    return {
        "schema_version": validator.SCHEMA_VERSION,
        "artifact_type": validator.BLOCKER_ARTIFACT_TYPE,
        "phase": "environment",
        "generated_at": "2026-05-29T04:00:00Z",
        "blocker_reason": "hermes_cli_not_found",
        "adapter": {
            "adapterType": "hermes_local",
            "testEnvironment": {"status": "fail", "code": "hermes_cli_not_found"},
        },
        "diagnostics": ["Hermes CLI not present in execution environment."],
    }


def write_fixture(root: Path, evidence: dict, matrix_value: dict | None = None) -> Path:
    (root / "docs").mkdir(parents=True)
    (root / "plugin-bos-light").mkdir(parents=True)
    (root / "PAPERCLIP_LIVE_VALIDATION_REPORT.md").write_text(REPORT, encoding="utf-8")
    (root / "docs" / "08_RUNTIME_CAPABILITY_HEALTH.md").write_text(HEALTH, encoding="utf-8")
    (root / "plugin-bos-light" / "capabilities.paperclip-runtime.json").write_text(
        json.dumps(matrix_value if matrix_value is not None else matrix(), indent=2),
        encoding="utf-8",
    )
    evidence_path = root / "runtime-evidence" / "fixture.json"
    evidence_path.parent.mkdir()
    evidence_path.write_text(json.dumps(evidence, indent=2), encoding="utf-8")
    return evidence_path


class S02HermesSmokeValidatorTests(unittest.TestCase):
    def validate_fixture(self, evidence: dict, matrix_value: dict | None = None):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            evidence_path = write_fixture(root, evidence, matrix_value)
            return validator.validate(evidence_path, root)

    def assertInvalidContains(self, evidence: dict, expected: str, matrix_value: dict | None = None) -> None:
        errors, classification = self.validate_fixture(evidence, matrix_value)
        self.assertEqual("invalid", classification)
        self.assertIn(expected, "\n".join(errors))

    def test_valid_agent_smoke_passes(self):
        errors, classification = self.validate_fixture(valid_agent_smoke())
        self.assertEqual([], errors)
        self.assertEqual("passing", classification)

    def test_valid_environment_phase_passes(self):
        errors, classification = self.validate_fixture(valid_environment())
        self.assertEqual([], errors)
        self.assertEqual("passing", classification)

    def test_fail_closed_blocker_is_valid_but_not_passing(self):
        errors, classification = self.validate_fixture(valid_blocker())
        self.assertEqual([], errors)
        self.assertEqual("blocker", classification)

    def test_rejects_missing_result_json_bos(self):
        evidence = valid_agent_smoke()
        evidence["run"]["resultJson"] = {}
        self.assertInvalidContains(evidence, "run.resultJson.bos")

    def test_rejects_wrong_adapter_type(self):
        evidence = valid_agent_smoke()
        evidence["adapter"]["adapterType"] = "process"
        evidence["adapter"]["registry_readback"]["adapterType"] = "process"
        self.assertInvalidContains(evidence, "must be hermes_local")

    def test_rejects_duplicate_wake(self):
        evidence = valid_agent_smoke()
        evidence["run"]["wakeCounts"] = {"before": 3, "after": 5, "delta": 2}
        self.assertInvalidContains(evidence, "no duplicate wake")

    def test_rejects_created_approvals(self):
        evidence = valid_agent_smoke()
        evidence["run"]["approvalCounts"] = {"before": 2, "after": 3, "created": 1}
        self.assertInvalidContains(evidence, "expected zero created approvals")

    def test_rejects_promoted_capabilities_without_version_build_and_readback(self):
        evidence = valid_agent_smoke()
        evidence["capability_promotions"] = ["plugin.runtime.version_build"]
        del evidence["paperclip"]["version"]
        del evidence["paperclip"]["build"]
        evidence["adapter"].pop("registry_readback")
        evidence["agent"].pop("readback")
        errors, classification = self.validate_fixture(evidence)
        joined = "\n".join(errors)
        self.assertEqual("invalid", classification)
        self.assertIn("Paperclip version proof", joined)
        self.assertIn("Paperclip build proof", joined)
        self.assertIn("adapter.registry_readback", joined)
        self.assertIn("agent.readback", joined)

    def test_rejects_confirmed_matrix_capability_without_version_build_and_readback(self):
        evidence = valid_environment()
        evidence["paperclip"] = {}
        evidence["adapter"].pop("registry_readback")
        self.assertInvalidContains(evidence, "promoted capabilities", matrix(status="confirmed"))

    def test_rejects_unredacted_secret_like_key(self):
        evidence = valid_agent_smoke()
        evidence["request"] = {"apiKey": "not-redacted-value"}
        self.assertInvalidContains(evidence, "secret-like field must be redacted")

    def test_rejects_unredacted_secret_like_value(self):
        evidence = valid_agent_smoke()
        evidence["diagnostics"] = ["Bearer abcdefghijklmnop leaked into logs"]
        self.assertInvalidContains(evidence, "secret-like string value is not redacted")

    def test_rejects_blocker_without_reason(self):
        evidence = valid_blocker()
        evidence["blocker_reason"] = ""
        self.assertInvalidContains(evidence, "blocker reason")

    def test_cli_accepts_phase_and_evidence_options(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            evidence_path = write_fixture(root, valid_environment())
            result = subprocess.run(
                [
                    "python3",
                    str(SCRIPT_PATH),
                    "--phase",
                    "environment",
                    "--evidence",
                    str(evidence_path),
                    "--root",
                    str(root),
                ],
                text=True,
                capture_output=True,
                check=False,
            )
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("contract is satisfied", result.stdout)

    def test_cli_accepts_final_phase_for_valid_blocker_docs(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            evidence = valid_blocker()
            evidence["phase"] = "agent-smoke"
            evidence["blocker_reason"] = "execution_time_secret_materialization"
            evidence_path = write_fixture(root, evidence)
            result = subprocess.run(
                [
                    "python3",
                    str(SCRIPT_PATH),
                    "--phase",
                    "final",
                    "--evidence",
                    str(evidence_path),
                    "--root",
                    str(root),
                ],
                text=True,
                capture_output=True,
                check=False,
            )
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("blocker artifact OK", result.stdout)

    def test_rejects_missing_no_core_modification_proof_for_passing_smoke(self):
        evidence = valid_agent_smoke()
        evidence.pop("no_core_modification")
        self.assertInvalidContains(evidence, "no_core_modification")


if __name__ == "__main__":
    unittest.main(verbosity=2)
