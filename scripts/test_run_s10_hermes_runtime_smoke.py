#!/usr/bin/env python3
"""Fixture coverage for scripts/run_s10_hermes_runtime_smoke.py."""

from __future__ import annotations

import argparse
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

RUNNER_PATH = Path(__file__).resolve().parent / "run_s10_hermes_runtime_smoke.py"
RUNNER_SPEC = importlib.util.spec_from_file_location("run_s10_hermes_runtime_smoke", RUNNER_PATH)
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
        "output": Path("runtime-evidence/M002-S10-hermes-runtime-execution-proof.json"),
        "base_url": None,
        "company_id": None,
        "origin": None,
        "timeout": 0.01,
        "settle_seconds": 0.0,
        "readback_interval_seconds": 0.0,
        "max_readbacks": 1,
        "agent_timeout_sec": 90,
        "agent_grace_sec": 5,
        "issue_id": "BOS-M002-S10",
        "agent_name": "fixture",
        "agent_prompt": "return JSON",
        "smoke_prompt": "return JSON",
        "force_single_run_after_warning": False,
    }
    values.update(overrides)
    return argparse.Namespace(**values)


class RunS10HermesRuntimeSmokeTests(unittest.TestCase):
    def test_missing_config_writes_valid_fail_closed_blocker(self) -> None:
        defaults = {"base_url": None, "company_id": None, "adapter_config": {"provider": "openai-codex"}}
        auth = {"selected_env_name": None, "available_env": []}
        with patch.object(runner, "_read_config_defaults", return_value=defaults), patch.object(runner, "_auth_headers", return_value=({}, auth)):
            evidence = runner.run_smoke(args())

        self.assertEqual("fail-closed-blocker", evidence["artifact_type"])
        self.assertEqual("hermes", evidence["phase"])
        self.assertIn("missing_base_url", evidence["blocker_codes"])
        self.assertIn("missing_company_id", evidence["blocker_codes"])
        self.assertEqual([], evidence["capability_promotions"])

        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "runtime-evidence/M002-S10-hermes-runtime-execution-proof.json"
            path.parent.mkdir(parents=True)
            path.write_text(json.dumps(evidence), encoding="utf-8")
            errors, classification = validator.validate(path, root=Path(tmp), phase_override="hermes")
        self.assertEqual([], errors)
        self.assertEqual("blocker", classification)

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

    def test_preflight_auth_denied_skips_runtime_invoke(self) -> None:
        class FakeClient:
            def __init__(self, *_args, **_kwargs):
                pass

            def request(self, method, path, body=None):
                if path == "/api/health":
                    return {"ok": True, "status": 200, "json": {"status": "ok", "version": "0.3.1"}}
                if path == "/api/adapters":
                    return {"ok": True, "status": 200, "json": [{"type": "hermes_local", "loaded": True}]}
                if path.endswith("/test-environment"):
                    return {"ok": False, "status": 401, "json": {"error": "unauthorized"}}
                raise AssertionError(f"unexpected runtime mutation/readback call: {method} {path}")

        defaults = {
            "base_url": "https://paperclip.example.test",
            "company_id": "company-1",
            "adapter_config": {"provider": "openai-codex"},
        }
        auth = {"selected_env_name": "PAPERCLIP_API_KEY", "available_env": [{"env_name": "PAPERCLIP_API_KEY", "present": True}]}
        with patch.object(runner, "_read_config_defaults", return_value=defaults), patch.object(runner, "_auth_headers", return_value=({"Authorization": "Bearer in-memory-only"}, auth)), patch.object(runner, "HttpClient", FakeClient):
            evidence = runner.run_smoke(args())

        self.assertEqual("fail-closed-blocker", evidence["artifact_type"])
        self.assertIn("test_environment_auth_denied", evidence["blocker_codes"])
        self.assertEqual(0, evidence["diagnostics"]["runSkipped"]["bounded_runtime_invocations"])
        self.assertNotIn("in-memory-only", json.dumps(evidence))

    def test_write_evidence_uses_exact_output_path(self) -> None:
        evidence = {
            "schema_version": runner.SCHEMA_VERSION,
            "artifact_type": "fail-closed-blocker",
            "phase": "hermes",
            "generated_at": "2026-05-29T20:31:42Z",
            "selected_path": runner.SELECTED_PATH,
            "adapter": {"adapterType": "hermes_local"},
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
