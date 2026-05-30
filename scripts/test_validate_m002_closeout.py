#!/usr/bin/env python3
"""Fixture tests for scripts/validate_m002_closeout.py."""

from __future__ import annotations

import copy
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

SCRIPT_PATH = Path(__file__).resolve().parent / "validate_m002_closeout.py"
SPEC = importlib.util.spec_from_file_location("validate_m002_closeout", SCRIPT_PATH)
assert SPEC is not None and SPEC.loader is not None
validator = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(validator)


FALLBACK_ONLY_KEYS = {
    "plugin.runtime.registration",
    "registration.tools",
    "registration.data",
    "registration.actions",
    "config.api",
    "state.company_scoped",
    "entities.api",
    "events.terminal_runs",
    "ui.dashboard_widgets",
    "ui.issue_detail_tabs",
}
CONFIRMED_KEYS = set(validator.S04_CONFIRMED_KEYS)


def valid_matrix() -> dict:
    capabilities = []
    for key in validator.EXPECTED_CAPABILITY_KEYS:
        status = "unvalidated"
        evidence_source = "Local fixture evidence only; not live Paperclip runtime proof."
        proof_command = "fixture validator command"
        runtime_evidence_field = "fixture.runtime.field"
        fallback_path = "Use conservative local fallback."
        blocker_text = "Runtime proof remains absent."
        notes = "Fixture notes."
        if key in FALLBACK_ONLY_KEYS:
            status = "fallback-only"
        if key in CONFIRMED_KEYS:
            status = "confirmed"
            evidence_source = f"S04 live Paperclip runtime version 0.3.1 and build health.version:0.3.1 in {validator.S04_EVIDENCE_PATH}."
            proof_command = f"python3 scripts/validate_s04_live_artifact_flow.py --evidence {validator.S04_EVIDENCE_PATH} --phase final"
            runtime_evidence_field = f"{validator.S04_EVIDENCE_PATH}: runtime.version, runtime.build, readbacks"
            fallback_path = "Use comments/documents/manual operator fallback if this bounded surface fails elsewhere."
            blocker_text = ""
            notes = "Confirmed only for bounded S04 issue/document/comment artifact readback."
        if key in validator.S05_CONFIRMABLE_KEYS:
            surface = validator.S05_CONFIRMABLE_KEYS[key]
            evidence_source = f"S05 canonical probe {validator.S05_EVIDENCE_PATH} kept {surface} fallback-only with no readback proof."
            proof_command = f"python3 scripts/validate_s05_plugin_ui_surface_probe.py --evidence {validator.S05_EVIDENCE_PATH} --phase final"
            runtime_evidence_field = f"{validator.S05_EVIDENCE_PATH}: surfaces.{surface}.readback_proof"
        if key == validator.S05_VERSION_KEY:
            evidence_source = f"S05 canonical probe {validator.S05_EVIDENCE_PATH} recorded runtime.version=unknown and runtime.build=unknown."
            proof_command = f"python3 scripts/validate_s05_plugin_ui_surface_probe.py --evidence {validator.S05_EVIDENCE_PATH} --phase final"
            runtime_evidence_field = f"{validator.S05_EVIDENCE_PATH}: runtime.version, runtime.build"
        capabilities.append(
            {
                "key": key,
                "status": status,
                "paperclip_surface_name": f"Surface {key}",
                "requirement_ids": ["C7"],
                "downstream_consumers": ["fixture"],
                "evidence_source": evidence_source,
                "proof_command": proof_command,
                "runtime_evidence_field": runtime_evidence_field,
                "fallback_path": fallback_path,
                "blocker_text": blocker_text,
                "notes": notes,
            }
        )
    return {"schema_version": "fixture", "plugin_key": "bos-light", "capabilities": capabilities}


def s04_evidence() -> dict:
    return {
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
        "readbacks": {
            "issue": {"ok": True, "ref": "issue-1", "sha256": "a" * 64, "status_code": 200},
            "document": {"ok": True, "ref": "doc-1", "sha256": "b" * 64, "status_code": 200},
            "comments": [{"ok": True, "ref": "comment-1", "sha256": "c" * 64, "status_code": 200}],
        },
    }


def s05_evidence(confirmed: bool = False) -> dict:
    surface_names = {
        "plugin_registration": ["bos-light"],
        "tools": ["piko:bpi-score"],
        "data_providers": ["betting-table"],
        "actions": ["approve-batch"],
        "dashboard_widgets": ["betting-table"],
        "issue_detail_tabs": ["bos-status", "circuit-state", "gate-results"],
    }
    route_attempts = []
    surfaces = {}
    if confirmed:
        route_attempts.append(
            {"id": "runtime-health", "ok": True, "status_code": 200, "malformed_json_reason": None, "truncated": False}
        )
    for name, requested in surface_names.items():
        route_id = f"{name}-readback"
        if confirmed:
            route_attempts.append({"id": route_id, "ok": True, "status_code": 200, "malformed_json_reason": None, "truncated": False})
        row = {
            "status": "confirmed" if confirmed else "fallback-only",
            "requested_keys": requested,
            "observed_registered_keys": requested if confirmed else [],
            "readback_proof": {"route_attempt_id": route_id} if confirmed else None,
            "render_ids": {},
            "piko_invocation_results": [{"ok": True}] if confirmed and name == "tools" else [],
        }
        if confirmed and name == "dashboard_widgets":
            row["render_ids"] = {"betting-table": "widget-1"}
        if confirmed and name == "issue_detail_tabs":
            row["render_ids"] = {key: f"tab-{index}" for index, key in enumerate(requested, start=1)}
        surfaces[name] = row
    return {
        "artifact_type": "live-evidence" if confirmed else "fail-closed-unsupported",
        "phase": "live",
        "runtime": {
            "version": "0.3.1" if confirmed else "unknown",
            "build": "health.version:0.3.1" if confirmed else "unknown",
            "observed_from_route_ids": ["runtime-health"] if confirmed else [],
        },
        "route_attempts": route_attempts,
        "surfaces": surfaces,
    }


def runtime_capabilities_source(matrix: dict) -> str:
    keys = "\n".join(f'  "{entry["key"]}",' for entry in matrix["capabilities"])
    return f'''export const PAPERCLIP_RUNTIME_CAPABILITY_MATRIX_PATH = "{validator.MATRIX_PATH}" as const;
export const PAPERCLIP_RUNTIME_CAPABILITY_STATUSES = ["confirmed", "unsupported", "fallback-only", "unvalidated"] as const;
export const PAPERCLIP_RUNTIME_CAPABILITY_KEYS = [
{keys}
] as const;
export const PAPERCLIP_RUNTIME_BOUNDARY_RULES = {{
  adapter: "No Paperclip core/private imports or direct DB mutation.",
  approvals: "Approval/request ownership stays with Paperclip-native approvals."
}} as const;
'''


def health_report(matrix: dict) -> str:
    key_lines = "\n".join(f"- `{entry['key']}`: `{entry['status']}`" for entry in matrix["capabilities"])
    return f"""# 08 - Runtime Capability Health

## Runtime Evidence
S04 canonical evidence is `{validator.S04_EVIDENCE_PATH}`. S05 canonical evidence is `{validator.S05_EVIDENCE_PATH}`.
S02 Hermes execution remains blocked by the execution-time secret-materialization blocker and lacks passing `resultJson.bos` proof.

## C4/C5/C6/C7 Status
Conservative runtime posture remains unchanged.

## Per-Surface Matrix Summary
Status totals: `confirmed`=3, `fallback-only`=10, `unvalidated`=7, `unsupported`=0.

{key_lines}

## Known Blockers
- S02 Hermes execution-time secret-materialization blocker: no passing `resultJson.bos`.
- S05 plugin/UI readbacks are absent.

## Downstream Guidance
Do not promote plugin/UI, Hermes, GSD-Pi, approvals, import/export, or AGENTS.md syntax without new evidence.
"""


def live_report() -> str:
    return f"""# Paperclip Live Validation Report

## Environment
Sandbox fixture.

## Core Boundary
- Paperclip core is read-only for this project.
- Direct database writes, core source patches, monkey patches, and private module imports are prohibited.

## Summary Verdict
S04 confirms bounded issue/document/comment artifacts only; S05 plugin/UI surfaces remain fallback-only.
S02 Hermes execution remains blocked by execution-time secret materialization and missing `resultJson.bos` proof.

## Evidence Matrix
| Surface | Previous posture | New posture | Proof | Remaining gap |
|---|---|---|---|---|
| Native artifacts | unvalidated | confirmed bounded | `{validator.S04_EVIDENCE_PATH}` | Broader native behavior still needs proof. |
| Plugin/UI | unvalidated | fallback-only | `{validator.S05_EVIDENCE_PATH}` | Needs live readback proof. |

## Capability Matrix Changes
Only `issues.native`, `documents.native`, and `comments.native` are confirmed.

## Extension Boundary Inventory
Use company templates, plugin APIs, agent configuration, and external/custom adapters only.

## Adapter Launch Checklist
Hermes and GSD-Pi require supported adapter setup and no core modification.

## Do Not Claim Yet
- Plugin/UI support.
- Hermes execution support.
- Native approval/request support.
"""


def write_text(root: Path, relative_path: Path, text: str) -> None:
    path = root / relative_path
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")


def write_json(root: Path, relative_path: Path, value: dict) -> None:
    write_text(root, relative_path, json.dumps(value, indent=2))


def write_fixture(root: Path, matrix: dict | None = None) -> dict:
    matrix_value = copy.deepcopy(matrix if matrix is not None else valid_matrix())
    write_json(root, validator.MATRIX_PATH, matrix_value)
    write_json(root, validator.S04_EVIDENCE_PATH, s04_evidence())
    write_json(root, validator.S05_EVIDENCE_PATH, s05_evidence(confirmed=False))
    write_text(root, validator.HEALTH_REPORT_PATH, health_report(matrix_value))
    write_text(root, validator.LIVE_REPORT_PATH, live_report())
    write_text(root, validator.RUNTIME_CAPABILITIES_PATH, runtime_capabilities_source(matrix_value))
    write_text(root, Path("plugin-bos-light/src/worker.ts"), "export const safe = true;\n")
    write_text(root, Path("adapters/gsdpi-local/src/index.ts"), "export const safeAdapter = true;\n")
    return matrix_value


class M002CloseoutValidatorTests(unittest.TestCase):
    def validate_fixture(self, mutate=None) -> list[str]:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            matrix = write_fixture(root)
            if mutate is not None:
                mutate(root, matrix)
            return validator.validate(root)

    def test_valid_fixture_passes(self):
        self.assertEqual([], self.validate_fixture())

    def test_malformed_evidence_json_reports_path_and_json_context(self):
        def mutate(root: Path, _matrix: dict) -> None:
            write_text(root, validator.S04_EVIDENCE_PATH, '{ "artifact_type": ')

        errors = self.validate_fixture(mutate)
        joined = "\n".join(errors)
        self.assertIn(str(validator.S04_EVIDENCE_PATH), joined)
        self.assertIn("malformed JSON", joined)

    def test_overclaim_confirmed_non_s04_or_s05_surface_fails(self):
        def mutate(root: Path, matrix: dict) -> None:
            for entry in matrix["capabilities"]:
                if entry["key"] == "config.api":
                    entry["status"] = "confirmed"
                    entry["evidence_source"] = f"Improperly reusing {validator.S04_EVIDENCE_PATH} for config."
            write_json(root, validator.MATRIX_PATH, matrix)
            write_text(root, validator.RUNTIME_CAPABILITIES_PATH, runtime_capabilities_source(matrix))

        errors = self.validate_fixture(mutate)
        joined = "\n".join(errors)
        self.assertIn("capability.config.api.status", joined)
        self.assertIn("not allowed", joined)

    def test_missing_gap_ledger_fails(self):
        def mutate(root: Path, _matrix: dict) -> None:
            write_text(root, validator.LIVE_REPORT_PATH, live_report().replace("| Remaining gap |", "| Gap |"))

        errors = self.validate_fixture(mutate)
        joined = "\n".join(errors)
        self.assertIn("remaining_gap_ledger", joined)

    def test_missing_no_core_audit_fails(self):
        def mutate(root: Path, _matrix: dict) -> None:
            text = live_report().replace("## Core Boundary", "## Boundary")
            text = text.replace("Paperclip core is read-only for this project.", "")
            write_text(root, validator.LIVE_REPORT_PATH, text)

        errors = self.validate_fixture(mutate)
        joined = "\n".join(errors)
        self.assertIn("heading.Core Boundary", joined)
        self.assertIn("no_core_audit.Paperclip core is read-only", joined)

    def test_stale_s05_proof_cannot_confirm_plugin_ui_surface(self):
        def mutate(root: Path, matrix: dict) -> None:
            for entry in matrix["capabilities"]:
                if entry["key"] == "ui.dashboard_widgets":
                    entry["status"] = "confirmed"
                    entry["evidence_source"] = f"Claimed live proof in {validator.S05_EVIDENCE_PATH}."
                    entry["proof_command"] = f"validate {validator.S05_EVIDENCE_PATH}"
                    entry["runtime_evidence_field"] = f"{validator.S05_EVIDENCE_PATH}: surfaces.dashboard_widgets"
            write_json(root, validator.MATRIX_PATH, matrix)
            write_text(root, validator.RUNTIME_CAPABILITIES_PATH, runtime_capabilities_source(matrix))

        errors = self.validate_fixture(mutate)
        joined = "\n".join(errors)
        self.assertIn("confirmed S05 plugin/UI capabilities require live-evidence", joined)
        self.assertIn("surfaces.dashboard_widgets.status", joined)
        self.assertIn("readback_proof", joined)

    def test_missing_hermes_blocker_text_fails(self):
        def mutate(root: Path, _matrix: dict) -> None:
            write_text(root, validator.HEALTH_REPORT_PATH, health_report(valid_matrix()).replace("S02 Hermes", "S02 adapter"))
            write_text(root, validator.LIVE_REPORT_PATH, live_report().replace("S02 Hermes", "S02 adapter"))

        errors = self.validate_fixture(mutate)
        joined = "\n".join(errors)
        self.assertIn("s02_hermes_blocker", joined)

    def test_secret_looking_text_is_reported_without_value(self):
        secret = "sk-abcdefghijklmnopqrstuvwxyz123456"

        def mutate(root: Path, _matrix: dict) -> None:
            write_text(root, validator.LIVE_REPORT_PATH, live_report() + f"\nDo not leak {secret}\n")

        errors = self.validate_fixture(mutate)
        joined = "\n".join(errors)
        self.assertIn("possible secret material detected", joined)
        self.assertIn("value redacted", joined)
        self.assertNotIn(secret, joined)

    def test_private_paperclip_import_is_forbidden(self):
        def mutate(root: Path, _matrix: dict) -> None:
            write_text(root, Path("plugin-bos-light/src/privateImport.ts"), "import { x } from '@paperclip/core/private/db';\n")

        errors = self.validate_fixture(mutate)
        joined = "\n".join(errors)
        self.assertIn("privateImport.ts", joined)
        self.assertIn("paperclip-core-or-private-import", joined)

    def test_direct_db_mutation_is_forbidden(self):
        def mutate(root: Path, _matrix: dict) -> None:
            write_text(root, Path("adapters/gsdpi-local/src/dbMutation.ts"), "export async function bad(db: any) { return db.update('issues'); }\n")

        errors = self.validate_fixture(mutate)
        joined = "\n".join(errors)
        self.assertIn("dbMutation.ts", joined)
        self.assertIn("direct-database-mutation", joined)


if __name__ == "__main__":
    unittest.main(verbosity=2)
