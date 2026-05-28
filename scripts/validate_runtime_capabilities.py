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

STATUS_ENUM = {"confirmed", "unsupported", "fallback-only", "unvalidated"}
KEY_RE = re.compile(r"^[a-z0-9]+(?:[._-][a-z0-9]+)*$")
TS_STRING_RE = re.compile(r'"([a-z0-9]+(?:[._-][a-z0-9]+)+)"')
HEADING_RE = re.compile(r"^#{1,6}\s+(.+?)\s*$", re.MULTILINE)

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
    if status == "confirmed" and not has_proof_command and not has_runtime_field:
        errors.add(MATRIX_PATH, context, "confirmed capability requires proof evidence")

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
