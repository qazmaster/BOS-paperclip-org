#!/usr/bin/env python3
"""Validate M006 S00 runtime capability inventory evidence artifacts.

Fail-closed. Accepts redacted fail-closed blocker artifacts as valid diagnostic
evidence, but passing proof requires all five probes to succeed with live
Paperclip runtime version/build, plugin discovery, tool registry readback,
secret materialization, and artifact regression smoke readbacks.

Validation layers:
1. JSON schema structure (required keys, probe shapes, timestamps).
2. Redaction audit (scan all text fields for unredacted secrets).
3. No-promotion enforcement (blocker artifacts cannot promote capabilities).
4. Capability matrix consistency against plugin-bos-light/capabilities.paperclip-runtime.json.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Iterable, Mapping, Sequence

ROOT = Path(__file__).resolve().parents[1]

SCHEMA_VERSION = "m006-s00-runtime-capability-inventory/v1"
PASSING_ARTIFACT_TYPE = "live-evidence"
BLOCKER_ARTIFACT_TYPE = "fail-closed-blocker"
PHASE = "live"
MAX_EVIDENCE_BYTES = 512 * 1024

# Exact patterns from the probe script for parity.
SECRET_KEY_RE = re.compile(
    r"(?:secret|token|password|passwd|api[_-]?key|credential|private[_-]?key|authorization|bearer|cookie)",
    re.IGNORECASE,
)
SECRET_VALUE_RE = re.compile(
    r"("
    r"sk-[A-Za-z0-9_\-]{8,}|"
    r"gh[pousr]_[A-Za-z0-9_]{8,}|"
    r"github_pat_[A-Za-z0-9_]{16,}|"
    r"xox[baprs]-[A-Za-z0-9\-]{8,}|"
    r"AKIA[0-9A-Z]{8,}|"
    r"(?:Bearer\s+)[A-Za-z0-9._~+/\-=]{8,}|"
    r"(?:Cookie:\s*)?[^\s=;]*(?:session|token|secret|password|api[_-]?key)[^\s=;]*=[^\s\"']+|"
    r"[A-Za-z_][A-Za-z0-9_]*(?:TOKEN|SECRET|PASSWORD|API_KEY)=[^\s\"']+"
    r")",
    re.IGNORECASE,
)
REDACTED_VALUES = {"<redacted>", "[redacted]", "redacted", "***", ""}
SAFE_SECRET_REF_PREFIXES = ("secret_ref:", "paperclip-secret:", "vault:", "env:")
STATUS_PASS = {"pass", "passed", "ok", "success", "succeeded", "completed", "finished"}

# Mapping from M006 S00 capability promotion identifiers to matrix keys.
CAPABILITY_TO_MATRIX_KEY: dict[str, list[str]] = {
    "runtime.health_version": ["plugin.runtime.version_build"],
    "runtime.plugin_install_path": ["plugin.runtime.registration"],
    "runtime.tool_registry": ["registration.tools"],
    "runtime.secret_materialization": [],
    "runtime.artifact_regression_smoke": ["issues.native", "documents.native", "comments.native"],
}

REQUIRED_TOP_KEYS = (
    "schema_version",
    "artifact_type",
    "phase",
    "generated_at",
    "runner",
    "inputs",
    "runtime",
    "probes",
    "side_effect_counters",
    "redaction",
    "fallback_diagnostics",
    "validation_errors",
)

REQUIRED_PROBE_KEYS = {
    "health_version": ("probe", "runtime", "results"),
    "plugin_install_path": ("probe", "plugin_key", "plugin_found", "observed_keys", "results"),
    "tool_registry": ("probe", "plugin_key", "observed_tools", "piko_tools_observed", "results"),
    "secret_materialization": ("probe", "secret_name", "secret_present_in_env", "secret_ref", "test_status", "results"),
    "artifact_regression_smoke": ("probe", "issue_id", "document_id", "comment_id", "side_effects", "readbacks", "results"),
}

REQUIRED_RESULT_KEYS = (
    "probe_id",
    "description",
    "method",
    "path",
    "ok",
    "status_code",
    "duration_ms",
    "truncated",
    "malformed_json_reason",
    "response_summary",
)

REQUIRED_READBACK_KEYS = ("kind", "ref", "status_code", "ok", "sha256", "snippet")

REQUIRED_SIDE_EFFECT_COUNTERS = (
    "issues_created",
    "documents_created",
    "comments_created",
    "approval_requests_created",
    "hermes_runs_started",
    "gsd_pi_runs_started",
)


class ErrorCollector:
    def __init__(self) -> None:
        self.errors: list[str] = []

    def add(self, context: str, message: str) -> None:
        self.errors.append(f"{context}: {message}")


def _load_json(path: Path, label: str, errors: ErrorCollector, *, required: bool = True) -> Any | None:
    if not path.exists():
        if required:
            errors.add(label, f"missing JSON file at {path}")
        return None
    try:
        raw = path.read_text(encoding="utf-8")
    except OSError as exc:
        errors.add(label, f"unable to read file: {exc.strerror or exc}")
        return None
    if len(raw.encode("utf-8")) > MAX_EVIDENCE_BYTES:
        errors.add(label, f"file exceeds bounded evidence limit of {MAX_EVIDENCE_BYTES} bytes")
    try:
        return json.loads(raw)
    except json.JSONDecodeError as exc:
        errors.add(label, f"malformed JSON at line {exc.lineno}, column {exc.colno}: {exc.msg}")
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
        if isinstance(value, str) and SECRET_VALUE_RE.search(value):
            # Allow redacted placeholders and safe secret references.
            normalized = value.strip().lower()
            if normalized in REDACTED_VALUES or any(normalized.startswith(prefix.lower()) for prefix in SAFE_SECRET_REF_PREFIXES):
                continue
            errors.add(path, "secret-like string value is not redacted")
        if key is None or not SECRET_KEY_RE.search(key):
            continue
        # secret_env_vars is allowed to contain env var names (not values).
        if key == "secret_env_vars" and isinstance(value, list):
            continue
        if key.endswith("_env") or key.endswith("Env"):
            continue
        if isinstance(value, str):
            normalized = value.strip().lower()
            if normalized in REDACTED_VALUES or any(normalized.startswith(prefix.lower()) for prefix in SAFE_SECRET_REF_PREFIXES):
                continue
            errors.add(path, "secret-like field must be redacted or a safe secret reference")
        elif isinstance(value, (Mapping, list)):
            serialized = json.dumps(value, sort_keys=True)
            if serialized not in ("{}", "[]") and "<redacted>" not in serialized and "redacted" not in serialized.lower():
                errors.add(path, "secret-like object/list must contain only redacted content")


def _validate_basic_structure(evidence: Mapping[str, Any], errors: ErrorCollector) -> str:
    if evidence.get("schema_version") != SCHEMA_VERSION:
        errors.add("schema_version", f"must be {SCHEMA_VERSION!r}")

    artifact_type = str(evidence.get("artifact_type") or "")
    if artifact_type not in {PASSING_ARTIFACT_TYPE, BLOCKER_ARTIFACT_TYPE}:
        errors.add("artifact_type", f"must be {PASSING_ARTIFACT_TYPE!r} or {BLOCKER_ARTIFACT_TYPE!r}")
        artifact_type = "invalid"

    if evidence.get("phase") != PHASE:
        errors.add("phase", f"must be {PHASE!r}")

    if not _parse_timestamp(evidence.get("generated_at")):
        errors.add("generated_at", "must be an ISO-8601 timestamp")

    for key in REQUIRED_TOP_KEYS:
        if key not in evidence:
            errors.add(key, "missing required top-level key")

    runner = _as_mapping(evidence.get("runner"))
    if runner.get("standard_library_only") is not True:
        errors.add("runner.standard_library_only", "must be true")
    if not _non_empty_string(runner.get("script")):
        errors.add("runner.script", "must name the probe script")

    inputs = _as_mapping(evidence.get("inputs"))
    for field in ("base_url", "auth_token_env", "auth_header_name", "auth_token_present", "company_id", "plugin_key", "run_label", "timeout_seconds", "live_probe_enabled"):
        if field not in inputs:
            errors.add(f"inputs.{field}", "missing required input echo")

    runtime = _as_mapping(evidence.get("runtime"))
    if "version" not in runtime or "build" not in runtime:
        errors.add("runtime", "must contain version and build keys")

    side_effect_counters = _as_mapping(evidence.get("side_effect_counters"))
    for field in REQUIRED_SIDE_EFFECT_COUNTERS:
        if field not in side_effect_counters:
            errors.add(f"side_effect_counters.{field}", "missing required counter")

    redaction = _as_mapping(evidence.get("redaction"))
    if redaction.get("secrets_redacted") is not True:
        errors.add("redaction.secrets_redacted", "must be true")

    return artifact_type


def _validate_probe_result(result: Any, index: int, probe_name: str, errors: ErrorCollector) -> None:
    if not isinstance(result, Mapping):
        errors.add(f"probes.{probe_name}.results[{index}]", "probe result must be an object")
        return
    for key in REQUIRED_RESULT_KEYS:
        if key not in result:
            errors.add(f"probes.{probe_name}.results[{index}]", f"missing required key '{key}'")
    ok = result.get("ok")
    if ok is not True and ok is not False:
        errors.add(f"probes.{probe_name}.results[{index}].ok", "must be a boolean")
    status_code = result.get("status_code")
    if status_code is not None and (not isinstance(status_code, int) or not 100 <= status_code <= 599):
        errors.add(f"probes.{probe_name}.results[{index}].status_code", "must be an HTTP status code or null")
    duration_ms = result.get("duration_ms")
    if duration_ms is not None and not isinstance(duration_ms, (int, float)):
        errors.add(f"probes.{probe_name}.results[{index}].duration_ms", "must be a number or null")
    summary = _as_mapping(result.get("response_summary"))
    if summary.get("json_type") not in ("dict", "list", "NoneType", None):
        errors.add(f"probes.{probe_name}.results[{index}].response_summary.json_type", "unexpected json_type")


def _validate_probe_structure(probe_name: str, probe: Any, errors: ErrorCollector) -> None:
    if not isinstance(probe, Mapping):
        errors.add(f"probes.{probe_name}", "probe must be an object")
        return
    required_keys = REQUIRED_PROBE_KEYS.get(probe_name, ())
    for key in required_keys:
        if key not in probe:
            errors.add(f"probes.{probe_name}", f"missing required key '{key}'")
    results = _as_sequence(probe.get("results"))
    if not results:
        errors.add(f"probes.{probe_name}.results", "must contain at least one result")
    for i, result in enumerate(results):
        _validate_probe_result(result, i, probe_name, errors)

    if probe_name == "artifact_regression_smoke":
        readbacks = _as_mapping(probe.get("readbacks"))
        for kind in ("issue", "document", "comment"):
            rb = _as_mapping(readbacks.get(kind))
            for key in REQUIRED_READBACK_KEYS:
                if key not in rb:
                    errors.add(f"probes.{probe_name}.readbacks.{kind}", f"missing required key '{key}'")
        side_effects = _as_mapping(probe.get("side_effects"))
        for key in ("issues_created", "documents_created", "comments_created"):
            if key not in side_effects:
                errors.add(f"probes.{probe_name}.side_effects", f"missing required key '{key}'")


def _validate_probes_structure(evidence: Mapping[str, Any], errors: ErrorCollector) -> None:
    probes = _as_mapping(evidence.get("probes"))
    artifact_type = str(evidence.get("artifact_type") or "")
    inputs = _as_mapping(evidence.get("inputs"))
    live_probe_enabled = inputs.get("live_probe_enabled")

    # Blocker artifacts with live_probe_enabled=false may have empty probes (preflight blocked).
    if artifact_type == BLOCKER_ARTIFACT_TYPE and live_probe_enabled is False and not probes:
        return

    for probe_name in REQUIRED_PROBE_KEYS:
        if probe_name not in probes:
            errors.add(f"probes", f"missing required probe '{probe_name}'")
        else:
            _validate_probe_structure(probe_name, probes.get(probe_name), errors)


def _status_is_pass(value: Any) -> bool:
    return isinstance(value, str) and value.strip().lower() in STATUS_PASS


def _validate_passing_internal_consistency(evidence: Mapping[str, Any], errors: ErrorCollector) -> None:
    """Ensure capability promotions match actual probe results."""
    probes = _as_mapping(evidence.get("probes"))
    promotions = _as_sequence(evidence.get("capability_promotions"))
    runtime = _as_mapping(evidence.get("runtime"))

    if "runtime.health_version" in promotions:
        if not _non_empty_string(runtime.get("version")) or not _non_empty_string(runtime.get("build")):
            errors.add("capability_promotions.runtime.health_version", "promoted but runtime version/build is missing")

    if "runtime.plugin_install_path" in promotions:
        p02 = _as_mapping(probes.get("plugin_install_path"))
        if p02.get("plugin_found") is not True:
            errors.add("capability_promotions.runtime.plugin_install_path", "promoted but plugin_found is false")

    if "runtime.tool_registry" in promotions:
        p03 = _as_mapping(probes.get("tool_registry"))
        piko_tools = _as_sequence(p03.get("piko_tools_observed"))
        if not piko_tools:
            errors.add("capability_promotions.runtime.tool_registry", "promoted but no piko_tools_observed")

    if "runtime.secret_materialization" in promotions:
        p04 = _as_mapping(probes.get("secret_materialization"))
        if not _status_is_pass(p04.get("test_status")):
            errors.add("capability_promotions.runtime.secret_materialization", "promoted but test_status is not passing")

    if "runtime.artifact_regression_smoke" in promotions:
        p05 = _as_mapping(probes.get("artifact_regression_smoke"))
        readbacks = _as_mapping(p05.get("readbacks"))
        side_effects = _as_mapping(p05.get("side_effects"))
        for kind in ("issue", "document", "comment"):
            rb = _as_mapping(readbacks.get(kind))
            if rb.get("ok") is not True:
                errors.add(f"capability_promotions.runtime.artifact_regression_smoke", f"promoted but {kind} readback is not ok")
        if side_effects.get("issues_created") != 1:
            errors.add("capability_promotions.runtime.artifact_regression_smoke", "promoted but issues_created != 1")
        if side_effects.get("documents_created") != 1:
            errors.add("capability_promotions.runtime.artifact_regression_smoke", "promoted but documents_created != 1")
        if side_effects.get("comments_created") != 1:
            errors.add("capability_promotions.runtime.artifact_regression_smoke", "promoted but comments_created != 1")


def _validate_no_promotion(evidence: Mapping[str, Any], errors: ErrorCollector) -> None:
    artifact_type = str(evidence.get("artifact_type") or "")
    promotions = _as_sequence(evidence.get("capability_promotions"))
    if artifact_type == BLOCKER_ARTIFACT_TYPE and promotions:
        errors.add("capability_promotions", "fail-closed blocker must not promote capabilities")
    if artifact_type == PASSING_ARTIFACT_TYPE and not promotions:
        errors.add("capability_promotions", "live-evidence must list promoted capabilities")


def _validate_capability_matrix_consistency(
    evidence: Mapping[str, Any],
    matrix: Mapping[str, Any],
    errors: ErrorCollector,
) -> None:
    promotions = _as_sequence(evidence.get("capability_promotions"))
    if not promotions:
        return

    capabilities = _as_sequence(matrix.get("capabilities"))
    entries_by_key: dict[str, Mapping[str, Any]] = {}
    for entry in capabilities:
        if isinstance(entry, Mapping):
            key = entry.get("key")
            if isinstance(key, str):
                entries_by_key[key] = entry

    for promoted in promotions:
        matrix_keys = CAPABILITY_TO_MATRIX_KEY.get(promoted, [])
        if not matrix_keys:
            # secret_materialization has no direct matrix mapping; skip.
            continue
        for matrix_key in matrix_keys:
            entry = entries_by_key.get(matrix_key)
            if entry is None:
                errors.add(
                    "capability_matrix",
                    f"promoted capability {promoted!r} maps to missing matrix key {matrix_key!r}",
                )
                continue
            status = entry.get("status")
            if status == "unsupported":
                errors.add(
                    "capability_matrix",
                    f"promoted capability {promoted!r} maps to matrix key {matrix_key!r} with status 'unsupported'",
                )


def _validate_blocker_diagnostics(evidence: Mapping[str, Any], errors: ErrorCollector) -> None:
    if not _non_empty_string(evidence.get("blocker_reason")):
        errors.add("blocker_reason", "fail-closed blocker requires a blocker reason")
    blocker_codes = _as_sequence(evidence.get("blocker_codes"))
    if not blocker_codes:
        errors.add("blocker_codes", "fail-closed blocker requires precise blocker codes")
    fallback = _as_sequence(evidence.get("fallback_diagnostics"))
    if not fallback and not blocker_codes:
        errors.add("fallback_diagnostics", "fail-closed blocker requires fallback diagnostics")
    side_effect_counters = _as_mapping(evidence.get("side_effect_counters"))
    for field in ("approval_requests_created", "hermes_runs_started", "gsd_pi_runs_started"):
        value = side_effect_counters.get(field)
        if isinstance(value, int) and value != 0:
            errors.add(f"side_effect_counters.{field}", "fail-closed blocker must have zero unsupported side effects")


def _validate_artifact(evidence_path: Path, root: Path) -> tuple[list[str], str]:
    errors = ErrorCollector()
    loaded = _load_json(evidence_path, str(evidence_path), errors)
    if not isinstance(loaded, Mapping):
        errors.add("evidence", "top-level JSON must be an object")
        return errors.errors, "invalid"
    evidence: Mapping[str, Any] = loaded

    artifact_type = _validate_basic_structure(evidence, errors)
    _validate_probes_structure(evidence, errors)
    _validate_redaction(evidence, errors)
    _validate_no_promotion(evidence, errors)

    if artifact_type == PASSING_ARTIFACT_TYPE:
        _validate_passing_internal_consistency(evidence, errors)
    elif artifact_type == BLOCKER_ARTIFACT_TYPE:
        _validate_blocker_diagnostics(evidence, errors)

    # Capability matrix consistency check.
    matrix_path = root / "plugin-bos-light" / "capabilities.paperclip-runtime.json"
    matrix = _load_json(matrix_path, "capability_matrix", errors, required=False)
    if isinstance(matrix, Mapping):
        _validate_capability_matrix_consistency(evidence, matrix, errors)

    classification = "invalid"
    if not errors.errors:
        classification = "blocker" if artifact_type == BLOCKER_ARTIFACT_TYPE else "passing"
    return errors.errors, classification


def validate(evidence_path: Path | None = None, root: Path = ROOT) -> tuple[list[str], str]:
    root = root.resolve()
    if evidence_path is None:
        return ["evidence: provide an evidence path"], "invalid"
    return _validate_artifact(evidence_path, root)


def _write_audit(path: Path, root: Path, evidence_path: Path | None, errors: Sequence[str], classification: str) -> None:
    payload = {
        "schema_version": "m006-s00-runtime-capability-inventory-closeout/v1",
        "artifact_type": "validator-audit",
        "generated_at": datetime.now(UTC).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        "phase": PHASE,
        "classification": classification,
        "passed": not errors,
        "inputs": {"evidence_path": str(evidence_path) if evidence_path else None},
        "diagnostics": {"error_count": len(errors), "errors": list(errors)},
        "posture": {
            "capability_promotions_require_passing_proof": True,
            "fail_closed_blocker_artifacts_accepted": True,
            "redaction_required": True,
            "plaintext_credential_values_allowed": False,
        },
    }
    target = path if path.is_absolute() else root / path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Validate M006 S00 runtime capability inventory evidence artifacts.")
    parser.add_argument("evidence_path", type=Path, nargs="?", help="Path to runtime-evidence/M006-S00-*.json artifact.")
    parser.add_argument("--evidence", dest="evidence_option", type=Path, help="Evidence JSON path; kept for task-plan CLI compatibility.")
    parser.add_argument("--root", type=Path, default=ROOT, help="Repository root.")
    parser.add_argument("--write-audit", type=Path, help="Write validator closeout JSON to this path.")
    parser.add_argument("--allow-blocker", action="store_true", help="Compatibility no-op: valid fail-closed blocker artifacts already return 0.")
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    evidence_path = args.evidence_option or args.evidence_path
    errors, classification = validate(evidence_path, args.root)
    if args.write_audit:
        _write_audit(args.write_audit, args.root.resolve(), evidence_path, errors, classification)
    if errors:
        print("M006 S00 runtime capability inventory validation failed:", file=sys.stderr)
        for error in errors:
            print(f"- {error}", file=sys.stderr)
        return 1
    if classification == "blocker":
        print("M006 S00 runtime capability inventory blocker artifact OK: fail-closed diagnostics are valid.")
        return 0
    print("M006 S00 runtime capability inventory proof OK: live runtime assumptions validated.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
