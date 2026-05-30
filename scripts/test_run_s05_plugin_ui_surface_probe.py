#!/usr/bin/env python3
from __future__ import annotations

import importlib.util
import json
import tempfile
import threading
import time
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]


def load_runner():
    path = ROOT / "scripts/run_s05_plugin_ui_surface_probe.py"
    spec = importlib.util.spec_from_file_location("run_s05_plugin_ui_surface_probe", path)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


runner = load_runner()

TOOLS = [
    "piko:bpi-score",
    "piko:blueprint-gen",
    "piko:bpi-blueprint-artifact",
    "piko:eval-gate",
    "piko:eval-gate-evidence",
    "piko:circuit-breaker-observe",
    "piko:decide",
]
TABS = ["bos-status", "circuit-state", "gate-results"]


class ProbeHandler(BaseHTTPRequestHandler):
    routes: dict[tuple[str, str], tuple[int, Any, float]] = {}

    def log_message(self, format: str, *args: Any) -> None:  # noqa: A002 - stdlib signature
        return

    def _send(self) -> None:
        key = (self.command, self.path.split("?", 1)[0])
        status, body, delay = self.routes.get(key, (404, {"error": "not found"}, 0.0))
        if delay:
            time.sleep(delay)
        if self.command == "POST":
            length = int(self.headers.get("Content-Length", "0") or "0")
            if length:
                self.rfile.read(length)
        raw = body if isinstance(body, bytes) else json.dumps(body).encode("utf-8")
        try:
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(raw)))
            self.end_headers()
            self.wfile.write(raw)
        except BrokenPipeError:
            return

    def do_GET(self) -> None:  # noqa: N802 - stdlib callback
        self._send()

    def do_POST(self) -> None:  # noqa: N802 - stdlib callback
        self._send()


class ProbeServer:
    def __init__(self, routes: dict[tuple[str, str], tuple[int, Any, float]]) -> None:
        self.routes = routes
        self.httpd: ThreadingHTTPServer | None = None
        self.thread: threading.Thread | None = None
        self.url = ""

    def __enter__(self) -> "ProbeServer":
        routes = self.routes

        class Handler(ProbeHandler):
            pass

        Handler.routes = routes
        self.httpd = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        host, port = self.httpd.server_address
        self.url = f"http://{host}:{port}"
        self.thread = threading.Thread(target=self.httpd.serve_forever, daemon=True)
        self.thread.start()
        return self

    def __exit__(self, *exc: Any) -> None:
        assert self.httpd is not None
        self.httpd.shutdown()
        self.httpd.server_close()
        if self.thread is not None:
            self.thread.join(timeout=2)


def success_routes(secret_value: str | None = None) -> dict[tuple[str, str], tuple[int, Any, float]]:
    routes: dict[tuple[str, str], tuple[int, Any, float]] = {
        ("GET", "/api/health"): (200, {"version": "2026.5.29", "build": "build-abc123"}, 0.0),
        ("GET", "/api/version"): (200, {"paperclipVersion": "2026.5.29", "gitSha": "build-abc123"}, 0.0),
        ("GET", "/api/plugins/bos-light"): (200, {"plugin_key": "bos-light", "registered": True}, 0.0),
        ("GET", "/api/plugins/bos-light/tools"): (200, {"registered_tool_keys": TOOLS}, 0.0),
        ("POST", "/api/plugins/bos-light/tools/piko%3Abpi-score/invoke"): (200, {"ok": True, "result": {"score": 0.42}}, 0.0),
        ("GET", "/api/plugins/bos-light/data"): (200, {"registered_provider_keys": ["betting-table"]}, 0.0),
        ("GET", "/api/plugins/bos-light/data/betting-table"): (200, {"key": "betting-table", "rows": []}, 0.0),
        ("GET", "/api/plugins/bos-light/actions"): (200, {"registered_action_keys": ["approve-batch"]}, 0.0),
        ("GET", "/api/plugins/bos-light/ui/dashboard-widgets/betting-table"): (200, {"key": "betting-table", "render_id": "dw-betting-table"}, 0.0),
    }
    for tab in TABS:
        routes[("GET", f"/api/plugins/bos-light/ui/issue-detail-tabs/{tab}")] = (
            200,
            {"key": tab, "render_id": f"tab-{tab}"},
            0.0,
        )
    if secret_value is not None:
        routes[("GET", "/api/plugins/bos-light/tools")] = (
            200,
            {"registered_tool_keys": TOOLS, "diagnostic": f"Bearer {secret_value}"},
            0.0,
        )
    return routes


class RunS05PluginUiSurfaceProbeTests(unittest.TestCase):
    def build_with_server(self, routes: dict[tuple[str, str], tuple[int, Any, float]], *, timeout: float = 1.0) -> dict[str, Any]:
        with ProbeServer(routes) as server, tempfile.TemporaryDirectory() as tmpdir:
            return runner.build_evidence(
                output_path=Path(tmpdir) / "evidence.json",
                env={
                    "PAPERCLIP_BASE_URL": server.url,
                    "PAPERCLIP_API_KEY": "test-api-key-not-secret-shaped",
                },
                timeout_seconds=timeout,
            )

    def test_live_success_fixture_confirms_all_surfaces_with_runtime_and_readbacks(self) -> None:
        evidence = self.build_with_server(success_routes())

        self.assertEqual(evidence["artifact_type"], runner.PASSING_ARTIFACT_TYPE)
        self.assertEqual(evidence["runtime"]["version"], "2026.5.29")
        self.assertEqual(evidence["runtime"]["build"], "build-abc123")
        self.assertEqual(evidence["side_effect_counters"]["native_approvals_created"], 0)
        self.assertEqual(evidence["side_effect_counters"]["approval_requests_created"], 0)
        self.assertLessEqual(len(evidence["route_attempts"]), runner.MAX_ROUTE_ATTEMPTS)
        self.assertTrue(all(row["status"] == "confirmed" for row in evidence["surfaces"].values()))
        self.assertEqual(evidence["surfaces"]["tools"]["observed_registered_keys"], TOOLS)
        self.assertEqual(evidence["surfaces"]["dashboard_widgets"]["render_ids"], {"betting-table": "dw-betting-table"})
        self.assertEqual(set(evidence["surfaces"]["issue_detail_tabs"]["render_ids"]), set(TABS))
        self.assertEqual(evidence["surfaces"]["tools"]["piko_invocation_results"][0]["ok"], True)

    def test_missing_auth_writes_fail_closed_without_route_attempts(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            evidence = runner.build_evidence(output_path=Path(tmpdir) / "evidence.json", env={}, timeout_seconds=0.1)

        self.assertEqual(evidence["artifact_type"], runner.BLOCKER_ARTIFACT_TYPE)
        self.assertFalse(evidence["inputs"]["live_probe_enabled"])
        self.assertEqual(evidence["route_attempts"], [])
        self.assertTrue(any(item["code"] == "missing_live_probe_env" for item in evidence["fallback_diagnostics"]))
        self.assertTrue(all(row["status"] == "fallback-only" for row in evidence["surfaces"].values()))

    def test_unsupported_404_routes_remain_fail_closed(self) -> None:
        routes = {("GET", "/api/health"): (200, {"version": "2026.5.29", "build": "build-abc123"}, 0.0)}
        evidence = self.build_with_server(routes)

        self.assertEqual(evidence["artifact_type"], runner.BLOCKER_ARTIFACT_TYPE)
        self.assertEqual(evidence["surfaces"]["tools"]["status"], "unsupported")
        self.assertTrue(any(attempt["status_code"] == 404 for attempt in evidence["route_attempts"]))
        self.assertEqual(evidence["side_effect_counters"]["native_approvals_created"], 0)

    def test_malformed_json_is_bounded_and_diagnostic(self) -> None:
        routes = success_routes()
        routes[("GET", "/api/plugins/bos-light/tools")] = (200, b"{not-json", 0.0)
        evidence = self.build_with_server(routes)

        self.assertIn("malformed_json:r04", evidence["validation_errors"])
        route = next(attempt for attempt in evidence["route_attempts"] if attempt["id"] == "r04")
        self.assertEqual(route["malformed_json_reason"].startswith("line 1"), True)
        self.assertLessEqual(len(route["response_summary"]["text_snippet"]), runner.MAX_TEXT_SNIPPET)
        self.assertNotEqual(evidence["surfaces"]["tools"]["status"], "confirmed")

    def test_timeout_and_5xx_are_recorded_as_diagnostics(self) -> None:
        routes = {
            ("GET", "/api/health"): (200, {"version": "slow", "build": "slow"}, 0.2),
            ("GET", "/api/version"): (500, {"error": "temporary runtime failure"}, 0.0),
        }
        evidence = self.build_with_server(routes, timeout=0.05)

        self.assertEqual(evidence["artifact_type"], runner.BLOCKER_ARTIFACT_TYPE)
        self.assertTrue(any(attempt["error"] for attempt in evidence["route_attempts"]))
        self.assertTrue(any(attempt["status_code"] == 500 for attempt in evidence["route_attempts"]))
        self.assertTrue(all(row["status"] != "confirmed" for row in evidence["surfaces"].values()))

    def test_missing_render_ids_prevent_ui_confirmation(self) -> None:
        routes = success_routes()
        routes[("GET", "/api/plugins/bos-light/ui/dashboard-widgets/betting-table")] = (200, {"key": "betting-table"}, 0.0)
        evidence = self.build_with_server(routes)

        self.assertIn("missing_render_id:dashboard_widgets:betting-table", evidence["validation_errors"])
        self.assertEqual(evidence["surfaces"]["dashboard_widgets"]["status"], "fallback-only")
        self.assertEqual(evidence["artifact_type"], runner.BLOCKER_ARTIFACT_TYPE)

    def test_secret_like_response_values_are_redacted(self) -> None:
        secret = "sk-testSECRET1234567890"
        routes = success_routes()
        routes[("GET", "/api/version")] = (500, f"Bearer {secret}".encode("utf-8"), 0.0)
        evidence = self.build_with_server(routes)
        serialized = json.dumps(evidence, sort_keys=True)

        self.assertNotIn(secret, serialized)
        self.assertIn("<redacted>", serialized)
        self.assertTrue(evidence["redaction"]["secrets_redacted"])


if __name__ == "__main__":
    unittest.main()
