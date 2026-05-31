#!/usr/bin/env python3
"""Validate the M004 S06 requirement coverage ledger for R012-R016.

This validator is standard-library-only and fail-closed. It validates the local
M004/S06 coverage ledger for traceability drift: missing or extra requirements,
status/coverage drift, ownership normalization, citation class loss, secret-like
values, and accidental runtime capability promotion. It performs only local file
reads/writes requested by the caller; it performs no network, subprocess, shell,
or database access.
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
SCHEMA_VERSION = "m004-s06-requirement-coverage/v1"
AUDIT_SCHEMA_VERSION = "m004-s06-requirement-coverage-validation/v1"
ARTIFACT_TYPE = "requirement-coverage-ledger"
DEFAULT_LEDGER_PATH = Path("runtime-evidence/M004-S06-requirement-coverage.json")
DEFAULT_AUDIT_PATH = Path("runtime-evidence/M004-S06-coverage-validation.json")

ALLOWED_PHASES = {"ledger", "final"}
REQUIRED_REQUIREMENT_IDS = ("R012", "R013", "R014", "R015", "R016")
REQUIRED_REQUIREMENTS = set(REQUIRED_REQUIREMENT_IDS)
ALLOWED_REQUIREMENT_CLASSES = {
    "R012": "constraint",
    "R013": "compliance/security",
    "R014": "compliance/security",
    "R015": "core-capability",
    "R016": "constraint",
}
REQUIRED_VALIDATION_CLASSES = {"Contract", "Integration", "Operational", "UAT"}
ALLOWED_VALIDATION_CLASSES = REQUIRED_VALIDATION_CLASSES
ALLOWED_PROBLEM_KINDS = {
    "division_map_contract",
    "external_io_boundary_contract",
    "quarantine_data_contract",
    "hco_routing_control_contract",
    "runtime_posture_contract",
    "requirement_closeout_coverage",
    "fresh_regression_proof",
    "secondary_regression_proof",
    "reviewer_readable_closeout",
    # Test/forward-compatible diagnostic buckets that keep the required shape.
    "contract_drift",
    "coverage_gap",
    "ownership_drift",
    "capability_promotion",
    "secret_leak",
    "malformed_json",
    "io_error",
    "uat_readability",
}
INHERITED_REQUIREMENTS = {"R012", "R013", "R014", "R016"}
M004_ORIGINATED_REQUIREMENTS = {"R015"}
MIN_SUMMARY_CHARS = 80
MAX_SUMMARY_CHARS = 900
MAX_CITATION_NOTE_CHARS = 700
MAX_CANONICAL_TEXT_CHARS = 700

SECRET_KEY_RE = re.compile(
    r"(?:secret|token|password|passwd|api[_-]?key|credential|private[_-]?key|authorization|bearer)",
    re.IGNORECASE,
)
SECRET_VALUE_RE = re.compile(
    r"("
    r"-----BEGIN (?:RSA |DSA |EC |OPENSSH |)?PRIVATE KEY-----|"
    r"sk-[A-Za-z0-9_\-]{20,}|"
    r"gh[pousr]_[A-Za-z0-9_]{8,}|"
    r"github_pat_[A-Za-z0-9_]{16,}|"
    r"xox[baprs]-[A-Za-z0-9\-]{8,}|"
    r"AKIA[0-9A-Z]{8,}|"
    r"(?:Authorization\s*[:=]\s*)?Bearer\s+[A-Za-z0-9._~+/=\-]{8,}|"
    r"[A-Za-z_][A-Za-z0-9_]*(?:TOKEN|SECRET|PASSWORD|API_KEY)=[^\s\"']+"
    r")",
    re.IGNORECASE,
)
SAFE_SECRET_VALUES = {"", "<redacted>", "[redacted]", "redacted", "***", "false", "none", "null"}
SAFE_SECRET_PREFIXES = ("secret_ref:", "paperclip-secret:", "vault:", "env:")


class ErrorCollector:
    """Collect concise diagnostics that never echo secret-like values."""

    def __init__(self) -> None:
        self.errors: list[str] = []

    def add(
        self,
        context: str,
        message: str,
        *,
        requirement_id: str = "M004-S06",
        validation_class: str = "Operational",
        artifact_path: str | Path = DEFAULT_LEDGER_PATH,
        problem_kind: str = "coverage_gap",
    ) -> None:
        safe_validation_class = validation_class if validation_class in ALLOWED_VALIDATION_CLASSES else "Contract"
        safe_problem_kind = problem_kind if problem_kind in ALLOWED_PROBLEM_KINDS else "coverage_gap"
        self.errors.append(
            f"[{requirement_id}][{safe_validation_class}][{artifact_path}][{safe_problem_kind}] {context}: {message}"
        )


def _utc_now() -> str:
    return datetime.now(UTC).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def _parse_timestamp(value: Any) -> bool:
    if not isinstance(value, str) or not value.strip():
        return False
    try:
        datetime.fromisoformat(value.strip().replace("Z", "+00:00"))
        return True
    except ValueError:
        return False


def _as_mapping(value: Any) -> Mapping[str, Any]:
    return value if isinstance(value, Mapping) else {}


def _as_sequence(value: Any) -> Sequence[Any]:
    return value if isinstance(value, list) else []


def _non_empty_string(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _bounded_string(value: Any, *, minimum: int = 1, maximum: int = 1000) -> bool:
    return isinstance(value, str) and minimum <= len(value.strip()) <= maximum


def _flag_false_or_empty(value: Any) -> bool:
    if value in (False, 0, None, "", [], {}):
        return True
    if isinstance(value, str) and value.strip().lower() in {
        "false",
        "no",
        "none",
        "null",
        "not used",
        "unused",
        "not promoted",
        "unpromoted",
        "redacted",
        "<redacted>",
    }:
        return True
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


def _is_safe_secret_reference(value: str) -> bool:
    normalized = value.strip().lower()
    return normalized in SAFE_SECRET_VALUES or normalized.startswith(SAFE_SECRET_PREFIXES)


def _validate_redaction_json(value: Any, errors: ErrorCollector, *, artifact_path: str | Path = DEFAULT_LEDGER_PATH) -> None:
    for path, key, child in _walk_json(value):
        if isinstance(child, str) and SECRET_VALUE_RE.search(child):
            errors.add(
                path,
                "secret-like string value is not redacted",
                artifact_path=artifact_path,
                problem_kind="secret_leak",
            )
        if key is None or not SECRET_KEY_RE.search(key):
            continue
        if _flag_false_or_empty(child):
            continue
        if isinstance(child, str) and _is_safe_secret_reference(child):
            continue
        errors.add(
            path,
            "secret-like field must be false, empty, redacted, or a safe secret reference",
            artifact_path=artifact_path,
            problem_kind="secret_leak",
        )


def _validate_redaction_text(text: str, label: str, errors: ErrorCollector) -> None:
    if SECRET_VALUE_RE.search(text):
        errors.add(label, "secret-like text value is not redacted", artifact_path=label, problem_kind="secret_leak")


def _duplicate_rejecting_pairs(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for key, value in pairs:
        if key in result:
            raise ValueError(f"duplicate JSON key {key!r}")
        result[key] = value
    return result


def _load_json(path: Path, label: str, errors: ErrorCollector, *, required: bool = True) -> Any | None:
    if not path.exists():
        if required:
            errors.add(label, f"missing JSON file at {path}", artifact_path=label, problem_kind="io_error")
        return None
    try:
        raw = path.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        errors.add(label, "JSON file is not valid UTF-8 text", artifact_path=label, problem_kind="io_error")
        return None
    except OSError as exc:
        errors.add(label, f"unable to read JSON file: {exc.strerror or exc}", artifact_path=label, problem_kind="io_error")
        return None
    try:
        loaded = json.loads(raw, object_pairs_hook=_duplicate_rejecting_pairs)
    except json.JSONDecodeError as exc:
        errors.add(
            label,
            f"malformed JSON at line {exc.lineno}, column {exc.colno}: {exc.msg}",
            artifact_path=label,
            problem_kind="malformed_json",
        )
        return None
    except ValueError as exc:
        errors.add(label, str(exc), artifact_path=label, problem_kind="malformed_json")
        return None
    _validate_redaction_json(loaded, errors, artifact_path=label)
    return loaded


def _read_text(path: Path, label: str, errors: ErrorCollector, *, required: bool = False) -> str:
    if not path.exists():
        if required:
            errors.add(label, f"missing text file at {path}", artifact_path=label, problem_kind="io_error")
        return ""
    try:
        text = path.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        errors.add(label, "text file is not valid UTF-8", artifact_path=label, problem_kind="io_error")
        return ""
    except OSError as exc:
        errors.add(label, f"unable to read text file: {exc.strerror or exc}", artifact_path=label, problem_kind="io_error")
        return ""
    _validate_redaction_text(text, label, errors)
    return text


def _relative_path(value: Any, default: Path) -> Path:
    if not _non_empty_string(value):
        return default
    return Path(str(value))


def _resolve_repo_path(root: Path, path: Path) -> Path:
    """Resolve a ledger-supplied path only if it stays inside root."""
    if path.is_absolute() or ".." in path.parts:
        raise ValueError("path must be repository-relative and must not contain traversal")
    root_resolved = root.resolve()
    resolved = (root_resolved / path).resolve()
    try:
        resolved.relative_to(root_resolved)
    except ValueError as exc:
        raise ValueError("path must stay inside repository root") from exc
    return resolved


def _validate_common_metadata(payload: Mapping[str, Any], errors: ErrorCollector) -> None:
    if payload.get("schema_version") != SCHEMA_VERSION:
        errors.add("schema_version", f"must be {SCHEMA_VERSION!r}", validation_class="Contract", problem_kind="contract_drift")
    if payload.get("artifact_type") != ARTIFACT_TYPE:
        errors.add("artifact_type", f"must be {ARTIFACT_TYPE!r}", validation_class="Contract", problem_kind="contract_drift")
    if payload.get("milestone") != "M004-osbua3":
        errors.add("milestone", "must be 'M004-osbua3'", validation_class="Contract", problem_kind="contract_drift")
    if payload.get("slice") != "S06":
        errors.add("slice", "must be 'S06'", validation_class="Contract", problem_kind="contract_drift")
    if payload.get("validation_round") != 1:
        errors.add("validation_round", "must be integer 1", validation_class="Contract", problem_kind="contract_drift")
    if not _parse_timestamp(payload.get("generated_at")):
        errors.add("generated_at", "must be an ISO-8601 timestamp", validation_class="Contract", problem_kind="contract_drift")
    source = payload.get("source_of_truth")
    if not _bounded_string(source, minimum=40, maximum=2000):
        errors.add("source_of_truth", "must be a bounded non-empty source-of-truth description", validation_class="Contract", problem_kind="contract_drift")
    elif "S05" not in str(source) or "M004" not in str(source):
        errors.add("source_of_truth", "must reference local M004/S05 evidence context", validation_class="Contract", problem_kind="contract_drift")


def _record_requirement_id(record: Mapping[str, Any], index: int) -> str:
    return str(record.get("requirement_id") or record.get("id") or f"record[{index}]")


def _validate_requirement_records(payload: Mapping[str, Any], errors: ErrorCollector) -> None:
    records = _as_sequence(payload.get("requirements"))
    if not records:
        errors.add("requirements", "must be a non-empty array", validation_class="Contract", problem_kind="contract_drift")
        return
    seen: set[str] = set()
    for index, raw_record in enumerate(records):
        if not isinstance(raw_record, Mapping):
            errors.add(f"requirements[{index}]", "record must be an object", validation_class="Contract", problem_kind="contract_drift")
            continue
        record = _as_mapping(raw_record)
        rid = _record_requirement_id(record, index)
        if rid in seen:
            errors.add(
                f"requirements[{index}].requirement_id",
                "duplicate requirement ID",
                requirement_id=rid,
                validation_class="Contract",
                problem_kind="contract_drift",
            )
        seen.add(rid)
        if rid not in REQUIRED_REQUIREMENTS:
            errors.add(
                f"requirements[{index}].requirement_id",
                "unknown requirement ID",
                requirement_id=rid,
                validation_class="Contract",
                problem_kind="contract_drift",
            )
            continue
        _validate_requirement_record(record, rid, index, errors)
    expected = set(REQUIRED_REQUIREMENT_IDS)
    missing = sorted(expected - seen)
    extra = sorted(seen - expected)
    if missing:
        errors.add(
            "requirements",
            f"missing requirement IDs: {', '.join(missing)}",
            requirement_id=missing[0],
            validation_class="Contract",
            problem_kind="contract_drift",
        )
    if extra:
        errors.add(
            "requirements",
            f"unexpected requirement IDs: {', '.join(extra)}",
            requirement_id=extra[0],
            validation_class="Contract",
            problem_kind="contract_drift",
        )


def _validate_requirement_record(record: Mapping[str, Any], rid: str, index: int, errors: ErrorCollector) -> None:
    if record.get("status") != "validated":
        errors.add("status", "must be validated", requirement_id=rid, validation_class="Contract", problem_kind="contract_drift")
    if record.get("coverage_status") != "covered":
        errors.add("coverage_status", "must be covered", requirement_id=rid, validation_class="Contract", problem_kind="coverage_gap")
    if record.get("requirement_class") != ALLOWED_REQUIREMENT_CLASSES[rid]:
        errors.add(
            "requirement_class",
            f"must be {ALLOWED_REQUIREMENT_CLASSES[rid]!r}",
            requirement_id=rid,
            validation_class="Contract",
            problem_kind="contract_drift",
        )
    if not _bounded_string(record.get("canonical_requirement_text"), minimum=60, maximum=MAX_CANONICAL_TEXT_CHARS):
        errors.add(
            "canonical_requirement_text",
            "must be bounded non-empty canonical text",
            requirement_id=rid,
            validation_class="Contract",
            problem_kind="contract_drift",
        )
    if record.get("m004_disposition") != "covered_in_m004":
        errors.add(
            "m004_disposition",
            "must be covered_in_m004",
            requirement_id=rid,
            validation_class="Integration",
            problem_kind="coverage_gap",
        )
    if not _bounded_string(record.get("coverage_summary"), minimum=MIN_SUMMARY_CHARS, maximum=MAX_SUMMARY_CHARS):
        errors.add(
            "coverage_summary",
            f"must be {MIN_SUMMARY_CHARS}-{MAX_SUMMARY_CHARS} characters",
            requirement_id=rid,
            validation_class="Integration",
            problem_kind="coverage_gap",
        )
    if record.get("live_runtime_capability_promoted") is not False:
        errors.add(
            "live_runtime_capability_promoted",
            "must be false; S06 is traceability-only",
            requirement_id=rid,
            validation_class="Operational",
            problem_kind="capability_promotion",
        )
    if record.get("runtime_proof_claimed") is True and rid != "R016":
        errors.add(
            "runtime_proof_claimed",
            "only R016 may reference conservative runtime posture proof",
            requirement_id=rid,
            validation_class="Operational",
            problem_kind="capability_promotion",
        )
    if rid == "R016":
        boundary = record.get("runtime_proof_boundary")
        if not _bounded_string(boundary, minimum=40, maximum=500) or "not live capability promotion" not in str(boundary).lower():
            errors.add(
                "runtime_proof_boundary",
                "R016 must state the conservative proof boundary and reject live capability promotion",
                requirement_id=rid,
                validation_class="Operational",
                problem_kind="capability_promotion",
            )
    _validate_owner_provenance(record, rid, errors)
    _validate_citations(record, rid, index, errors)


def _validate_owner_provenance(record: Mapping[str, Any], rid: str, errors: ErrorCollector) -> None:
    provenance = _as_mapping(record.get("primary_owner_provenance"))
    if not provenance:
        errors.add(
            "primary_owner_provenance",
            "missing owner provenance block",
            requirement_id=rid,
            validation_class="Contract",
            problem_kind="ownership_drift",
        )
        return
    origin = provenance.get("origin")
    if rid in M004_ORIGINATED_REQUIREMENTS:
        if origin != "m004_originated":
            errors.add(
                "primary_owner_provenance.origin",
                "R015 must remain M004-originated",
                requirement_id=rid,
                validation_class="Contract",
                problem_kind="ownership_drift",
            )
    elif rid in INHERITED_REQUIREMENTS and origin != "inherited":
        errors.add(
            "primary_owner_provenance.origin",
            "inherited requirement must keep inherited origin",
            requirement_id=rid,
            validation_class="Contract",
            problem_kind="ownership_drift",
        )
    if provenance.get("owner_normalized_to_s06") is not False:
        errors.add(
            "primary_owner_provenance.owner_normalized_to_s06",
            "S06 must not normalize ownership to itself",
            requirement_id=rid,
            validation_class="Contract",
            problem_kind="ownership_drift",
        )
    if not _bounded_string(provenance.get("existing_primary_owner_text"), minimum=20, maximum=600):
        errors.add(
            "primary_owner_provenance.existing_primary_owner_text",
            "must preserve explicit owner provenance text",
            requirement_id=rid,
            validation_class="Contract",
            problem_kind="ownership_drift",
        )
    if not _bounded_string(provenance.get("owner_reconciliation"), minimum=30, maximum=800):
        errors.add(
            "primary_owner_provenance.owner_reconciliation",
            "must explain owner reconciliation without reassigning to S06",
            requirement_id=rid,
            validation_class="Contract",
            problem_kind="ownership_drift",
        )


def _validate_citations(record: Mapping[str, Any], rid: str, index: int, errors: ErrorCollector) -> None:
    citations = _as_sequence(record.get("evidence_citations"))
    if not citations:
        errors.add(
            "evidence_citations",
            "must include bounded coverage citations",
            requirement_id=rid,
            validation_class="Integration",
            problem_kind="coverage_gap",
        )
        return
    classes_seen: set[str] = set()
    for citation_index, raw_citation in enumerate(citations):
        if not isinstance(raw_citation, Mapping):
            errors.add(
                f"evidence_citations[{citation_index}]",
                "citation must be an object",
                requirement_id=rid,
                validation_class="Integration",
                problem_kind="coverage_gap",
            )
            continue
        citation = _as_mapping(raw_citation)
        validation_class = str(citation.get("validation_class") or "")
        problem_kind = str(citation.get("problem_kind") or "")
        path = str(citation.get("path") or "")
        effective_class = validation_class if validation_class in ALLOWED_VALIDATION_CLASSES else "Contract"
        effective_kind = problem_kind if problem_kind in ALLOWED_PROBLEM_KINDS else "coverage_gap"
        if validation_class not in ALLOWED_VALIDATION_CLASSES:
            errors.add(
                f"evidence_citations[{citation_index}].validation_class",
                "invalid validation class",
                requirement_id=rid,
                validation_class="Contract",
                artifact_path=path or DEFAULT_LEDGER_PATH,
                problem_kind="contract_drift",
            )
        else:
            classes_seen.add(validation_class)
        if problem_kind not in ALLOWED_PROBLEM_KINDS:
            errors.add(
                f"evidence_citations[{citation_index}].problem_kind",
                "invalid problem kind",
                requirement_id=rid,
                validation_class=effective_class,
                artifact_path=path or DEFAULT_LEDGER_PATH,
                problem_kind="contract_drift",
            )
        if not _bounded_string(path, minimum=1, maximum=300):
            errors.add(
                f"evidence_citations[{citation_index}].path",
                "citation path is required and bounded",
                requirement_id=rid,
                validation_class=effective_class,
                artifact_path=path or DEFAULT_LEDGER_PATH,
                problem_kind=effective_kind,
            )
        if not _bounded_string(citation.get("note"), minimum=20, maximum=MAX_CITATION_NOTE_CHARS):
            errors.add(
                f"evidence_citations[{citation_index}].note",
                "citation note is required and bounded",
                requirement_id=rid,
                validation_class=effective_class,
                artifact_path=path or DEFAULT_LEDGER_PATH,
                problem_kind=effective_kind,
            )
    missing_classes = sorted(REQUIRED_VALIDATION_CLASSES - classes_seen)
    if missing_classes:
        errors.add(
            "evidence_citations",
            f"missing validation classes: {', '.join(missing_classes)}",
            requirement_id=rid,
            validation_class="Integration",
            problem_kind="coverage_gap",
        )


def _validate_safety_block(payload: Mapping[str, Any], errors: ErrorCollector) -> None:
    safety = _as_mapping(payload.get("safety"))
    if not safety:
        errors.add("safety", "missing S06 safety block", validation_class="Operational", problem_kind="coverage_gap")
        return
    expected_ids = _as_sequence(safety.get("required_requirement_ids"))
    if list(expected_ids) != list(REQUIRED_REQUIREMENT_IDS):
        errors.add(
            "safety.required_requirement_ids",
            f"must be exactly {', '.join(REQUIRED_REQUIREMENT_IDS)} in order",
            validation_class="Contract",
            problem_kind="contract_drift",
        )
    true_keys = (
        "traceability_only",
        "requirements_validated",
        "requirements_covered",
        "r015_m004_originated_preserved",
        "inherited_owner_provenance_preserved",
        "runtime_proof_boundary_preserved",
        "no_capability_promotions",
        "local_json_only",
    )
    for key in true_keys:
        if safety.get(key) is not True:
            errors.add(f"safety.{key}", "must be true", validation_class="Operational", problem_kind="coverage_gap")
    false_keys = (
        "ownership_normalized_to_s06",
        "requirements_broadened",
        "success_criteria_broadened",
        "live_runtime_capability_promoted",
        "blocker_evidence_promoted",
        "network_access_required",
        "secret_like_values_copied",
        "plaintext_credentials_logged",
    )
    for key in false_keys:
        if safety.get(key) is not False:
            problem_kind = "capability_promotion" if key in {"live_runtime_capability_promoted", "blocker_evidence_promoted"} else "coverage_gap"
            if key in {"secret_like_values_copied", "plaintext_credentials_logged"}:
                problem_kind = "secret_leak"
            errors.add(f"safety.{key}", "must be false", validation_class="Operational", problem_kind=problem_kind)
    promotions = safety.get("capability_promotions")
    if promotions != []:
        errors.add(
            "safety.capability_promotions",
            "runtime capability promotions are forbidden for S06",
            validation_class="Operational",
            problem_kind="capability_promotion",
        )


def _validate_final_docs(payload: Mapping[str, Any], root: Path, errors: ErrorCollector) -> None:
    """Final phase checks reviewer-facing local artifacts referenced by the ledger."""

    inputs = _as_mapping(payload.get("inputs"))
    required_paths = [
        _relative_path(inputs.get("m004_summary_path"), Path(".gsd/milestones/M004-osbua3/M004-osbua3-SUMMARY.md")),
        _relative_path(inputs.get("s05_summary_path"), Path(".gsd/milestones/M004-osbua3/slices/S05/S05-SUMMARY.md")),
    ]
    resolved_paths: list[Path] = []
    for path in required_paths:
        try:
            resolved_paths.append(_resolve_repo_path(root, path))
        except ValueError as exc:
            errors.add(
                str(path),
                str(exc),
                validation_class="UAT",
                artifact_path=str(path),
                problem_kind="io_error",
            )
    combined = "\n".join(_read_text(path, str(path), errors, required=True) for path in resolved_paths).lower()
    for rid in REQUIRED_REQUIREMENT_IDS:
        if rid.lower() not in combined:
            errors.add(
                rid,
                f"final docs must mention {rid}",
                requirement_id=rid,
                validation_class="UAT",
                artifact_path="final-docs",
                problem_kind="uat_readability",
            )
    for phrase in ("covered", "validated"):
        if phrase not in combined:
            errors.add(
                phrase,
                f"final docs must mention {phrase!r}",
                validation_class="UAT",
                artifact_path="final-docs",
                problem_kind="uat_readability",
            )


def validate_payload(payload: Mapping[str, Any], *, root: Path = ROOT, phase: str = "ledger") -> tuple[list[str], str]:
    """Return (errors, classification) for an already-loaded M004/S06 ledger."""

    errors = ErrorCollector()
    root = root.resolve()
    if phase not in ALLOWED_PHASES:
        errors.add("phase", "must be 'ledger' or 'final'", validation_class="Contract", problem_kind="contract_drift")
        return errors.errors, "invalid"
    _validate_redaction_json(payload, errors)
    _validate_common_metadata(payload, errors)
    _validate_requirement_records(payload, errors)
    _validate_safety_block(payload, errors)
    if phase == "final":
        _validate_final_docs(payload, root, errors)
    classification = "coverage_ledger" if phase == "ledger" else "final_ready"
    if errors.errors:
        return errors.errors, "invalid"
    return errors.errors, classification


def validate(ledger_path: Path | None = None, *, root: Path = ROOT, phase: str = "ledger") -> tuple[list[str], str]:
    """Return (errors, classification) for an M004/S06 coverage ledger file."""

    root = root.resolve()
    relative_or_absolute = ledger_path or DEFAULT_LEDGER_PATH
    path = relative_or_absolute if relative_or_absolute.is_absolute() else root / relative_or_absolute
    load_errors = ErrorCollector()
    loaded = _load_json(path, str(relative_or_absolute), load_errors)
    if not isinstance(loaded, Mapping):
        load_errors.add("ledger", "top-level JSON value must be an object", artifact_path=relative_or_absolute, problem_kind="malformed_json")
        return load_errors.errors, "invalid"
    errors, classification = validate_payload(loaded, root=root, phase=phase)
    combined = [*load_errors.errors, *errors]
    if combined:
        return combined, "invalid"
    return combined, classification


def write_audit(path: Path, root: Path, ledger_path: Path, phase: str, errors: Sequence[str], classification: str) -> None:
    payload = {
        "schema_version": AUDIT_SCHEMA_VERSION,
        "artifact_type": "validator-audit",
        "generated_at": _utc_now(),
        "milestone": "M004-osbua3",
        "slice": "S06",
        "phase": phase,
        "classification": classification,
        "passed": not errors,
        "inputs": {"ledger_path": str(ledger_path)},
        "diagnostics": {"error_count": len(errors), "errors": list(errors)},
        "failure_visibility": {
            "diagnostics_include_requirement_id": True,
            "diagnostics_include_validation_class": True,
            "diagnostics_include_artifact_path": True,
            "diagnostics_include_problem_kind": True,
            "allowed_problem_kinds": sorted(ALLOWED_PROBLEM_KINDS),
        },
        "load_profile": {
            "network_access": False,
            "subprocesses": False,
            "complexity": "O(number_of_requirements + citation_count + final_doc_bytes_when_phase_final)",
            "expected_requirement_count": len(REQUIRED_REQUIREMENT_IDS),
        },
        "posture": {
            "required_requirements": list(REQUIRED_REQUIREMENT_IDS),
            "traceability_only": True,
            "runtime_capability_promotions_allowed": False,
            "plaintext_credentials_allowed": False,
        },
    }
    target = path if path.is_absolute() else root / path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=ROOT)
    parser.add_argument("--ledger", type=Path, default=DEFAULT_LEDGER_PATH)
    parser.add_argument("--phase", choices=sorted(ALLOWED_PHASES), default="ledger")
    parser.add_argument("--write-audit", nargs="?", const=DEFAULT_AUDIT_PATH, type=Path)
    args = parser.parse_args(argv)

    errors, classification = validate(args.ledger, root=args.root, phase=args.phase)
    if args.write_audit:
        write_audit(args.write_audit, args.root, args.ledger, args.phase, errors, classification)
    if errors:
        for error in errors:
            print(f"ERROR: {error}", file=sys.stderr)
        return 1
    print(f"M004 S06 requirement coverage validation passed: {classification}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
