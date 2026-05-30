#!/usr/bin/env python3
"""Validate S05 BOS Light plugin/UI surface probe evidence.

The validator is fail-closed. It accepts unsupported/fallback evidence when the
artifact is bounded and redacted, but only accepts confirmed plugin/UI surface
statuses when S05-specific runtime version/build and route readback proof are
present. S04 issue/document/comment proof can never promote a plugin/UI surface.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from datetime import datetime
from pathlib import Path
from typing import Any, Iterable, Mapping, Sequence

SCHEMA_VERSION = "s05-plugin-ui-surface-probe/v1"
PASSING_ARTIFACT_TYPE = "live-evidence"
BLOCKER_ARTIFACT_TYPE = "fail-closed-unsupported"
DEFAULT_EVIDENCE = Path("runtime-evidence/M002-S05-plugin-ui-surface-probe.json")
MAX_ROUTE_ATTEMPTS = 24
MAX_RESPONSE_BYTES = 96 * 1024
MAX_TEXT_SNIPPET = 800
MAX_EVIDENCE_BYTES = 384 * 1024
SURFACE_NAMES = (
    "plugin_registration",
    "tools",
    "data_providers",
    "actions",
    "dashboard_widgets",
    "issue_detail_tabs",
)
ALLOWED_STATUSES = {"confirmed", "unsupported", "fallback-only", "unvalidated"}

SECRET_KEY_RE = re.compile(
    r"(?:secret|token|password|passwd|api[_-]?key|credential|private[_-]?key|authorization|bearer|cookie)",
    re.IGNORECASE,
)
SECRET_VALUE_RE = re.compile(
    r"("
    r"sk-[A-Za-z0-9_\-]{8,}|"
    r"gh[pousr]_[A-Za-z0-9_]{8,}|"
    r"xox[baprs]-[A-Za-z0-9\-]{8,}|"
    r"AKIA[0-9A-Z]{8,}|"
    r"(?:Bearer\s+)[A-Za-z0-9._~+/\-=]{8,}|"
    r"(?:Cookie:\s*)?[^\s=;]*(?:session|token|secret|password|api[_-]?key)[^\s=;]*=[^\s\"']+|"
    r"[A-Za-z_][A-Za-z0-9_]*(?:TOKEN|SECRET|PASSWORD|API_KEY)=[^\s\"']+"
    r")",
    re.IGNORECASE,
)
REDACTED_VALUES = {"<redacted>", "[redacted]", "redacted", "***", ""}


class ErrorCollector:
    def __init__(self) -> None:
        self.errors: list[str] = []

    def add(self, context: str, message: str) -> None:
        self.errors.append(f"{context}: {message}")


def _load_json(path: Path, errors: ErrorCollector) -> Any | None:
    if not path.exists():
        errors.add("evidence", f"missing JSON file at {path}")
        return None
    try:
        raw = path.read_text(encoding="utf-8")
    except OSError as exc:
        errors.add("evidence", f"unable to read file: {exc.strerror or exc}")
        return None
    if len(raw.encode("utf-8")) > MAX_EVIDENCE_BYTES:
        errors.add("evidence", f"file exceeds bounded evidence limit of {MAX_EVIDENCE_BYTES} bytes")
    try:
        return json.loads(raw)
    except json.JSONDecodeError as exc:
        errors.add("evidence", f"malformed JSON at line {exc.lineno}, column {exc.colno}: {exc.msg}")
        return None


def _as_mapping(value: Any) -> Mapping[str, Any]:
    return value if isinstance(value, Mapping) else {}


def _as_sequence(value: Any) -> Sequence[Any]:
    return value if isinstance(value, list) else []


def _non_empty_string(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _known(value: Any) -> bool:
    return _non_empty_string(value) and str(value).strip().lower() not in {"unknown", "n/a", "none", "null"}


def _count(value: Any) -> int | None:
    if isinstance(value, bool):
        return int(value)
    if isinstance(value, int):
        return value
    if isinstance(value, float) and value.is_integer():
        return int(value)
    return None


def _parse_timestamp(value: Any) -> bool:
    if not _non_empty_string(value):
        return False
    try:
        datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        return True
    except ValueError:
        return False


def _walk_json(value: Any, path: str = "$") -> Iterable[tuple[str, str | None, Any]]:
    if isinstance(value, Mapping):
        for key, child in value.items():
            key_text = str(key)
            child_path = f"{path}.{key_text}"
            yield child_path, key_text, child
            yield from _walk_json(child, child_path)
    elif isinstance(value, list):
        for index, child in enumerate(value):
            child_path = f"{path}[{index}]"
            yield child_path, None, child
            yield from _walk_json(child, child_path)


def _validate_redaction(evidence: Mapping[str, Any], errors: ErrorCollector) -> None:
    for path, key, value in _walk_json(evidence):
        if key is not None and SECRET_KEY_RE.search(key) and key != "secret_env_vars" and not key.endswith("_env") and not key.endswith("Env"):
            if isinstance(value, str) and value.strip().lower() not in REDACTED_VALUES:
                errors.add(path, "secret-like field must be redacted")
            elif isinstance(value, (Mapping, list)):
                serialized = json.dumps(value, sort_keys=True)
                if serialized not in ("{}", "[]") and "<redacted>" not in serialized:
                    errors.add(path, "secret-like object/list field must contain only redacted content")
        if isinstance(value, str) and SECRET_VALUE_RE.search(value):
            errors.add(path, "secret-like string value is not redacted")


def _validate_basic_contract(evidence: Mapping[str, Any], errors: ErrorCollector) -> str:
    if evidence.get("schema_version") != SCHEMA_VERSION:
        errors.add("schema_version", f"must be {SCHEMA_VERSION!r}")
    artifact_type = evidence.get("artifact_type")
    if artifact_type not in {PASSING_ARTIFACT_TYPE, BLOCKER_ARTIFACT_TYPE}:
        errors.add("artifact_type", f"must be {PASSING_ARTIFACT_TYPE!r} or {BLOCKER_ARTIFACT_TYPE!r}")
        artifact_type = "invalid"
    if evidence.get("phase") != "live":
        errors.add("phase", "must be 'live'")
    if not _parse_timestamp(evidence.get("generated_at")):
        errors.add("generated_at", "must be an ISO-8601 timestamp")
    runner = _as_mapping(evidence.get("runner"))
    if runner.get("standard_library_only") is not True:
        errors.add("runner.standard_library_only", "must be true")
    if _count(runner.get("max_route_attempts")) is None or _count(runner.get("max_route_attempts")) > MAX_ROUTE_ATTEMPTS:
        errors.add("runner.max_route_attempts", f"must be <= {MAX_ROUTE_ATTEMPTS}")
    inputs = _as_mapping(evidence.get("inputs"))
    for field in ("manifest_path", "runtime_matrix_path", "auth_token_env", "auth_header_name", "timeout_seconds"):
        if field not in inputs:
            errors.add(f"inputs.{field}", "missing required runner input echo")
    requested = _as_mapping(evidence.get("requested_manifest"))
    if not _non_empty_string(requested.get("plugin_key")):
        errors.add("requested_manifest.plugin_key", "missing requested plugin key")
    ui = _as_mapping(requested.get("ui"))
    for field in ("tools", "data_providers", "actions"):
        if not isinstance(requested.get(field), list):
            errors.add(f"requested_manifest.{field}", "must be a list")
    for field in ("dashboard_widgets", "issue_detail_tabs"):
        if not isinstance(ui.get(field), list):
            errors.add(f"requested_manifest.ui.{field}", "must be a list")
    return str(artifact_type)


def _route_by_id(evidence: Mapping[str, Any], errors: ErrorCollector) -> dict[str, Mapping[str, Any]]:
    attempts = _as_sequence(evidence.get("route_attempts"))
    route_map: dict[str, Mapping[str, Any]] = {}
    if len(attempts) > MAX_ROUTE_ATTEMPTS:
        errors.add("route_attempts", f"must contain <= {MAX_ROUTE_ATTEMPTS} attempts")
    for index, raw in enumerate(attempts):
        attempt = _as_mapping(raw)
        context = f"route_attempts[{index}]"
        route_id = attempt.get("id")
        if not _non_empty_string(route_id):
            errors.add(f"{context}.id", "missing route attempt id")
        elif route_id in route_map:
            errors.add(f"{context}.id", "duplicate route attempt id")
        else:
            route_map[str(route_id)] = attempt
        if attempt.get("surface") not in set(SURFACE_NAMES) | {"runtime"}:
            errors.add(f"{context}.surface", "unknown surface")
        if attempt.get("method") not in {"GET", "POST"}:
            errors.add(f"{context}.method", "must be GET or POST")
        if not _non_empty_string(attempt.get("path")) or len(str(attempt.get("path"))) > 240:
            errors.add(f"{context}.path", "missing or unbounded path")
        status = attempt.get("status_code")
        if status is not None and (_count(status) is None or not 100 <= int(status) <= 599):
            errors.add(f"{context}.status_code", "must be an HTTP status code or null")
        if attempt.get("malformed_json_reason"):
            errors.add(f"{context}.malformed_json_reason", "malformed route responses cannot be used as valid S05 evidence")
        if attempt.get("truncated") is True:
            errors.add(f"{context}.truncated", "truncated route responses are unbounded evidence")
        summary = _as_mapping(attempt.get("response_summary"))
        snippet = summary.get("text_snippet")
        if isinstance(snippet, str) and len(snippet) > MAX_TEXT_SNIPPET:
            errors.add(f"{context}.response_summary.text_snippet", f"must be <= {MAX_TEXT_SNIPPET} chars")
        if len(json.dumps(summary, sort_keys=True)) > 1600:
            errors.add(f"{context}.response_summary", "response summary is unbounded")
    return route_map


def _proof_route_ids(proof: Any) -> list[str]:
    mapping = _as_mapping(proof)
    route_ids: list[str] = []
    route_id = mapping.get("route_attempt_id")
    if _non_empty_string(route_id):
        route_ids.append(str(route_id))
    for item in _as_sequence(mapping.get("route_attempt_ids")):
        if _non_empty_string(item):
            route_ids.append(str(item))
    return route_ids


def _proof_mentions_s04(proof: Any) -> bool:
    text = json.dumps(proof, sort_keys=True).lower()
    return "s04" in text or "m002-s04" in text or "s04-live-artifact" in text


def _validate_confirmed_surface(
    name: str,
    row: Mapping[str, Any],
    runtime: Mapping[str, Any],
    route_map: Mapping[str, Mapping[str, Any]],
    errors: ErrorCollector,
) -> None:
    if not (_known(runtime.get("version")) and _known(runtime.get("build"))):
        errors.add(f"surfaces.{name}.status", "confirmed status requires S05 runtime version and build evidence")
    proof = row.get("readback_proof")
    if not proof:
        errors.add(f"surfaces.{name}.readback_proof", "confirmed status requires S05 route readback proof")
        return
    if _proof_mentions_s04(proof):
        errors.add(f"surfaces.{name}.readback_proof", "confirmed status must not reuse S04-only proof")
    route_ids = _proof_route_ids(proof)
    if not route_ids:
        errors.add(f"surfaces.{name}.readback_proof", "missing route_attempt_id(s)")
    for route_id in route_ids:
        route = route_map.get(route_id)
        if not route:
            errors.add(f"surfaces.{name}.readback_proof", f"unknown route attempt id {route_id!r}")
            continue
        if route.get("ok") is not True:
            errors.add(f"surfaces.{name}.readback_proof", f"route {route_id} is not ok")
        if _count(route.get("status_code")) is None or not 200 <= int(route.get("status_code")) < 300:
            errors.add(f"surfaces.{name}.readback_proof", f"route {route_id} is not a 2xx response")
        if route.get("malformed_json_reason"):
            errors.add(f"surfaces.{name}.readback_proof", f"route {route_id} is malformed")
    if name in {"dashboard_widgets", "issue_detail_tabs"}:
        requested = [str(item) for item in _as_sequence(row.get("requested_keys")) if _non_empty_string(item)]
        render_ids = _as_mapping(row.get("render_ids"))
        for key in requested:
            if not _non_empty_string(render_ids.get(key)):
                errors.add(f"surfaces.{name}.render_ids.{key}", "confirmed UI surface requires render id")
    if name == "tools":
        invocations = _as_sequence(row.get("piko_invocation_results"))
        if not invocations:
            errors.add("surfaces.tools.piko_invocation_results", "confirmed tools require at least one piko invocation result")
        elif not any(_as_mapping(item).get("ok") is True for item in invocations):
            errors.add("surfaces.tools.piko_invocation_results", "confirmed tools require a successful piko invocation result")


def _validate_surfaces(evidence: Mapping[str, Any], route_map: Mapping[str, Mapping[str, Any]], errors: ErrorCollector) -> list[str]:
    surfaces = _as_mapping(evidence.get("surfaces"))
    runtime = _as_mapping(evidence.get("runtime"))
    confirmed: list[str] = []
    for name in SURFACE_NAMES:
        row = _as_mapping(surfaces.get(name))
        if not row:
            errors.add(f"surfaces.{name}", "missing required surface row")
            continue
        status = row.get("status")
        if status not in ALLOWED_STATUSES:
            errors.add(f"surfaces.{name}.status", f"must be one of {', '.join(sorted(ALLOWED_STATUSES))}")
        requested = _as_sequence(row.get("requested_keys"))
        observed = _as_sequence(row.get("observed_registered_keys"))
        if not isinstance(row.get("requested_keys"), list):
            errors.add(f"surfaces.{name}.requested_keys", "must be a list")
        if not isinstance(row.get("observed_registered_keys"), list):
            errors.add(f"surfaces.{name}.observed_registered_keys", "must be a list")
        if len(requested) > 32 or len(observed) > 64:
            errors.add(f"surfaces.{name}", "surface key lists are unbounded")
        if status != "confirmed" and not _non_empty_string(row.get("fallback_reason")):
            errors.add(f"surfaces.{name}.fallback_reason", "non-confirmed surfaces require fallback diagnostics")
        if status == "confirmed":
            confirmed.append(name)
            _validate_confirmed_surface(name, row, runtime, route_map, errors)
    return confirmed


def _validate_side_effects(evidence: Mapping[str, Any], errors: ErrorCollector) -> None:
    counters = _as_mapping(evidence.get("side_effect_counters"))
    for field in ("native_approvals_created", "approval_requests_created"):
        if _count(counters.get(field)) != 0:
            errors.add(f"side_effect_counters.{field}", "must remain zero for S05 probes")
    if _count(counters.get("action_invocations_attempted")) not in {0, None}:
        errors.add("side_effect_counters.action_invocations_attempted", "native action invocation must not be attempted by S05 probe")
    route_count = _count(counters.get("route_requests_attempted"))
    if route_count is not None and route_count > MAX_ROUTE_ATTEMPTS:
        errors.add("side_effect_counters.route_requests_attempted", f"must be <= {MAX_ROUTE_ATTEMPTS}")


def _validate_phase_timestamps(evidence: Mapping[str, Any], errors: ErrorCollector) -> None:
    timestamps = _as_mapping(evidence.get("phase_timestamps"))
    for field in ("start", "inputs_loaded", "evidence_written"):
        if not _parse_timestamp(timestamps.get(field)):
            errors.add(f"phase_timestamps.{field}", "missing ISO-8601 phase timestamp")


def validate_evidence(evidence: Mapping[str, Any]) -> list[str]:
    errors = ErrorCollector()
    artifact_type = _validate_basic_contract(evidence, errors)
    route_map = _route_by_id(evidence, errors)
    confirmed = _validate_surfaces(evidence, route_map, errors)
    _validate_side_effects(evidence, errors)
    _validate_phase_timestamps(evidence, errors)
    _validate_redaction(evidence, errors)

    redaction = _as_mapping(evidence.get("redaction"))
    if redaction.get("secrets_redacted") is not True:
        errors.add("redaction.secrets_redacted", "must be true")
    if not isinstance(redaction.get("secret_env_vars"), list):
        errors.add("redaction.secret_env_vars", "must list secret env var names, not values")

    if artifact_type == PASSING_ARTIFACT_TYPE and set(confirmed) != set(SURFACE_NAMES):
        errors.add("artifact_type", "live-evidence requires all plugin/UI surfaces to be confirmed")
    if artifact_type == BLOCKER_ARTIFACT_TYPE and not _as_sequence(evidence.get("fallback_diagnostics")) and not confirmed:
        errors.add("fallback_diagnostics", "fail-closed evidence without confirmed surfaces requires diagnostics")
    return errors.errors


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Validate S05 BOS Light plugin/UI surface probe evidence.")
    parser.add_argument("evidence", nargs="?", type=Path, default=DEFAULT_EVIDENCE)
    parser.add_argument("--evidence", dest="evidence_option", type=Path, default=None, help="Evidence JSON path; kept for task-plan CLI compatibility.")
    parser.add_argument("--phase", choices=("final",), default="final", help="Validation phase label; S05 currently exposes only final fail-closed validation.")
    args = parser.parse_args(argv)
    evidence_path = args.evidence_option or args.evidence
    if args.evidence_option is not None and args.evidence != DEFAULT_EVIDENCE and args.evidence != args.evidence_option:
        print("--evidence and positional evidence path disagree", file=sys.stderr)
        return 2
    errors = ErrorCollector()
    evidence = _load_json(evidence_path, errors)
    if isinstance(evidence, Mapping):
        errors.errors.extend(validate_evidence(evidence))
    if errors.errors:
        print("S05 plugin/UI surface probe evidence validation failed:", file=sys.stderr)
        for error in errors.errors:
            print(f"- {error}", file=sys.stderr)
        return 1
    print(f"S05 plugin/UI surface probe evidence validation passed: {evidence_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
