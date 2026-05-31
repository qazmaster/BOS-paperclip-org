#!/usr/bin/env python3
"""Validate the M004 S07 restored validation evidence artifact package.

This validator is standard-library-only and fail-closed. It validates local
M004/S07 validation evidence restoration artifacts for presence, populated
Boundary Map content, R012-R016 traceability, S06 evidence citations, final
validation readiness, secret-safe diagnostics, and no live Paperclip runtime
capability promotion. It performs only local file reads/writes requested by the
caller; it performs no network, subprocess, shell, or database access.
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
SCHEMA_VERSION = "m004-s07-validation-artifacts/v1"
AUDIT_SCHEMA_VERSION = "m004-s07-validation-artifacts-validation/v1"
ARTIFACT_TYPE = "validation-artifact-package"
DEFAULT_AUDIT_PATH = Path("runtime-evidence/M004-S07-validation-artifacts-audit.json")

ALLOWED_PHASES = {"artifact", "final"}
REQUIRED_REQUIREMENT_IDS = ("R012", "R013", "R014", "R015", "R016")
REQUIRED_VALIDATION_CLASSES = {"Contract", "Integration", "Operational", "UAT"}
ALLOWED_VALIDATION_CLASSES = REQUIRED_VALIDATION_CLASSES
ALLOWED_PROBLEM_KINDS = {
    "artifact_missing",
    "boundary_map_empty",
    "capability_promotion",
    "contract_drift",
    "coverage_gap",
    "evidence_citation_missing",
    "final_artifact_missing",
    "io_error",
    "malformed_json",
    "posture_drift",
    "requirement_trace_gap",
    "secret_leak",
    "uat_readability",
}

ROADMAP_PATH = Path(".gsd/milestones/M004-osbua3/M004-osbua3-ROADMAP.md")
CONTEXT_PATH = Path(".gsd/milestones/M004-osbua3/M004-osbua3-CONTEXT.md")
ASSESSMENT_PATH = Path(".gsd/milestones/M004-osbua3/M004-osbua3-ASSESSMENT.md")
S07_ASSESSMENT_PATH = Path(".gsd/milestones/M004-osbua3/slices/S07/S07-ASSESSMENT.md")
FINAL_VALIDATION_PATH = Path(".gsd/milestones/M004-osbua3/M004-osbua3-VALIDATION.md")
INVENTORY_PATH = Path("runtime-evidence/M004-S07-restored-artifact-inventory.json")
S06_LEDGER_PATH = Path("runtime-evidence/M004-S06-requirement-coverage.json")
S06_AUDIT_PATH = Path("runtime-evidence/M004-S06-coverage-validation.json")

RESTORED_MARKDOWN_PATHS = (ROADMAP_PATH, CONTEXT_PATH, ASSESSMENT_PATH, S07_ASSESSMENT_PATH)
REQUIRED_ARTIFACT_PATHS = (*RESTORED_MARKDOWN_PATHS, INVENTORY_PATH, S06_LEDGER_PATH, S06_AUDIT_PATH)
FINAL_PHASE_EXTRA_PATHS = (FINAL_VALIDATION_PATH,)
REQUIRED_EVIDENCE_CITATIONS = (
    "runtime-evidence/M004-S06-requirement-coverage.json",
    "runtime-evidence/M004-S06-coverage-validation.json",
    "runtime-evidence/M004-S07-validation-artifacts-audit.json",
)
BOUNDARY_TOKENS = (
    "Div6.External",
    "Div5.QualificationsLibraryLearning",
    "Div1.HCO",
    "Div3.Treasury",
    "Paperclip",
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
CAPABILITY_PROMOTION_RE = re.compile(
    r"("
    r"live_runtime_capability_promoted\s*[:=]\s*true|"
    r"live_paperclip_capability_promoted\s*[:=]\s*true|"
    r"runtime_capability_promotions_allowed\s*[:=]\s*true|"
    r"no_capability_promotions\s*[:=]\s*false|"
    r"capability_promotions\s*[:=]\s*\[[^\]]*[^\s\]]"
    r")",
    re.IGNORECASE,
)


class ErrorCollector:
    """Collect concise diagnostics that never echo secret-like values."""

    def __init__(self) -> None:
        self.errors: list[str] = []

    def add(
        self,
        context: str,
        message: str,
        *,
        requirement_id: str = "M004-S07",
        validation_class: str = "Operational",
        artifact_path: str | Path = INVENTORY_PATH,
        problem_kind: str = "coverage_gap",
    ) -> None:
        safe_validation_class = validation_class if validation_class in ALLOWED_VALIDATION_CLASSES else "Contract"
        safe_problem_kind = problem_kind if problem_kind in ALLOWED_PROBLEM_KINDS else "coverage_gap"
        self.errors.append(
            f"[{requirement_id}][{safe_validation_class}][{artifact_path}][{safe_problem_kind}] {context}: {message}"
        )


def _utc_now() -> str:
    return datetime.now(UTC).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def _as_mapping(value: Any) -> Mapping[str, Any]:
    return value if isinstance(value, Mapping) else {}


def _as_sequence(value: Any) -> Sequence[Any]:
    return value if isinstance(value, list) else []


def _non_empty_string(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _duplicate_rejecting_pairs(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for key, value in pairs:
        if key in result:
            raise ValueError(f"duplicate JSON key {key!r}")
        result[key] = value
    return result


def _within_root(path: Path, root: Path) -> bool:
    try:
        path.resolve().relative_to(root.resolve())
        return True
    except ValueError:
        return False


def _resolve_under_root(root: Path, relative_or_absolute: Path, errors: ErrorCollector, *, label: str) -> Path | None:
    candidate = relative_or_absolute if relative_or_absolute.is_absolute() else root / relative_or_absolute
    resolved = candidate.resolve()
    if not _within_root(resolved, root):
        errors.add(
            label,
            "path escapes repository root",
            validation_class="Operational",
            artifact_path=label,
            problem_kind="io_error",
        )
        return None
    return resolved


def _walk_json(value: Any, path: str = "$") -> Iterable[tuple[str, Any]]:
    if isinstance(value, Mapping):
        for key, child in value.items():
            child_path = f"{path}.{key}"
            yield child_path, child
            yield from _walk_json(child, child_path)
    elif isinstance(value, list):
        for index, child in enumerate(value):
            child_path = f"{path}[{index}]"
            yield child_path, child
            yield from _walk_json(child, child_path)


def _validate_redaction_text(text: str, label: str | Path, errors: ErrorCollector) -> None:
    if SECRET_VALUE_RE.search(text):
        errors.add(
            "content",
            "secret-like text value is not redacted",
            validation_class="Operational",
            artifact_path=label,
            problem_kind="secret_leak",
        )


def _validate_redaction_json(value: Any, label: str | Path, errors: ErrorCollector) -> None:
    for path, child in _walk_json(value):
        if isinstance(child, str) and SECRET_VALUE_RE.search(child):
            errors.add(
                path,
                "secret-like string value is not redacted",
                validation_class="Operational",
                artifact_path=label,
                problem_kind="secret_leak",
            )


def _validate_no_promotion_text(text: str, label: str | Path, errors: ErrorCollector) -> None:
    if CAPABILITY_PROMOTION_RE.search(text):
        errors.add(
            "content",
            "live runtime capability promotion flags or lists are forbidden",
            validation_class="Operational",
            artifact_path=label,
            problem_kind="capability_promotion",
        )


def _load_text(path: Path, label: Path, errors: ErrorCollector, *, required: bool = True) -> str:
    try:
        raw = path.read_text(encoding="utf-8")
    except FileNotFoundError:
        if required:
            errors.add(
                "artifact",
                "missing text file",
                validation_class="Contract",
                artifact_path=label,
                problem_kind="artifact_missing",
            )
        return ""
    except UnicodeDecodeError:
        errors.add(
            "artifact",
            "text file is not valid UTF-8",
            validation_class="Contract",
            artifact_path=label,
            problem_kind="io_error",
        )
        return ""
    except OSError as exc:
        errors.add(
            "artifact",
            f"unable to read text file: {exc.strerror or exc}",
            validation_class="Contract",
            artifact_path=label,
            problem_kind="io_error",
        )
        return ""
    if not raw.strip():
        errors.add(
            "artifact",
            "text file is empty",
            validation_class="Contract",
            artifact_path=label,
            problem_kind="artifact_missing",
        )
    _validate_redaction_text(raw, label, errors)
    _validate_no_promotion_text(raw, label, errors)
    return raw


def _load_json(path: Path, label: Path, errors: ErrorCollector, *, required: bool = True) -> Any | None:
    try:
        raw = path.read_text(encoding="utf-8")
    except FileNotFoundError:
        if required:
            errors.add(
                "artifact",
                "missing JSON file",
                validation_class="Contract",
                artifact_path=label,
                problem_kind="artifact_missing",
            )
        return None
    except UnicodeDecodeError:
        errors.add(
            "artifact",
            "JSON file is not valid UTF-8 text",
            validation_class="Contract",
            artifact_path=label,
            problem_kind="io_error",
        )
        return None
    except OSError as exc:
        errors.add(
            "artifact",
            f"unable to read JSON file: {exc.strerror or exc}",
            validation_class="Contract",
            artifact_path=label,
            problem_kind="io_error",
        )
        return None
    if not raw.strip():
        errors.add(
            "artifact",
            "JSON file is empty",
            validation_class="Contract",
            artifact_path=label,
            problem_kind="artifact_missing",
        )
        return None
    _validate_redaction_text(raw, label, errors)
    _validate_no_promotion_text(raw, label, errors)
    try:
        loaded = json.loads(raw, object_pairs_hook=_duplicate_rejecting_pairs)
    except json.JSONDecodeError as exc:
        errors.add(
            "artifact",
            f"malformed JSON at line {exc.lineno}, column {exc.colno}: {exc.msg}",
            validation_class="Contract",
            artifact_path=label,
            problem_kind="malformed_json",
        )
        return None
    except ValueError as exc:
        errors.add(
            "artifact",
            str(exc),
            validation_class="Contract",
            artifact_path=label,
            problem_kind="malformed_json",
        )
        return None
    _validate_redaction_json(loaded, label, errors)
    return loaded


def _read_text_artifact(root: Path, relative_path: Path, errors: ErrorCollector) -> str:
    resolved = _resolve_under_root(root, relative_path, errors, label=str(relative_path))
    if resolved is None:
        return ""
    return _load_text(resolved, relative_path, errors)


def _read_json_artifact(root: Path, relative_path: Path, errors: ErrorCollector) -> Any | None:
    resolved = _resolve_under_root(root, relative_path, errors, label=str(relative_path))
    if resolved is None:
        return None
    return _load_json(resolved, relative_path, errors)


def _boundary_map_body(roadmap_text: str) -> str:
    match = re.search(r"^## Boundary Map\s*$", roadmap_text, re.MULTILINE)
    if not match:
        return ""
    following = roadmap_text[match.end() :]
    next_heading = re.search(r"^## ", following, re.MULTILINE)
    return following[: next_heading.start()] if next_heading else following


def _validate_boundary_map(roadmap_text: str, errors: ErrorCollector) -> None:
    body = _boundary_map_body(roadmap_text)
    if len(body.strip()) < 300:
        errors.add(
            "Boundary Map",
            "Boundary Map section is missing or too small to be populated",
            validation_class="Contract",
            artifact_path=ROADMAP_PATH,
            problem_kind="boundary_map_empty",
        )
        return
    if "Not provided" in body or re.search(r"\b(?:TBD|TODO)\b", body):
        errors.add(
            "Boundary Map",
            "Boundary Map contains placeholder text",
            validation_class="Contract",
            artifact_path=ROADMAP_PATH,
            problem_kind="boundary_map_empty",
        )
    if "| Producer |" not in body or "| S07:" not in body:
        errors.add(
            "Boundary Map",
            "Boundary Map must include producer table rows through S07",
            validation_class="Contract",
            artifact_path=ROADMAP_PATH,
            problem_kind="boundary_map_empty",
        )
    for slice_id in ("S01", "S02", "S03", "S04", "S05", "S06", "S07"):
        if slice_id not in body:
            errors.add(
                "Boundary Map",
                f"Boundary Map missing {slice_id} trace row",
                validation_class="Integration",
                artifact_path=ROADMAP_PATH,
                problem_kind="coverage_gap",
            )
    for token in BOUNDARY_TOKENS:
        if token not in body:
            errors.add(
                "Boundary Map",
                f"Boundary Map missing boundary token {token}",
                validation_class="Integration",
                artifact_path=ROADMAP_PATH,
                problem_kind="posture_drift",
            )


def _validate_inventory(payload: Any, errors: ErrorCollector) -> None:
    inventory = _as_mapping(payload)
    if not inventory:
        errors.add(
            "inventory",
            "inventory top-level JSON value must be an object",
            validation_class="Contract",
            artifact_path=INVENTORY_PATH,
            problem_kind="malformed_json",
        )
        return
    expected = {
        "schema_version": "m004-s07-restored-artifact-inventory/v1",
        "artifact_type": "restored-artifact-inventory",
        "milestone": "M004-osbua3",
        "slice": "S07",
    }
    for key, expected_value in expected.items():
        if inventory.get(key) != expected_value:
            errors.add(
                key,
                f"must be {expected_value!r}",
                validation_class="Contract",
                artifact_path=INVENTORY_PATH,
                problem_kind="contract_drift",
            )
    restored_paths = {
        str(_as_mapping(item).get("path"))
        for item in _as_sequence(inventory.get("restored_artifacts"))
        if isinstance(item, Mapping)
    }
    for required_path in RESTORED_MARKDOWN_PATHS:
        if str(required_path) not in restored_paths:
            errors.add(
                "restored_artifacts",
                f"missing restored artifact path {required_path}",
                validation_class="Contract",
                artifact_path=INVENTORY_PATH,
                problem_kind="contract_drift",
            )
    if list(_as_sequence(inventory.get("required_requirements"))) != list(REQUIRED_REQUIREMENT_IDS):
        errors.add(
            "required_requirements",
            f"must be exactly {', '.join(REQUIRED_REQUIREMENT_IDS)} in order",
            validation_class="Contract",
            artifact_path=INVENTORY_PATH,
            problem_kind="requirement_trace_gap",
        )
    posture = _as_mapping(inventory.get("boundary_posture"))
    true_keys = (
        "div6_external_only_external_io",
        "div5_quarantine_sanitization_required",
        "div1_hco_routing_control_required",
        "div3_treasury_paid_or_credentialed_grants_required",
        "traceability_only",
    )
    false_keys = (
        "requirements_reowned_by_s07",
        "requirements_status_changed_by_s07",
        "runtime_capability_promotions_allowed",
        "live_paperclip_capability_promoted",
        "network_access_required",
        "plaintext_credentials_allowed",
    )
    for key in true_keys:
        if posture.get(key) is not True:
            errors.add(
                f"boundary_posture.{key}",
                "must be true",
                validation_class="Operational",
                artifact_path=INVENTORY_PATH,
                problem_kind="posture_drift",
            )
    for key in false_keys:
        if posture.get(key) is not False:
            kind = "capability_promotion" if "promot" in key else "posture_drift"
            if "credential" in key:
                kind = "secret_leak"
            errors.add(
                f"boundary_posture.{key}",
                "must be false",
                validation_class="Operational",
                artifact_path=INVENTORY_PATH,
                problem_kind=kind,
            )


def _validate_s06_evidence(ledger: Any, audit: Any, errors: ErrorCollector) -> None:
    ledger_map = _as_mapping(ledger)
    audit_map = _as_mapping(audit)
    if ledger_map:
        if ledger_map.get("schema_version") != "m004-s06-requirement-coverage/v1":
            errors.add(
                "schema_version",
                "S06 ledger schema version drifted",
                validation_class="Contract",
                artifact_path=S06_LEDGER_PATH,
                problem_kind="contract_drift",
            )
        seen = {
            str(_as_mapping(item).get("requirement_id"))
            for item in _as_sequence(ledger_map.get("requirements"))
            if isinstance(item, Mapping)
        }
        missing = sorted(set(REQUIRED_REQUIREMENT_IDS) - seen)
        if missing:
            errors.add(
                "requirements",
                f"S06 ledger missing requirement IDs: {', '.join(missing)}",
                requirement_id=missing[0],
                validation_class="Contract",
                artifact_path=S06_LEDGER_PATH,
                problem_kind="requirement_trace_gap",
            )
        safety = _as_mapping(ledger_map.get("safety"))
        if safety and safety.get("live_runtime_capability_promoted") is not False:
            errors.add(
                "safety.live_runtime_capability_promoted",
                "must remain false in S06 ledger",
                validation_class="Operational",
                artifact_path=S06_LEDGER_PATH,
                problem_kind="capability_promotion",
            )
    if audit_map:
        if audit_map.get("schema_version") != "m004-s06-requirement-coverage-validation/v1":
            errors.add(
                "schema_version",
                "S06 audit schema version drifted",
                validation_class="Contract",
                artifact_path=S06_AUDIT_PATH,
                problem_kind="contract_drift",
            )
        if audit_map.get("passed") is not True or audit_map.get("classification") != "final_ready":
            errors.add(
                "passed",
                "S06 audit must be passed/final_ready",
                validation_class="Operational",
                artifact_path=S06_AUDIT_PATH,
                problem_kind="coverage_gap",
            )
        load_profile = _as_mapping(audit_map.get("load_profile"))
        posture = _as_mapping(audit_map.get("posture"))
        if load_profile.get("network_access") is not False or load_profile.get("subprocesses") is not False:
            errors.add(
                "load_profile",
                "S06 audit must remain no-network and no-subprocess",
                validation_class="Operational",
                artifact_path=S06_AUDIT_PATH,
                problem_kind="posture_drift",
            )
        if posture.get("runtime_capability_promotions_allowed") is not False:
            errors.add(
                "posture.runtime_capability_promotions_allowed",
                "runtime capability promotions must remain disallowed",
                validation_class="Operational",
                artifact_path=S06_AUDIT_PATH,
                problem_kind="capability_promotion",
            )


def _validate_traceability(combined_restored_text: str, errors: ErrorCollector, *, phase: str) -> None:
    for rid in REQUIRED_REQUIREMENT_IDS:
        if rid not in combined_restored_text:
            errors.add(
                "R012-R016 traceability",
                f"restored artifacts must mention {rid}",
                requirement_id=rid,
                validation_class="Integration",
                artifact_path="restored-artifacts",
                problem_kind="requirement_trace_gap",
            )
    for citation in REQUIRED_EVIDENCE_CITATIONS:
        if citation not in combined_restored_text:
            errors.add(
                "evidence citations",
                f"restored artifacts must cite {citation}",
                validation_class="Integration",
                artifact_path="restored-artifacts",
                problem_kind="evidence_citation_missing",
            )
    for token in BOUNDARY_TOKENS[:-1]:
        if token not in combined_restored_text:
            errors.add(
                "boundary posture",
                f"restored artifacts must mention {token}",
                validation_class="Integration",
                artifact_path="restored-artifacts",
                problem_kind="posture_drift",
            )
    if phase == "final":
        for marker in ("MV01", "MV02", "MV03", "MV04", "Verification Classes"):
            if marker not in combined_restored_text:
                errors.add(
                    "final validation",
                    f"final validation package must mention {marker}",
                    validation_class="UAT",
                    artifact_path=FINAL_VALIDATION_PATH,
                    problem_kind="uat_readability",
                )


def validate(*, root: Path = ROOT, phase: str = "artifact") -> tuple[list[str], str]:
    """Return (errors, classification) for the M004/S07 restored artifact package."""

    errors = ErrorCollector()
    root = root.resolve()
    if phase not in ALLOWED_PHASES:
        errors.add("phase", "must be 'artifact' or 'final'", validation_class="Contract", problem_kind="contract_drift")
        return errors.errors, "invalid"

    texts: dict[Path, str] = {}
    for relative_path in RESTORED_MARKDOWN_PATHS:
        texts[relative_path] = _read_text_artifact(root, relative_path, errors)
    if phase == "final":
        texts[FINAL_VALIDATION_PATH] = _read_text_artifact(root, FINAL_VALIDATION_PATH, errors)

    inventory = _read_json_artifact(root, INVENTORY_PATH, errors)
    ledger = _read_json_artifact(root, S06_LEDGER_PATH, errors)
    audit = _read_json_artifact(root, S06_AUDIT_PATH, errors)

    _validate_boundary_map(texts.get(ROADMAP_PATH, ""), errors)
    _validate_inventory(inventory, errors)
    _validate_s06_evidence(ledger, audit, errors)

    restored_json_text = ""
    for payload in (inventory,):
        if payload is not None:
            restored_json_text += json.dumps(payload, sort_keys=True)
    combined_restored_text = "\n".join(texts.values()) + "\n" + restored_json_text
    _validate_traceability(combined_restored_text, errors, phase=phase)

    classification = "artifact_ready" if phase == "artifact" else "final_ready"
    if errors.errors:
        return errors.errors, "invalid"
    return errors.errors, classification


def write_audit(path: Path, root: Path, phase: str, errors: Sequence[str], classification: str) -> bool:
    local_errors = ErrorCollector()
    target = _resolve_under_root(root.resolve(), path, local_errors, label=str(path))
    if target is None:
        for error in local_errors.errors:
            print(f"ERROR: {error}", file=sys.stderr)
        return False
    payload = {
        "schema_version": AUDIT_SCHEMA_VERSION,
        "artifact_type": "validator-audit",
        "generated_at": _utc_now(),
        "milestone": "M004-osbua3",
        "slice": "S07",
        "phase": phase,
        "classification": classification,
        "passed": not errors,
        "required_artifacts": [str(path) for path in REQUIRED_ARTIFACT_PATHS + (FINAL_VALIDATION_PATH,)],
        "inputs": {
            "root": str(root),
            "phase": phase,
        },
        "diagnostics": {
            "error_count": len(errors),
            "errors": list(errors),
        },
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
            "database_access": False,
            "complexity": "O(total_required_markdown_bytes + S06/S07_json_bytes)",
            "expected_required_artifact_count": len(REQUIRED_ARTIFACT_PATHS),
        },
        "posture": {
            "required_requirements": list(REQUIRED_REQUIREMENT_IDS),
            "traceability_only": True,
            "runtime_capability_promotions_allowed": False,
            "live_paperclip_capability_promoted": False,
            "plaintext_credentials_allowed": False,
            "network_access_required": False,
        },
    }
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return True


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=ROOT)
    parser.add_argument("--phase", choices=sorted(ALLOWED_PHASES), default="artifact")
    parser.add_argument("--write-audit", nargs="?", const=DEFAULT_AUDIT_PATH, type=Path)
    args = parser.parse_args(argv)

    errors, classification = validate(root=args.root, phase=args.phase)
    if args.write_audit and not write_audit(args.write_audit, args.root, args.phase, errors, classification):
        return 1
    if errors:
        for error in errors:
            print(f"ERROR: {error}", file=sys.stderr)
        return 1
    print(f"M004 S07 validation artifact package passed: {classification}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
