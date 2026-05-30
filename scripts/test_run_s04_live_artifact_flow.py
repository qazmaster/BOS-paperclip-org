#!/usr/bin/env python3
"""Unit tests for scripts/run_s04_live_artifact_flow.py."""

from __future__ import annotations

import importlib.util
import json
import os
import tempfile
import unittest
from argparse import Namespace
from pathlib import Path
from unittest.mock import patch

SCRIPT_PATH = Path(__file__).resolve().parent / "run_s04_live_artifact_flow.py"
SPEC = importlib.util.spec_from_file_location("run_s04_live_artifact_flow", SCRIPT_PATH)
assert SPEC is not None and SPEC.loader is not None
runner = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(runner)


class FakeClient:
    def __init__(self, responses: dict[tuple[str, str], dict]):
        self.responses = responses
        self.requests: list[tuple[str, str, dict | None]] = []

    def request(self, method: str, path: str, body: dict | None = None) -> dict:
        self.requests.append((method, path, body))
        key = (method, path)
        if key not in self.responses:
            return {"ok": False, "status": 404, "json": {"error": f"missing fixture for {method} {path}"}, "text": None, "malformed_json_reason": None}
        return self.responses[key]


def ok_json(status: int, payload: dict) -> dict:
    return {"ok": 200 <= status < 300, "status": status, "json": payload, "text": None, "malformed_json_reason": None}


def guard_file(root: Path, name: str, payload: dict) -> Path:
    path = root / name
    path.write_text(json.dumps(payload), encoding="utf-8")
    return path


def base_args(root: Path) -> Namespace:
    return Namespace(
        base_url="http://paperclip.local",
        company_id="company-1",
        auth_token_env="PAPERCLIP_API_KEY",
        auth_header_name="Authorization",
        origin="http://paperclip.local",
        timeout=5.0,
        output=root / "evidence.json",
        issue_id=None,
        run_label="s04-test",
        hermes_evidence=guard_file(
            root,
            "hermes.json",
            {
                "schema_version": "s02-hermes-smoke/v1",
                "artifact_type": "fail-closed-blocker",
                "phase": "agent-smoke",
                "blocker_reason": "missing_result_json_bos",
                "run": {"resultJson": {}},
            },
        ),
        gsdpi_evidence=guard_file(
            root,
            "gsdpi.json",
            {
                "schema_version": "s03-gsdpi-smoke/v1",
                "artifact_type": "fail-closed-blocker",
                "phase": "execute",
                "blocker_reason": "gsdpi_local_execution_not_attempted_registration_blocked",
                "run": {"resultJson": None},
            },
        ),
    )


def markdown() -> str:
    return "\n".join(
        [
            "# BOS Light S04 Live Artifact Flow",
            "## BOS BPI Evidence",
            "## BOS Blueprint Evidence",
            "## BOS Betting Table Evidence",
            "## BOS Eval Gate Evidence",
            "## BOS Circuit Breaker Evidence",
        ]
    )


def live_responses() -> dict[tuple[str, str], dict]:
    content = markdown()
    return {
        ("GET", "/api/health"): ok_json(200, {"status": "ok", "version": "2026.5.29"}),
        ("GET", "/api/version"): ok_json(404, {"error": "API route not found"}),
        ("POST", "/api/companies/company-1/issues"): ok_json(201, {"id": "ISS-1", "title": "BOS Light S04 sandbox"}),
        ("GET", "/api/issues/ISS-1"): ok_json(200, {"id": "ISS-1", "title": "BOS Light S04 sandbox"}),
        ("PUT", "/api/issues/ISS-1/documents/bos-s04-evidence"): ok_json(201, {"id": "DOC-1", "key": "bos-s04-evidence"}),
        ("GET", "/api/issues/ISS-1/documents/bos-s04-evidence"): ok_json(200, {"id": "DOC-1", "key": "bos-s04-evidence", "body": content}),
        ("POST", "/api/issues/ISS-1/comments"): ok_json(201, {"id": "COM-1"}),
        ("GET", "/api/issues/ISS-1/comments/COM-1"): ok_json(200, {"id": "COM-1", "body": content}),
    }


class S04LiveRunnerTests(unittest.TestCase):
    def test_headers_from_env_adds_bearer_without_persisting_value(self):
        with patch.dict(os.environ, {"PAPERCLIP_API_KEY": "pc_test_secret_1234567890"}, clear=False):
            headers = runner._headers_from_env("PAPERCLIP_API_KEY", "Authorization")
        self.assertEqual({"Authorization": "Bearer pc_test_secret_1234567890"}, headers)
        redacted = runner._redact_value("evidence", {"headers": headers, "auth_token_env": "PAPERCLIP_API_KEY"})
        self.assertEqual("<redacted>", redacted["headers"]["Authorization"])
        self.assertEqual("PAPERCLIP_API_KEY", redacted["auth_token_env"])

    def test_missing_auth_env_stops_before_mutation_and_writes_blocker_shape(self):
        with tempfile.TemporaryDirectory() as tmp:
            args = base_args(Path(tmp))
            client = FakeClient(live_responses())
            with patch.dict(os.environ, {}, clear=True):
                evidence = runner.run_live_flow(client, args)
        self.assertEqual(runner.BLOCKER_ARTIFACT_TYPE, evidence["artifact_type"])
        self.assertEqual("missing_auth_token_env", evidence["blocker_reason"])
        self.assertEqual([], client.requests)
        self.assertNotIn("pc_test_secret", json.dumps(evidence))

    def test_live_flow_builds_expected_requests_and_embeds_no_go_guards(self):
        with tempfile.TemporaryDirectory() as tmp:
            args = base_args(Path(tmp))
            client = FakeClient(live_responses())
            with patch.dict(os.environ, {"PAPERCLIP_API_KEY": "pc_test_secret_1234567890"}, clear=False):
                evidence = runner.run_live_flow(client, args)
        self.assertEqual(runner.PASSING_ARTIFACT_TYPE, evidence["artifact_type"])
        request_keys = [(method, path) for method, path, _body in client.requests]
        self.assertEqual(
            [
                ("GET", "/api/health"),
                ("GET", "/api/version"),
                ("POST", "/api/companies/company-1/issues"),
                ("GET", "/api/issues/ISS-1"),
                ("PUT", "/api/issues/ISS-1/documents/bos-s04-evidence"),
                ("GET", "/api/issues/ISS-1/documents/bos-s04-evidence"),
                ("POST", "/api/issues/ISS-1/comments"),
                ("GET", "/api/issues/ISS-1/comments/COM-1"),
            ],
            request_keys,
        )
        document_body = client.requests[4][2]
        comment_body = client.requests[6][2]
        self.assertIn("BOS BPI Evidence", document_body["body"])
        self.assertIn("BOS Circuit Breaker Evidence", comment_body["body"])
        self.assertTrue(evidence["no_go_guards"]["hermes"]["no_go"])
        self.assertEqual(False, evidence["no_go_guards"]["hermes"]["result_json_bos_present"])
        self.assertTrue(evidence["no_go_guards"]["gsd_pi"]["no_go"])
        self.assertEqual(0, evidence["side_effect_counts"]["approval_requests_created"])

    def test_http_diagnostic_redacts_and_bounds_malformed_or_error_response(self):
        response = {
            "ok": False,
            "status": 401,
            "json": None,
            "text": "Bearer abcdefghijklmnopqrstuvwxyz " + ("x" * 2000),
            "malformed_json_reason": "line 1, column 2: Expecting value",
            "timeout_ms": None,
        }
        diagnostic = runner._diagnostic("comments.native", response, False, "failed with token=abc123456789")
        self.assertLessEqual(len(diagnostic["bounded_response_text"]), runner.MAX_DIAGNOSTIC_TEXT)
        self.assertNotIn("abcdefghijklmnopqrstuvwxyz", diagnostic["bounded_response_text"])
        self.assertIn("<redacted>", diagnostic["message"])
        self.assertEqual("line 1, column 2: Expecting value", diagnostic["malformed_json_reason"])

    def test_live_flow_uses_document_key_when_create_response_omits_id(self):
        with tempfile.TemporaryDirectory() as tmp:
            args = base_args(Path(tmp))
            responses = live_responses()
            responses[("PUT", "/api/issues/ISS-1/documents/bos-s04-evidence")] = ok_json(201, {"created": True})
            client = FakeClient(responses)
            with patch.dict(os.environ, {"PAPERCLIP_API_KEY": "pc_test_secret_1234567890"}, clear=False):
                evidence = runner.run_live_flow(client, args)
        self.assertEqual(runner.PASSING_ARTIFACT_TYPE, evidence["artifact_type"])
        self.assertEqual("bos-s04-evidence", evidence["artifact_refs"]["document"])
        self.assertEqual(1, evidence["side_effect_counts"]["documents_created"])
        self.assertEqual(1, evidence["side_effect_counts"]["comments_created"])

    def test_invalid_base_url_returns_bounded_error_without_network(self):
        response = runner.HttpClient("not a url", {}, 0.01).request("GET", "/api/health")
        self.assertFalse(response["ok"])
        self.assertEqual("ValueError", response["error"])
        self.assertIn("invalid base URL", response["message"])

    def test_422_malformed_payload_fail_closes_with_phase_status_and_reason(self):
        with tempfile.TemporaryDirectory() as tmp:
            args = base_args(Path(tmp))
            responses = live_responses()
            responses[("PUT", "/api/issues/ISS-1/documents/bos-s04-evidence")] = {
                "ok": False,
                "status": 422,
                "json": None,
                "text": "{bad payload",
                "malformed_json_reason": "line 1, column 2: Expecting property name enclosed in double quotes",
            }
            client = FakeClient(responses)
            with patch.dict(os.environ, {"PAPERCLIP_API_KEY": "pc_test_secret_1234567890"}, clear=False):
                evidence = runner.run_live_flow(client, args)
        self.assertEqual(runner.BLOCKER_ARTIFACT_TYPE, evidence["artifact_type"])
        self.assertEqual("document_creation_failed", evidence["blocker_reason"])
        diagnostic_text = json.dumps(evidence["diagnostics"])
        self.assertIn("documents.native", diagnostic_text)
        self.assertIn("422", diagnostic_text)
        self.assertIn("Expecting property name", diagnostic_text)

    def test_http_client_marks_oversized_text_response_truncated(self):
        class FakeResponse:
            status = 200

            def __enter__(self):
                return self

            def __exit__(self, _exc_type, _exc, _tb):
                return False

            def read(self, _limit):
                return b"x" * (runner.MAX_RESPONSE_BYTES + 10)

        with patch.object(runner.urllib.request, "urlopen", return_value=FakeResponse()):
            response = runner.HttpClient("http://paperclip.local", {}, 1).request("GET", "/api/health")
        self.assertTrue(response["ok"])
        self.assertTrue(response["truncated"])
        self.assertLessEqual(len(response["text"]), runner.MAX_DIAGNOSTIC_TEXT)


if __name__ == "__main__":
    unittest.main()
