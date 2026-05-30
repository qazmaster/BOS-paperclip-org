#!/usr/bin/env python3
"""Fixture tests for scripts/validate_s03_gsdpi_smoke.py."""

from __future__ import annotations

import copy
import importlib.util
import json
import subprocess
import tempfile
import unittest
from pathlib import Path

SCRIPT_PATH = Path(__file__).resolve().parent / "validate_s03_gsdpi_smoke.py"
SPEC = importlib.util.spec_from_file_location("validate_s03_gsdpi_smoke", SCRIPT_PATH)
assert SPEC is not None and SPEC.loader is not None
validator = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(validator)


REPORT = """# Paperclip Live Validation Report

S03 GSD-Pi local adapter smoke uses gsdpi_local and requires BosAdapterResult evidence.
No Paperclip core source, package code, or database rows were patched directly.
Approvals created | `0`
"""

HEALTH = """# Runtime Capability Health

GSD-Pi adapter execution remains unvalidated until S03 proof exists.
For S04, use document/comment/markdown fallbacks unless registry, testEnvironment, and BosAdapterResult execution proof passes.
plugin-bos-light/capabilities.paperclip-runtime.json remains the source of truth.
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
                "key": "registration.tools",
                "status": "unvalidated",
                "paperclip_surface_name": "Tools",
                "evidence_source": "Fixture evidence.",
            },
        ],
    }


def valid_environment() -> dict:
    return {
        "schema_version": validator.SCHEMA_VERSION,
        "artifact_type": validator.PASSING_ARTIFACT_TYPE,
        "phase": "environment",
        "generated_at": "2026-05-29T04:00:00Z",
        "paperclip": {"version": "canary/v2026.525.0", "build": "60efa38"},
        "adapter": {
            "adapterType": "gsdpi_local",
            "registry_readback": {"adapterType": "gsdpi_local", "loaded": True},
            "testEnvironment": {"status": "pass", "checks": [{"code": "gsd_version", "level": "info"}]},
        },
        "runtime": {
            "command": "gsd",
            "version": "gsd-pi 1.2.3",
            "node": "v24.16.0",
        },
        "no_core_modification": {
            "method": "Supported Paperclip external adapter/container boundary only; no source patch or direct DB write.",
            "files_modified": [],
            "core_source_patched": False,
            "direct_db_mutation": False,
        },
    }


def valid_execute() -> dict:
    evidence = copy.deepcopy(valid_environment())
    evidence["phase"] = "execute"
    evidence["agent"] = {
        "companyId": "company-1",
        "agentId": "agent-1",
        "config": {"adapterType": "gsdpi_local", "name": "BOS GSD-Pi Smoke"},
        "readback": {"id": "agent-1", "adapterType": "gsdpi_local"},
    }
    evidence["run"] = {
        "runId": "run-1",
        "wakeCounts": {"before": 1, "after": 2, "delta": 1},
        "approvalCounts": {"before": 0, "after": 0, "created": 0},
        "sourceWriteCounts": {"created": 0, "modified": 0, "deleted": 0},
        "resultJson": {
            "bosAdapterResult": {
                "schemaVersion": "1.0",
                "runId": "run-1",
                "adapterType": "gsdpi_local",
                "status": "succeeded",
                "gateResults": [{"gateId": "Div4-smoke", "status": "passed"}],
            }
        },
    }
    return evidence


def valid_registration() -> dict:
    evidence = copy.deepcopy(valid_environment())
    evidence["phase"] = "registration"
    evidence["registration"] = {
        "method": "external-adapter-package",
        "registered": True,
        "adapterType": "gsdpi_local",
        "readback": {"adapterType": "gsdpi_local", "loaded": True},
    }
    return evidence


def valid_blocker() -> dict:
    return {
        "schema_version": validator.SCHEMA_VERSION,
        "artifact_type": validator.BLOCKER_ARTIFACT_TYPE,
        "phase": "registration",
        "generated_at": "2026-05-29T04:00:00Z",
        "blocker_reason": "adapter_registration_requires_core_patch",
        "adapter": {"adapterType": "gsdpi_local"},
        "diagnostics": {"registration": {"status": "blocked"}},
        "no_core_modification": {
            "method": "Stopped before unsupported Paperclip mutation.",
            "files_modified": [],
            "core_source_patched": False,
            "direct_db_mutation": False,
        },
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


class S03GsdPiSmokeValidatorTests(unittest.TestCase):
    def validate_fixture(self, evidence: dict, matrix_value: dict | None = None, phase: str | None = None):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            evidence_path = write_fixture(root, evidence, matrix_value)
            return validator.validate(evidence_path, root, phase_override=phase)

    def assertInvalidContains(self, evidence: dict, expected: str, matrix_value: dict | None = None) -> None:
        errors, classification = self.validate_fixture(evidence, matrix_value)
        self.assertEqual("invalid", classification)
        self.assertIn(expected, "\n".join(errors))

    def test_valid_environment_passes(self):
        errors, classification = self.validate_fixture(valid_environment())
        self.assertEqual([], errors)
        self.assertEqual("passing", classification)

    def test_valid_registration_passes(self):
        errors, classification = self.validate_fixture(valid_registration())
        self.assertEqual([], errors)
        self.assertEqual("passing", classification)

    def test_valid_execute_passes(self):
        errors, classification = self.validate_fixture(valid_execute())
        self.assertEqual([], errors)
        self.assertEqual("passing", classification)

    def test_fail_closed_blocker_is_valid_but_not_passing(self):
        errors, classification = self.validate_fixture(valid_blocker())
        self.assertEqual([], errors)
        self.assertEqual("blocker", classification)

    def test_rejects_wrong_adapter_type(self):
        evidence = valid_execute()
        evidence["adapter"]["adapterType"] = "process"
        self.assertInvalidContains(evidence, "must be gsdpi_local")

    def test_rejects_missing_bos_adapter_result(self):
        evidence = valid_execute()
        evidence["run"]["resultJson"] = {}
        self.assertInvalidContains(evidence, "bosAdapterResult")

    def test_rejects_created_approvals(self):
        evidence = valid_execute()
        evidence["run"]["approvalCounts"] = {"before": 0, "after": 1, "created": 1}
        self.assertInvalidContains(evidence, "expected zero created approvals")

    def test_rejects_source_writes(self):
        evidence = valid_execute()
        evidence["run"]["sourceWriteCounts"] = {"created": 0, "modified": 1, "deleted": 0}
        self.assertInvalidContains(evidence, "expected zero source writes")

    def test_rejects_unredacted_secret_like_value(self):
        evidence = valid_environment()
        evidence["diagnostics"] = ["Bearer abcdefghijklmnop leaked into logs"]
        self.assertInvalidContains(evidence, "secret-like string value is not redacted")

    def test_rejects_core_modification_claim(self):
        evidence = valid_environment()
        evidence["no_core_modification"]["core_source_patched"] = True
        self.assertInvalidContains(evidence, "core_source_patched")

    def test_final_phase_accepts_blocker_with_conservative_docs(self):
        errors, classification = self.validate_fixture(valid_blocker(), phase="final")
        self.assertEqual([], errors)
        self.assertEqual("blocker", classification)

    def test_final_phase_requires_s04_downstream_fallback_guidance(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            evidence_path = write_fixture(root, valid_blocker())
            (root / "docs" / "08_RUNTIME_CAPABILITY_HEALTH.md").write_text(
                "# Runtime Capability Health\n\nGSD-Pi adapter execution remains unvalidated until S03 proof exists.\n"
                "plugin-bos-light/capabilities.paperclip-runtime.json remains the source of truth.\n",
                encoding="utf-8",
            )
            errors, classification = validator.validate(evidence_path, root, phase_override="final")
        self.assertEqual("invalid", classification)
        self.assertIn("downstream S04 GSD-Pi fallback guidance", "\n".join(errors))

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


if __name__ == "__main__":
    unittest.main(verbosity=2)
