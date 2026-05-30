#!/usr/bin/env python3
from __future__ import annotations

import copy
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]


def load_validator():
    path = ROOT / "scripts/validate_s05_plugin_ui_surface_probe.py"
    spec = importlib.util.spec_from_file_location("validate_s05_plugin_ui_surface_probe", path)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


validator = load_validator()

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


def route(route_id: str, surface: str, path: str, *, method: str = "GET") -> dict[str, Any]:
    return {
        "id": route_id,
        "surface": surface,
        "method": method,
        "path": path,
        "ok": True,
        "status_code": 200,
        "duration_ms": 1,
        "error": None,
        "message": None,
        "truncated": False,
        "malformed_json_reason": None,
        "used_for_proof": True,
        "response_summary": {"json_type": "dict", "top_level_keys": ["ok"], "text_snippet": None},
    }


def valid_live_evidence() -> dict[str, Any]:
    return {
        "schema_version": validator.SCHEMA_VERSION,
        "artifact_type": validator.PASSING_ARTIFACT_TYPE,
        "phase": "live",
        "generated_at": "2026-05-29T00:00:00Z",
        "runner": {
            "script": "scripts/run_s05_plugin_ui_surface_probe.py",
            "standard_library_only": True,
            "max_route_attempts": validator.MAX_ROUTE_ATTEMPTS,
            "max_response_bytes": validator.MAX_RESPONSE_BYTES,
        },
        "inputs": {
            "manifest_path": "plugin-bos-light/manifest.paperclip-plugin.json",
            "runtime_matrix_path": "plugin-bos-light/capabilities.paperclip-runtime.json",
            "base_url": "http://127.0.0.1:12345",
            "auth_token_env": "PAPERCLIP_API_KEY",
            "auth_header_name": "Authorization",
            "companyId": "company-1",
            "issueId": "issue-1",
            "timeout_seconds": 1.0,
            "live_probe_enabled": True,
        },
        "requested_manifest": {
            "plugin_key": "bos-light",
            "capabilities": ["tools.register", "data.register", "actions.register"],
            "tools": TOOLS,
            "data_providers": ["betting-table"],
            "actions": ["approve-batch"],
            "ui": {"dashboard_widgets": ["betting-table"], "issue_detail_tabs": TABS},
        },
        "capability_matrix_excerpt": {},
        "runtime": {"version": "2026.5.29", "build": "build-abc123", "observed_from_route_ids": ["r00"]},
        "surfaces": {
            "plugin_registration": {
                "status": "confirmed",
                "requested_keys": ["bos-light"],
                "observed_registered_keys": ["bos-light"],
                "readback_proof": {"route_attempt_id": "r01", "source": "S05 live route"},
                "fallback_reason": None,
                "validation_errors": [],
            },
            "tools": {
                "status": "confirmed",
                "requested_keys": TOOLS,
                "observed_registered_keys": TOOLS,
                "readback_proof": {"route_attempt_id": "r02", "source": "S05 live route"},
                "piko_invocation_results": [{"tool_key": "piko:bpi-score", "route_attempt_id": "r03", "ok": True, "status_code": 200}],
                "fallback_reason": None,
                "validation_errors": [],
            },
            "data_providers": {
                "status": "confirmed",
                "requested_keys": ["betting-table"],
                "observed_registered_keys": ["betting-table"],
                "readback_proof": {"route_attempt_id": "r04", "source": "S05 live route"},
                "fallback_reason": None,
                "validation_errors": [],
            },
            "actions": {
                "status": "confirmed",
                "requested_keys": ["approve-batch"],
                "observed_registered_keys": ["approve-batch"],
                "readback_proof": {"route_attempt_id": "r05", "source": "S05 live route"},
                "fallback_reason": None,
                "validation_errors": [],
            },
            "dashboard_widgets": {
                "status": "confirmed",
                "requested_keys": ["betting-table"],
                "observed_registered_keys": ["betting-table"],
                "render_ids": {"betting-table": "dw-betting-table"},
                "readback_proof": {"route_attempt_ids": ["r06"], "source": "S05 live route"},
                "fallback_reason": None,
                "validation_errors": [],
            },
            "issue_detail_tabs": {
                "status": "confirmed",
                "requested_keys": TABS,
                "observed_registered_keys": TABS,
                "render_ids": {tab: f"tab-{tab}" for tab in TABS},
                "readback_proof": {"route_attempt_ids": ["r07", "r08", "r09"], "source": "S05 live route"},
                "fallback_reason": None,
                "validation_errors": [],
            },
        },
        "route_attempts": [
            route("r00", "runtime", "/api/health"),
            route("r01", "plugin_registration", "/api/plugins/bos-light"),
            route("r02", "tools", "/api/plugins/bos-light/tools"),
            route("r03", "tools", "/api/plugins/bos-light/tools/piko%3Abpi-score/invoke", method="POST"),
            route("r04", "data_providers", "/api/plugins/bos-light/data"),
            route("r05", "actions", "/api/plugins/bos-light/actions"),
            route("r06", "dashboard_widgets", "/api/plugins/bos-light/ui/dashboard-widgets/betting-table"),
            route("r07", "issue_detail_tabs", "/api/plugins/bos-light/ui/issue-detail-tabs/bos-status"),
            route("r08", "issue_detail_tabs", "/api/plugins/bos-light/ui/issue-detail-tabs/circuit-state"),
            route("r09", "issue_detail_tabs", "/api/plugins/bos-light/ui/issue-detail-tabs/gate-results"),
        ],
        "phase_timestamps": {
            "start": "2026-05-29T00:00:00Z",
            "inputs_loaded": "2026-05-29T00:00:01Z",
            "live_probe_start": "2026-05-29T00:00:02Z",
            "live_probe_end": "2026-05-29T00:00:03Z",
            "evidence_written": "2026-05-29T00:00:04Z",
        },
        "side_effect_counters": {
            "route_requests_attempted": 10,
            "piko_invocations_attempted": 1,
            "native_approvals_created": 0,
            "approval_requests_created": 0,
            "documents_created": 0,
            "comments_created": 0,
            "issue_mutations_attempted": 0,
            "action_invocations_attempted": 0,
        },
        "redaction": {"secrets_redacted": True, "secret_env_vars": ["PAPERCLIP_API_KEY"], "redaction_errors": []},
        "fallback_diagnostics": [],
        "validation_errors": [],
    }


def valid_fail_closed_evidence() -> dict[str, Any]:
    evidence = valid_live_evidence()
    evidence["artifact_type"] = validator.BLOCKER_ARTIFACT_TYPE
    evidence["inputs"]["base_url"] = ""
    evidence["inputs"]["live_probe_enabled"] = False
    evidence["runtime"] = {"version": "unknown", "build": "unknown", "observed_from_route_ids": []}
    evidence["route_attempts"] = []
    evidence["side_effect_counters"]["route_requests_attempted"] = 0
    evidence["side_effect_counters"]["piko_invocations_attempted"] = 0
    evidence["fallback_diagnostics"] = [{"code": "missing_live_probe_env", "message": "no live env"}]
    for row in evidence["surfaces"].values():
        row["status"] = "fallback-only"
        row["observed_registered_keys"] = []
        row["readback_proof"] = None
        row["fallback_reason"] = "live env not supplied"
        if "render_ids" in row:
            row["render_ids"] = {}
        if "piko_invocation_results" in row:
            row["piko_invocation_results"] = []
    return evidence


class ValidateS05PluginUiSurfaceProbeTests(unittest.TestCase):
    def assertInvalidContains(self, evidence: dict[str, Any], expected: str) -> None:
        errors = validator.validate_evidence(evidence)
        self.assertTrue(any(expected in error for error in errors), f"missing {expected!r} in {errors}")

    def test_accepts_complete_positive_live_contract(self) -> None:
        self.assertEqual(validator.validate_evidence(valid_live_evidence()), [])

    def test_cli_accepts_task_plan_evidence_and_phase_flags(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            path = Path(tmpdir) / "evidence.json"
            path.write_text(json.dumps(valid_fail_closed_evidence()), encoding="utf-8")
            self.assertEqual(validator.main(["--evidence", str(path), "--phase", "final"]), 0)

    def test_rejects_missing_required_surface_rows(self) -> None:
        evidence = valid_live_evidence()
        del evidence["surfaces"]["actions"]
        self.assertInvalidContains(evidence, "surfaces.actions")

    def test_rejects_secret_like_values(self) -> None:
        evidence = valid_live_evidence()
        evidence["route_attempts"][0]["response_summary"]["diagnostic_token"] = "sk-liveSECRET1234567890"
        self.assertInvalidContains(evidence, "secret-like field must be redacted")

    def test_rejects_nonzero_native_approvals(self) -> None:
        evidence = valid_live_evidence()
        evidence["side_effect_counters"]["native_approvals_created"] = 1
        self.assertInvalidContains(evidence, "side_effect_counters.native_approvals_created")

    def test_rejects_s04_only_proof_reuse_for_confirmed_surface(self) -> None:
        evidence = valid_live_evidence()
        evidence["surfaces"]["tools"]["readback_proof"]["source"] = "M002-S04-live-artifact-flow.json"
        self.assertInvalidContains(evidence, "must not reuse S04-only proof")

    def test_rejects_confirmed_status_without_runtime_build(self) -> None:
        evidence = valid_live_evidence()
        evidence["runtime"]["build"] = "unknown"
        self.assertInvalidContains(evidence, "confirmed status requires S05 runtime version and build evidence")

    def test_rejects_confirmed_status_without_readback(self) -> None:
        evidence = valid_live_evidence()
        evidence["surfaces"]["data_providers"]["readback_proof"] = None
        self.assertInvalidContains(evidence, "confirmed status requires S05 route readback proof")

    def test_rejects_malformed_route_response(self) -> None:
        evidence = valid_live_evidence()
        evidence["route_attempts"][2]["malformed_json_reason"] = "line 1, column 2: nope"
        self.assertInvalidContains(evidence, "malformed route responses")

    def test_rejects_unbounded_route_attempts(self) -> None:
        evidence = valid_live_evidence()
        evidence["route_attempts"] = [route(f"rx{i}", "tools", f"/api/plugins/bos-light/tools/{i}") for i in range(validator.MAX_ROUTE_ATTEMPTS + 1)]
        self.assertInvalidContains(evidence, "must contain <=")

    def test_rejects_confirmed_ui_surface_missing_render_id(self) -> None:
        evidence = valid_live_evidence()
        del evidence["surfaces"]["dashboard_widgets"]["render_ids"]["betting-table"]
        self.assertInvalidContains(evidence, "confirmed UI surface requires render id")

    def test_rejects_passing_artifact_when_not_all_surfaces_confirmed(self) -> None:
        evidence = valid_live_evidence()
        evidence["surfaces"]["actions"]["status"] = "fallback-only"
        evidence["surfaces"]["actions"]["fallback_reason"] = "not supported"
        evidence["surfaces"]["actions"]["readback_proof"] = None
        self.assertInvalidContains(evidence, "live-evidence requires all plugin/UI surfaces to be confirmed")


if __name__ == "__main__":
    unittest.main()
