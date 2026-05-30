#!/usr/bin/env python3
"""Validate S09 reconciliation inputs without contacting Paperclip.

This validator encodes the conservative S08 closeout contract. It checks that
canonical S08 artifacts exist, that S08 runtime evidence remains fail-closed, that
reader-facing docs carry the S08 outcome instead of only the older S02 blocker,
and that the runtime capability matrix does not promote Hermes/GSD-Pi execution.

The script is intentionally standard-library only and reads local files only.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable, Mapping, Sequence

S08_ARTIFACT_PATHS: tuple[Path, ...] = (
    Path(".gsd/milestones/M002/slices/S08/S08-SUMMARY.md"),
    Path(".gsd/milestones/M002/slices/S08/S08-ASSESSMENT.md"),
    Path(".gsd/milestones/M002/slices/S08/S08-UAT.md"),
)

S08_EVIDENCE_PATHS: tuple[Path, ...] = (
    Path("runtime-evidence/M002-S09-s08-artifact-reconstruction.json"),
    Path("runtime-evidence/M002-S08-provider-adapter-feasibility.json"),
    Path("runtime-evidence/M002-S08-execution-path-decision-packet.json"),
    Path("runtime-evidence/M002-S08-adapter-registration-evidence.json"),
    Path("runtime-evidence/M002-S08-hermes-cli-environment-remediation.json"),
    Path("runtime-evidence/M002-S08-runtime-execution-smoke.json"),
)

LIVE_REPORT_PATH = Path("PAPERCLIP_LIVE_VALIDATION_REPORT.md")
RUNTIME_HEALTH_PATH = Path("docs/08_RUNTIME_CAPABILITY_HEALTH.md")
CAPABILITY_MATRIX_PATH = Path("plugin-bos-light/capabilities.paperclip-runtime.json")

SELECTED_PATH = "hermes_local_with_codex_cli_backend"
ADAPTER_FAILED = "adapter_failed"
READY_WITH_WARNING = "ready_with_warning"

TARGET_EXECUTION_TERMS = (
    "hermes",
    "gsd-pi",
    "gsd_pi",
    "gsdpi",
    "agent execution",
    "runtime execution",
)
PROMOTION_PHRASES = (
    "hermes execution confirmed",
    "hermes execution support",
    "gsd-pi execution confirmed",
    "gsd_pi execution confirmed",
    "gsdpi execution confirmed",
    "runtime execution support confirmed",
    "paperclip runtime execution confirmed",
)
SECRET_PATTERNS: tuple[tuple[re.Pattern[str], str], ...] = (
    (re.compile(r"-----BEGIN (?:RSA |DSA |EC |OPENSSH |)?PRIVATE KEY-----"), "private-key-block"),
    (re.compile(r"\bsk-[A-Za-z0-9_-]{20,}\b"), "openai-style-api-key"),
    (re.compile(r"\b(?:ghp|github_pat)_[A-Za-z0-9_]{30,}\b"), "github-token"),
    (re.compile(r"\bAKIA[0-9A-Z]{16}\b"), "aws-access-key"),
    (re.compile(r"\bAuthorization\s*[:=]\s*Bearer\s+[A-Za-z0-9._~+/=-]{24,}\b", re.IGNORECASE), "authorization-bearer-token"),
)


class ValidationErrorCollector:
    """Collect path-specific validation failures."""

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


def _read_text(root: Path, relative_path: Path, errors: ValidationErrorCollector, *, required: bool = True) -> str:
    absolute_path = root / relative_path
    display_path = _display_path(root, absolute_path)
    if not absolute_path.exists():
        if required:
            errors.add(display_path, "file", "missing required text file")
        return ""
    try:
        text = absolute_path.read_text(encoding="utf-8")
    except UnicodeDecodeError as exc:
        errors.add(display_path, "file", f"not valid UTF-8 text: {exc}")
        return ""
    except OSError as exc:
        errors.add(display_path, "file", f"unable to read file: {exc.strerror or exc}")
        return ""
    if required and not text.strip():
        errors.add(display_path, "file", "required file is empty")
    return text


def _load_json(root: Path, relative_path: Path, errors: ValidationErrorCollector) -> Any | None:
    absolute_path = root / relative_path
    display_path = _display_path(root, absolute_path)
    text = _read_text(root, relative_path, errors)
    if not text.strip():
        return None
    try:
        return json.loads(text)
    except json.JSONDecodeError as exc:
        errors.add(display_path, "json", f"malformed JSON at line {exc.lineno}, column {exc.colno}: {exc.msg}")
        return None


def _json_text(value: Any) -> str:
    try:
        return json.dumps(value, sort_keys=True, ensure_ascii=False)
    except TypeError:
        return str(value)


def _flatten_strings(value: Any) -> Iterable[str]:
    if isinstance(value, Mapping):
        for key, child in value.items():
            yield str(key)
            yield from _flatten_strings(child)
    elif isinstance(value, list):
        for child in value:
            yield from _flatten_strings(child)
    elif value is not None:
        yield str(value)


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


def _iter_result_jsons(smoke: Any) -> Iterable[tuple[str, Any]]:
    candidates = (
        ("run.final_readback.json.resultJson", _nested_get(smoke, "run.final_readback.json.resultJson")),
        ("run.invoke_response.json.resultJson", _nested_get(smoke, "run.invoke_response.json.resultJson")),
    )
    for label, value in candidates:
        yield label, value

    history = _nested_get(smoke, "run.readback_history_tail")
    if isinstance(history, list):
        for index, item in enumerate(history):
            yield f"run.readback_history_tail[{index}].json.resultJson", _nested_get(item, "json.resultJson")

    run_list = _nested_get(smoke, "run.runListAfter")
    if isinstance(run_list, Mapping):
        run_list = run_list.get("json")
    if isinstance(run_list, list):
        for index, item in enumerate(run_list):
            yield f"run.runListAfter[{index}].resultJson", item.get("resultJson") if isinstance(item, Mapping) else None


def _has_passing_result_json_bos(result_json: Any) -> bool:
    if not isinstance(result_json, Mapping):
        return False
    bos = result_json.get("bos")
    if bos is None:
        return False
    if isinstance(bos, Mapping):
        return bos.get("ok") is not False
    return True


def _contains_any(text: str, terms: Sequence[str]) -> bool:
    lower = text.lower()
    return any(term.lower() in lower for term in terms)


def _marker_status(text: str) -> dict[str, bool]:
    lower = text.lower()
    return {
        "selected_path": SELECTED_PATH.lower() in lower,
        "adapter_failed": ADAPTER_FAILED.lower() in lower,
        "wake_count_or_no_duplicate": "wakecountdelta" in lower or "no-duplicate-wake" in lower or "no duplicate wake" in lower,
        "result_json_bos_no_pass": "resultjson.bos" in lower and (
            "no passing" in lower or "missing_resultjson_bos" in lower or "missing `resultjson.bos`" in lower or "did not produce passing" in lower
        ),
        "ready_warning": READY_WITH_WARNING.lower() in lower or "ready with warning" in lower or "readiness warning" in lower,
        "no_capability_promotion": "no capability promotion" in lower or "no_promotion" in lower or "not promoted" in lower or "no-promotion" in lower,
    }


def validate_s08_artifacts(root: Path, errors: ValidationErrorCollector, audit: dict[str, Any]) -> str:
    artifact_texts: list[str] = []
    checked: list[dict[str, Any]] = []
    for relative_path in S08_ARTIFACT_PATHS:
        text = _read_text(root, relative_path, errors)
        artifact_texts.append(text)
        checked.append(_file_summary(root, relative_path, text))
    combined = "\n".join(artifact_texts)
    markers = _marker_status(combined)
    for marker, present in markers.items():
        if not present:
            errors.add("S08 canonical artifacts", "marker", f"missing conservative marker: {marker}")
    audit["s08_artifacts"] = {"checked_files": checked, "markers": markers}
    return combined


def validate_s08_evidence(root: Path, errors: ValidationErrorCollector, audit: dict[str, Any]) -> str:
    evidence_objects: dict[str, Any] = {}
    evidence_texts: list[str] = []
    checked: list[dict[str, Any]] = []
    for relative_path in S08_EVIDENCE_PATHS:
        obj = _load_json(root, relative_path, errors)
        if obj is None:
            continue
        text = _json_text(obj)
        evidence_texts.append(text)
        evidence_objects[str(relative_path)] = obj
        checked.append(_file_summary(root, relative_path, text))

    combined = "\n".join(evidence_texts)
    markers = _marker_status(combined)
    # Runtime evidence uses structured resultJson fields rather than doc shorthand.
    markers["result_json_bos_no_pass"] = "missing_resultjson_bos" in combined.lower() or "resultjson.bos" in combined.lower()
    for marker, present in markers.items():
        if not present:
            errors.add("S08 runtime evidence", "marker", f"missing conservative marker: {marker}")

    smoke = evidence_objects.get(str(Path("runtime-evidence/M002-S08-runtime-execution-smoke.json")))
    if isinstance(smoke, Mapping):
        if smoke.get("selected_path") != SELECTED_PATH:
            errors.add(S08_EVIDENCE_PATHS[-1], "selected_path", f"expected {SELECTED_PATH!r}")
        error_code = _nested_get(smoke, "run.final_readback.json.errorCode")
        stop_reason = _nested_get(smoke, "run.final_readback.json.resultJson.stopReason")
        if error_code != ADAPTER_FAILED and stop_reason != ADAPTER_FAILED:
            errors.add(S08_EVIDENCE_PATHS[-1], "adapter_failed", "final readback does not record adapter_failed")
        wake_delta = _nested_get(smoke, "run.wakeCountDelta")
        if wake_delta != 1:
            errors.add(S08_EVIDENCE_PATHS[-1], "wakeCountDelta", f"expected exactly 1 wake delta, got {wake_delta!r}")
        passing_paths = [label for label, result_json in _iter_result_jsons(smoke) if _has_passing_result_json_bos(result_json)]
        if passing_paths:
            errors.add(S08_EVIDENCE_PATHS[-1], "resultJson.bos", f"unexpected passing BOS result at {', '.join(passing_paths)}")

    registration = evidence_objects.get(str(Path("runtime-evidence/M002-S08-adapter-registration-evidence.json")))
    if isinstance(registration, Mapping):
        readiness_status = _nested_get(registration, "readiness_assessment.status")
        warning_codes = _nested_get(registration, "readiness_assessment.remaining_warning_codes")
        if readiness_status != READY_WITH_WARNING and not warning_codes:
            errors.add(
                Path("runtime-evidence/M002-S08-adapter-registration-evidence.json"),
                "readiness_assessment",
                "expected ready_with_warning or remaining readiness warning codes",
            )

    audit["s08_runtime_evidence"] = {
        "checked_files": checked,
        "markers": markers,
        "structured_checks": {
            "selected_path": _nested_get(smoke, "selected_path") if isinstance(smoke, Mapping) else None,
            "adapter_error_code": _nested_get(smoke, "run.final_readback.json.errorCode") if isinstance(smoke, Mapping) else None,
            "wakeCountDelta": _nested_get(smoke, "run.wakeCountDelta") if isinstance(smoke, Mapping) else None,
            "readiness_status": _nested_get(registration, "readiness_assessment.status") if isinstance(registration, Mapping) else None,
            "passing_resultJson_bos_present": bool(
                isinstance(smoke, Mapping) and any(_has_passing_result_json_bos(result) for _, result in _iter_result_jsons(smoke))
            ),
        },
    }
    return combined


def validate_docs(root: Path, errors: ValidationErrorCollector, audit: dict[str, Any]) -> str:
    doc_summaries: list[dict[str, Any]] = []
    combined_parts: list[str] = []
    for relative_path in (LIVE_REPORT_PATH, RUNTIME_HEALTH_PATH):
        text = _read_text(root, relative_path, errors)
        combined_parts.append(text)
        lower = text.lower()
        markers = {
            "s08": "s08" in lower,
            "selected_path_or_codex": SELECTED_PATH.lower() in lower or "codex" in lower,
            "adapter_failed": ADAPTER_FAILED.lower() in lower,
            "wake_count_or_no_duplicate": "wakecountdelta" in lower or "no-duplicate-wake" in lower or "no duplicate wake" in lower,
            "result_json_bos_no_pass": "resultjson.bos" in lower and ("no passing" in lower or "missing_resultjson_bos" in lower or "did not produce passing" in lower),
            "no_promotion": "not promoted" in lower or "no capability promotion" in lower or "no-promotion" in lower or "fallback-only" in lower,
            "s02_context_allowed": "s02" in lower,
        }
        for marker, present in markers.items():
            if marker == "s02_context_allowed":
                continue
            if not present:
                errors.add(relative_path, "doc marker", f"missing S08 reconciliation marker: {marker}")
        if markers["s02_context_allowed"] and not markers["s08"]:
            errors.add(relative_path, "doc marker", "mentions old S02 blocker but not S08 outcome")
        doc_summaries.append({"path": str(relative_path), "markers": markers, **_file_summary(root, relative_path, text)})
    audit["docs"] = {"checked_files": doc_summaries}
    return "\n".join(combined_parts)


def validate_capability_matrix(root: Path, errors: ValidationErrorCollector, audit: dict[str, Any]) -> str:
    obj = _load_json(root, CAPABILITY_MATRIX_PATH, errors)
    if obj is None:
        audit["capability_posture"] = {"loaded": False}
        return ""
    if not isinstance(obj, Mapping):
        errors.add(CAPABILITY_MATRIX_PATH, "json", "expected top-level object")
        audit["capability_posture"] = {"loaded": False, "type": type(obj).__name__}
        return _json_text(obj)
    capabilities = obj.get("capabilities")
    if not isinstance(capabilities, list):
        errors.add(CAPABILITY_MATRIX_PATH, "capabilities", "expected capabilities list")
        capabilities = []

    statuses: dict[str, int] = {}
    promoted_targets: list[str] = []
    suspicious_confirmed_rows: list[str] = []
    for index, row in enumerate(capabilities):
        if not isinstance(row, Mapping):
            errors.add(CAPABILITY_MATRIX_PATH, f"capabilities[{index}]", "expected object row")
            continue
        key = str(row.get("key", f"index-{index}"))
        status = str(row.get("status", ""))
        statuses[status] = statuses.get(status, 0) + 1
        identity_text = " ".join(str(row.get(field, "")) for field in ("key", "paperclip_surface_name"))
        row_text = _json_text(row).lower()
        if status == "confirmed" and _contains_any(identity_text, TARGET_EXECUTION_TERMS):
            promoted_targets.append(key)
        if status == "confirmed" and _contains_any(row_text, PROMOTION_PHRASES):
            suspicious_confirmed_rows.append(key)

    matrix_text = _json_text(obj)
    matrix_lower = matrix_text.lower()
    caveat_markers = {
        "mentions_hermes": "hermes" in matrix_lower,
        "mentions_gsd_pi": "gsd-pi" in matrix_lower or "gsd_pi" in matrix_lower or "gsdpi" in matrix_lower,
        "explicit_non_confirmation": "does not confirm" in matrix_lower or "do not" in matrix_lower or "cannot" in matrix_lower,
    }
    for marker, present in caveat_markers.items():
        if not present:
            errors.add(CAPABILITY_MATRIX_PATH, "capability posture", f"missing conservative execution caveat: {marker}")
    if promoted_targets:
        errors.add(CAPABILITY_MATRIX_PATH, "capability posture", "Hermes/GSD-Pi execution capability row is marked confirmed: " + ", ".join(promoted_targets))
    if suspicious_confirmed_rows:
        errors.add(CAPABILITY_MATRIX_PATH, "capability posture", "confirmed row uses execution-promotion wording: " + ", ".join(suspicious_confirmed_rows))

    audit["capability_posture"] = {
        "loaded": True,
        "path": str(CAPABILITY_MATRIX_PATH),
        "status_counts": statuses,
        "target_execution_rows_marked_confirmed": promoted_targets,
        "confirmed_rows_with_promotion_wording": suspicious_confirmed_rows,
        "caveat_markers": caveat_markers,
        **_file_summary(root, CAPABILITY_MATRIX_PATH, matrix_text),
    }
    return matrix_text


def validate_no_secret_like_output(texts_by_label: Mapping[str, str], errors: ValidationErrorCollector, audit: dict[str, Any]) -> None:
    findings: list[dict[str, str]] = []
    for label, text in texts_by_label.items():
        for pattern, name in SECRET_PATTERNS:
            if pattern.search(text):
                findings.append({"label": label, "pattern": name})
                errors.add(label, "redaction", f"secret-like pattern present in checked artifact: {name}")
    audit["redaction"] = {"secret_like_findings": findings, "secret_values_recorded": False}


def _file_summary(root: Path, relative_path: Path, text: str | None = None) -> dict[str, Any]:
    absolute_path = root / relative_path
    exists = absolute_path.exists()
    size_bytes = absolute_path.stat().st_size if exists else 0
    if text is None and exists:
        try:
            text = absolute_path.read_text(encoding="utf-8")
        except Exception:
            text = ""
    text = text or ""
    return {
        "path": str(relative_path),
        "exists": exists,
        "non_empty": bool(text.strip()),
        "size_bytes": size_bytes,
        "sha256": hashlib.sha256(text.encode("utf-8")).hexdigest() if text else None,
    }


def validate(root: Path) -> tuple[bool, list[str], dict[str, Any]]:
    errors = ValidationErrorCollector()
    audit: dict[str, Any] = {
        "schema_version": "s09-reconciliation-audit/v1",
        "artifact_type": "validation-audit",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "milestone": "M002",
        "slice": "S09",
        "validator": "scripts/validate_s09_reconciliation.py",
        "root": str(root),
        "redaction_notice": "Audit contains marker statuses, paths, counts, and hashes only; it intentionally omits artifact excerpts and secret values.",
    }
    artifact_text = validate_s08_artifacts(root, errors, audit)
    evidence_text = validate_s08_evidence(root, errors, audit)
    docs_text = validate_docs(root, errors, audit)
    matrix_text = validate_capability_matrix(root, errors, audit)
    validate_no_secret_like_output(
        {
            "s08_artifacts": artifact_text,
            "s08_runtime_evidence": evidence_text,
            "docs": docs_text,
            "capability_matrix": matrix_text,
        },
        errors,
        audit,
    )
    audit["result"] = {"ok": not errors.errors, "error_count": len(errors.errors), "errors": errors.errors}
    return not errors.errors, errors.errors, audit


def write_audit(root: Path, relative_path: Path, audit: Mapping[str, Any]) -> None:
    output_path = root / relative_path
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(audit, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def parse_args(argv: Sequence[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Validate M002/S09 reconciliation of S08 closeout artifacts and runtime posture.")
    parser.add_argument("--root", type=Path, default=Path.cwd(), help="Repository/worktree root to validate; default: current directory.")
    parser.add_argument(
        "--write-audit",
        type=Path,
        help="Optional relative path for redacted audit JSON, e.g. runtime-evidence/M002-S09-reconciliation-audit.json.",
    )
    return parser.parse_args(argv)


def main(argv: Sequence[str] | None = None) -> int:
    args = parse_args(sys.argv[1:] if argv is None else argv)
    root = args.root.resolve()
    ok, errors, audit = validate(root)
    if args.write_audit:
        write_audit(root, args.write_audit, audit)
        print(f"Wrote S09 reconciliation audit: {args.write_audit}")
    if ok:
        print("S09 reconciliation validation passed.")
        return 0
    print("S09 reconciliation validation failed:", file=sys.stderr)
    for error in errors:
        print(f"- {error}", file=sys.stderr)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
