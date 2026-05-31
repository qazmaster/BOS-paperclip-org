#!/usr/bin/env python3
"""Validate the M004 S08 requirement scope reconciliation ledger.

This validator is standard-library-only and fail-closed. It validates the local
M004/S08 requirement scope reconciliation ledger for completeness, citation
existence, secret safety, and posture assertions. It performs only local file
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
SCHEMA_VERSION = "m004-s08-requirement-scope-reconciliation/v1"
AUDIT_SCHEMA_VERSION = "m004-s08-requirement-scope-reconciliation-validation/v1"
ARTIFACT_TYPE = "requirement-scope-reconciliation-ledger"
DEFAULT_LEDGER_PATH = Path("runtime-evidence/M004-S08-requirement-scope-reconciliation.json")
DEFAULT_AUDIT_PATH = Path("runtime-evidence/M004-S08-scope-reconciliation-validation.json")

ALLOWED_PHASES = {"ledger", "final"}
REQUIRED_REQUIREMENT_IDS = ("R003", "R008", "R009", "R010", "R011")
REQUIRED_REQUIREMENTS = set(REQUIRED_REQUIREMENT_IDS)

ALLOWED_STATUSES = {"active", "validated"}
ALLOWED_DISPOSITIONS = {
    "traceability_only_out_of_scope_for_m004",
    "validated_no_reopen_needed",
}

EXPECTED_DISPOSITIONS = {
    "R003": "traceability_only_out_of_scope_for_m004",
    "R008": "traceability_only_out_of_scope_for_m004",
    "R009": "validated_no_reopen_needed",
    "R010": "validated_no_reopen_needed",
    "R011": "validated_no_reopen_needed",
}

EXPECTED_STATUSES = {
    "R003": "active",
    "R008": "active",
    "R009": "validated",
    "R010": "validated",
    "R011": "validated",
}

ALLOWED_REQUIREMENT_CLASSES = {
    "R003": "constraint",
    "R008": "constraint",
    "R009": "primary-user-loop",
    "R010": "primary-user-loop",
    "R011": "constraint",
}

REQUIRED_VALIDATION_CLASSES = {"Contract", "Integration", "Operational", "UAT"}
ALLOWED_VALIDATION_CLASSES = REQUIRED_VALIDATION_CLASSES
ALLOWED_PROBLEM_KINDS = {
    "requirement_definition",
    "coverage_gap_acknowledgment",
    "validated_requirement_preservation",
    "approved_rescope_disposition",
    "requirement_reaffirmation",
    "source_boundary_preservation",
    "approval_ownership_preservation",
    "approval_ownership_documentation",
    "circuit_breaker_documentation",
    "boundary_documentation",
    "safety_assertions",
    "regression_closure_proof",
    # Forward-compatible diagnostic buckets.
    "contract_drift",
    "coverage_gap",
    "ownership_drift",
    "capability_promotion",
    "secret_leak",
    "malformed_json",
    "io_error",
    "uat_readability",
}

ACTIVE_REQUIREMENTS = {"R003", "R008"}
VALIDATED_REQUIREMENTS = {"R009", "R010", "R011"}
M003_OWNED_REQUIREMENTS = {"R003", "R008"}
M002_M003_VALIDATED_REQUIREMENTS = {"R009", "R010", "R011"}

REQUIRED_POSTURE_ASSERTIONS = {
    "r003_r008_active_m003_owned",
    "r003_r008_traceability_only_out_of_scope_for_m004",
    "r009_r010_r011_validated_no_reopen_needed",
    "r009_r010_r011_cited_from_m002_m003",
    "no_m004_requirement_ownership_reassigned",
    "no_m004_validated_requirements_reopened",
    "no_live_runtime_capability_promoted",
    "no_capability_promotions",
    "no_plaintext_credentials_logged",
    "citations_point_to_existing_local_evidence",
}

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
        requirement_id: str = "M004-S08",
    ) -> None:
        prefix = f"[{requirement_id}]" if requirement_id else ""
        self.errors.append(f"{prefix} {context}: {message}")

    @property
    def ok(self) -> bool:
        return not self.errors

    def as_dict(self) -> dict[str, Any]:
        return {
            "error_count": len(self.errors),
            "errors": self.errors,
        }


def _read_json(path: Path, errors: ErrorCollector, context: str) -> Any:
    """Read and parse a JSON file, returning None on failure."""
    try:
        text = path.read_text(encoding="utf-8")
    except FileNotFoundError:
        errors.add(context, f"file not found: {path}")
        return None
    except OSError as exc:
        errors.add(context, f"IO error reading {path}: {type(exc).__name__}")
        return None
    try:
        return json.loads(text)
    except json.JSONDecodeError as exc:
        errors.add(context, f"malformed JSON in {path}: {exc.msg} at line {exc.lineno}")
        return None


def _check_secret_safety(
    obj: Any,
    errors: ErrorCollector,
    context: str,
    *,
    path: str = "",
) -> None:
    """Recursively scan for secret-like keys or values."""
    if isinstance(obj, dict):
        for key, value in obj.items():
            child_path = f"{path}.{key}" if path else key
            if isinstance(key, str) and SECRET_KEY_RE.search(key):
                if value not in SAFE_SECRET_VALUES and not any(
                    str(value).startswith(p) for p in SAFE_SECRET_PREFIXES
                ):
                    # Check if the value looks like an actual secret
                    val_str = str(value)
                    if SECRET_VALUE_RE.search(val_str) and val_str not in SAFE_SECRET_VALUES:
                        errors.add(
                            context,
                            f"secret-like value detected at {child_path}",
                        )
            _check_secret_safety(value, errors, context, path=child_path)
    elif isinstance(obj, list):
        for idx, item in enumerate(obj):
            _check_secret_safety(item, errors, context, path=f"{path}[{idx}]")
    elif isinstance(obj, str):
        if SECRET_VALUE_RE.search(obj) and obj not in SAFE_SECRET_VALUES:
            errors.add(context, f"secret-like value detected at {path or '<root>'}")


def _validate_requirement_entry(
    req: Mapping[str, Any],
    errors: ErrorCollector,
    idx: int,
) -> None:
    """Validate a single requirement entry in the ledger."""
    rid = req.get("requirement_id")
    if not isinstance(rid, str):
        errors.add(f"requirements[{idx}]", "missing or non-string requirement_id")
        return
    ctx = f"requirements[{rid}]"

    # Status check
    status = req.get("status")
    if status not in ALLOWED_STATUSES:
        errors.add(ctx, f"status must be one of {ALLOWED_STATUSES}, got {status!r}")
    elif rid in EXPECTED_STATUSES and status != EXPECTED_STATUSES[rid]:
        errors.add(ctx, f"status must be {EXPECTED_STATUSES[rid]!r} for {rid}, got {status!r}")

    # Disposition check
    disposition = req.get("m004_disposition")
    if disposition not in ALLOWED_DISPOSITIONS:
        errors.add(ctx, f"m004_disposition must be one of {ALLOWED_DISPOSITIONS}, got {disposition!r}")
    elif rid in EXPECTED_DISPOSITIONS and disposition != EXPECTED_DISPOSITIONS[rid]:
        errors.add(ctx, f"m004_disposition must be {EXPECTED_DISPOSITIONS[rid]!r} for {rid}, got {disposition!r}")

    # Requirement class check
    req_class = req.get("requirement_class")
    if not isinstance(req_class, str) or not req_class:
        errors.add(ctx, "missing or empty requirement_class")
    elif rid in ALLOWED_REQUIREMENT_CLASSES and req_class != ALLOWED_REQUIREMENT_CLASSES[rid]:
        errors.add(ctx, f"requirement_class must be {ALLOWED_REQUIREMENT_CLASSES[rid]!r} for {rid}, got {req_class!r}")

    # Canonical text length check
    canonical = req.get("canonical_requirement_text", "")
    if not isinstance(canonical, str) or len(canonical) < 20:
        errors.add(ctx, "canonical_requirement_text is missing or too short")
    elif len(canonical) > MAX_CANONICAL_TEXT_CHARS:
        errors.add(ctx, f"canonical_requirement_text exceeds {MAX_CANONICAL_TEXT_CHARS} chars")

    # Coverage summary length check
    summary = req.get("m004_coverage_summary", "")
    if not isinstance(summary, str) or len(summary) < MIN_SUMMARY_CHARS:
        errors.add(ctx, f"m004_coverage_summary is missing or shorter than {MIN_SUMMARY_CHARS} chars")
    elif len(summary) > MAX_SUMMARY_CHARS:
        errors.add(ctx, f"m004_coverage_summary exceeds {MAX_SUMMARY_CHARS} chars")

    # Runtime proof must not be claimed
    if req.get("runtime_proof_claimed") is not False:
        errors.add(ctx, "runtime_proof_claimed must be false")
    if req.get("live_runtime_capability_promoted") is not False:
        errors.add(ctx, "live_runtime_capability_promoted must be false")

    # Owner provenance checks
    provenance = req.get("primary_owner_provenance", {})
    if not isinstance(provenance, Mapping):
        errors.add(ctx, "primary_owner_provenance must be an object")
    else:
        origin = provenance.get("origin")
        if rid in M003_OWNED_REQUIREMENTS and origin != "m003_owned":
            errors.add(ctx, f"origin must be 'm003_owned' for {rid}, got {origin!r}")
        if rid in M002_M003_VALIDATED_REQUIREMENTS and origin != "m002_m003_validated":
            errors.add(ctx, f"origin must be 'm002_m003_validated' for {rid}, got {origin!r}")
        if provenance.get("owner_normalized_to_s08") is not False:
            errors.add(ctx, "owner_normalized_to_s08 must be false (no ownership reassignment)")

    # Evidence citations check
    citations = req.get("evidence_citations")
    if not isinstance(citations, list) or len(citations) < 2:
        errors.add(ctx, "evidence_citations must be an array with at least 2 entries")
        return

    seen_classes: set[str] = set()
    for cidx, citation in enumerate(citations):
        if not isinstance(citation, Mapping):
            errors.add(ctx, f"evidence_citations[{cidx}] must be an object")
            continue

        # Path must be a non-empty string
        path = citation.get("path")
        if not isinstance(path, str) or not path:
            errors.add(ctx, f"evidence_citations[{cidx}].path must be a non-empty string")
        else:
            # Check path exists on disk
            full_path = ROOT / path
            if not full_path.exists():
                errors.add(ctx, f"evidence_citations[{cidx}].path does not exist on disk: {path}")

        # Validation class
        vclass = citation.get("validation_class")
        if vclass not in ALLOWED_VALIDATION_CLASSES:
            errors.add(
                ctx,
                f"evidence_citations[{cidx}].validation_class must be one of {ALLOWED_VALIDATION_CLASSES}, got {vclass!r}",
            )
        else:
            seen_classes.add(vclass)

        # Problem kind
        pkind = citation.get("problem_kind")
        if not isinstance(pkind, str) or not pkind:
            errors.add(ctx, f"evidence_citations[{cidx}].problem_kind must be a non-empty string")
        elif pkind not in ALLOWED_PROBLEM_KINDS:
            errors.add(
                ctx,
                f"evidence_citations[{cidx}].problem_kind {pkind!r} is not in allowed set",
            )

        # Note length
        note = citation.get("note", "")
        if not isinstance(note, str) or len(note) < 20:
            errors.add(ctx, f"evidence_citations[{cidx}].note is missing or too short")
        elif len(note) > MAX_CITATION_NOTE_CHARS:
            errors.add(ctx, f"evidence_citations[{cidx}].note exceeds {MAX_CITATION_NOTE_CHARS} chars")

    # Must have all four validation classes represented
    missing_classes = REQUIRED_VALIDATION_CLASSES - seen_classes
    if missing_classes:
        errors.add(ctx, f"missing validation classes in citations: {sorted(missing_classes)}")


def _validate_posture_assertions(
    assertions: Mapping[str, Any],
    errors: ErrorCollector,
) -> None:
    """Validate that all required posture assertions are present and true."""
    if not isinstance(assertions, Mapping):
        errors.add("posture_assertions", "must be an object")
        return

    for key in REQUIRED_POSTURE_ASSERTIONS:
        if key not in assertions:
            errors.add("posture_assertions", f"missing required assertion: {key}")
        elif assertions[key] is not True:
            errors.add("posture_assertions", f"assertion {key!r} must be true, got {assertions[key]!r}")


def _validate_safety_block(
    safety: Mapping[str, Any],
    errors: ErrorCollector,
) -> None:
    """Validate the safety block assertions."""
    if not isinstance(safety, Mapping):
        errors.add("safety", "must be an object")
        return

    required_true = {
        "traceability_only",
        "r003_r008_preserved_as_active",
        "r009_r010_r011_preserved_as_validated",
        "no_requirement_ownership_reassigned",
        "no_validated_requirements_reopened",
        "runtime_proof_boundary_preserved",
        "no_capability_promotions",
        "local_json_only",
    }
    required_false = {
        "requirements_broadened",
        "success_criteria_broadened",
        "live_runtime_capability_promoted",
        "secret_like_values_copied",
        "plaintext_credentials_logged",
        "network_access_required",
    }

    for key in required_true:
        if key not in safety:
            errors.add("safety", f"missing required field: {key}")
        elif safety[key] is not True:
            errors.add("safety", f"{key!r} must be true, got {safety[key]!r}")

    for key in required_false:
        if key not in safety:
            errors.add("safety", f"missing required field: {key}")
        elif safety[key] is not False:
            errors.add("safety", f"{key!r} must be false, got {safety[key]!r}")


def validate_ledger(
    ledger_path: Path,
    errors: ErrorCollector,
) -> dict[str, Any] | None:
    """Validate the reconciliation ledger and return parsed data."""
    data = _read_json(ledger_path, errors, "ledger")
    if data is None:
        return None

    # Top-level schema check
    if data.get("schema_version") != SCHEMA_VERSION:
        errors.add("ledger", f"schema_version must be {SCHEMA_VERSION!r}")
    if data.get("artifact_type") != ARTIFACT_TYPE:
        errors.add("ledger", f"artifact_type must be {ARTIFACT_TYPE!r}")
    if data.get("milestone") != "M004-osbua3":
        errors.add("ledger", "milestone must be 'M004-osbua3'")
    if data.get("slice") != "S08":
        errors.add("ledger", "slice must be 'S08'")

    # Secret safety scan on the whole document
    _check_secret_safety(data, errors, "ledger")

    # Requirements array check
    requirements = data.get("requirements")
    if not isinstance(requirements, list):
        errors.add("ledger", "requirements must be an array")
        return data

    # Check completeness
    found_ids = set()
    for idx, req in enumerate(requirements):
        rid = req.get("requirement_id") if isinstance(req, Mapping) else None
        if isinstance(rid, str):
            found_ids.add(rid)
        _validate_requirement_entry(req, errors, idx)

    missing = REQUIRED_REQUIREMENTS - found_ids
    extra = found_ids - REQUIRED_REQUIREMENTS
    if missing:
        errors.add("ledger", f"missing required requirements: {sorted(missing)}")
    if extra:
        errors.add("ledger", f"unexpected extra requirements: {sorted(extra)}")

    # Posture assertions check
    posture = data.get("posture_assertions")
    _validate_posture_assertions(posture, errors)

    # Safety block check
    safety = data.get("safety")
    _validate_safety_block(safety, errors)

    return data


def build_audit(
    ledger_path: Path,
    audit_path: Path,
    errors: ErrorCollector,
    *,
    write_audit: bool = False,
) -> dict[str, Any]:
    """Build and optionally write the validation audit."""
    passed = errors.ok
    audit = {
        "schema_version": AUDIT_SCHEMA_VERSION,
        "artifact_type": "requirement-scope-reconciliation-validation",
        "generated_at": datetime.now(UTC).isoformat().replace("+00:00", "Z"),
        "milestone": "M004-osbua3",
        "slice": "S08",
        "ledger_path": str(ledger_path),
        "audit_path": str(audit_path),
        "passed": passed,
        "classification": "final_ready" if passed else "failed",
        "diagnostics": errors.as_dict(),
        "requirements_checked": sorted(REQUIRED_REQUIREMENTS),
        "posture_assertions_checked": sorted(REQUIRED_POSTURE_ASSERTIONS),
    }
    if write_audit:
        audit_path.parent.mkdir(parents=True, exist_ok=True)
        audit_path.write_text(json.dumps(audit, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return audit


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--ledger",
        type=Path,
        default=DEFAULT_LEDGER_PATH,
        help="Path to the requirement scope reconciliation ledger JSON.",
    )
    parser.add_argument(
        "--phase",
        choices=sorted(ALLOWED_PHASES),
        default="final",
        help="Validation phase: 'ledger' validates the ledger only; 'final' also writes the audit file.",
    )
    parser.add_argument(
        "--write-audit",
        type=Path,
        default=DEFAULT_AUDIT_PATH,
        help="Path to write the validation audit JSON.",
    )
    args = parser.parse_args(argv)

    errors = ErrorCollector()
    validate_ledger(args.ledger, errors)

    write_audit = args.phase == "final"
    audit = build_audit(args.ledger, args.write_audit, errors, write_audit=write_audit)

    if errors.ok:
        print(
            f"S08 requirement scope reconciliation validation passed: "
            f"{args.ledger}"
        )
        return 0
    else:
        print(
            f"S08 requirement scope reconciliation validation failed: "
            f"{errors.errors[0] if errors.errors else 'unknown error'}",
            file=sys.stderr,
        )
        return 1


if __name__ == "__main__":
    sys.exit(main())
