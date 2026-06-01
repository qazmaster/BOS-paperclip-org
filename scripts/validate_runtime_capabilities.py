#!/usr/bin/env python3
"""Validate the BOS Light Paperclip runtime capability matrix.

This validator is deterministic and standard-library only. It checks that the
runtime matrix does not overclaim Paperclip support beyond the draft manifest,
worker wiring, and adapter/persistence assumptions currently present in this
repository.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any, Iterable, Mapping, Sequence

MATRIX_PATH = Path("plugin-bos-light/capabilities.paperclip-runtime.json")
MANIFEST_PATH = Path("plugin-bos-light/manifest.paperclip-plugin.json")
WORKER_PATH = Path("plugin-bos-light/src/worker.ts")
ADAPTER_PATH = Path("plugin-bos-light/src/paperclipAdapter.ts")
PERSISTENCE_PATH = Path("plugin-bos-light/src/persistence.ts")
RUNTIME_CAPABILITIES_PATH = Path("plugin-bos-light/src/runtimeCapabilities.ts")
HEALTH_REPORT_PATH = Path("docs/08_RUNTIME_CAPABILITY_HEALTH.md")
S04_LIVE_ARTIFACT_EVIDENCE_PATH = Path("runtime-evidence/M002-S04-live-artifact-flow.json")
S05_PLUGIN_UI_SURFACE_EVIDENCE_PATH = Path("runtime-evidence/M002-S05-plugin-ui-surface-probe.json")
M003_S04_DECISION_READBACK_EVIDENCE_PATH = Path("runtime-evidence/M003-S04-live-decision-artifact-readback.json")
M006_S00_EVIDENCE_PATH = Path("runtime-evidence/M006-S00-runtime-capability-inventory.json")

STATUS_ENUM = {"confirmed", "unsupported", "fallback-only", "unvalidated"}
KEY_RE = re.compile(r"^[a-z0-9]+(?:[._-][a-z0-9]+)*$")
TS_STRING_RE = re.compile(r'"([a-z0-9]+(?:[._-][a-z0-9]+)+)"')
HEADING_RE = re.compile(r"^#{1,6}\s+(.+?)\s*$", re.MULTILINE)
CONFIRMED_PLACEHOLDER_RE = re.compile(
    r"\b(?:fixture|future|planned|placeholder|todo|tbd|when available|no live|unvalidated|fallback-only)\b",
    re.IGNORECASE,
)

REQUIRED_ENTRY_FIELDS = (
    "key",
    "status",
    "paperclip_surface_name",
    "requirement_ids",
    "downstream_consumers",
    "evidence_source",
    "proof_command",
    "runtime_evidence_field",
    "fallback_path",
    "blocker_text",
    "notes",
)

EXPECTED_SURFACE_KEYS = (
    "company_template.import_export",
    "agents.syntax",
    "plugin.runtime.version_build",
    "plugin.runtime.registration",
    "registration.tools",
    "registration.data",
    "registration.actions",
    "config.api",
    "state.issue_scoped",
    "state.company_scoped",
    "entities.api",
    "activity.logging",
    "events.issue_lifecycle",
    "events.terminal_runs",
    "issues.native",
    "documents.native",
    "comments.native",
    "approvals.native",
    "ui.dashboard_widgets",
    "ui.issue_detail_tabs",
)

S04_NATIVE_ARTIFACT_CONFIRMED_KEYS = {
    "issues.native": ("issue", "issues_created"),
    "documents.native": ("document", "documents_created"),
    "comments.native": ("comments", "comments_created"),
}
S04_REQUIRED_ARTIFACT_FAMILIES = ("BPI", "Blueprint", "Betting Table", "Eval Gate", "Circuit Breaker")
S04_ZERO_SIDE_EFFECT_COUNTS = (
    "approval_requests_created",
    "hermes_runs_started",
    "gsd_pi_runs_started",
    "activity_logs_written",
)

M003_S04_ALLOWED_PROMOTION_KEYS = {"documents.native", "comments.native"}
M003_S04_UNSUPPORTED_ZERO_COUNTS = (
    "approval_requests_created",
    "activity_logs_written",
    "hermes_runs_started",
    "gsd_pi_runs_started",
    "plugin_actions_invoked",
)
M003_S04_FORBIDDEN_CLAIMS = (
    "native_approval",
    "activity_log",
    "hermes",
    "gsd_pi",
    "plugin_actions",
    "unsupported_capability_promoted",
)

S05_PLUGIN_UI_CONFIRMED_KEYS = {
    "plugin.runtime.registration": "plugin_registration",
    "registration.tools": "tools",
    "registration.data": "data_providers",
    "registration.actions": "actions",
    "ui.dashboard_widgets": "dashboard_widgets",
    "ui.issue_detail_tabs": "issue_detail_tabs",
}

S05_ALL_CONFIRMATION_KEYS = set(S05_PLUGIN_UI_CONFIRMED_KEYS) | {"plugin.runtime.version_build"}

CODE_ASSUMPTIONS = (
    (WORKER_PATH, "ctx.tools?.register", "registration.tools", "worker tool registration"),
    (WORKER_PATH, "ctx.data?.register", "registration.data", "worker data provider registration"),
    (WORKER_PATH, "ctx.actions?.register", "registration.actions", "worker action registration"),
    (WORKER_PATH, "ctx.approvals?.create", "approvals.native", "worker native approval creation"),
    (ADAPTER_PATH, "createIssueDocument", "documents.native", "adapter native document API"),
    (ADAPTER_PATH, "addIssueComment", "comments.native", "adapter native comment API"),
    (ADAPTER_PATH, "createApprovalRequest", "approvals.native", "adapter native approval API"),
    (ADAPTER_PATH, "createEscalationIssue", "issues.native", "adapter native issue API"),
    (ADAPTER_PATH, "logActivity", "activity.logging", "adapter activity logging API"),
    (PERSISTENCE_PATH, "InMemoryBOSPersistence", "state.issue_scoped", "draft in-memory persistence fallback"),
)

FORBIDDEN_SOURCE_CLAIMS = (
    (re.compile(r"plugin-owned\s+approval", re.IGNORECASE), "approvals must remain Paperclip-owned, not plugin-owned"),
    (re.compile(r"native\s+approval\s+(?:is\s+)?(?:created|owned)\s+by\s+plugin", re.IGNORECASE), "native approvals must not be described as plugin-created/owned"),
    (re.compile(r"events?\s+(?:are|is)\s+(?:guaranteed|confirmed)", re.IGNORECASE), "events must remain optional until runtime proof exists"),
    (re.compile(r"plugin\s+state\s+(?:is\s+)?durable\s+truth", re.IGNORECASE), "plugin state must not be described as durable truth"),
)

REQUIRED_HEALTH_REPORT_HEADINGS = (
    "Runtime Evidence",
    "C4/C5/C6/C7 Status",
    "Import/Export and AGENTS.md Compatibility",
    "Per-Surface Matrix Summary",
    "Adapter Contract Rules",
    "Persistence and State Boundaries",
    "Events, Polling, and Activity Fallback",
    "Approval and Request Ownership",
    "Known Blockers",
    "Downstream Guidance",
)

REQUIRED_HEALTH_REPORT_PHRASES = (
    "no live Paperclip runtime evidence",
    "plugin-bos-light/capabilities.paperclip-runtime.json",
    "runtime-evidence/M003-S04-live-decision-artifact-readback.json",
    "fail-closed-blocker",
    "blocked_preflight",
    "no capability status promotion",
    "unvalidated",
    "fallback-only",
    "Paperclip-native approvals",
    "S03",
    "S04",
    "S05",
    "S06",
)


class ValidationErrorCollector:
    """Collect validation failures so one run reports all actionable context."""

    def __init__(self) -> None:
        self.errors: list[str] = []

    def add(self, path: Path | str, context: str, message: str) -> None:
        self.errors.append(f"{path}: {context}: {message}")

    def extend(self, failures: Iterable[tuple[Path | str, str, str]]) -> None:
        for path, context, message in failures:
            self.add(path, context, message)


def _display_path(root: Path, path: Path) -> Path:
    try:
        return path.resolve().relative_to(root.resolve())
    except ValueError:
        return path


def _load_json(root: Path, relative_path: Path, errors: ValidationErrorCollector) -> Any | None:
    absolute_path = root / relative_path
    display_path = _display_path(root, absolute_path)
    if not absolute_path.exists():
        errors.add(display_path, "file", "missing required JSON file")
        return None
    try:
        return json.loads(absolute_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        errors.add(display_path, "json", f"malformed JSON at line {exc.lineno}, column {exc.colno}: {exc.msg}")
    except OSError as exc:
        errors.add(display_path, "file", f"unable to read file: {exc.strerror or exc}")
    return None


def _read_text(root: Path, relative_path: Path, errors: ValidationErrorCollector) -> str:
    absolute_path = root / relative_path
    display_path = _display_path(root, absolute_path)
    if not absolute_path.exists():
        errors.add(display_path, "file", "missing required source file")
        return ""
    try:
        return absolute_path.read_text(encoding="utf-8")
    except OSError as exc:
        errors.add(display_path, "file", f"unable to read file: {exc.strerror or exc}")
        return ""


def _as_string_list(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    return [item for item in value if isinstance(item, str) and item.strip()]


def _entry_context(entry: Any, index: int) -> str:
    if isinstance(entry, Mapping):
        key = entry.get("key")
        if isinstance(key, str) and key.strip():
            return f"capabilities[{index}:{key}]"
    return f"capabilities[{index}:<missing-key>]"


def _is_placeholder_evidence(value: Any) -> bool:
    return not isinstance(value, str) or not value.strip() or bool(CONFIRMED_PLACEHOLDER_RE.search(value))


def _validate_confirmed_runtime_evidence(
    entry: Mapping[str, Any],
    context: str,
    has_proof_command: bool,
    has_runtime_field: bool,
    errors: ValidationErrorCollector,
) -> None:
    if not has_proof_command or not has_runtime_field:
        errors.add(MATRIX_PATH, context, "confirmed capability requires both proof_command and runtime_evidence_field")

    proof_command = entry.get("proof_command")
    runtime_field = entry.get("runtime_evidence_field")
    evidence_source = entry.get("evidence_source")
    evidence_text = " ".join(
        str(value)
        for value in (proof_command, runtime_field, evidence_source, entry.get("notes"))
        if isinstance(value, str)
    )

    for field_name, value in (
        ("proof_command", proof_command),
        ("runtime_evidence_field", runtime_field),
        ("evidence_source", evidence_source),
    ):
        if _is_placeholder_evidence(value):
            errors.add(
                MATRIX_PATH,
                context,
                f"confirmed capability field '{field_name}' must contain live Paperclip runtime evidence, not placeholder/future/local-only text",
            )

    if not re.search(r"\bversion\b", evidence_text, re.IGNORECASE) or not re.search(r"\bbuild\b", evidence_text, re.IGNORECASE):
        errors.add(MATRIX_PATH, context, "confirmed capability requires live Paperclip runtime version and build evidence")


def _non_empty_runtime_string(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip()) and value.strip().lower() not in {"unknown", "n/a", "none"}


def _readback_is_live(readback: Any) -> bool:
    return (
        isinstance(readback, Mapping)
        and readback.get("ok") is True
        and isinstance(readback.get("ref"), str)
        and bool(readback.get("ref", "").strip())
        and isinstance(readback.get("sha256"), str)
        and bool(readback.get("sha256", "").strip())
        and int(readback.get("status_code") or 0) < 300
    )


def _s05_route_ids_from_proof(proof: Any) -> list[str]:
    if not isinstance(proof, Mapping):
        return []
    route_ids: list[str] = []
    route_id = proof.get("route_attempt_id")
    if isinstance(route_id, str) and route_id.strip():
        route_ids.append(route_id)
    raw_route_ids = proof.get("route_attempt_ids")
    if isinstance(raw_route_ids, list):
        route_ids.extend(item for item in raw_route_ids if isinstance(item, str) and item.strip())
    return route_ids


def _s05_route_attempts_by_id(evidence: Mapping[str, Any]) -> dict[str, Mapping[str, Any]]:
    attempts = evidence.get("route_attempts")
    if not isinstance(attempts, list):
        return {}
    route_map: dict[str, Mapping[str, Any]] = {}
    for attempt in attempts:
        if not isinstance(attempt, Mapping):
            continue
        route_id = attempt.get("id")
        if isinstance(route_id, str) and route_id.strip():
            route_map[route_id] = attempt
    return route_map


def _s05_route_id_is_live(route_map: Mapping[str, Mapping[str, Any]], route_id: str) -> bool:
    route = route_map.get(route_id)
    if not isinstance(route, Mapping):
        return False
    status_code = route.get("status_code")
    return (
        route.get("ok") is True
        and isinstance(status_code, int)
        and 200 <= status_code < 300
        and not route.get("malformed_json_reason")
        and route.get("truncated") is not True
    )


def _s05_has_successful_piko_invocation(row: Mapping[str, Any]) -> bool:
    invocations = row.get("piko_invocation_results")
    return isinstance(invocations, list) and any(isinstance(item, Mapping) and item.get("ok") is True for item in invocations)


def _artifact_readback(evidence: Mapping[str, Any], readback_key: str) -> Any:
    readbacks = evidence.get("readbacks")
    if not isinstance(readbacks, Mapping):
        return None
    value = readbacks.get(readback_key)
    if readback_key == "comments":
        if not isinstance(value, list) or not value:
            return None
        return value[0]
    return value


def _validate_s04_live_artifact_evidence(
    root: Path,
    entries_by_key: Mapping[str, Mapping[str, Any]],
    errors: ValidationErrorCollector,
) -> None:
    confirmed_entries = {
        key: entry
        for key, entry in entries_by_key.items()
        if entry.get("status") == "confirmed"
    }
    if not confirmed_entries:
        return

    for key, entry in confirmed_entries.items():
        evidence_text = " ".join(
            str(value)
            for value in (entry.get("evidence_source"), entry.get("proof_command"), entry.get("runtime_evidence_field"), entry.get("notes"))
            if isinstance(value, str)
        )
        if (str(S04_LIVE_ARTIFACT_EVIDENCE_PATH) in evidence_text or "s04-live-artifact-flow" in evidence_text) and key not in S04_NATIVE_ARTIFACT_CONFIRMED_KEYS:
            errors.add(
                MATRIX_PATH,
                f"capability.{key}",
                "S04 live artifact evidence may confirm only issues.native, documents.native, and comments.native",
            )

    required_confirmed = [key for key in S04_NATIVE_ARTIFACT_CONFIRMED_KEYS if key in confirmed_entries]
    if not required_confirmed:
        return

    evidence = _load_json(root, S04_LIVE_ARTIFACT_EVIDENCE_PATH, errors)
    if not isinstance(evidence, Mapping):
        return

    runtime = evidence.get("runtime")
    side_effect_counts = evidence.get("side_effect_counts")
    invariants = evidence.get("invariants")
    no_go_guards = evidence.get("no_go_guards")
    artifact_families = evidence.get("artifact_families")

    if evidence.get("phase") != "live" or evidence.get("artifact_type") != "live-evidence":
        errors.add(S04_LIVE_ARTIFACT_EVIDENCE_PATH, "phase", "confirmed native artifacts require final live S04 evidence")
    if not isinstance(runtime, Mapping) or not _non_empty_runtime_string(runtime.get("version")) or not _non_empty_runtime_string(runtime.get("build")):
        errors.add(S04_LIVE_ARTIFACT_EVIDENCE_PATH, "runtime", "confirmed native artifacts require runtime version and build")
    if not isinstance(side_effect_counts, Mapping):
        errors.add(S04_LIVE_ARTIFACT_EVIDENCE_PATH, "side_effect_counts", "missing side-effect counts")
    else:
        for field in S04_ZERO_SIDE_EFFECT_COUNTS:
            if side_effect_counts.get(field) != 0:
                errors.add(S04_LIVE_ARTIFACT_EVIDENCE_PATH, f"side_effect_counts.{field}", "S04 confirmed artifact evidence must not include approvals, agent runs, or activity-log writes")

    if not isinstance(invariants, Mapping):
        errors.add(S04_LIVE_ARTIFACT_EVIDENCE_PATH, "invariants", "missing invariant flags")
    else:
        for field in ("no_core_patch", "no_direct_db_access", "no_secret_diagnostics"):
            if invariants.get(field) is not True:
                errors.add(S04_LIVE_ARTIFACT_EVIDENCE_PATH, f"invariants.{field}", "confirmed native artifacts require no-core/no-DB/no-secret proof")

    if not isinstance(no_go_guards, Mapping):
        errors.add(S04_LIVE_ARTIFACT_EVIDENCE_PATH, "no_go_guards", "missing S02/S03 no-go guard propagation")
    else:
        for guard in ("hermes", "gsd_pi"):
            value = no_go_guards.get(guard)
            if not isinstance(value, Mapping) or value.get("status") != "blocked" or value.get("execution_allowed") is not False or value.get("no_go") is not True:
                errors.add(S04_LIVE_ARTIFACT_EVIDENCE_PATH, f"no_go_guards.{guard}", "S04 must propagate Hermes and GSD-Pi no-go guards")

    if not isinstance(artifact_families, Mapping):
        errors.add(S04_LIVE_ARTIFACT_EVIDENCE_PATH, "artifact_families", "missing BOS artifact family readback summary")
    else:
        for family in S04_REQUIRED_ARTIFACT_FAMILIES:
            value = artifact_families.get(family)
            if not isinstance(value, Mapping) or value.get("present") is not True:
                errors.add(S04_LIVE_ARTIFACT_EVIDENCE_PATH, f"artifact_families.{family}", "missing visible BOS artifact family proof")

    for key in required_confirmed:
        readback_key, count_key = S04_NATIVE_ARTIFACT_CONFIRMED_KEYS[key]
        entry = confirmed_entries[key]
        evidence_text = " ".join(
            str(value)
            for value in (entry.get("evidence_source"), entry.get("proof_command"), entry.get("runtime_evidence_field"))
            if isinstance(value, str)
        )
        if str(S04_LIVE_ARTIFACT_EVIDENCE_PATH) not in evidence_text:
            errors.add(MATRIX_PATH, f"capability.{key}", "confirmed S04 native artifact surface must name the canonical S04 evidence path")
        if isinstance(side_effect_counts, Mapping) and int(side_effect_counts.get(count_key) or 0) < 1:
            errors.add(S04_LIVE_ARTIFACT_EVIDENCE_PATH, f"side_effect_counts.{count_key}", f"confirmed {key} requires at least one live side effect")
        if not _readback_is_live(_artifact_readback(evidence, readback_key)):
            errors.add(S04_LIVE_ARTIFACT_EVIDENCE_PATH, f"readbacks.{readback_key}", f"confirmed {key} requires successful live readback ref, sha256, and <300 status")



def _validate_s05_plugin_ui_surface_evidence(
    root: Path,
    entries_by_key: Mapping[str, Mapping[str, Any]],
    errors: ValidationErrorCollector,
) -> None:
    confirmed_s05_entries = {
        key: entry
        for key, entry in entries_by_key.items()
        if key in S05_ALL_CONFIRMATION_KEYS and entry.get("status") == "confirmed"
    }
    if not confirmed_s05_entries:
        return

    evidence_text_by_key = {
        key: " ".join(
            str(value)
            for value in (entry.get("evidence_source"), entry.get("proof_command"), entry.get("runtime_evidence_field"), entry.get("notes"))
            if isinstance(value, str)
        )
        for key, entry in confirmed_s05_entries.items()
    }

    # M006 S00 provides an alternative live evidence path for plugin.runtime.version_build
    m006_s00_version_build_ok = False
    if "plugin.runtime.version_build" in confirmed_s05_entries:
        text = evidence_text_by_key.get("plugin.runtime.version_build", "")
        if str(M006_S00_EVIDENCE_PATH) in text:
            m006_evidence = _load_json(root, M006_S00_EVIDENCE_PATH, errors)
            if isinstance(m006_evidence, Mapping):
                m006_runtime = m006_evidence.get("runtime")
                if isinstance(m006_runtime, Mapping) and _non_empty_runtime_string(m006_runtime.get("version")) and _non_empty_runtime_string(m006_runtime.get("build")):
                    m006_s00_version_build_ok = True
                else:
                    errors.add(M006_S00_EVIDENCE_PATH, "runtime", "M006 S00 confirmed plugin.runtime.version_build requires runtime version and build")

    # If M006 S00 covers the only confirmed S05 entry, skip S05-specific validation
    if set(confirmed_s05_entries) == {"plugin.runtime.version_build"} and m006_s00_version_build_ok:
        return

    for key, evidence_text in evidence_text_by_key.items():
        if str(S05_PLUGIN_UI_SURFACE_EVIDENCE_PATH) not in evidence_text:
            errors.add(
                MATRIX_PATH,
                f"capability.{key}",
                f"confirmed S05 plugin/UI capability must name canonical evidence path {S05_PLUGIN_UI_SURFACE_EVIDENCE_PATH}",
            )

    evidence = _load_json(root, S05_PLUGIN_UI_SURFACE_EVIDENCE_PATH, errors)
    if not isinstance(evidence, Mapping):
        return

    runtime = evidence.get("runtime")
    if evidence.get("phase") != "live" or evidence.get("artifact_type") != "live-evidence":
        errors.add(S05_PLUGIN_UI_SURFACE_EVIDENCE_PATH, "artifact_type", "confirmed S05 plugin/UI capabilities require final live-evidence")
    if not isinstance(runtime, Mapping) or not _non_empty_runtime_string(runtime.get("version")) or not _non_empty_runtime_string(runtime.get("build")):
        errors.add(S05_PLUGIN_UI_SURFACE_EVIDENCE_PATH, "runtime", "confirmed S05 plugin/UI capabilities require runtime version and build")

    route_map = _s05_route_attempts_by_id(evidence)
    observed_runtime_routes = runtime.get("observed_from_route_ids") if isinstance(runtime, Mapping) else None
    if "plugin.runtime.version_build" in confirmed_s05_entries:
        if m006_s00_version_build_ok:
            pass  # M006 S00 validates version/build independently
        elif not isinstance(observed_runtime_routes, list) or not any(
            isinstance(route_id, str) and _s05_route_id_is_live(route_map, route_id) for route_id in observed_runtime_routes
        ):
            errors.add(
                S05_PLUGIN_UI_SURFACE_EVIDENCE_PATH,
                "runtime.observed_from_route_ids",
                "confirmed plugin.runtime.version_build requires a live S05 runtime route readback",
            )

    surfaces = evidence.get("surfaces")
    if not isinstance(surfaces, Mapping):
        errors.add(S05_PLUGIN_UI_SURFACE_EVIDENCE_PATH, "surfaces", "missing S05 surface evidence")
        return

    for key, surface_name in S05_PLUGIN_UI_CONFIRMED_KEYS.items():
        if key not in confirmed_s05_entries:
            continue
        row = surfaces.get(surface_name)
        if not isinstance(row, Mapping):
            errors.add(S05_PLUGIN_UI_SURFACE_EVIDENCE_PATH, f"surfaces.{surface_name}", f"confirmed {key} requires S05 surface row")
            continue
        if row.get("status") != "confirmed":
            errors.add(S05_PLUGIN_UI_SURFACE_EVIDENCE_PATH, f"surfaces.{surface_name}.status", f"confirmed matrix capability {key} requires confirmed S05 surface status")
        proof = row.get("readback_proof")
        route_ids = _s05_route_ids_from_proof(proof)
        if not route_ids:
            errors.add(S05_PLUGIN_UI_SURFACE_EVIDENCE_PATH, f"surfaces.{surface_name}.readback_proof", f"confirmed {key} requires S05 route readback proof")
        for route_id in route_ids:
            if not _s05_route_id_is_live(route_map, route_id):
                errors.add(S05_PLUGIN_UI_SURFACE_EVIDENCE_PATH, f"surfaces.{surface_name}.readback_proof", f"route {route_id!r} is not a live 2xx S05 readback")
        requested = [item for item in row.get("requested_keys", []) if isinstance(item, str) and item.strip()] if isinstance(row.get("requested_keys"), list) else []
        if surface_name in {"plugin_registration", "tools", "data_providers", "actions"}:
            observed = {item for item in row.get("observed_registered_keys", []) if isinstance(item, str) and item.strip()} if isinstance(row.get("observed_registered_keys"), list) else set()
            missing = [item for item in requested if item not in observed]
            if missing:
                errors.add(S05_PLUGIN_UI_SURFACE_EVIDENCE_PATH, f"surfaces.{surface_name}.observed_registered_keys", f"missing requested keys: {', '.join(missing)}")
        if surface_name in {"dashboard_widgets", "issue_detail_tabs"}:
            render_ids = row.get("render_ids")
            if not isinstance(render_ids, Mapping):
                errors.add(S05_PLUGIN_UI_SURFACE_EVIDENCE_PATH, f"surfaces.{surface_name}.render_ids", f"confirmed {key} requires render ids")
            else:
                for requested_key in requested:
                    render_id = render_ids.get(requested_key)
                    if not isinstance(render_id, str) or not render_id.strip():
                        errors.add(S05_PLUGIN_UI_SURFACE_EVIDENCE_PATH, f"surfaces.{surface_name}.render_ids.{requested_key}", "missing rendered id")
        if surface_name == "tools" and not _s05_has_successful_piko_invocation(row):
            errors.add(S05_PLUGIN_UI_SURFACE_EVIDENCE_PATH, "surfaces.tools.piko_invocation_results", "confirmed registration.tools requires a successful piko invocation result")

def _matrix_mentions_m003_s04(matrix: Mapping[str, Any], entries_by_key: Mapping[str, Mapping[str, Any]]) -> bool:
    text_parts = [str(matrix.get("guardrail") or "")]
    no_promotion = matrix.get("no_promotion_evidence")
    if isinstance(no_promotion, list):
        text_parts.append(json.dumps(no_promotion, sort_keys=True))
    for entry in entries_by_key.values():
        text_parts.extend(
            str(value)
            for value in (entry.get("evidence_source"), entry.get("proof_command"), entry.get("runtime_evidence_field"), entry.get("fallback_path"), entry.get("blocker_text"), entry.get("notes"))
            if isinstance(value, str)
        )
    return str(M003_S04_DECISION_READBACK_EVIDENCE_PATH) in "\n".join(text_parts)


def _validate_m003_s04_no_promotion_metadata(matrix: Any, errors: ValidationErrorCollector) -> None:
    if not isinstance(matrix, Mapping):
        return
    guardrail = str(matrix.get("guardrail") or "")
    for phrase in (
        str(M003_S04_DECISION_READBACK_EVIDENCE_PATH),
        "fail-closed decision readback blocker evidence",
        "promotes no capability status",
    ):
        if phrase not in guardrail:
            errors.add(MATRIX_PATH, "guardrail.M003-S04", f"missing M003 S04 no-promotion guardrail phrase {phrase!r}")

    rows = matrix.get("no_promotion_evidence")
    if not isinstance(rows, list):
        errors.add(MATRIX_PATH, "no_promotion_evidence", "missing no-promotion evidence ledger for M003 S04 blocker")
        return
    m003_rows = [row for row in rows if isinstance(row, Mapping) and row.get("slice") == "M003-S04"]
    if len(m003_rows) != 1:
        errors.add(MATRIX_PATH, "no_promotion_evidence.M003-S04", "must contain exactly one M003-S04 no-promotion evidence row")
        return
    row = m003_rows[0]
    expected = {
        "evidence_path": str(M003_S04_DECISION_READBACK_EVIDENCE_PATH),
        "artifact_type": "fail-closed-blocker",
        "selected_surface": "markdown-only",
        "readback_status": "blocked_preflight",
        "status_effect": "no capability status promotion",
    }
    for field, value in expected.items():
        if row.get(field) != value:
            errors.add(MATRIX_PATH, f"no_promotion_evidence.M003-S04.{field}", f"must be {value!r}")
    guardrails = row.get("guardrails")
    guardrail_text = "\n".join(item for item in guardrails if isinstance(item, str)) if isinstance(guardrails, list) else ""
    for phrase in (
        "native_approval_mutated=false",
        "no_secret_diagnostics=true",
        "hermes_execution_attempted=false",
        "gsd_pi_execution_attempted=false",
    ):
        if phrase not in guardrail_text:
            errors.add(MATRIX_PATH, "no_promotion_evidence.M003-S04.guardrails", f"missing guardrail {phrase!r}")


def _validate_m003_s04_decision_readback_evidence(
    root: Path,
    matrix: Any,
    entries_by_key: Mapping[str, Mapping[str, Any]],
    errors: ValidationErrorCollector,
) -> None:
    if not isinstance(matrix, Mapping):
        return
    _validate_m003_s04_no_promotion_metadata(matrix, errors)
    mentions_m003 = _matrix_mentions_m003_s04(matrix, entries_by_key)

    evidence = _load_json(root, M003_S04_DECISION_READBACK_EVIDENCE_PATH, errors)
    if not isinstance(evidence, Mapping):
        return

    artifact_type = evidence.get("artifact_type")
    selected_surface = evidence.get("selected_surface")
    side_effect_counts = evidence.get("side_effect_counts")
    invariants = evidence.get("invariants")
    claims = evidence.get("capability_claims")
    runtime = evidence.get("runtime")
    fallback = evidence.get("fallback")
    artifact_refs = evidence.get("artifact_refs")

    if evidence.get("schema_version") != "m003-s04-live-decision-artifact-readback/v1":
        errors.add(M003_S04_DECISION_READBACK_EVIDENCE_PATH, "schema_version", "unexpected M003 S04 decision readback schema")
    if artifact_type not in {"live-evidence", "fail-closed-blocker"}:
        errors.add(M003_S04_DECISION_READBACK_EVIDENCE_PATH, "artifact_type", "must be live-evidence or fail-closed-blocker")
    if evidence.get("phase") != "live":
        errors.add(M003_S04_DECISION_READBACK_EVIDENCE_PATH, "phase", "must be live")

    if not isinstance(side_effect_counts, Mapping):
        errors.add(M003_S04_DECISION_READBACK_EVIDENCE_PATH, "side_effect_counts", "missing side-effect counts")
    else:
        for field in M003_S04_UNSUPPORTED_ZERO_COUNTS:
            if side_effect_counts.get(field) != 0:
                errors.add(M003_S04_DECISION_READBACK_EVIDENCE_PATH, f"side_effect_counts.{field}", "M003 S04 decision readback must not record unsupported side effects")
    if not isinstance(claims, Mapping):
        errors.add(M003_S04_DECISION_READBACK_EVIDENCE_PATH, "capability_claims", "missing capability claims")
    else:
        for field in M003_S04_FORBIDDEN_CLAIMS:
            if claims.get(field) is not False:
                errors.add(M003_S04_DECISION_READBACK_EVIDENCE_PATH, f"capability_claims.{field}", "M003 S04 evidence must not promote unsupported capabilities")
    if not isinstance(invariants, Mapping):
        errors.add(M003_S04_DECISION_READBACK_EVIDENCE_PATH, "invariants", "missing invariants")
    else:
        expected_invariants = {
            "native_approval_mutated": False,
            "no_secret_diagnostics": True,
            "hermes_execution_attempted": False,
            "gsd_pi_execution_attempted": False,
        }
        for field, value in expected_invariants.items():
            if invariants.get(field) is not value:
                errors.add(M003_S04_DECISION_READBACK_EVIDENCE_PATH, f"invariants.{field}", f"must be {value!r}")
    if isinstance(artifact_refs, Mapping) and artifact_refs.get("native_approval") not in (None, ""):
        errors.add(M003_S04_DECISION_READBACK_EVIDENCE_PATH, "artifact_refs.native_approval", "decision readback evidence must not include native approval refs")

    for key, entry in entries_by_key.items():
        evidence_text = " ".join(
            str(value)
            for value in (entry.get("evidence_source"), entry.get("proof_command"), entry.get("runtime_evidence_field"), entry.get("notes"))
            if isinstance(value, str)
        )
        if str(M003_S04_DECISION_READBACK_EVIDENCE_PATH) in evidence_text and entry.get("status") == "confirmed" and key not in M003_S04_ALLOWED_PROMOTION_KEYS:
            errors.add(
                MATRIX_PATH,
                f"capability.{key}",
                "M003 S04 decision readback evidence may confirm only native document/comment decision artifact readback surfaces",
            )

    if artifact_type == "fail-closed-blocker":
        if selected_surface != "markdown-only":
            errors.add(M003_S04_DECISION_READBACK_EVIDENCE_PATH, "selected_surface", "fail-closed blocker must select markdown-only")
        if evidence.get("readback_status") != "blocked_preflight":
            errors.add(M003_S04_DECISION_READBACK_EVIDENCE_PATH, "readback_status", "current blocker evidence must be blocked_preflight")
        if not isinstance(fallback, Mapping) or fallback.get("live_proof") is not False:
            errors.add(M003_S04_DECISION_READBACK_EVIDENCE_PATH, "fallback.live_proof", "markdown fallback must not be live proof")
        if isinstance(runtime, Mapping) and (_non_empty_runtime_string(runtime.get("version")) or _non_empty_runtime_string(runtime.get("build"))):
            errors.add(M003_S04_DECISION_READBACK_EVIDENCE_PATH, "runtime", "current fail-closed blocker must not be used as runtime version/build proof")
        if mentions_m003:
            for key, entry in entries_by_key.items():
                if entry.get("status") == "confirmed":
                    evidence_text = " ".join(
                        str(value)
                        for value in (entry.get("evidence_source"), entry.get("proof_command"), entry.get("runtime_evidence_field"), entry.get("notes"))
                        if isinstance(value, str)
                    )
                    if str(M003_S04_DECISION_READBACK_EVIDENCE_PATH) in evidence_text:
                        errors.add(MATRIX_PATH, f"capability.{key}", "fail-closed M003 S04 blocker evidence cannot confirm capability status")
    elif artifact_type == "live-evidence":
        if selected_surface not in {"documents.native", "comments.native"}:
            errors.add(M003_S04_DECISION_READBACK_EVIDENCE_PATH, "selected_surface", "live M003 S04 evidence must select native document or comment readback")

def _validate_entry_shape(entry: Any, index: int, errors: ValidationErrorCollector) -> str | None:
    context = _entry_context(entry, index)
    if not isinstance(entry, dict):
        errors.add(MATRIX_PATH, context, "capability entry must be an object")
        return None

    for field in REQUIRED_ENTRY_FIELDS:
        if field not in entry:
            errors.add(MATRIX_PATH, context, f"missing required field '{field}'")

    key = entry.get("key")
    if not isinstance(key, str) or not key.strip():
        errors.add(MATRIX_PATH, context, "missing required field 'key'")
        return None
    if not KEY_RE.match(key):
        errors.add(MATRIX_PATH, context, "key must be stable lowercase dot/underscore/dash text")

    status = entry.get("status")
    if status not in STATUS_ENUM:
        errors.add(MATRIX_PATH, context, f"status must be one of: {', '.join(sorted(STATUS_ENUM))}")

    for field in ("paperclip_surface_name", "evidence_source", "notes"):
        value = entry.get(field)
        if not isinstance(value, str) or not value.strip():
            errors.add(MATRIX_PATH, context, f"field '{field}' must be a non-empty string")

    for field in ("requirement_ids", "downstream_consumers"):
        values = _as_string_list(entry.get(field))
        if not values:
            errors.add(MATRIX_PATH, context, f"field '{field}' must be a non-empty string list")

    proof_command = entry.get("proof_command")
    runtime_field = entry.get("runtime_evidence_field")
    has_proof_command = isinstance(proof_command, str) and bool(proof_command.strip())
    has_runtime_field = isinstance(runtime_field, str) and bool(runtime_field.strip())
    if not has_proof_command and not has_runtime_field:
        errors.add(MATRIX_PATH, context, "must include proof_command or runtime_evidence_field")

    fallback_path = entry.get("fallback_path")
    blocker_text = entry.get("blocker_text")
    has_fallback = isinstance(fallback_path, str) and bool(fallback_path.strip())
    has_blocker = isinstance(blocker_text, str) and bool(blocker_text.strip())
    if status != "confirmed" and not has_fallback and not has_blocker:
        errors.add(MATRIX_PATH, context, "non-confirmed capability must name fallback_path or blocker_text")
    if status == "unsupported" and not has_fallback and not has_blocker:
        errors.add(MATRIX_PATH, context, "unsupported capability must name fallback_path or blocker_text")
    if status == "confirmed":
        _validate_confirmed_runtime_evidence(entry, context, has_proof_command, has_runtime_field, errors)

    for optional_list_field in ("manifest_capabilities", "manifest_tools", "adapter_assumptions"):
        if optional_list_field in entry and not isinstance(entry[optional_list_field], list):
            errors.add(MATRIX_PATH, context, f"field '{optional_list_field}' must be a list when present")

    manifest_ui = entry.get("manifest_ui")
    if manifest_ui is not None:
        if not isinstance(manifest_ui, dict):
            errors.add(MATRIX_PATH, context, "field 'manifest_ui' must be an object when present")
        else:
            for field in ("dashboard_widgets", "issue_detail_tabs"):
                if field in manifest_ui and not isinstance(manifest_ui[field], list):
                    errors.add(MATRIX_PATH, context, f"field 'manifest_ui.{field}' must be a list when present")

    return key


def _collect_entries(matrix: Any, errors: ValidationErrorCollector) -> dict[str, Mapping[str, Any]]:
    if not isinstance(matrix, dict):
        errors.add(MATRIX_PATH, "json", "top-level value must be an object")
        return {}
    capabilities = matrix.get("capabilities")
    if not isinstance(capabilities, list):
        errors.add(MATRIX_PATH, "capabilities", "missing field or value is not a list")
        return {}

    entries_by_key: dict[str, Mapping[str, Any]] = {}
    for index, entry in enumerate(capabilities):
        key = _validate_entry_shape(entry, index, errors)
        if key is None or not isinstance(entry, dict):
            continue
        if key in entries_by_key:
            errors.add(MATRIX_PATH, _entry_context(entry, index), "duplicate capability key")
        entries_by_key[key] = entry

    for expected_key in EXPECTED_SURFACE_KEYS:
        if expected_key not in entries_by_key:
            errors.add(MATRIX_PATH, expected_key, "missing required Paperclip runtime surface mapping")

    return entries_by_key


def _validate_manifest_coverage(manifest: Any, entries_by_key: Mapping[str, Mapping[str, Any]], errors: ValidationErrorCollector) -> None:
    if not isinstance(manifest, dict):
        errors.add(MANIFEST_PATH, "json", "top-level value must be an object")
        return

    covered_capabilities: set[str] = set()
    covered_tools: set[str] = set()
    covered_dashboard_widgets: set[str] = set()
    covered_issue_detail_tabs: set[str] = set()

    for entry in entries_by_key.values():
        covered_capabilities.update(_as_string_list(entry.get("manifest_capabilities")))
        covered_tools.update(_as_string_list(entry.get("manifest_tools")))
        manifest_ui = entry.get("manifest_ui")
        if isinstance(manifest_ui, dict):
            covered_dashboard_widgets.update(_as_string_list(manifest_ui.get("dashboard_widgets")))
            covered_issue_detail_tabs.update(_as_string_list(manifest_ui.get("issue_detail_tabs")))

    for capability in _as_string_list(manifest.get("capabilities_requested")):
        if capability not in covered_capabilities:
            errors.add(MANIFEST_PATH, f"capabilities_requested.{capability}", "manifest capability not represented in capability matrix")

    manifest_ui = manifest.get("ui", {})
    if isinstance(manifest_ui, dict):
        for widget in _as_string_list(manifest_ui.get("dashboard_widgets")):
            if widget not in covered_dashboard_widgets:
                errors.add(MANIFEST_PATH, f"ui.dashboard_widgets.{widget}", "manifest dashboard widget not represented in capability matrix")
        for tab in _as_string_list(manifest_ui.get("issue_detail_tabs")):
            if tab not in covered_issue_detail_tabs:
                errors.add(MANIFEST_PATH, f"ui.issue_detail_tabs.{tab}", "manifest issue detail tab not represented in capability matrix")

    for tool in _as_string_list(manifest.get("tools")):
        if tool not in covered_tools:
            errors.add(MANIFEST_PATH, f"tools.{tool}", "manifest tool not represented in capability matrix")


def _validate_code_assumption_coverage(root: Path, entries_by_key: Mapping[str, Mapping[str, Any]], errors: ValidationErrorCollector) -> None:
    text_by_path: dict[Path, str] = {}
    for relative_path, token, expected_key, label in CODE_ASSUMPTIONS:
        if relative_path not in text_by_path:
            text_by_path[relative_path] = _read_text(root, relative_path, errors)
        if token in text_by_path[relative_path] and expected_key not in entries_by_key:
            errors.add(relative_path, label, f"source assumption token {token!r} is not represented by capability key '{expected_key}'")


def _validate_source_capability_contract(root: Path, entries_by_key: Mapping[str, Mapping[str, Any]], errors: ValidationErrorCollector) -> None:
    source = _read_text(root, RUNTIME_CAPABILITIES_PATH, errors)
    if not source:
        return

    if str(MATRIX_PATH) not in source:
        errors.add(RUNTIME_CAPABILITIES_PATH, "matrix-path", f"source contract must reference {MATRIX_PATH}")

    source_keys = {
        match.group(1)
        for match in TS_STRING_RE.finditer(source)
        if match.group(1) in entries_by_key or match.group(1) in EXPECTED_SURFACE_KEYS
    }
    matrix_keys = set(entries_by_key)
    missing = sorted(matrix_keys - source_keys)
    extra = sorted(source_keys - matrix_keys)
    for key in missing:
        errors.add(RUNTIME_CAPABILITIES_PATH, key, "matrix capability key missing from source-level runtime contract")
    for key in extra:
        errors.add(RUNTIME_CAPABILITIES_PATH, key, "source-level runtime contract key is not present in capability matrix")

    for status in STATUS_ENUM:
        if status not in source:
            errors.add(RUNTIME_CAPABILITIES_PATH, f"status.{status}", "source-level status vocabulary must mirror matrix enum")

    boundary_terms = ("test/draft", "cache/overlay", "polling", "Paperclip-native approvals")
    for term in boundary_terms:
        if term not in source:
            errors.add(RUNTIME_CAPABILITIES_PATH, f"boundary.{term}", "source-level boundary rules must preserve conservative runtime posture")


def _validate_forbidden_source_claims(root: Path, errors: ValidationErrorCollector) -> None:
    for relative_path in (WORKER_PATH, ADAPTER_PATH, PERSISTENCE_PATH, RUNTIME_CAPABILITIES_PATH):
        source = _read_text(root, relative_path, errors)
        for pattern, message in FORBIDDEN_SOURCE_CLAIMS:
            if pattern.search(source):
                errors.add(relative_path, "runtime-boundary wording", message)


def _validate_manifest_note(manifest: Any, errors: ValidationErrorCollector) -> None:
    if not isinstance(manifest, dict):
        return
    note = str(manifest.get("note") or "")
    for phrase in ("capabilities.paperclip-runtime.json", "requested", "not confirmed"):
        if phrase not in note:
            errors.add(MANIFEST_PATH, "note", f"manifest note must distinguish requested capabilities from confirmed runtime support using phrase {phrase!r}")


def _validate_health_report_if_present(root: Path, entries_by_key: Mapping[str, Mapping[str, Any]], errors: ValidationErrorCollector) -> None:
    report_path = root / HEALTH_REPORT_PATH
    if not report_path.exists():
        return
    text = _read_text(root, HEALTH_REPORT_PATH, errors)
    if not text.strip():
        errors.add(HEALTH_REPORT_PATH, "file", "health report must be non-empty")
        return

    headings = {match.group(1).strip().lower() for match in HEADING_RE.finditer(text)}
    for heading in REQUIRED_HEALTH_REPORT_HEADINGS:
        if heading.lower() not in headings:
            errors.add(HEALTH_REPORT_PATH, f"heading.{heading}", "missing required health report section")

    for phrase in REQUIRED_HEALTH_REPORT_PHRASES:
        if phrase not in text:
            errors.add(HEALTH_REPORT_PATH, f"phrase.{phrase}", "missing required health report wording")

    for key in entries_by_key:
        if key not in text:
            errors.add(HEALTH_REPORT_PATH, f"capability.{key}", "health report must summarize every capability matrix key")

    if "status: confirmed" in text.lower() and "no live Paperclip runtime evidence" in text:
        errors.add(HEALTH_REPORT_PATH, "confirmed-claim", "report cannot claim confirmed support when it states no live runtime evidence exists")


def validate(
    root: Path,
    matrix_path: Path = MATRIX_PATH,
    manifest_path: Path = MANIFEST_PATH,
) -> list[str]:
    root = root.resolve()
    errors = ValidationErrorCollector()

    matrix = _load_json(root, matrix_path, errors)
    manifest = _load_json(root, manifest_path, errors)
    if matrix is None:
        return errors.errors

    entries_by_key = _collect_entries(matrix, errors)
    _validate_s04_live_artifact_evidence(root, entries_by_key, errors)
    _validate_s05_plugin_ui_surface_evidence(root, entries_by_key, errors)
    _validate_m003_s04_decision_readback_evidence(root, matrix, entries_by_key, errors)
    if manifest is not None:
        _validate_manifest_coverage(manifest, entries_by_key, errors)
        _validate_manifest_note(manifest, errors)
    _validate_code_assumption_coverage(root, entries_by_key, errors)
    _validate_source_capability_contract(root, entries_by_key, errors)
    _validate_forbidden_source_claims(root, errors)
    _validate_health_report_if_present(root, entries_by_key, errors)
    return errors.errors


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Validate BOS Light Paperclip runtime capability matrix.")
    parser.add_argument(
        "--root",
        type=Path,
        default=Path(__file__).resolve().parents[1],
        help="Repository root containing plugin-bos-light/ and scripts/ (default: parent of scripts/).",
    )
    parser.add_argument(
        "--matrix",
        type=Path,
        default=MATRIX_PATH,
        help="Capability matrix path relative to root.",
    )
    parser.add_argument(
        "--manifest",
        type=Path,
        default=MANIFEST_PATH,
        help="Draft Paperclip plugin manifest path relative to root.",
    )
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    errors = validate(args.root, args.matrix, args.manifest)
    if errors:
        print("Paperclip runtime capability validation failed:", file=sys.stderr)
        for error in errors:
            print(f"- {error}", file=sys.stderr)
        return 1

    print("Paperclip runtime capabilities OK: manifest surfaces, adapter assumptions, and guardrail fields are mapped.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
