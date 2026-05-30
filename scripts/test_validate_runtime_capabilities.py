#!/usr/bin/env python3
"""Fixture-based negative coverage for scripts/validate_runtime_capabilities.py."""

from __future__ import annotations

import copy
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

SCRIPT_PATH = Path(__file__).resolve().parent / "validate_runtime_capabilities.py"
SPEC = importlib.util.spec_from_file_location("validate_runtime_capabilities", SCRIPT_PATH)
assert SPEC is not None and SPEC.loader is not None
validator = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(validator)


MANIFEST = {
    "schema_version": "0.1-test",
    "plugin_key": "bos-light",
    "note": "Draft requested-capability manifest only. Runtime confirmation lives in plugin-bos-light/capabilities.paperclip-runtime.json; requested capabilities here are not confirmed Paperclip support.",
    "capabilities_requested": [
        "config.read",
        "config.write",
        "events.subscribe",
        "state.read",
        "state.write",
        "entities.read",
        "entities.write",
        "issues.read",
        "issues.write",
        "activity.write",
        "data.register",
        "actions.register",
        "tools.register",
    ],
    "ui": {
        "dashboard_widgets": ["betting-table"],
        "issue_detail_tabs": ["bos-status", "circuit-state", "gate-results"],
    },
    "tools": [
        "piko:bpi-score",
        "piko:blueprint-gen",
        "piko:bpi-blueprint-artifact",
        "piko:eval-gate",
        "piko:eval-gate-evidence",
        "piko:circuit-breaker-observe",
        "piko:decide",
    ],
}

MANIFEST_CAPABILITIES_BY_KEY = {
    "registration.tools": ["tools.register"],
    "registration.data": ["data.register"],
    "registration.actions": ["actions.register"],
    "config.api": ["config.read", "config.write"],
    "state.issue_scoped": ["state.read", "state.write"],
    "entities.api": ["entities.read", "entities.write"],
    "activity.logging": ["activity.write"],
    "events.issue_lifecycle": ["events.subscribe"],
    "issues.native": ["issues.read", "issues.write"],
}

MANIFEST_TOOLS_BY_KEY = {
    "registration.tools": [
        "piko:bpi-score",
        "piko:blueprint-gen",
        "piko:bpi-blueprint-artifact",
        "piko:eval-gate",
        "piko:eval-gate-evidence",
        "piko:circuit-breaker-observe",
        "piko:decide",
    ],
}

MANIFEST_UI_BY_KEY = {
    "ui.dashboard_widgets": {"dashboard_widgets": ["betting-table"], "issue_detail_tabs": []},
    "ui.issue_detail_tabs": {
        "dashboard_widgets": [],
        "issue_detail_tabs": ["bos-status", "circuit-state", "gate-results"],
    },
}


WORKER_TS = """
export async function registerBosLightPlugin(ctx: any): Promise<void> {
  await ctx.tools?.register?.("piko:bpi-score", async () => ({}));
  await ctx.data?.register?.("betting-table", async () => ({}));
  await ctx.actions?.register?.("approve-batch", async (input: any) => {
    return ctx.approvals?.create?.({ issueIds: input.issue_ids ?? [] });
  });
}
"""

ADAPTER_TS = """
export interface PaperclipAdapter {
  createIssueDocument(issueId: string, title: string, markdown: string): Promise<{ document_id: string }>;
  addIssueComment(issueId: string, markdown: string): Promise<{ comment_id: string }>;
  createApprovalRequest(issueIds: string[], reason: string): Promise<{ id: string }>;
  createEscalationIssue(input: { title: string; body: string; related_issue_id: string }): Promise<{ issue_id: string }>;
  logActivity(message: string, data?: unknown): Promise<void>;
}
"""

PERSISTENCE_TS = """
export class InMemoryBOSPersistence {}
"""


def runtime_capabilities_ts(matrix: dict) -> str:
    keys = [entry["key"] for entry in matrix["capabilities"] if isinstance(entry, dict) and "key" in entry]
    keys_text = "\n".join(f'  "{key}",' for key in keys)
    return f'''export const PAPERCLIP_RUNTIME_CAPABILITY_MATRIX_PATH = "plugin-bos-light/capabilities.paperclip-runtime.json" as const;
export const PAPERCLIP_RUNTIME_CAPABILITY_STATUSES = ["confirmed", "unsupported", "fallback-only", "unvalidated"] as const;
export const PAPERCLIP_RUNTIME_CAPABILITY_KEYS = [
{keys_text}
] as const;
export const PAPERCLIP_RUNTIME_BOUNDARY_RULES = {{
  adapter: "In-memory adapter and persistence are test/draft-only and never prove Paperclip host support.",
  artifacts: "Issue documents and comments are preferred durable artifact paths when proven.",
  state: "Plugin state is cache/overlay only unless runtime proof exists.",
  events: "Event handling is optional behind polling and activity fallback.",
  approvals: "Approval/request ownership stays with Paperclip-native approvals."
}} as const;
'''


def valid_matrix() -> dict:
    capabilities: list[dict] = []
    for key in validator.EXPECTED_SURFACE_KEYS:
        entry = {
            "key": key,
            "status": "unvalidated",
            "paperclip_surface_name": f"Test surface {key}",
            "requirement_ids": ["C7"],
            "downstream_consumers": ["fixture"],
            "evidence_source": "Fixture evidence source.",
            "proof_command": "fixture proof command",
            "runtime_evidence_field": "fixture.runtime.field",
            "fallback_path": "Fixture fallback path.",
            "blocker_text": "Fixture blocker text.",
            "notes": "Fixture notes.",
            "manifest_capabilities": copy.deepcopy(MANIFEST_CAPABILITIES_BY_KEY.get(key, [])),
            "manifest_tools": copy.deepcopy(MANIFEST_TOOLS_BY_KEY.get(key, [])),
            "adapter_assumptions": [],
        }
        if key in MANIFEST_UI_BY_KEY:
            entry["manifest_ui"] = copy.deepcopy(MANIFEST_UI_BY_KEY[key])
        capabilities.append(entry)
    return {"schema_version": "0.1-test", "plugin_key": "bos-light", "capabilities": capabilities}


def s04_live_artifact_evidence() -> dict:
    return {
        "schema_version": "s04-live-artifact-flow/v1",
        "artifact_type": "live-evidence",
        "phase": "live",
        "runtime": {"version": "0.3.1", "build": "health.version:0.3.1"},
        "side_effect_counts": {
            "issues_created": 1,
            "documents_created": 1,
            "comments_created": 1,
            "approval_requests_created": 0,
            "hermes_runs_started": 0,
            "gsd_pi_runs_started": 0,
            "activity_logs_written": 0,
        },
        "invariants": {
            "no_core_patch": True,
            "no_direct_db_access": True,
            "no_secret_diagnostics": True,
        },
        "no_go_guards": {
            "hermes": {"status": "blocked", "execution_allowed": False, "no_go": True},
            "gsd_pi": {"status": "blocked", "execution_allowed": False, "no_go": True},
        },
        "artifact_families": {
            family: {"present": True, "surfaces": ["document", "comment"]}
            for family in validator.S04_REQUIRED_ARTIFACT_FAMILIES
        },
        "readbacks": {
            "issue": {"ok": True, "ref": "issue-1", "sha256": "a" * 64, "status_code": 200},
            "document": {"ok": True, "ref": "document-1", "sha256": "b" * 64, "status_code": 200},
            "comments": [{"ok": True, "ref": "comment-1", "sha256": "c" * 64, "status_code": 200}],
        },
    }


def write_s04_evidence(root: Path, evidence: dict | None = None) -> None:
    path = root / validator.S04_LIVE_ARTIFACT_EVIDENCE_PATH
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(copy.deepcopy(evidence if evidence is not None else s04_live_artifact_evidence()), indent=2), encoding="utf-8")


def s05_plugin_ui_surface_evidence(confirmed: bool = True) -> dict:
    surface_names = [
        "plugin_registration",
        "tools",
        "data_providers",
        "actions",
        "dashboard_widgets",
        "issue_detail_tabs",
    ]
    requested_by_surface = {
        "plugin_registration": ["bos-light"],
        "tools": ["piko:bpi-score"],
        "data_providers": ["betting-table"],
        "actions": ["approve-batch"],
        "dashboard_widgets": ["betting-table"],
        "issue_detail_tabs": ["bos-status", "circuit-state", "gate-results"],
    }
    surfaces = {}
    route_attempts = [
        {
            "id": "runtime-health",
            "surface": "runtime",
            "method": "GET",
            "path": "/api/health",
            "ok": True,
            "status_code": 200,
            "malformed_json_reason": None,
            "truncated": False,
            "response_summary": {"text_snippet": "ok"},
        }
    ]
    for name in surface_names:
        requested = requested_by_surface[name]
        route_id = f"{name}-readback"
        route_attempts.append(
            {
                "id": route_id,
                "surface": name,
                "method": "GET",
                "path": f"/api/probe/{name}",
                "ok": confirmed,
                "status_code": 200 if confirmed else 404,
                "malformed_json_reason": None,
                "truncated": False,
                "response_summary": {"text_snippet": name},
            }
        )
        row = {
            "status": "confirmed" if confirmed else "fallback-only",
            "requested_keys": requested,
            "observed_registered_keys": requested if confirmed else [],
            "readback_proof": {"route_attempt_id": route_id} if confirmed else None,
            "fallback_reason": "" if confirmed else "fixture fallback",
            "validation_errors": [],
        }
        if name == "dashboard_widgets":
            row["render_ids"] = {"betting-table": "widget-1"} if confirmed else {}
        if name == "issue_detail_tabs":
            row["render_ids"] = {key: f"tab-{index}" for index, key in enumerate(requested, start=1)} if confirmed else {}
        if name == "tools":
            row["piko_invocation_results"] = [{"tool_key": "piko:bpi-score", "ok": True}] if confirmed else []
        surfaces[name] = row
    return {
        "schema_version": "s05-plugin-ui-surface-probe/v1",
        "artifact_type": "live-evidence" if confirmed else "fail-closed-unsupported",
        "phase": "live",
        "generated_at": "2026-05-29T00:00:00Z",
        "runtime": {
            "version": "0.3.1" if confirmed else "unknown",
            "build": "health.version:0.3.1" if confirmed else "unknown",
            "observed_from_route_ids": ["runtime-health"] if confirmed else [],
        },
        "route_attempts": route_attempts if confirmed else [],
        "surfaces": surfaces,
    }


def write_s05_evidence(root: Path, evidence: dict | None = None) -> None:
    path = root / validator.S05_PLUGIN_UI_SURFACE_EVIDENCE_PATH
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(copy.deepcopy(evidence if evidence is not None else s05_plugin_ui_surface_evidence()), indent=2), encoding="utf-8")


def mark_s04_native_confirmed(matrix: dict) -> None:
    for entry in matrix["capabilities"]:
        key = entry.get("key")
        if key in validator.S04_NATIVE_ARTIFACT_CONFIRMED_KEYS:
            entry["status"] = "confirmed"
            entry["evidence_source"] = f"S04 live Paperclip runtime version 0.3.1 and build health.version:0.3.1 in {validator.S04_LIVE_ARTIFACT_EVIDENCE_PATH}."
            entry["proof_command"] = f"python3 scripts/validate_s04_live_artifact_flow.py --evidence {validator.S04_LIVE_ARTIFACT_EVIDENCE_PATH} --phase final verifies version and build."
            entry["runtime_evidence_field"] = f"{validator.S04_LIVE_ARTIFACT_EVIDENCE_PATH}: runtime.version, runtime.build, readbacks"


def write_fixture(root: Path, matrix: dict | str | None = None, manifest: dict | None = None) -> None:
    (root / "plugin-bos-light" / "src").mkdir(parents=True)
    (root / "plugin-bos-light" / "manifest.paperclip-plugin.json").write_text(
        json.dumps(copy.deepcopy(manifest if manifest is not None else MANIFEST), indent=2),
        encoding="utf-8",
    )
    matrix_value = copy.deepcopy(matrix if matrix is not None else valid_matrix())
    if isinstance(matrix_value, str):
        matrix_text = matrix_value
    else:
        matrix_text = json.dumps(matrix_value, indent=2)
    (root / "plugin-bos-light" / "capabilities.paperclip-runtime.json").write_text(matrix_text, encoding="utf-8")
    (root / "plugin-bos-light" / "src" / "worker.ts").write_text(WORKER_TS, encoding="utf-8")
    (root / "plugin-bos-light" / "src" / "paperclipAdapter.ts").write_text(ADAPTER_TS, encoding="utf-8")
    (root / "plugin-bos-light" / "src" / "persistence.ts").write_text(PERSISTENCE_TS, encoding="utf-8")
    runtime_source = runtime_capabilities_ts(matrix_value if isinstance(matrix_value, dict) else valid_matrix())
    (root / "plugin-bos-light" / "src" / "runtimeCapabilities.ts").write_text(runtime_source, encoding="utf-8")


class RuntimeCapabilityValidatorTests(unittest.TestCase):
    def validate_fixture(self, mutate=None, matrix: dict | str | None = None) -> list[str]:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            fixture_matrix = copy.deepcopy(matrix if matrix is not None else valid_matrix())
            if mutate is not None and isinstance(fixture_matrix, dict):
                mutate(fixture_matrix)
            write_fixture(root, fixture_matrix)
            return validator.validate(root)

    def test_valid_fixture_passes(self):
        self.assertEqual([], self.validate_fixture())

    def test_malformed_json_reports_matrix_path(self):
        errors = self.validate_fixture(matrix='{ "capabilities": [')
        joined = "\n".join(errors)
        self.assertIn("plugin-bos-light/capabilities.paperclip-runtime.json", joined)
        self.assertIn("malformed JSON", joined)

    def test_missing_capability_key_reports_entry_context(self):
        def mutate(matrix: dict) -> None:
            del matrix["capabilities"][0]["key"]

        errors = self.validate_fixture(mutate)
        joined = "\n".join(errors)
        self.assertIn("capabilities[0:<missing-key>]", joined)
        self.assertIn("missing required field 'key'", joined)

    def test_missing_manifest_coverage_reports_requested_capability(self):
        def mutate(matrix: dict) -> None:
            for entry in matrix["capabilities"]:
                if entry.get("key") == "config.api":
                    entry["manifest_capabilities"] = ["config.write"]

        errors = self.validate_fixture(mutate)
        joined = "\n".join(errors)
        self.assertIn("manifest.paperclip-plugin.json", joined)
        self.assertIn("capabilities_requested.config.read", joined)
        self.assertIn("manifest capability not represented", joined)

    def test_unsupported_status_without_fallback_or_blocker_fails(self):
        def mutate(matrix: dict) -> None:
            target = matrix["capabilities"][0]
            target["status"] = "unsupported"
            target["fallback_path"] = ""
            target["blocker_text"] = ""

        errors = self.validate_fixture(mutate)
        joined = "\n".join(errors)
        self.assertIn("unsupported capability", joined)
        self.assertIn("fallback_path or blocker_text", joined)

    def test_confirmed_status_without_proof_evidence_fails(self):
        def mutate(matrix: dict) -> None:
            target = matrix["capabilities"][0]
            target["status"] = "confirmed"
            target["proof_command"] = ""
            target["runtime_evidence_field"] = ""

        errors = self.validate_fixture(mutate)
        joined = "\n".join(errors)
        self.assertIn("confirmed capability requires both proof_command and runtime_evidence_field", joined)

    def test_confirmed_status_with_placeholder_runtime_evidence_fails(self):
        def mutate(matrix: dict) -> None:
            target = matrix["capabilities"][0]
            target["status"] = "confirmed"
            target["proof_command"] = "fixture proof command"
            target["runtime_evidence_field"] = "future.paperclip.version_build"
            target["evidence_source"] = "Future Paperclip runtime evidence when available."

        errors = self.validate_fixture(mutate)
        joined = "\n".join(errors)
        self.assertIn("live Paperclip runtime evidence", joined)
        self.assertIn("placeholder/future/local-only", joined)

    def test_confirmed_status_requires_version_and_build_evidence(self):
        def mutate(matrix: dict) -> None:
            target = matrix["capabilities"][0]
            target["status"] = "confirmed"
            target["proof_command"] = "paperclip-runtime --print-version"
            target["runtime_evidence_field"] = "paperclip.runtime.version"
            target["evidence_source"] = "Live Paperclip runtime version probe."

        errors = self.validate_fixture(mutate)
        joined = "\n".join(errors)
        self.assertIn("runtime version and build evidence", joined)

    def test_manifest_ui_and_tools_are_required(self):
        def mutate(matrix: dict) -> None:
            for entry in matrix["capabilities"]:
                if entry.get("key") == "registration.tools":
                    entry["manifest_tools"] = ["piko:bpi-score"]
                if entry.get("key") == "ui.issue_detail_tabs":
                    entry["manifest_ui"] = {"dashboard_widgets": [], "issue_detail_tabs": ["bos-status"]}

        errors = self.validate_fixture(mutate)
        joined = "\n".join(errors)
        self.assertIn("tools.piko:blueprint-gen", joined)
        self.assertIn("tools.piko:eval-gate-evidence", joined)
        self.assertIn("tools.piko:circuit-breaker-observe", joined)
        self.assertIn("ui.issue_detail_tabs.circuit-state", joined)

    def test_source_contract_missing_matrix_key_fails(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            matrix = valid_matrix()
            write_fixture(root, matrix)
            source_path = root / "plugin-bos-light" / "src" / "runtimeCapabilities.ts"
            source_path.write_text(source_path.read_text(encoding="utf-8").replace('  "approvals.native",\n', ""), encoding="utf-8")
            errors = validator.validate(root)
        joined = "\n".join(errors)
        self.assertIn("runtimeCapabilities.ts", joined)
        self.assertIn("approvals.native", joined)
        self.assertIn("missing from source-level runtime contract", joined)

    def test_forbidden_plugin_owned_approval_wording_fails(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            write_fixture(root)
            worker_path = root / "plugin-bos-light" / "src" / "worker.ts"
            worker_path.write_text(worker_path.read_text(encoding="utf-8") + "\n// plugin-owned approval\n", encoding="utf-8")
            errors = validator.validate(root)
        joined = "\n".join(errors)
        self.assertIn("approvals must remain Paperclip-owned", joined)

    def test_existing_health_report_must_include_required_sections_and_keys(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            write_fixture(root)
            docs = root / "docs"
            docs.mkdir()
            (docs / "08_RUNTIME_CAPABILITY_HEALTH.md").write_text("# Health\n\nno live Paperclip runtime evidence\n", encoding="utf-8")
            errors = validator.validate(root)
        joined = "\n".join(errors)
        self.assertIn("heading.Runtime Evidence", joined)
        self.assertIn("capability.approvals.native", joined)

    def test_s04_native_artifact_confirmations_require_canonical_evidence(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            matrix = valid_matrix()
            mark_s04_native_confirmed(matrix)
            write_fixture(root, matrix)
            errors = validator.validate(root)
        joined = "\n".join(errors)
        self.assertIn(str(validator.S04_LIVE_ARTIFACT_EVIDENCE_PATH), joined)
        self.assertIn("missing required JSON file", joined)

    def test_s04_native_artifact_confirmations_pass_with_live_readbacks(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            matrix = valid_matrix()
            mark_s04_native_confirmed(matrix)
            write_fixture(root, matrix)
            write_s04_evidence(root)
            errors = validator.validate(root)
        self.assertEqual([], errors)

    def test_s04_native_artifact_confirmations_reject_missing_readback(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            matrix = valid_matrix()
            mark_s04_native_confirmed(matrix)
            write_fixture(root, matrix)
            evidence = s04_live_artifact_evidence()
            evidence["readbacks"]["document"]["ok"] = False
            write_s04_evidence(root, evidence)
            errors = validator.validate(root)
        joined = "\n".join(errors)
        self.assertIn("readbacks.document", joined)
        self.assertIn("documents.native", joined)

    def test_s04_evidence_cannot_confirm_unrelated_surfaces(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            matrix = valid_matrix()
            for entry in matrix["capabilities"]:
                if entry.get("key") == "approvals.native":
                    entry["status"] = "confirmed"
                    entry["evidence_source"] = f"S04 live Paperclip runtime version 0.3.1 and build health.version:0.3.1 in {validator.S04_LIVE_ARTIFACT_EVIDENCE_PATH}."
                    entry["proof_command"] = f"python3 scripts/validate_s04_live_artifact_flow.py --evidence {validator.S04_LIVE_ARTIFACT_EVIDENCE_PATH} --phase final verifies version and build."
                    entry["runtime_evidence_field"] = f"{validator.S04_LIVE_ARTIFACT_EVIDENCE_PATH}: runtime.version, runtime.build, readbacks"
            write_fixture(root, matrix)
            write_s04_evidence(root)
            errors = validator.validate(root)
        joined = "\n".join(errors)
        self.assertIn("S04 live artifact evidence may confirm only issues.native, documents.native, and comments.native", joined)

    def test_s05_plugin_ui_confirmations_require_canonical_evidence_path(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            matrix = valid_matrix()
            for entry in matrix["capabilities"]:
                if entry.get("key") == "registration.tools":
                    entry["status"] = "confirmed"
                    entry["evidence_source"] = "Live Paperclip runtime version 0.3.1 and build health.version:0.3.1 registered piko tools."
                    entry["proof_command"] = "paperclip tools readback recorded version and build"
                    entry["runtime_evidence_field"] = "paperclip.registration.tools.registered_tool_keys"
            write_fixture(root, matrix)
            write_s05_evidence(root)
            errors = validator.validate(root)
        joined = "\n".join(errors)
        self.assertIn(str(validator.S05_PLUGIN_UI_SURFACE_EVIDENCE_PATH), joined)
        self.assertIn("confirmed S05 plugin/UI capability must name canonical evidence path", joined)

    def test_s05_fallback_artifact_cannot_confirm_plugin_ui_surfaces(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            matrix = valid_matrix()
            for entry in matrix["capabilities"]:
                if entry.get("key") == "ui.dashboard_widgets":
                    entry["status"] = "confirmed"
                    entry["evidence_source"] = f"Live Paperclip runtime version 0.3.1 and build health.version:0.3.1 in {validator.S05_PLUGIN_UI_SURFACE_EVIDENCE_PATH}."
                    entry["proof_command"] = f"python3 scripts/validate_s05_plugin_ui_surface_probe.py --evidence {validator.S05_PLUGIN_UI_SURFACE_EVIDENCE_PATH} --phase final"
                    entry["runtime_evidence_field"] = f"{validator.S05_PLUGIN_UI_SURFACE_EVIDENCE_PATH}: surfaces.dashboard_widgets.render_ids"
            write_fixture(root, matrix)
            write_s05_evidence(root, s05_plugin_ui_surface_evidence(confirmed=False))
            errors = validator.validate(root)
        joined = "\n".join(errors)
        self.assertIn("confirmed S05 plugin/UI capabilities require final live-evidence", joined)
        self.assertIn("confirmed matrix capability ui.dashboard_widgets requires confirmed S05 surface status", joined)

    def test_s05_live_artifact_can_confirm_plugin_ui_surface(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            matrix = valid_matrix()
            for entry in matrix["capabilities"]:
                if entry.get("key") == "ui.issue_detail_tabs":
                    entry["status"] = "confirmed"
                    entry["evidence_source"] = f"S05 live Paperclip runtime version 0.3.1 and build health.version:0.3.1 in {validator.S05_PLUGIN_UI_SURFACE_EVIDENCE_PATH}."
                    entry["proof_command"] = f"python3 scripts/validate_s05_plugin_ui_surface_probe.py --evidence {validator.S05_PLUGIN_UI_SURFACE_EVIDENCE_PATH} --phase final"
                    entry["runtime_evidence_field"] = f"{validator.S05_PLUGIN_UI_SURFACE_EVIDENCE_PATH}: surfaces.issue_detail_tabs.render_ids, surfaces.issue_detail_tabs.readback_proof"
            write_fixture(root, matrix)
            write_s05_evidence(root)
            errors = validator.validate(root)
        self.assertEqual([], errors)


if __name__ == "__main__":
    unittest.main(verbosity=2)
