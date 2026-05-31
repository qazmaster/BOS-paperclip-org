#!/usr/bin/env python3
"""Validate M003 S04 live decision artifact readback evidence."""

from __future__ import annotations

import argparse
import json
import re
import sys
from datetime import datetime
from pathlib import Path
from typing import Any, Iterable, Mapping, Sequence

DEFAULT_EVIDENCE = Path("runtime-evidence/M003-S04-live-decision-artifact-readback.json")
SCHEMA_VERSION = "m003-s04-live-decision-artifact-readback/v1"
PASSING_ARTIFACT_TYPE = "live-evidence"
BLOCKER_ARTIFACT_TYPE = "fail-closed-blocker"
SECRET_KEY_RE = re.compile(r"(?:secret|token|password|passwd|api[_-]?key|credential|private[_-]?key|authorization|bearer|cookie)", re.I)
SECRET_VALUE_RE = re.compile(r"(sk-[A-Za-z0-9_\-]{8,}|gh[pousr]_[A-Za-z0-9_]{8,}|xox[baprs]-[A-Za-z0-9\-]{8,}|AKIA[0-9A-Z]{8,}|(?:Bearer\s+)[A-Za-z0-9._~+/\-=]{8,}|(?:Cookie:\s*)?[^\s=;]*(?:session|token|secret|password|api[_-]?key)[^\s=;]*=[^\s\"']+|[A-Za-z_][A-Za-z0-9_]*(?:TOKEN|SECRET|PASSWORD|API_KEY)=[^\s\"']+)", re.I)
REDACTED_VALUES = {"<redacted>", "[redacted]", "redacted", "***", ""}
UNSUPPORTED_ZERO_COUNTS = ("approval_requests_created", "activity_logs_written", "hermes_runs_started", "gsd_pi_runs_started", "plugin_actions_invoked")


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
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        errors.add("evidence", f"malformed JSON at line {exc.lineno}, column {exc.colno}: {exc.msg}")
    except OSError as exc:
        errors.add("evidence", f"unable to read file: {exc.strerror or exc}")
    return None


def _as_mapping(value: Any) -> Mapping[str, Any]:
    return value if isinstance(value, Mapping) else {}


def _as_sequence(value: Any) -> Sequence[Any]:
    return value if isinstance(value, list) else []


def _non_empty_string(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _parse_timestamp(value: Any) -> bool:
    if not isinstance(value, str) or not value.strip():
        return False
    try:
        datetime.fromisoformat(value.strip().replace("Z", "+00:00"))
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
        if key is not None and SECRET_KEY_RE.search(key) and not (key.endswith("_env") or key.endswith("Env")):
            if isinstance(value, str) and value.strip().lower() not in REDACTED_VALUES:
                errors.add(path, "secret-like field must be redacted")
            elif isinstance(value, (Mapping, list)):
                serialized = json.dumps(value, sort_keys=True)
                if "<redacted>" not in serialized and serialized not in ("{}", "[]"):
                    errors.add(path, "secret-like object/list field must contain only redacted content")
        if isinstance(value, str) and SECRET_VALUE_RE.search(value):
            errors.add(path, "secret-like string value is not redacted")


def _count(value: Any) -> int | None:
    if isinstance(value, bool):
        return int(value)
    if isinstance(value, int):
        return value
    if isinstance(value, float) and value.is_integer():
        return int(value)
    return None


def _validate_basic(evidence: Mapping[str, Any], errors: ErrorCollector) -> str:
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
    inputs = _as_mapping(evidence.get("inputs"))
    for field in ("base_url", "companyId", "auth_token_env", "auth_header_name"):
        if not _non_empty_string(inputs.get(field)):
            errors.add(f"inputs.{field}", "missing required runner input echo")
    return str(artifact_type)


def _validate_side_effects_and_claims(evidence: Mapping[str, Any], errors: ErrorCollector) -> None:
    counts = _as_mapping(evidence.get("side_effect_counts"))
    for field in UNSUPPORTED_ZERO_COUNTS:
        if _count(counts.get(field)) != 0:
            errors.add(f"side_effect_counts.{field}", "unsupported side effect count must be zero")
    claims = _as_mapping(evidence.get("capability_claims"))
    for field in ("native_approval", "activity_log", "hermes", "gsd_pi", "plugin_actions", "unsupported_capability_promoted"):
        if claims.get(field) is not False:
            errors.add(f"capability_claims.{field}", "unsupported capability promotion must be false")
    refs = _as_mapping(evidence.get("artifact_refs"))
    if refs.get("native_approval") not in (None, ""):
        errors.add("artifact_refs.native_approval", "native approval refs are forbidden for this proof")


def _validate_invariants(evidence: Mapping[str, Any], errors: ErrorCollector) -> None:
    invariants = _as_mapping(evidence.get("invariants"))
    if invariants.get("decided_by") != "Div7.MissionControl":
        errors.add("invariants.decided_by", "must be Div7.MissionControl")
    if invariants.get("diagnostics_sanitized") is not True:
        errors.add("invariants.diagnostics_sanitized", "must be true")
    if invariants.get("native_approval_mutated") is not False:
        errors.add("invariants.native_approval_mutated", "must be false")
    if invariants.get("no_secret_diagnostics") is not True:
        errors.add("invariants.no_secret_diagnostics", "must be true")
    if invariants.get("hermes_execution_attempted") is not False:
        errors.add("invariants.hermes_execution_attempted", "must be false")
    if invariants.get("gsd_pi_execution_attempted") is not False:
        errors.add("invariants.gsd_pi_execution_attempted", "must be false")


def _successful_native_readbacks(evidence: Mapping[str, Any]) -> list[Mapping[str, Any]]:
    readbacks = _as_mapping(evidence.get("readbacks"))
    native = [_as_mapping(item) for item in _as_sequence(readbacks.get("documents"))]
    native.extend(_as_mapping(item) for item in _as_sequence(readbacks.get("comments")))
    return [item for item in native if item.get("kind") in {"document", "comment"} and item.get("ok") is True and _non_empty_string(item.get("sha256")) and item.get("hash_match") is True]


def _validate_summary_fields(evidence: Mapping[str, Any], errors: ErrorCollector) -> None:
    if evidence.get("selected_surface") not in {"documents.native", "comments.native", "markdown-only"}:
        errors.add("selected_surface", "must identify documents.native, comments.native, or markdown-only")
    if not _non_empty_string(evidence.get("artifact_ref")):
        errors.add("artifact_ref", "missing primary artifact ref")
    if not _non_empty_string(evidence.get("readback_status")):
        errors.add("readback_status", "missing readback status")
    content_hash = evidence.get("content_hash")
    if content_hash is not None and not (isinstance(content_hash, str) and re.fullmatch(r"[0-9a-f]{64}", content_hash)):
        errors.add("content_hash", "must be null or a sha256 hex digest")
    snippet = evidence.get("bounded_snippet")
    if snippet is not None and not isinstance(snippet, str):
        errors.add("bounded_snippet", "must be a string or null")


def _validate_live_evidence(evidence: Mapping[str, Any], errors: ErrorCollector) -> None:
    context = _as_mapping(evidence.get("company_issue_context"))
    for field in ("companyId", "issueId"):
        if not _non_empty_string(context.get(field)):
            errors.add(f"company_issue_context.{field}", "missing live issue context")
    decision = _as_mapping(evidence.get("decision_artifact"))
    if decision.get("decided_by") != "Div7.MissionControl":
        errors.add("decision_artifact.decided_by", "must be Div7.MissionControl")
    if decision.get("native_approval_mutated") is not False:
        errors.add("decision_artifact.native_approval_mutated", "must be false")
    if not _non_empty_string(decision.get("markdown_sha256")):
        errors.add("decision_artifact.markdown_sha256", "missing expected markdown hash")
    if evidence.get("selected_surface") not in {"documents.native", "comments.native"}:
        errors.add("selected_surface", "live evidence must select a native document or comment surface")
    if not _successful_native_readbacks(evidence):
        errors.add("readbacks", "live-evidence requires at least one successful native document or comment readback with matching sha256")


def _validate_blocker(evidence: Mapping[str, Any], errors: ErrorCollector) -> None:
    if not _non_empty_string(evidence.get("blocker_reason")):
        errors.add("blocker_reason", "fail-closed blocker evidence requires a blocker reason")
    diagnostics = _as_sequence(evidence.get("diagnostics"))
    if not diagnostics:
        errors.add("diagnostics", "fail-closed blocker evidence requires diagnostics")
    fallback = _as_mapping(evidence.get("fallback"))
    if fallback.get("live_proof") is not False:
        errors.add("fallback.live_proof", "markdown fallback must not be treated as live proof")
    deterministic_ref = fallback.get("deterministic_ref")
    if not (_non_empty_string(deterministic_ref) and str(deterministic_ref).startswith("markdown-only://issues/")):
        errors.add("fallback.deterministic_ref", "missing deterministic markdown fallback ref")
    refs = _as_mapping(evidence.get("artifact_refs"))
    if refs.get("markdown_fallback") != deterministic_ref:
        errors.add("artifact_refs.markdown_fallback", "must match fallback.deterministic_ref")


def validate(path: Path = DEFAULT_EVIDENCE) -> tuple[list[str], str]:
    errors = ErrorCollector()
    loaded = _load_json(path, errors)
    if not isinstance(loaded, Mapping):
        if loaded is not None:
            errors.add("evidence", "top-level evidence must be an object")
        return errors.errors, "invalid"
    evidence = loaded
    artifact_type = _validate_basic(evidence, errors)
    _validate_redaction(evidence, errors)
    _validate_invariants(evidence, errors)
    _validate_summary_fields(evidence, errors)
    _validate_side_effects_and_claims(evidence, errors)
    if artifact_type == PASSING_ARTIFACT_TYPE:
        _validate_live_evidence(evidence, errors)
    elif artifact_type == BLOCKER_ARTIFACT_TYPE:
        _validate_blocker(evidence, errors)
    return errors.errors, "invalid" if errors.errors else ("passing" if artifact_type == PASSING_ARTIFACT_TYPE else "blocker")


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Validate M003 S04 live decision artifact readback evidence.")
    parser.add_argument("evidence", nargs="?", type=Path, default=None, help="Evidence JSON path; kept for backward compatibility.")
    parser.add_argument("--evidence", dest="evidence_flag", type=Path, default=None, help="Evidence JSON path for GSD final-mode verification.")
    parser.add_argument("--phase", choices=("final",), default="final", help="Validation phase. Only final evidence validation is currently supported.")
    args = parser.parse_args(argv)
    evidence_path = args.evidence_flag or args.evidence or DEFAULT_EVIDENCE
    errors, classification = validate(evidence_path)
    if errors:
        print(f"M003 S04 live decision artifact readback evidence invalid ({classification}):", file=sys.stderr)
        for error in errors:
            print(f"- {error}", file=sys.stderr)
        return 1
    print(f"M003 S04 live decision artifact readback evidence valid: {classification}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
