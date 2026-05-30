#!/usr/bin/env python3
"""Validate M002 closeout evidence without contacting Paperclip.

This closeout gate is intentionally standard-library only. It cross-checks the
runtime capability matrix, canonical S04/S05 evidence, reader-facing closeout
reports, and BOS Light source boundaries so M002 cannot close with capability
overclaims, hidden blockers, leaked secrets, or Paperclip core/private coupling.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any, Iterable, Mapping, Sequence

MATRIX_PATH = Path("plugin-bos-light/capabilities.paperclip-runtime.json")
RUNTIME_CAPABILITIES_PATH = Path("plugin-bos-light/src/runtimeCapabilities.ts")
HEALTH_REPORT_PATH = Path("docs/08_RUNTIME_CAPABILITY_HEALTH.md")
LIVE_REPORT_PATH = Path("PAPERCLIP_LIVE_VALIDATION_REPORT.md")
S04_EVIDENCE_PATH = Path("runtime-evidence/M002-S04-live-artifact-flow.json")
S05_EVIDENCE_PATH = Path("runtime-evidence/M002-S05-plugin-ui-surface-probe.json")

DEFAULT_SOURCE_ROOTS = (
    Path("plugin-bos-light/src"),
    Path("adapters/gsdpi-local/src"),
)
SOURCE_SUFFIXES = {".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"}

STATUS_ENUM = {"confirmed", "fallback-only", "unvalidated", "unsupported"}
EXPECTED_STATUS_COUNTS = {
    "confirmed": 3,
    "fallback-only": 10,
    "unvalidated": 7,
    "unsupported": 0,
}
EXPECTED_CAPABILITY_KEYS = (
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

S04_CONFIRMED_KEYS = {
    "issues.native": ("readbacks.issue", "side_effect_counts.issues_created"),
    "documents.native": ("readbacks.document", "side_effect_counts.documents_created"),
    "comments.native": ("readbacks.comments[0]", "side_effect_counts.comments_created"),
}
S04_ZERO_SIDE_EFFECT_FIELDS = (
    "approval_requests_created",
    "hermes_runs_started",
    "gsd_pi_runs_started",
    "activity_logs_written",
)
S04_REQUIRED_INVARIANTS = (
    "no_core_patch",
    "no_direct_db_access",
    "no_secret_diagnostics",
)

S05_CONFIRMABLE_KEYS = {
    "plugin.runtime.registration": "plugin_registration",
    "registration.tools": "tools",
    "registration.data": "data_providers",
    "registration.actions": "actions",
    "ui.dashboard_widgets": "dashboard_widgets",
    "ui.issue_detail_tabs": "issue_detail_tabs",
}
S05_VERSION_KEY = "plugin.runtime.version_build"
S05_ALL_CONFIRMABLE_KEYS = set(S05_CONFIRMABLE_KEYS) | {S05_VERSION_KEY}

REQUIRED_HEALTH_HEADINGS = (
    "Runtime Evidence",
    "C4/C5/C6/C7 Status",
    "Per-Surface Matrix Summary",
    "Known Blockers",
    "Downstream Guidance",
)
REQUIRED_REPORT_HEADINGS = (
    "Core Boundary",
    "Summary Verdict",
    "Evidence Matrix",
    "Capability Matrix Changes",
    "Extension Boundary Inventory",
    "Adapter Launch Checklist",
    "Do Not Claim Yet",
)
NO_CORE_AUDIT_PHRASES = (
    "Paperclip core is read-only",
    "Direct database writes",
    "core source patches",
    "monkey patches",
    "private module imports",
)

HEADING_RE = re.compile(r"^#{1,6}\s+(.+?)\s*$", re.MULTILINE)
STATUS_TOTAL_RE = re.compile(r"`?(confirmed|fallback-only|unvalidated|unsupported)`?\s*=\s*(\d+)", re.IGNORECASE)

SECRET_PATTERNS: tuple[tuple[re.Pattern[str], str], ...] = (
    (re.compile(r"-----BEGIN (?:RSA |DSA |EC |OPENSSH |)?PRIVATE KEY-----"), "private-key-block"),
    (re.compile(r"\bsk-[A-Za-z0-9_-]{20,}\b"), "openai-style-api-key"),
    (re.compile(r"\b(?:ghp|github_pat)_[A-Za-z0-9_]{30,}\b"), "github-token"),
    (re.compile(r"\bAKIA[0-9A-Z]{16}\b"), "aws-access-key"),
    (re.compile(r"\bAuthorization\s*[:=]\s*Bearer\s+[A-Za-z0-9._~+/=-]{24,}\b", re.IGNORECASE), "authorization-bearer-token"),
    (re.compile(r"\b(?:api[_-]?key|token|secret|password)\s*[:=]\s*['\"]?(?!redacted\b|<redacted>|unknown\b|PAPERCLIP_API_KEY\b)[A-Za-z0-9._~+/=-]{32,}", re.IGNORECASE), "inline-secret-assignment"),
)

FORBIDDEN_SOURCE_PATTERNS: tuple[tuple[re.Pattern[str], str], ...] = (
    (
        re.compile(
            r"\b(?:import\s+[^;\n]*\s+from\s+|require\()['\"][^'\"]*(?:@?paperclip[^'\"]*/(?:core|private|internal|server|db)|paperclip-(?:core|server|db)|@paperclip/(?:core|server|db|private|internal))[^'\"]*['\"]",
            re.IGNORECASE,
        ),
        "paperclip-core-or-private-import",
    ),
    (
        re.compile(r"\b(?:db|database|prisma|knex)\s*\.\s*(?:execute|queryRaw|\$executeRaw|insert|update|delete|create)\s*\(", re.IGNORECASE),
        "direct-database-mutation",
    ),
    (
        re.compile(r"\b(?:INSERT|UPDATE|DELETE)\s+(?:INTO\s+)?(?:paperclip_|companies|issues|approvals|comments|documents)\b", re.IGNORECASE),
        "direct-sql-mutation",
    ),
    (
        re.compile(r"(?:Object\.defineProperty\s*\([^\n]*prototype|\.prototype\.[A-Za-z_$][\w$]*\s*=)", re.IGNORECASE),
        "monkey-patch-runtime-prototype",
    ),
    (
        re.compile(r"\b(?:fallback|markdown|comment)[^\n]{0,80}\b(?:nativeApprovalId|native_approval_id|nativeApprovalStatus|native_approval_status)\s*[:=]", re.IGNORECASE),
        "native-approval-side-effect-from-fallback",
    ),
)


class ValidationErrorCollector:
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


def _read_text(root: Path, relative_path: Path, errors: ValidationErrorCollector, *, required: bool = True) -> str:
    absolute_path = root / relative_path
    display_path = _display_path(root, absolute_path)
    if not absolute_path.exists():
        if required:
            errors.add(display_path, "file", "missing required text file")
        return ""
    try:
        return absolute_path.read_text(encoding="utf-8")
    except OSError as exc:
        errors.add(display_path, "file", f"unable to read file: {exc.strerror or exc}")
        return ""


def _headings(text: str) -> set[str]:
    return {match.group(1).strip().lower() for match in HEADING_RE.finditer(text)}


def _nested_get(value: Any, path: str) -> Any:
    current = value
    for part in path.split("."):
        if "[" in part:
            name, _, index_text = part.partition("[")
            if name:
                if not isinstance(current, Mapping):
                    return None
                current = current.get(name)
            try:
                index = int(index_text.rstrip("]"))
            except ValueError:
                return None
            if not isinstance(current, list) or index >= len(current):
                return None
            current = current[index]
            continue
        if not isinstance(current, Mapping):
            return None
        current = current.get(part)
    return current


def _non_empty_runtime_string(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip()) and value.strip().lower() not in {"unknown", "n/a", "none"}


def _readback_ok(value: Any) -> bool:
    return (
        isinstance(value, Mapping)
        and value.get("ok") is True
        and isinstance(value.get("ref"), str)
        and bool(value.get("ref", "").strip())
        and isinstance(value.get("sha256"), str)
        and bool(value.get("sha256", "").strip())
        and isinstance(value.get("status_code"), int)
        and 200 <= int(value.get("status_code")) < 300
    )


def _collect_matrix_entries(matrix: Any, errors: ValidationErrorCollector) -> dict[str, Mapping[str, Any]]:
    if not isinstance(matrix, Mapping):
        errors.add(MATRIX_PATH, "json", "top-level value must be an object")
        return {}
    capabilities = matrix.get("capabilities")
    if not isinstance(capabilities, list):
        errors.add(MATRIX_PATH, "capabilities", "missing field or value is not a list")
        return {}

    entries: dict[str, Mapping[str, Any]] = {}
    for index, entry in enumerate(capabilities):
        context = f"capabilities[{index}]"
        if not isinstance(entry, Mapping):
            errors.add(MATRIX_PATH, context, "capability entry must be an object")
            continue
        key = entry.get("key")
        if not isinstance(key, str) or not key.strip():
            errors.add(MATRIX_PATH, context, "missing field 'key'")
            continue
        if key in entries:
            errors.add(MATRIX_PATH, f"capability.{key}", "duplicate capability key")
        status = entry.get("status")
        if status not in STATUS_ENUM:
            errors.add(MATRIX_PATH, f"capability.{key}.status", f"must be one of {', '.join(sorted(STATUS_ENUM))}")
        entries[key] = entry

    for expected_key in EXPECTED_CAPABILITY_KEYS:
        if expected_key not in entries:
            errors.add(MATRIX_PATH, f"capability.{expected_key}", "missing required runtime surface")
    return entries


def _entry_text(entry: Mapping[str, Any]) -> str:
    chunks: list[str] = []
    for field in ("evidence_source", "proof_command", "runtime_evidence_field", "fallback_path", "blocker_text", "notes"):
        value = entry.get(field)
        if isinstance(value, str):
            chunks.append(value)
    return "\n".join(chunks)


def _status_counts(entries: Mapping[str, Mapping[str, Any]]) -> dict[str, int]:
    counts = {status: 0 for status in STATUS_ENUM}
    for entry in entries.values():
        status = entry.get("status")
        if isinstance(status, str) and status in counts:
            counts[status] += 1
    return counts


def _validate_status_posture(entries: Mapping[str, Mapping[str, Any]], health_text: str, errors: ValidationErrorCollector) -> None:
    counts = _status_counts(entries)
    for status, expected in EXPECTED_STATUS_COUNTS.items():
        actual = counts.get(status, 0)
        if actual != expected:
            errors.add(MATRIX_PATH, f"status_counts.{status}", f"expected conservative M002 count {expected}, found {actual}")

    reported = {match.group(1).lower(): int(match.group(2)) for match in STATUS_TOTAL_RE.finditer(health_text)}
    for status, actual in counts.items():
        if reported.get(status) != actual:
            errors.add(HEALTH_REPORT_PATH, f"status_totals.{status}", f"health report must state {status}={actual}")

    confirmed_keys = {key for key, entry in entries.items() if entry.get("status") == "confirmed"}
    allowed_confirmed = set(S04_CONFIRMED_KEYS) | S05_ALL_CONFIRMABLE_KEYS
    for key in sorted(confirmed_keys - allowed_confirmed):
        errors.add(MATRIX_PATH, f"capability.{key}.status", "confirmed status is not allowed without an explicit S04/S05 closeout evidence rule")


def _validate_s04_evidence(root: Path, entries: Mapping[str, Mapping[str, Any]], errors: ValidationErrorCollector) -> None:
    evidence = _load_json(root, S04_EVIDENCE_PATH, errors)
    if not isinstance(evidence, Mapping):
        return

    runtime = evidence.get("runtime")
    if evidence.get("artifact_type") != "live-evidence":
        errors.add(S04_EVIDENCE_PATH, "artifact_type", "must be live-evidence")
    if evidence.get("phase") != "live":
        errors.add(S04_EVIDENCE_PATH, "phase", "must be live")
    if not isinstance(runtime, Mapping) or not _non_empty_runtime_string(runtime.get("version")):
        errors.add(S04_EVIDENCE_PATH, "runtime.version", "missing live runtime version")
    if not isinstance(runtime, Mapping) or not _non_empty_runtime_string(runtime.get("build")):
        errors.add(S04_EVIDENCE_PATH, "runtime.build", "missing live runtime build")

    for field in S04_REQUIRED_INVARIANTS:
        if _nested_get(evidence, f"invariants.{field}") is not True:
            errors.add(S04_EVIDENCE_PATH, f"invariants.{field}", "must be true for closeout")
    for field in S04_ZERO_SIDE_EFFECT_FIELDS:
        if _nested_get(evidence, f"side_effect_counts.{field}") != 0:
            errors.add(S04_EVIDENCE_PATH, f"side_effect_counts.{field}", "must remain zero for S04 bounded proof")

    for key, (readback_path, count_path) in S04_CONFIRMED_KEYS.items():
        entry = entries.get(key)
        if not isinstance(entry, Mapping):
            continue
        if entry.get("status") != "confirmed":
            errors.add(MATRIX_PATH, f"capability.{key}.status", "S04 native artifact surface must remain confirmed in M002 closeout")
            continue
        text = _entry_text(entry)
        if str(S04_EVIDENCE_PATH) not in text:
            errors.add(MATRIX_PATH, f"capability.{key}.evidence_source", f"must reference canonical evidence {S04_EVIDENCE_PATH}")
        if not _readback_ok(_nested_get(evidence, readback_path)):
            errors.add(S04_EVIDENCE_PATH, readback_path, f"confirmed {key} requires ok ref sha256 and 2xx status")
        count_value = _nested_get(evidence, count_path)
        if not isinstance(count_value, int) or count_value < 1:
            errors.add(S04_EVIDENCE_PATH, count_path, f"confirmed {key} requires at least one live side effect")

    for key, entry in entries.items():
        if key not in S04_CONFIRMED_KEYS and entry.get("status") == "confirmed" and str(S04_EVIDENCE_PATH) in _entry_text(entry):
            errors.add(MATRIX_PATH, f"capability.{key}.evidence_source", "S04 evidence may confirm only issues.native, documents.native, and comments.native")


def _route_attempts_by_id(evidence: Mapping[str, Any]) -> dict[str, Mapping[str, Any]]:
    attempts = evidence.get("route_attempts")
    if not isinstance(attempts, list):
        return {}
    result: dict[str, Mapping[str, Any]] = {}
    for attempt in attempts:
        if not isinstance(attempt, Mapping):
            continue
        route_id = attempt.get("id")
        if isinstance(route_id, str) and route_id.strip():
            result[route_id] = attempt
    return result


def _route_ok(route_map: Mapping[str, Mapping[str, Any]], route_id: str) -> bool:
    route = route_map.get(route_id)
    status = route.get("status_code") if isinstance(route, Mapping) else None
    return (
        isinstance(route, Mapping)
        and route.get("ok") is True
        and isinstance(status, int)
        and 200 <= status < 300
        and route.get("malformed_json_reason") in (None, "")
        and route.get("truncated") is not True
    )


def _proof_route_ids(proof: Any) -> list[str]:
    if not isinstance(proof, Mapping):
        return []
    values: list[str] = []
    route_id = proof.get("route_attempt_id")
    if isinstance(route_id, str) and route_id.strip():
        values.append(route_id)
    route_ids = proof.get("route_attempt_ids")
    if isinstance(route_ids, list):
        values.extend(item for item in route_ids if isinstance(item, str) and item.strip())
    return values


def _validate_s05_evidence(root: Path, entries: Mapping[str, Mapping[str, Any]], errors: ValidationErrorCollector) -> None:
    evidence = _load_json(root, S05_EVIDENCE_PATH, errors)
    if not isinstance(evidence, Mapping):
        return

    confirmed_s05 = {key: entry for key, entry in entries.items() if key in S05_ALL_CONFIRMABLE_KEYS and entry.get("status") == "confirmed"}
    if not confirmed_s05:
        return

    if evidence.get("artifact_type") != "live-evidence":
        errors.add(S05_EVIDENCE_PATH, "artifact_type", "confirmed S05 plugin/UI capabilities require live-evidence")
    if evidence.get("phase") != "live":
        errors.add(S05_EVIDENCE_PATH, "phase", "confirmed S05 plugin/UI capabilities require phase=live")
    runtime = evidence.get("runtime")
    if not isinstance(runtime, Mapping) or not _non_empty_runtime_string(runtime.get("version")):
        errors.add(S05_EVIDENCE_PATH, "runtime.version", "confirmed S05 plugin/UI capabilities require runtime version")
    if not isinstance(runtime, Mapping) or not _non_empty_runtime_string(runtime.get("build")):
        errors.add(S05_EVIDENCE_PATH, "runtime.build", "confirmed S05 plugin/UI capabilities require runtime build")

    route_map = _route_attempts_by_id(evidence)
    if S05_VERSION_KEY in confirmed_s05:
        observed_routes = runtime.get("observed_from_route_ids") if isinstance(runtime, Mapping) else None
        if not isinstance(observed_routes, list) or not any(isinstance(route_id, str) and _route_ok(route_map, route_id) for route_id in observed_routes):
            errors.add(S05_EVIDENCE_PATH, "runtime.observed_from_route_ids", "confirmed plugin runtime version/build requires live route readback")

    surfaces = evidence.get("surfaces")
    if not isinstance(surfaces, Mapping):
        errors.add(S05_EVIDENCE_PATH, "surfaces", "missing S05 surface evidence")
        return

    for key, surface_name in S05_CONFIRMABLE_KEYS.items():
        if key not in confirmed_s05:
            continue
        entry_text = _entry_text(confirmed_s05[key])
        if str(S05_EVIDENCE_PATH) not in entry_text:
            errors.add(MATRIX_PATH, f"capability.{key}.evidence_source", f"must reference canonical evidence {S05_EVIDENCE_PATH}")
        surface = surfaces.get(surface_name)
        if not isinstance(surface, Mapping):
            errors.add(S05_EVIDENCE_PATH, f"surfaces.{surface_name}", f"confirmed {key} requires surface row")
            continue
        if surface.get("status") != "confirmed":
            errors.add(S05_EVIDENCE_PATH, f"surfaces.{surface_name}.status", f"confirmed {key} requires confirmed S05 status")
        route_ids = _proof_route_ids(surface.get("readback_proof"))
        if not route_ids:
            errors.add(S05_EVIDENCE_PATH, f"surfaces.{surface_name}.readback_proof", f"confirmed {key} requires route readback proof")
        for route_id in route_ids:
            if not _route_ok(route_map, route_id):
                errors.add(S05_EVIDENCE_PATH, f"surfaces.{surface_name}.readback_proof", f"route id {route_id!r} is not a live 2xx readback")

        requested = surface.get("requested_keys")
        requested_keys = [item for item in requested if isinstance(item, str) and item.strip()] if isinstance(requested, list) else []
        if surface_name in {"plugin_registration", "tools", "data_providers", "actions"}:
            observed = surface.get("observed_registered_keys")
            observed_keys = {item for item in observed if isinstance(item, str) and item.strip()} if isinstance(observed, list) else set()
            missing = [item for item in requested_keys if item not in observed_keys]
            if missing:
                errors.add(S05_EVIDENCE_PATH, f"surfaces.{surface_name}.observed_registered_keys", f"missing requested keys: {', '.join(missing)}")
        if surface_name in {"dashboard_widgets", "issue_detail_tabs"}:
            render_ids = surface.get("render_ids")
            if not isinstance(render_ids, Mapping):
                errors.add(S05_EVIDENCE_PATH, f"surfaces.{surface_name}.render_ids", f"confirmed {key} requires render ids")
            else:
                for requested_key in requested_keys:
                    if not isinstance(render_ids.get(requested_key), str) or not render_ids.get(requested_key, "").strip():
                        errors.add(S05_EVIDENCE_PATH, f"surfaces.{surface_name}.render_ids.{requested_key}", "missing rendered id")
        if surface_name == "tools":
            invocations = surface.get("piko_invocation_results")
            if not isinstance(invocations, list) or not any(isinstance(item, Mapping) and item.get("ok") is True for item in invocations):
                errors.add(S05_EVIDENCE_PATH, "surfaces.tools.piko_invocation_results", "confirmed registration.tools requires a successful piko invocation result")


def _validate_doc_sections(entries: Mapping[str, Mapping[str, Any]], health_text: str, report_text: str, errors: ValidationErrorCollector) -> None:
    health_headings = _headings(health_text)
    report_headings = _headings(report_text)
    for heading in REQUIRED_HEALTH_HEADINGS:
        if heading.lower() not in health_headings:
            errors.add(HEALTH_REPORT_PATH, f"heading.{heading}", "missing required health report section")
    for heading in REQUIRED_REPORT_HEADINGS:
        if heading.lower() not in report_headings:
            errors.add(LIVE_REPORT_PATH, f"heading.{heading}", "missing required live validation report section")

    for phrase in NO_CORE_AUDIT_PHRASES:
        if phrase not in report_text:
            errors.add(LIVE_REPORT_PATH, f"no_core_audit.{phrase}", "missing required no-core-modification audit wording")

    if "| Remaining gap |" not in report_text or "## Do Not Claim Yet" not in report_text:
        errors.add(LIVE_REPORT_PATH, "remaining_gap_ledger", "missing remaining gap ledger column or Do Not Claim Yet section")
    if "## Known Blockers" not in health_text:
        errors.add(HEALTH_REPORT_PATH, "known_blockers", "missing remaining blocker ledger")

    combined = f"{health_text}\n{report_text}".replace("secret-materialization", "secret materialization")
    has_s02_hermes_context = bool(
        re.search(r"S02[^\n]{0,160}Hermes|Hermes[^\n]{0,160}S02", combined, re.IGNORECASE)
    )
    if not (has_s02_hermes_context and "execution" in combined and "secret materialization" in combined and "resultJson.bos" in combined):
        errors.add(LIVE_REPORT_PATH, "s02_hermes_blocker", "must mention S02 Hermes execution-time secret-materialization blocker and resultJson.bos")

    for key in entries:
        if key not in health_text:
            errors.add(HEALTH_REPORT_PATH, f"capability.{key}", "health report must summarize every capability key")

    for key, entry in entries.items():
        if entry.get("status") == "confirmed" and key not in S04_CONFIRMED_KEYS and key in S05_ALL_CONFIRMABLE_KEYS:
            if key not in report_text:
                errors.add(LIVE_REPORT_PATH, f"capability.{key}", "confirmed S05 capability must be explicitly localized in report")


def _validate_runtime_source_contract(root: Path, entries: Mapping[str, Mapping[str, Any]], errors: ValidationErrorCollector) -> None:
    text = _read_text(root, RUNTIME_CAPABILITIES_PATH, errors)
    if not text:
        return
    if str(MATRIX_PATH) not in text:
        errors.add(RUNTIME_CAPABILITIES_PATH, "matrix-path", f"must reference {MATRIX_PATH}")
    for key in entries:
        if key not in text:
            errors.add(RUNTIME_CAPABILITIES_PATH, f"capability.{key}", "runtimeCapabilities.ts must mirror matrix key")
    for status in STATUS_ENUM:
        if status not in text:
            errors.add(RUNTIME_CAPABILITIES_PATH, f"status.{status}", "runtimeCapabilities.ts must mirror status vocabulary")


def _iter_source_files(root: Path, source_roots: Sequence[Path]) -> Iterable[Path]:
    for source_root in source_roots:
        absolute_root = root / source_root
        if not absolute_root.exists():
            continue
        if absolute_root.is_file():
            if absolute_root.suffix in SOURCE_SUFFIXES:
                yield absolute_root
            continue
        for path in sorted(absolute_root.rglob("*")):
            if path.is_file() and path.suffix in SOURCE_SUFFIXES:
                yield path


def _scan_text_for_secrets(path: Path, display_path: Path, text: str, errors: ValidationErrorCollector) -> None:
    for pattern, label in SECRET_PATTERNS:
        if pattern.search(text):
            errors.add(display_path, "secret-scan", f"possible secret material detected ({label}); value redacted")


def _validate_secret_hygiene(root: Path, text_paths: Sequence[Path], errors: ValidationErrorCollector) -> None:
    for relative_path in text_paths:
        absolute_path = root / relative_path
        display_path = _display_path(root, absolute_path)
        if not absolute_path.exists():
            continue
        try:
            text = absolute_path.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            continue
        except OSError as exc:
            errors.add(display_path, "file", f"unable to read for secret scan: {exc.strerror or exc}")
            continue
        _scan_text_for_secrets(absolute_path, display_path, text, errors)


def _validate_forbidden_source_patterns(root: Path, source_roots: Sequence[Path], errors: ValidationErrorCollector) -> None:
    for path in _iter_source_files(root, source_roots):
        display_path = _display_path(root, path)
        try:
            text = path.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            continue
        except OSError as exc:
            errors.add(display_path, "file", f"unable to read source file: {exc.strerror or exc}")
            continue
        _scan_text_for_secrets(path, display_path, text, errors)
        for pattern, label in FORBIDDEN_SOURCE_PATTERNS:
            if pattern.search(text):
                errors.add(display_path, "boundary-scan", f"forbidden pattern detected ({label})")


def validate(root: Path, *, phase: str = "preflight", source_roots: Sequence[Path] = DEFAULT_SOURCE_ROOTS) -> list[str]:
    root = root.resolve()
    errors = ValidationErrorCollector()

    matrix = _load_json(root, MATRIX_PATH, errors)
    s04_evidence = None  # loaded by dedicated validator for precise field errors
    s05_evidence = None  # loaded by dedicated validator for precise field errors
    _ = (s04_evidence, s05_evidence, phase)  # keep phase explicit for CLI compatibility and future closure artifact phases
    health_text = _read_text(root, HEALTH_REPORT_PATH, errors)
    report_text = _read_text(root, LIVE_REPORT_PATH, errors)

    entries = _collect_matrix_entries(matrix, errors) if matrix is not None else {}
    if entries:
        _validate_status_posture(entries, health_text, errors)
        _validate_s04_evidence(root, entries, errors)
        _validate_s05_evidence(root, entries, errors)
        _validate_doc_sections(entries, health_text, report_text, errors)
        _validate_runtime_source_contract(root, entries, errors)

    _validate_secret_hygiene(root, (MATRIX_PATH, HEALTH_REPORT_PATH, LIVE_REPORT_PATH, S04_EVIDENCE_PATH, S05_EVIDENCE_PATH), errors)
    _validate_forbidden_source_patterns(root, source_roots, errors)
    return errors.errors


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Validate M002 closeout evidence and no-core boundary guardrails.")
    parser.add_argument(
        "--root",
        type=Path,
        default=Path(__file__).resolve().parents[1],
        help="Repository root containing plugin-bos-light/, runtime-evidence/, docs/, and scripts/.",
    )
    parser.add_argument(
        "--phase",
        choices=("preflight", "final"),
        default="preflight",
        help="Closeout phase. Preflight does not require later S06 regression artifacts.",
    )
    parser.add_argument(
        "--source-root",
        action="append",
        type=Path,
        dest="source_roots",
        help="Additional or replacement source root to scan. May be passed more than once.",
    )
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    source_roots = tuple(args.source_roots) if args.source_roots else DEFAULT_SOURCE_ROOTS
    errors = validate(args.root, phase=args.phase, source_roots=source_roots)
    if errors:
        print("M002 closeout validation failed:", file=sys.stderr)
        for error in errors:
            print(f"- {error}", file=sys.stderr)
        return 1
    print("M002 closeout OK: evidence, conservative matrix posture, docs, secrets, and no-core boundary guard passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
