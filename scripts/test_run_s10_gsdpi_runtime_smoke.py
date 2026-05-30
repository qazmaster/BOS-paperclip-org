#!/usr/bin/env python3
"""Fixture coverage for scripts/run_s10_gsdpi_runtime_smoke.py."""

from __future__ import annotations

import argparse
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

RUNNER_PATH = Path(__file__).resolve().parent / "run_s10_gsdpi_runtime_smoke.py"
RUNNER_SPEC = importlib.util.spec_from_file_location("run_s10_gsdpi_runtime_smoke", RUNNER_PATH)
assert RUNNER_SPEC is not None and RUNNER_SPEC.loader is not None
runner = importlib.util.module_from_spec(RUNNER_SPEC)
RUNNER_SPEC.loader.exec_module(runner)

VALIDATOR_PATH = Path(__file__).resolve().parent / "validate_s10_runtime_execution.py"
VALIDATOR_SPEC = importlib.util.spec_from_file_location("validate_s10_runtime_execution", VALIDATOR_PATH)
assert VALIDATOR_SPEC is not None and VALIDATOR_SPEC.loader is not None
validator = importlib.util.module_from_spec(VALIDATOR_SPEC)
VALIDATOR_SPEC.loader.exec_module(validator)


def args(**overrides):
    values = {
        "output": Path("runtime-evidence/M002-S10-gsdpi-runtime-execution-proof.json"),
        "base_url": None,
        "company_id": None,
        "origin": None,
        "timeout": 0.01,
        "local_timeout": 0.01,
        "settle_seconds": 0.0,
        "readback_interval_seconds": 0.0,
        "max_readbacks": 1,
        "agent_timeout_sec": 90,
        "agent_grace_sec": 5,
        "adapter_timeout_ms": 60_000,
        "gsdpi_command": "gsd",
        "gsdpi_args": [],
        "issue_id": "BOS-M002-S10",
        "agent_name": "fixture",
        "agent_prompt": "return JSON",
        "smoke_prompt": "return JSON",
    }
    values.update(overrides)
    return argparse.Namespace(**values)


def local_package(status: str = "pass") -> dict:
    return {
        "path": "adapters/gsdpi-local",
        "package": "@bos/adapter-gsdpi-local",
        "contract": "local package build/test only; not live Paperclip runtime proof",
        "build_status": status,
        "test_status": status,
        "test": {"command": ["npm", "--prefix", "adapters/gsdpi-local", "test"], "exit_code": 0 if status == "pass" else 1, "timed_out": False},
    }


class RunS10GsdPiRuntimeSmokeTests(unittest.TestCase):
    def test_missing_config_writes_valid_fail_closed_blocker(self) -> None:
        defaults = {"base_url": None, "company_id": None, "previous_evidence": {}}
        auth = {"selected_env_name": None, "available_env": []}
        with (
            patch.object(runner, "_read_config_defaults", return_value=defaults),
            patch.object(runner, "_auth_headers", return_value=({}, auth)),
            patch.object(runner, "_run_local_package_checks", return_value=local_package()),
        ):
            evidence = runner.run_smoke(args())

        self.assertEqual("fail-closed-blocker", evidence["artifact_type"])
        self.assertEqual("gsdpi", evidence["phase"])
        self.assertEqual("pass", evidence["local_package"]["test_status"])
        self.assertIn("missing_base_url", evidence["blocker_codes"])
        self.assertIn("missing_company_id", evidence["blocker_codes"])
        self.assertEqual([], evidence["capability_promotions"])

        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "runtime-evidence/M002-S10-gsdpi-runtime-execution-proof.json"
            path.parent.mkdir(parents=True)
            path.write_text(json.dumps(evidence), encoding="utf-8")
            errors, classification = validator.validate(path, root=Path(tmp), phase_override="gsdpi")
        self.assertEqual([], errors)
        self.assertEqual("blocker", classification)

    def test_unknown_adapter_type_skips_runtime_invoke(self) -> None:
        class FakeClient:
            def __init__(self, *_args, **_kwargs):
                pass

            def request(self, method, path, body=None):
                if path == "/api/health":
                    return {"ok": True, "status": 200, "json": {"status": "ok", "version": "0.3.1"}}
                if path == "/api/adapters":
                    return {"ok": True, "status": 200, "json": [{"type": "hermes_local", "loaded": True}]}
                if path.endswith("/test-environment"):
                    return {"ok": False, "status": 422, "json": {"error": "Unknown adapter type: gsdpi_local"}}
                raise AssertionError(f"unexpected runtime mutation/readback call: {method} {path}")

        defaults = {"base_url": "https://paperclip.example.test", "company_id": "company-1", "previous_evidence": {}}
        auth = {"selected_env_name": "PAPERCLIP_API_KEY", "available_env": [{"env_name": "PAPERCLIP_API_KEY", "present": True}]}
        with (
            patch.object(runner, "_read_config_defaults", return_value=defaults),
            patch.object(runner, "_auth_headers", return_value=({"Authorization": "Bearer in-memory-only"}, auth)),
            patch.object(runner, "_run_local_package_checks", return_value=local_package()),
            patch.object(runner, "HttpClient", FakeClient),
        ):
            evidence = runner.run_smoke(args())

        self.assertEqual("fail-closed-blocker", evidence["artifact_type"])
        self.assertIn("gsdpi_local_unknown_adapter_type", evidence["blocker_codes"])
        self.assertEqual(0, evidence["diagnostics"]["runSkipped"]["bounded_runtime_invocations"])
        self.assertNotIn("in-memory-only", json.dumps(evidence))

    def test_supported_readback_and_bos_adapter_result_promote_passing_proof(self) -> None:
        class FakeClient:
            def __init__(self, *_args, **_kwargs):
                pass

            def request(self, method, path, body=None):
                if path == "/api/health":
                    return {"ok": True, "status": 200, "json": {"status": "ok", "version": "0.3.1", "build": "fixture"}}
                if path == "/api/adapters":
                    return {"ok": True, "status": 200, "json": [{"type": "gsdpi_local", "loaded": True, "supported": True}]}
                if path.endswith("/test-environment"):
                    return {"ok": True, "status": 200, "json": {"status": "pass", "adapterType": "gsdpi_local"}}
                if method == "POST" and path.endswith("/agents"):
                    return {"ok": True, "status": 200, "json": {"id": "agent-1", "adapterType": "gsdpi_local"}}
                if method == "GET" and path.endswith("/agents/agent-1"):
                    return {"ok": True, "status": 200, "json": {"id": "agent-1", "adapterType": "gsdpi_local"}}
                if "heartbeat-runs?agentId=agent-1" in path:
                    return {"ok": True, "status": 200, "json": {"runs": []}}
                if path.endswith("/approvals?limit=20"):
                    return {"ok": True, "status": 200, "json": {"approvals": []}}
                if method == "POST" and path == "/api/agents/agent-1/heartbeat/invoke":
                    return {"ok": True, "status": 200, "json": {"runId": "run-1", "status": "succeeded"}}
                if method == "GET" and path == "/api/heartbeat-runs/run-1":
                    return {
                        "ok": True,
                        "status": 200,
                        "json": {
                            "runId": "run-1",
                            "status": "succeeded",
                            "resultJson": {
                                "bosAdapterResult": {
                                    "schemaVersion": "s10-gsdpi-result/v1",
                                    "adapterType": "gsdpi_local",
                                    "runId": "run-1",
                                    "status": "succeeded",
                                }
                            },
                        },
                    }
                raise AssertionError(f"unexpected call: {method} {path}")

        defaults = {"base_url": "https://paperclip.example.test", "company_id": "company-1", "previous_evidence": {}}
        auth = {"selected_env_name": "PAPERCLIP_API_KEY", "available_env": [{"env_name": "PAPERCLIP_API_KEY", "present": True}]}
        with (
            patch.object(runner, "_read_config_defaults", return_value=defaults),
            patch.object(runner, "_auth_headers", return_value=({"Authorization": "Bearer in-memory-only"}, auth)),
            patch.object(runner, "_run_local_package_checks", return_value=local_package()),
            patch.object(runner, "HttpClient", FakeClient),
        ):
            evidence = runner.run_smoke(args())

        self.assertEqual("runtime-execution-proof", evidence["artifact_type"])
        self.assertEqual(["gsdpi.execution"], evidence["capability_promotions"])
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "runtime-evidence/M002-S10-gsdpi-runtime-execution-proof.json"
            path.parent.mkdir(parents=True)
            path.write_text(json.dumps(evidence), encoding="utf-8")
            errors, classification = validator.validate(path, root=Path(tmp), phase_override="gsdpi")
        self.assertEqual([], errors)
        self.assertEqual("passing", classification)

    def test_secret_like_values_are_redacted_recursively(self) -> None:
        payload = {
            "safe": "Authorization: Bearer abcdefghijklmnopqrstuvwxyz",
            "headers": {"Authorization": "Bearer abcdefghijklmnopqrstuvwxyz"},
            "nested": [{"api_key": "sk-abcdefghijklmnop"}],
        }
        redacted = runner._redact_value("evidence", payload)
        serialized = json.dumps(redacted)
        self.assertNotIn("abcdefghijklmnopqrstuvwxyz", serialized)
        self.assertNotIn("sk-abcdefghijklmnop", serialized)
        self.assertIn("<redacted>", serialized)

    def test_write_evidence_uses_exact_output_path(self) -> None:
        evidence = {
            "schema_version": runner.SCHEMA_VERSION,
            "artifact_type": "fail-closed-blocker",
            "phase": "gsdpi",
            "generated_at": "2026-05-29T20:31:42Z",
            "adapter": {"adapterType": "gsdpi_local"},
            "blocker_reason": "missing_auth",
            "diagnostics": {"reason": "fixture"},
            "capability_promotions": [],
        }
        with tempfile.TemporaryDirectory() as tmp:
            target = Path(tmp) / "nested/evidence.json"
            runner.write_evidence(target, evidence)
            self.assertEqual(evidence, json.loads(target.read_text(encoding="utf-8")))


if __name__ == "__main__":
    unittest.main()
