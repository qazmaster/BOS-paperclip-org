#!/usr/bin/env python3
"""Unit tests for scripts/run_m003_s04_live_decision_artifact_readback.py."""

from __future__ import annotations

import importlib.util
import json
import os
import tempfile
import unittest
from argparse import Namespace
from pathlib import Path
from unittest.mock import patch

SCRIPT_PATH = Path(__file__).resolve().parent / "run_m003_s04_live_decision_artifact_readback.py"
SPEC = importlib.util.spec_from_file_location("run_m003_s04_live_decision_artifact_readback", SCRIPT_PATH)
assert SPEC is not None and SPEC.loader is not None
runner = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(runner)


class FakeClient:
    def __init__(self, responses: dict[tuple[str, str], dict]):
        self.responses = responses
        self.requests: list[tuple[str, str, dict | None]] = []

    def request(self, method: str, path: str, body: dict | None = None) -> dict:
        self.requests.append((method, path, body))
        return self.responses.get((method, path), {"ok": False, "status": 404, "json": {"error": f"missing fixture for {method} {path}"}, "text": None, "malformed_json_reason": None})


def ok_json(status: int, payload: dict) -> dict:
    return {"ok": 200 <= status < 300, "status": status, "json": payload, "text": None, "malformed_json_reason": None}


def base_args(root: Path) -> Namespace:
    return Namespace(
        base_url="http://paperclip.local",
        company_id="company-1",
        issue_id=None,
        auth_token_env="PAPERCLIP_API_KEY",
        auth_header_name="Authorization",
        origin="http://paperclip.local",
        timeout=5.0,
        output=root / "evidence.json",
        run_label="m003-test",
    )


def markdown_for(issue_id: str, generated_at: str) -> str:
    return runner._decision_markdown(issue_id, generated_at)


def live_responses() -> dict[tuple[str, str], dict]:
    # generated_at is not known until runtime. Tests patch _utc_now for stable fixtures.
    content = markdown_for("ISS-1", "2026-05-31T00:00:00Z")
    return {
        ("GET", "/api/health"): ok_json(200, {"status": "ok", "version": "2026.5.31"}),
        ("GET", "/api/version"): ok_json(200, {"build": "abc123"}),
        ("POST", "/api/companies/company-1/issues"): ok_json(201, {"id": "ISS-1", "title": "BOS M003 S04 sandbox"}),
        ("GET", "/api/issues/ISS-1"): ok_json(200, {"id": "ISS-1", "title": "BOS M003 S04 sandbox"}),
        ("PUT", "/api/issues/ISS-1/documents/bos-m003-s04-decision-artifact"): ok_json(201, {"id": "DOC-1", "key": "bos-m003-s04-decision-artifact"}),
        ("GET", "/api/issues/ISS-1/documents/bos-m003-s04-decision-artifact"): ok_json(200, {"id": "DOC-1", "body": content}),
    }


class M003S04LiveReadbackRunnerTests(unittest.TestCase):
    def test_headers_from_env_adds_bearer_without_persisting_value(self):
        with patch.dict(os.environ, {"PAPERCLIP_API_KEY": "pc_test_secret_1234567890"}, clear=False):
            headers = runner._headers_from_env("PAPERCLIP_API_KEY", "Authorization")
        self.assertEqual({"Authorization": "Bearer pc_test_secret_1234567890"}, headers)
        redacted = runner._redact_value("evidence", {"headers": headers, "auth_token_env": "PAPERCLIP_API_KEY"})
        self.assertEqual("<redacted>", redacted["headers"]["Authorization"])
        self.assertEqual("PAPERCLIP_API_KEY", redacted["auth_token_env"])

    def test_missing_preflight_inputs_stop_before_mutation_and_write_blocker(self):
        with tempfile.TemporaryDirectory() as tmp:
            args = base_args(Path(tmp))
            args.base_url = None
            client = FakeClient(live_responses())
            with patch.dict(os.environ, {}, clear=True):
                evidence = runner.run_live_readback(client, args)
        self.assertEqual(runner.BLOCKER_ARTIFACT_TYPE, evidence["artifact_type"])
        self.assertIn("missing_base_url", evidence["blocker_reason"])
        self.assertEqual([], client.requests)
        self.assertTrue(evidence["fallback"]["deterministic_ref"].startswith("markdown-only://issues/"))
        self.assertEqual("markdown-only", evidence["selected_surface"])
        self.assertEqual(evidence["fallback"]["deterministic_ref"], evidence["artifact_ref"])
        self.assertEqual("blocked_preflight", evidence["readback_status"])
        self.assertIn("BOS Decision Record", evidence["bounded_snippet"])
        self.assertTrue(evidence["invariants"]["no_secret_diagnostics"])
        self.assertFalse(evidence["invariants"]["hermes_execution_attempted"])
        self.assertFalse(evidence["invariants"]["gsd_pi_execution_attempted"])

    def test_blank_auth_token_env_stops_before_mutation(self):
        with tempfile.TemporaryDirectory() as tmp:
            args = base_args(Path(tmp))
            args.auth_token_env = ""
            client = FakeClient(live_responses())
            evidence = runner.run_live_readback(client, args)
        self.assertEqual(runner.BLOCKER_ARTIFACT_TYPE, evidence["artifact_type"])
        self.assertIn("missing_auth_token_env", evidence["blocker_reason"])
        self.assertEqual([], client.requests)
        self.assertEqual("blocked_preflight", evidence["readback_status"])

    def test_unsafe_issue_id_stops_before_mutation_and_sanitizes_refs(self):
        with tempfile.TemporaryDirectory() as tmp:
            args = base_args(Path(tmp))
            args.issue_id = "ISS/../../secret-token-1234567890"
            client = FakeClient(live_responses())
            with patch.dict(os.environ, {"PAPERCLIP_API_KEY": "pc_test_secret_1234567890"}, clear=False):
                evidence = runner.run_live_readback(client, args)
        serialized = json.dumps(evidence)
        self.assertEqual(runner.BLOCKER_ARTIFACT_TYPE, evidence["artifact_type"])
        self.assertIn("unsafe_issue_id", evidence["blocker_reason"])
        self.assertEqual([], client.requests)
        self.assertEqual("blocked_preflight", evidence["readback_status"])
        self.assertEqual("markdown-only://issues/missing/decisions/decision_m003_s04_live_readback", evidence["artifact_ref"])
        self.assertNotIn("secret-token", serialized)
        self.assertNotIn("../", serialized)

    def test_live_success_uses_document_write_and_readback_without_unsupported_side_effects(self):
        with tempfile.TemporaryDirectory() as tmp, patch.object(runner, "_utc_now", return_value="2026-05-31T00:00:00Z"):
            args = base_args(Path(tmp))
            client = FakeClient(live_responses())
            with patch.dict(os.environ, {"PAPERCLIP_API_KEY": "pc_test_secret_1234567890"}, clear=False):
                evidence = runner.run_live_readback(client, args)
        self.assertEqual(runner.PASSING_ARTIFACT_TYPE, evidence["artifact_type"])
        self.assertEqual("documents.native", evidence["selected_surface"])
        self.assertEqual("DOC-1", evidence["artifact_refs"]["document"])
        self.assertTrue(evidence["readbacks"]["documents"][0]["hash_match"])
        self.assertEqual(1, evidence["side_effect_counts"]["documents_created"])
        for field in ("approval_requests_created", "activity_logs_written", "hermes_runs_started", "gsd_pi_runs_started", "plugin_actions_invoked"):
            self.assertEqual(0, evidence["side_effect_counts"][field])
        self.assertFalse(any(evidence["capability_claims"].values()))
        self.assertEqual("paperclip://issues/ISS-1/documents/DOC-1", evidence["artifact_ref"])
        self.assertEqual("ok", evidence["readback_status"])
        self.assertEqual(evidence["readbacks"]["documents"][0]["sha256"], evidence["content_hash"])
        self.assertIn("BOS Decision Record", evidence["bounded_snippet"])

    def test_denied_document_falls_back_to_comment_success(self):
        responses = live_responses()
        content = markdown_for("ISS-1", "2026-05-31T00:00:00Z")
        responses[("PUT", "/api/issues/ISS-1/documents/bos-m003-s04-decision-artifact")] = {"ok": False, "status": 403, "json": {"error": "denied"}, "text": None, "malformed_json_reason": None}
        responses[("POST", "/api/issues/ISS-1/comments")] = ok_json(201, {"id": "COM-1"})
        responses[("GET", "/api/issues/ISS-1/comments/COM-1")] = ok_json(200, {"id": "COM-1", "body": content})
        with tempfile.TemporaryDirectory() as tmp, patch.object(runner, "_utc_now", return_value="2026-05-31T00:00:00Z"):
            args = base_args(Path(tmp))
            client = FakeClient(responses)
            with patch.dict(os.environ, {"PAPERCLIP_API_KEY": "pc_test_secret_1234567890"}, clear=False):
                evidence = runner.run_live_readback(client, args)
        self.assertEqual(runner.PASSING_ARTIFACT_TYPE, evidence["artifact_type"])
        self.assertEqual("comments.native", evidence["selected_surface"])
        self.assertEqual(["COM-1"], evidence["artifact_refs"]["comments"])

    def test_malformed_or_mismatch_readback_fail_closes_with_diagnostics(self):
        responses = live_responses()
        responses[("GET", "/api/issues/ISS-1/documents/bos-m003-s04-decision-artifact")] = {"ok": True, "status": 200, "json": None, "text": "{bad payload", "malformed_json_reason": "line 1, column 2: Expecting property name"}
        responses[("POST", "/api/issues/ISS-1/comments")] = {"ok": False, "status": 404, "json": {"error": "missing"}, "text": None, "malformed_json_reason": None}
        with tempfile.TemporaryDirectory() as tmp, patch.object(runner, "_utc_now", return_value="2026-05-31T00:00:00Z"):
            args = base_args(Path(tmp))
            client = FakeClient(responses)
            with patch.dict(os.environ, {"PAPERCLIP_API_KEY": "pc_test_secret_1234567890"}, clear=False):
                evidence = runner.run_live_readback(client, args)
        self.assertEqual(runner.BLOCKER_ARTIFACT_TYPE, evidence["artifact_type"])
        self.assertIn("malformed_json", evidence["blocker_reason"])
        self.assertIn("Expecting property", json.dumps(evidence["diagnostics"]))

    def test_secret_redaction_in_diagnostics_and_inputs(self):
        diagnostic = runner._diagnostic("documents.native", {"ok": False, "status": 401, "text": "Bearer abcdefghijklmnopqrstuvwxyz token=abc123456789", "malformed_json_reason": None}, True, "failed token=abc123456789")
        self.assertNotIn("abcdefghijklmnopqrstuvwxyz", json.dumps(diagnostic))
        self.assertIn("<redacted>", json.dumps(diagnostic))

    def test_http_client_invalid_base_url_returns_bounded_error_without_network(self):
        response = runner.HttpClient("not a url", {}, 0.01).request("GET", "/api/health")
        self.assertFalse(response["ok"])
        self.assertEqual("ValueError", response["error"])
        self.assertIn("invalid base URL", response["message"])

    def test_main_returns_zero_when_valid_fail_closed_blocker_is_written(self):
        with tempfile.TemporaryDirectory() as tmp, patch.dict(os.environ, {}, clear=True):
            output = Path(tmp) / "evidence.json"
            exit_code = runner.main(["--output", str(output)])
            evidence = json.loads(output.read_text(encoding="utf-8"))
        self.assertEqual(0, exit_code)
        self.assertEqual(runner.BLOCKER_ARTIFACT_TYPE, evidence["artifact_type"])
        self.assertEqual("blocked_preflight", evidence["readback_status"])
        self.assertEqual(evidence["fallback"]["deterministic_ref"], evidence["artifact_ref"])


if __name__ == "__main__":
    unittest.main()
