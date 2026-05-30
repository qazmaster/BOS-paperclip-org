#!/usr/bin/env python3
"""Validate S13 requirement coverage ledger for active R012-R015.

This validator is standard-library-only and fail-closed. It validates a local
coverage ledger against the canonical requirement text embedded in the S13 task
plan and against the existing M002 S12 approved-rescope/no-promotion posture.
It performs only local filesystem reads of JSON/Markdown artifacts; it performs
no network, subprocess, shell, or database access.
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
SCHEMA_VERSION = "s13-requirement-coverage/v1"
AUDIT_SCHEMA_VERSION = "s13-requirement-coverage-validation/v1"
ARTIFACT_TYPE = "requirement-coverage-ledger"
DEFAULT_LEDGER_PATH = Path("runtime-evidence/M002-S13-requirement-coverage.json")
DEFAULT_S12_DISPOSITION_PATH = Path("runtime-evidence/M002-S12-runtime-proof-or-rescope.json")
DEFAULT_S12_CLOSEOUT_PATH = Path("runtime-evidence/M002-S12-validation-closeout.json")

ALLOWED_PHASES = {"ledger", "final"}
ALLOWED_REQUIREMENT_CLASSES = {
    "R012": "constraint",
    "R013": "compliance/security",
    "R014": "compliance/security",
    "R015": "core-capability",
}
ALLOWED_DISPOSITIONS = {"out_of_scope_for_m002", "inherited_no_scope_change"}
ALLOWED_VALIDATION_CLASSES = {"Contract", "Integration", "Operational", "UAT"}
ALLOWED_PROBLEM_KINDS = {"contract_drift", "documentation_mismatch", "operational_posture", "uat_readability"}
REQUIRED_OWNER_SLICE = "M004-osbua3"
REQUIRED_REQUIREMENTS: dict[str, str] = {
    "R012": "R012 active constraint: The canonical v1.4.1 division map must be the active company and org contract; legacy v1.3 division names may appear only in historical/deprecated context. Primary owning slice: M004-osbua3. Validation: active company template, AGENTS profiles, validators, and plugin contracts all use v1.4.1 division ids; deprecated ids remain only in historical notes or deprecated sections.",
    "R013": "R013 active compliance/security: Only Div6.External may interact with the external world; internal divisions must not receive raw web, API, customer, or vendor tools. Primary owning slice: M004-osbua3. Validation: tool permission matrix blocks external IO for Div1, Div2, Div3, Div4, Div5, and Div7; external requests route via Div1 and execute by Div6.",
    "R014": "R014 active compliance/security: Div5.QualificationsLibraryLearning must quarantine, validate, and sanitize raw external evidence before any internal division can consume it. Primary owning slice: M004-osbua3. Validation: ExternalEvidencePacket flows into a Div5-approved SanitizedKnowledgePacket before internal use.",
    "R015": "R015 active core-capability: Div1.HCO must own routing, escalation, Circuit Breaker control, and staffing/workload coordination while routine routing remains automated under Div1 policy. Primary owning slice: M004-osbua3. Validation: routing docs and contracts show Div1.HCO as policy owner; deterministic automation handles routine routes; escalations and staffing changes route through Div1.",
}

SECRET_KEY_RE = re.compile(
    r"(?:secret|token|password|passwd|api[_-]?key|credential|private[_-]?key|authorization|bearer)",
    re.IGNORECASE,
)
SECRET_VALUE_RE = re.compile(
    r"("
    r"-----BEGIN (?:RSA |DSA |EC |OPENSSH |)?PRIVATE KEY-----|"
    r"sk-[A-Za-z0-9_\-]{8,}|"
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
    """Collect concise diagnostics without credential values."""

    def __init__(self) -> None:
        self.errors: list[str] = []

    def add(
        self,
        context: str,
        message: str,
        *,
        requirement_id: str = "S13",
        validation_class: str = "Operational",
        artifact_path: str | Path = DEFAULT_LEDGER_PATH,
        problem_kind: str = "operational_posture",
    ) -> None:
        self.errors.append(
            f"[{requirement_id}][{validation_class}][{artifact_path}][{problem_kind}] {context}: {message}"
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
            errors.add(path, "secret-like string value is not redacted", artifact_path=artifact_path)
        if key is None or not SECRET_KEY_RE.search(key):
            continue
        if _flag_false_or_empty(child):
            continue
        if isinstance(child, str) and _is_safe_secret_reference(child):
            continue
        errors.add(path, "secret-like field must be false, empty, redacted, or a safe secret reference", artifact_path=artifact_path)


def _validate_redaction_text(text: str, label: str, errors: ErrorCollector) -> None:
    if SECRET_VALUE_RE.search(text):
        errors.add(label, "secret-like text value is not redacted", artifact_path=label)


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
            errors.add(label, f"missing JSON file at {path}", artifact_path=label)
        return None
    try:
        raw = path.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        errors.add(label, "JSON file is not valid UTF-8 text", artifact_path=label)
        return None
    except OSError as exc:
        errors.add(label, f"unable to read JSON file: {exc.strerror or exc}", artifact_path=label)
        return None
    try:
        loaded = json.loads(raw, object_pairs_hook=_duplicate_rejecting_pairs)
    except json.JSONDecodeError as exc:
        errors.add(label, f"malformed JSON at line {exc.lineno}, column {exc.colno}: {exc.msg}", artifact_path=label)
        return None
    except ValueError as exc:
        errors.add(label, str(exc), artifact_path=label)
        return None
    _validate_redaction_json(loaded, errors, artifact_path=label)
    return loaded


def _read_text(path: Path, label: str, errors: ErrorCollector, *, required: bool = False) -> str:
    if not path.exists():
        if required:
            errors.add(label, f"missing text file at {path}", artifact_path=label)
        return ""
    try:
        text = path.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        errors.add(label, "text file is not valid UTF-8", artifact_path=label)
        return ""
    except OSError as exc:
        errors.add(label, f"unable to read text file: {exc.strerror or exc}", artifact_path=label)
        return ""
    _validate_redaction_text(text, label, errors)
    return text


def _relative_path(value: Any, default: Path) -> Path:
    if not _non_empty_string(value):
        return default
    return Path(str(value))


def _resolve(root: Path, path: Path) -> Path:
    return path if path.is_absolute() else root / path


def _validate_common_metadata(payload: Mapping[str, Any], errors: ErrorCollector) -> None:
    if payload.get("schema_version") != SCHEMA_VERSION:
        errors.add("schema_version", f"must be {SCHEMA_VERSION!r}", validation_class="Contract", problem_kind="contract_drift")
    if payload.get("artifact_type") != ARTIFACT_TYPE:
        errors.add("artifact_type", f"must be {ARTIFACT_TYPE!r}", validation_class="Contract", problem_kind="contract_drift")
    if payload.get("milestone") != "M002":
        errors.add("milestone", "must be 'M002'", validation_class="Contract", problem_kind="contract_drift")
    if payload.get("slice") != "S13":
        errors.add("slice", "must be 'S13'", validation_class="Contract", problem_kind="contract_drift")
    if payload.get("validation_round") != 1:
        errors.add("validation_round", "must be integer 1", validation_class="Contract", problem_kind="contract_drift")
    if not _parse_timestamp(payload.get("generated_at")):
        errors.add("generated_at", "must be an ISO-8601 timestamp", validation_class="Contract", problem_kind="contract_drift")
    source = payload.get("source_of_truth")
    if not _non_empty_string(source) or "GSD requirements" not in str(source):
        errors.add("source_of_truth", "must reference the GSD requirements store context", validation_class="Contract", problem_kind="contract_drift")


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
            errors.add(f"requirements[{index}].requirement_id", "duplicate requirement ID", requirement_id=rid, validation_class="Contract", problem_kind="contract_drift")
        seen.add(rid)
        if rid not in REQUIRED_REQUIREMENTS:
            errors.add(f"requirements[{index}].requirement_id", "unknown requirement ID", requirement_id=rid, validation_class="Contract", problem_kind="contract_drift")
            continue
        expected_text = REQUIRED_REQUIREMENTS[rid]
        if record.get("canonical_requirement_text") != expected_text:
            errors.add("canonical_requirement_text", "requirement text drifted from canonical S13 task text", requirement_id=rid, validation_class="Contract", problem_kind="contract_drift")
        if record.get("status") != "active":
            errors.add("status", "must be active", requirement_id=rid, validation_class="Contract", problem_kind="contract_drift")
        if record.get("requirement_class") != ALLOWED_REQUIREMENT_CLASSES[rid]:
            errors.add("requirement_class", f"must be {ALLOWED_REQUIREMENT_CLASSES[rid]!r}", requirement_id=rid, validation_class="Contract", problem_kind="contract_drift")
        if record.get("primary_owning_slice") != REQUIRED_OWNER_SLICE:
            errors.add("primary_owning_slice", f"must be {REQUIRED_OWNER_SLICE!r}", requirement_id=rid, validation_class="Contract", problem_kind="contract_drift")
        disposition = record.get("m002_disposition")
        if disposition not in ALLOWED_DISPOSITIONS:
            errors.add("m002_disposition", "must not claim M002 runtime validation; use an out-of-scope/no-scope-change disposition", requirement_id=rid, validation_class="Operational", problem_kind="operational_posture")
        if record.get("runtime_proof_claimed") is True or record.get("validated_by_m002_runtime") is True:
            errors.add("runtime_proof_claimed", "M002 must not claim runtime proof for R012-R015", requirement_id=rid, validation_class="Operational", problem_kind="operational_posture")
        _validate_citations(record, rid, errors)
    expected = set(REQUIRED_REQUIREMENTS)
    missing = sorted(expected - seen)
    extra = sorted(seen - expected)
    if missing:
        errors.add("requirements", f"missing requirement IDs: {', '.join(missing)}", requirement_id=missing[0], validation_class="Contract", problem_kind="contract_drift")
    if extra:
        errors.add("requirements", f"unexpected requirement IDs: {', '.join(extra)}", requirement_id=extra[0], validation_class="Contract", problem_kind="contract_drift")


def _validate_citations(record: Mapping[str, Any], rid: str, errors: ErrorCollector) -> None:
    citations = _as_sequence(record.get("evidence_citations"))
    if not citations:
        errors.add("evidence_citations", "must include at least one citation", requirement_id=rid, validation_class="Integration", problem_kind="documentation_mismatch")
        return
    classes_seen: set[str] = set()
    for index, raw_citation in enumerate(citations):
        citation = _as_mapping(raw_citation)
        validation_class = str(citation.get("validation_class") or "")
        problem_kind = str(citation.get("problem_kind") or "")
        path = str(citation.get("path") or "")
        if validation_class not in ALLOWED_VALIDATION_CLASSES:
            errors.add(f"evidence_citations[{index}].validation_class", "invalid validation class", requirement_id=rid, validation_class="Contract", problem_kind="contract_drift")
        else:
            classes_seen.add(validation_class)
        if problem_kind not in ALLOWED_PROBLEM_KINDS:
            errors.add(f"evidence_citations[{index}].problem_kind", "invalid problem kind", requirement_id=rid, validation_class=validation_class if validation_class in ALLOWED_VALIDATION_CLASSES else "Contract", problem_kind="contract_drift")
        if not _non_empty_string(path):
            errors.add(f"evidence_citations[{index}].path", "citation path is required", requirement_id=rid, validation_class=validation_class if validation_class in ALLOWED_VALIDATION_CLASSES else "Integration", problem_kind=problem_kind if problem_kind in ALLOWED_PROBLEM_KINDS else "documentation_mismatch")
        if not _non_empty_string(citation.get("note")):
            errors.add(f"evidence_citations[{index}].note", "citation note is required", requirement_id=rid, validation_class=validation_class if validation_class in ALLOWED_VALIDATION_CLASSES else "Integration", problem_kind=problem_kind if problem_kind in ALLOWED_PROBLEM_KINDS else "documentation_mismatch")
    if "Operational" not in classes_seen:
        errors.add("evidence_citations", "must include an Operational citation to S12 posture", requirement_id=rid, validation_class="Operational", problem_kind="operational_posture")


def _validate_safety_block(payload: Mapping[str, Any], root: Path, errors: ErrorCollector) -> None:
    safety = _as_mapping(payload.get("safety"))
    if not safety:
        errors.add("safety", "missing S12 safety posture block", validation_class="Operational", problem_kind="operational_posture")
        return
    if safety.get("preserves_s12_approved_rescope") is not True:
        errors.add("safety.preserves_s12_approved_rescope", "must preserve S12 approved_rescope", validation_class="Operational", problem_kind="operational_posture")
    if safety.get("no_capability_promotions") is not True:
        errors.add("safety.no_capability_promotions", "must explicitly preserve no capability promotions", validation_class="Operational", problem_kind="operational_posture")
    for key in ("blocker_evidence_promoted", "requirements_broadened", "success_criteria_broadened", "plaintext_credentials_logged"):
        if safety.get(key) is not False:
            errors.add(f"safety.{key}", "must be false", validation_class="Operational", problem_kind="operational_posture")
    promotions = safety.get("capability_promotions") or safety.get("unsupported_promotions") or []
    if promotions:
        errors.add("safety.capability_promotions", "runtime capability promotions are forbidden for S13", validation_class="Operational", problem_kind="operational_posture")

    inputs = _as_mapping(payload.get("inputs"))
    s12_disposition_path = _relative_path(
        safety.get("s12_disposition_path") or inputs.get("s12_runtime_proof_or_rescope_path"),
        DEFAULT_S12_DISPOSITION_PATH,
    )
    s12_closeout_path = _relative_path(
        safety.get("s12_validation_closeout_path") or inputs.get("s12_validation_closeout_path"),
        DEFAULT_S12_CLOSEOUT_PATH,
    )
    _validate_s12_disposition(root, s12_disposition_path, errors)
    _validate_s12_closeout(root, s12_closeout_path, errors)


def _validate_s12_disposition(root: Path, relative_path: Path, errors: ErrorCollector) -> None:
    loaded = _load_json(_resolve(root, relative_path), str(relative_path), errors)
    if not isinstance(loaded, Mapping):
        errors.add(str(relative_path), "S12 disposition is missing or malformed; S13 is blocked", artifact_path=relative_path)
        return
    if loaded.get("outcome") != "approved_rescope":
        errors.add("outcome", "S12 disposition must remain approved_rescope", artifact_path=relative_path)
    approved = _as_mapping(loaded.get("approved_rescope"))
    if not approved:
        errors.add("approved_rescope", "missing S12 approved_rescope block", artifact_path=relative_path)
    else:
        if approved.get("no_capability_promotions") is not True:
            errors.add("approved_rescope.no_capability_promotions", "must be true", artifact_path=relative_path)
        requirement_ids = {str(item) for item in _as_sequence(approved.get("requirement_ids"))}
        if requirement_ids != {"R009", "R010", "R011"}:
            errors.add("approved_rescope.requirement_ids", "S12 rescope must remain scoped to R009/R010/R011", artifact_path=relative_path)
    no_promotion = _as_mapping(loaded.get("no_promotion"))
    for key in ("blocker_evidence_promoted", "requirements_broadened", "success_criteria_broadened"):
        if no_promotion.get(key) is not False:
            errors.add(f"no_promotion.{key}", "must be false", artifact_path=relative_path)
    unsupported = no_promotion.get("unsupported_promotions") or loaded.get("capability_promotions") or []
    if unsupported:
        errors.add("no_promotion.unsupported_promotions", "must be empty", artifact_path=relative_path)
    diagnostics = _as_mapping(loaded.get("diagnostics"))
    if diagnostics.get("redacted") is not True:
        errors.add("diagnostics.redacted", "must be true", artifact_path=relative_path)


def _validate_s12_closeout(root: Path, relative_path: Path, errors: ErrorCollector) -> None:
    loaded = _load_json(_resolve(root, relative_path), str(relative_path), errors)
    if not isinstance(loaded, Mapping):
        errors.add(str(relative_path), "S12 validation closeout is missing or malformed; S13 is blocked", artifact_path=relative_path)
        return
    if loaded.get("passed") is not True:
        errors.add("passed", "S12 validation closeout must remain passing", artifact_path=relative_path)
    if loaded.get("classification") != "approved_rescope":
        errors.add("classification", "S12 validation closeout must remain approved_rescope", artifact_path=relative_path)
    diagnostics = _as_mapping(loaded.get("diagnostics"))
    if diagnostics.get("error_count") not in (0, None):
        errors.add("diagnostics.error_count", "S12 closeout diagnostics must remain clean", artifact_path=relative_path)


def _validate_final_docs(payload: Mapping[str, Any], root: Path, errors: ErrorCollector) -> None:
    """Final phase checks reader-facing docs after T02 sync; ledger phase intentionally skips these."""

    inputs = _as_mapping(payload.get("inputs"))
    context_path = _relative_path(inputs.get("m002_context_path"), Path(".gsd/milestones/M002/M002-CONTEXT.md"))
    assessment_path = _relative_path(inputs.get("m002_assessment_path"), Path(".gsd/milestones/M002/M002-ASSESSMENT.md"))
    uat_path = _relative_path(inputs.get("s11_uat_path"), Path(".gsd/milestones/M002/slices/S11/S11-UAT.md"))
    required_phrases = {
        "R012": "R012",
        "R013": "R013",
        "R014": "R014",
        "R015": "R015",
        "out_of_scope": "out of scope",
        "no_promotion": "no-promotion",
    }
    combined = "\n".join(
        _read_text(_resolve(root, path), str(path), errors, required=True) for path in (context_path, assessment_path, uat_path)
    ).lower()
    for label, phrase in required_phrases.items():
        if phrase.lower() not in combined:
            errors.add(label, f"final docs must mention {phrase!r}", validation_class="UAT", artifact_path="final-docs", problem_kind="uat_readability")


def validate_payload(payload: Mapping[str, Any], *, root: Path = ROOT, phase: str = "ledger") -> tuple[list[str], str]:
    """Return (errors, classification) for an already-loaded S13 coverage ledger."""

    errors = ErrorCollector()
    root = root.resolve()
    if phase not in ALLOWED_PHASES:
        errors.add("phase", "must be 'ledger' or 'final'", validation_class="Contract", problem_kind="contract_drift")
        return errors.errors, "invalid"
    _validate_redaction_json(payload, errors)
    _validate_common_metadata(payload, errors)
    _validate_requirement_records(payload, errors)
    _validate_safety_block(payload, root, errors)
    if phase == "final":
        _validate_final_docs(payload, root, errors)
    if errors.errors:
        joined = "\n".join(errors.errors)
        classification = "blocked" if "S12" in joined or "approved_rescope" in joined else "invalid"
    else:
        classification = "coverage_ledger" if phase == "ledger" else "final_ready"
    return errors.errors, classification


def validate(ledger_path: Path | None = None, *, root: Path = ROOT, phase: str = "ledger") -> tuple[list[str], str]:
    """Return (errors, classification) for an S13 coverage ledger file."""

    root = root.resolve()
    relative_or_absolute = ledger_path or DEFAULT_LEDGER_PATH
    path = relative_or_absolute if relative_or_absolute.is_absolute() else root / relative_or_absolute
    load_errors = ErrorCollector()
    loaded = _load_json(path, str(relative_or_absolute), load_errors)
    if not isinstance(loaded, Mapping):
        load_errors.add("ledger", "top-level JSON value must be an object", artifact_path=relative_or_absolute)
        return load_errors.errors, "invalid"
    errors, classification = validate_payload(loaded, root=root, phase=phase)
    combined = [*load_errors.errors, *errors]
    if load_errors.errors:
        return combined, "invalid"
    return combined, classification


def write_audit(path: Path, root: Path, ledger_path: Path, phase: str, errors: Sequence[str], classification: str) -> None:
    payload = {
        "schema_version": AUDIT_SCHEMA_VERSION,
        "artifact_type": "validator-audit",
        "generated_at": _utc_now(),
        "milestone": "M002",
        "slice": "S13",
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
        "posture": {
            "required_requirements": sorted(REQUIRED_REQUIREMENTS),
            "s12_approved_rescope_preserved": not errors,
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
    parser.add_argument("--write-audit", type=Path)
    args = parser.parse_args(argv)

    errors, classification = validate(args.ledger, root=args.root, phase=args.phase)
    if args.write_audit:
        write_audit(args.write_audit, args.root, args.ledger, args.phase, errors, classification)
    if errors:
        for error in errors:
            print(f"ERROR: {error}", file=sys.stderr)
        return 1
    print(f"S13 requirement coverage validation passed: {classification}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
