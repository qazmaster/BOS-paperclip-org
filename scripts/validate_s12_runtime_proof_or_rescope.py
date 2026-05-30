#!/usr/bin/env python3
"""Validate S12 runtime proof or approved rescope disposition artifacts.

This validator is standard-library-only and fail-closed. It accepts exactly two
S12 dispositions:

* runtime_proof: both S10 Hermes and GSD-Pi artifacts validate as passing proof
  through supported Paperclip boundaries, including resultJson.bos and
  BosAdapterResult evidence.
* approved_rescope: runtime proof is blocked and the disposition records an
  explicit approval source, narrowed/deferred success criteria for R009/R010/R011,
  blocker citations, and no capability promotions.

It rejects plaintext secret-looking values, Paperclip core patches, private
internal imports, direct database mutation flags, shell-string execution flags,
unsupported promotions, and docs/matrix confirmation that tries to promote blocker
evidence into runtime proof.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Iterable, Mapping, Sequence

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

import validate_s10_runtime_execution as s10_validator  # noqa: E402 - local stdlib-only validator.

ROOT = Path(__file__).resolve().parents[1]
SCHEMA_VERSION = "s12-runtime-proof-or-rescope/v1"
ARTIFACT_TYPE = "runtime-proof-or-approved-rescope"
DEFAULT_OUTPUT_PATH = Path("runtime-evidence/M002-S12-runtime-proof-or-rescope.json")
DEFAULT_HERMES_PATH = Path("runtime-evidence/M002-S10-hermes-runtime-execution-proof.json")
DEFAULT_GSDPI_PATH = Path("runtime-evidence/M002-S10-gsdpi-runtime-execution-proof.json")
DEFAULT_REQUIREMENT_SCOPE_PATH = Path("runtime-evidence/M002-S10-requirement-scope-resolution.json")
DEFAULT_S11_PATH = Path("runtime-evidence/M002-S11-validation-artifact-repair.json")
DEFAULT_MATRIX_PATH = Path("plugin-bos-light/capabilities.paperclip-runtime.json")
DEFAULT_REPORT_PATH = Path("PAPERCLIP_LIVE_VALIDATION_REPORT.md")
DEFAULT_HEALTH_PATH = Path("docs/08_RUNTIME_CAPABILITY_HEALTH.md")

OUTCOMES = {"runtime_proof", "approved_rescope"}
SURFACES = ("hermes", "gsdpi")
REQUIRED_REQUIREMENTS = {"R009", "R010", "R011"}
CONFIRMED_STATUSES = {"confirmed"}

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
    """Collect concise path-specific validation errors without secret values."""

    def __init__(self) -> None:
        self.errors: list[str] = []

    def add(self, context: str, message: str) -> None:
        self.errors.append(f"{context}: {message}")


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
    if isinstance(value, str) and value.strip().lower() in {"false", "no", "none", "null", "not used", "unused", "not promoted", "unpromoted"}:
        return True
    return False


def _json_text(value: Any) -> str:
    try:
        return json.dumps(value, ensure_ascii=False, sort_keys=True)
    except TypeError:
        return str(value)


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


def _validate_redaction_json(value: Any, errors: ErrorCollector) -> None:
    for path, key, child in _walk_json(value):
        if isinstance(child, str) and SECRET_VALUE_RE.search(child):
            errors.add(path, "secret-like string value is not redacted")
        if key is None or not SECRET_KEY_RE.search(key):
            continue
        if _flag_false_or_empty(child):
            continue
        if isinstance(child, str) and _is_safe_secret_reference(child):
            continue
        errors.add(path, "secret-like field must be false, empty, redacted, or a safe secret reference")


def _validate_redaction_text(text: str, label: str, errors: ErrorCollector) -> None:
    if SECRET_VALUE_RE.search(text):
        errors.add(label, "secret-like text value is not redacted")


def _load_json(path: Path, label: str, errors: ErrorCollector, *, required: bool = True) -> Any | None:
    if not path.exists():
        if required:
            errors.add(label, f"missing JSON file at {path}")
        return None
    try:
        raw = path.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        errors.add(label, "JSON file is not valid UTF-8 text")
        return None
    except OSError as exc:
        errors.add(label, f"unable to read JSON file: {exc.strerror or exc}")
        return None
    try:
        loaded = json.loads(raw)
    except json.JSONDecodeError as exc:
        errors.add(label, f"malformed JSON at line {exc.lineno}, column {exc.colno}: {exc.msg}")
        return None
    _validate_redaction_json(loaded, errors)
    return loaded


def _read_text(path: Path, label: str, errors: ErrorCollector, *, required: bool = False) -> str:
    if not path.exists():
        if required:
            errors.add(label, f"missing text file at {path}")
        return ""
    try:
        text = path.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        errors.add(label, "text file is not valid UTF-8")
        return ""
    except OSError as exc:
        errors.add(label, f"unable to read text file: {exc.strerror or exc}")
        return ""
    _validate_redaction_text(text, label, errors)
    return text


def _relative_path_from(root: Path, value: Any, default: Path) -> Path:
    if not _non_empty_string(value):
        return default
    path = Path(str(value))
    if path.is_absolute():
        try:
            return path.resolve().relative_to(root.resolve())
        except ValueError:
            return path
    return path


def _resolve_path(root: Path, path: Path) -> Path:
    return path if path.is_absolute() else root / path


def _validate_forbidden_flags(payload: Mapping[str, Any], errors: ErrorCollector) -> None:
    forbidden_exact = {
        "direct_db_mutation": "direct database mutation is forbidden",
        "directdatabasemutation": "direct database mutation is forbidden",
        "database_rows_patched": "direct database mutation is forbidden",
        "core_source_patched": "Paperclip core patches are forbidden",
        "paperclip_core_patched": "Paperclip core patches are forbidden",
        "corepatched": "Paperclip core patches are forbidden",
        "private_internal_imports": "private internal imports are forbidden",
        "privateimports": "private internal imports are forbidden",
        "used_private_imports": "private internal imports are forbidden",
        "shell_string_execution": "shell-string execution is forbidden",
        "shellstringexecution": "shell-string execution is forbidden",
        "subprocess_shell": "shell-string execution is forbidden",
        "shell_command": "shell-string execution is forbidden",
        "unsupported_paths_used": "unsupported paths are forbidden",
        "unsupportedpromotions": "unsupported promotions are forbidden",
    }
    for path, key, value in _walk_json(payload):
        if key is None:
            continue
        snakeish = re.sub(r"[^a-z0-9_]", "_", key.lower()).strip("_")
        normalized = re.sub(r"[^a-z0-9]", "", key.lower())
        for pattern, message in forbidden_exact.items():
            pattern_normalized = re.sub(r"[^a-z0-9]", "", pattern)
            if snakeish == pattern or normalized == pattern_normalized:
                if not _flag_false_or_empty(value):
                    errors.add(path, f"{message}; expected false/empty")


def _validate_no_promotion(payload: Mapping[str, Any], errors: ErrorCollector) -> None:
    explicit_promotions = payload.get("capability_promotions") or payload.get("promoted_capabilities") or []
    if explicit_promotions:
        errors.add("capability_promotions", "S12 disposition must not add unsupported runtime promotions")
    no_promotion = _as_mapping(payload.get("no_promotion") or payload.get("noPromotion"))
    required_false = {
        "blocker_evidence_promoted": "blocker evidence must not be promoted",
        "requirements_broadened": "requirements must not be broadened by S12 disposition",
        "success_criteria_broadened": "success criteria must not be broadened by S12 disposition",
    }
    for key, message in required_false.items():
        value = no_promotion.get(key)
        if value is not False:
            errors.add(f"no_promotion.{key}", f"{message}; expected false")
    unsupported = no_promotion.get("unsupported_promotions") or no_promotion.get("capability_promotions") or []
    if unsupported:
        errors.add("no_promotion.unsupported_promotions", "unsupported promotions must be empty")


def _s10_reference(payload: Mapping[str, Any], surface: str, root: Path) -> tuple[Path, list[str], str]:
    proof = _as_mapping(payload.get("proof"))
    surface_record = _as_mapping(proof.get(surface))
    default = DEFAULT_HERMES_PATH if surface == "hermes" else DEFAULT_GSDPI_PATH
    evidence_path = _relative_path_from(root, surface_record.get("evidence_path"), default)
    errors, classification = s10_validator.validate(_resolve_path(root, evidence_path), root=root, phase_override=surface)
    return evidence_path, list(errors), classification


def _validate_common_metadata(payload: Mapping[str, Any], errors: ErrorCollector) -> str:
    if payload.get("schema_version") != SCHEMA_VERSION:
        errors.add("schema_version", f"must be {SCHEMA_VERSION!r}")
    if payload.get("artifact_type") != ARTIFACT_TYPE:
        errors.add("artifact_type", f"must be {ARTIFACT_TYPE!r}")
    if payload.get("milestone") != "M002":
        errors.add("milestone", "must be 'M002'")
    if payload.get("slice") != "S12":
        errors.add("slice", "must be 'S12'")
    if not _parse_timestamp(payload.get("generated_at")):
        errors.add("generated_at", "must be an ISO-8601 timestamp")
    outcome = str(payload.get("outcome") or "")
    if outcome not in OUTCOMES:
        errors.add("outcome", "must be 'runtime_proof' or 'approved_rescope'")
    return outcome


def _validate_s11_posture(root: Path, payload: Mapping[str, Any], errors: ErrorCollector) -> None:
    inputs = _as_mapping(payload.get("inputs"))
    s11_path = _relative_path_from(root, inputs.get("s11_validation_artifact_path") or inputs.get("s11_path"), DEFAULT_S11_PATH)
    loaded = _load_json(_resolve_path(root, s11_path), str(s11_path), errors, required=False)
    if loaded is None:
        # Older fixtures may omit S11, but live S12 closeout needs the posture; report as a blocker.
        errors.add(str(s11_path), "missing or malformed S11 validation artifact repair posture")
        return
    if not isinstance(loaded, Mapping):
        errors.add(str(s11_path), "S11 posture artifact must be a JSON object")
        return
    if loaded.get("passed") is not True:
        errors.add(str(s11_path), "S11 validation artifact repair must have passed before S12 disposition")
    posture = _as_mapping(loaded.get("posture"))
    if posture.get("fail_closed_blocker_evidence_is_not_runtime_proof") is not True:
        errors.add(f"{s11_path}.posture.fail_closed_blocker_evidence_is_not_runtime_proof", "must be true")
    if posture.get("runtime_promotions_require_passing_s10_proof") is not True:
        errors.add(f"{s11_path}.posture.runtime_promotions_require_passing_s10_proof", "must be true")


def _validate_runtime_proof(payload: Mapping[str, Any], root: Path, errors: ErrorCollector) -> None:
    proof = _as_mapping(payload.get("proof"))
    if not proof:
        errors.add("proof", "runtime_proof requires hermes and gsdpi proof records")
    both_passing = True
    for surface in SURFACES:
        record = _as_mapping(proof.get(surface))
        if not record:
            errors.add(f"proof.{surface}", "missing proof record")
            both_passing = False
            continue
        path, s10_errors, classification = _s10_reference(payload, surface, root)
        if s10_errors:
            for error in s10_errors:
                errors.add(f"proof.{surface}.{path}", error)
        if classification != "passing" or record.get("classification") != "passing" or record.get("passing") is not True:
            both_passing = False
        if record.get("supported_boundary") is not True:
            errors.add(f"proof.{surface}.supported_boundary", "runtime_proof requires supported-boundary proof")
        if surface == "hermes" and record.get("result_json_bos_present") is not True:
            errors.add("proof.hermes.result_json_bos_present", "runtime_proof requires Hermes resultJson.bos proof")
        if surface == "gsdpi" and record.get("bos_adapter_result_present") is not True:
            errors.add("proof.gsdpi.bos_adapter_result_present", "runtime_proof requires gsdpi_local BosAdapterResult proof")
    if not both_passing:
        errors.add("proof", "runtime_proof requires passing S10 proof for both hermes and gsdpi")
    if "approved_rescope" in payload:
        errors.add("approved_rescope", "runtime_proof disposition must not also carry an approved rescope")


def _blocker_codes_for(payload: Mapping[str, Any], surface: str) -> set[str]:
    record = _as_mapping(_as_mapping(payload.get("proof")).get(surface))
    codes = {str(item) for item in _as_sequence(record.get("blocker_codes") or record.get("blockerCodes")) if str(item).strip()}
    if _non_empty_string(record.get("blocker_reason")):
        codes.add(str(record.get("blocker_reason")))
    return codes


def _validate_rescope_approval(payload: Mapping[str, Any], root: Path, errors: ErrorCollector) -> None:
    proof = _as_mapping(payload.get("proof"))
    for surface in SURFACES:
        record = _as_mapping(proof.get(surface))
        path, s10_errors, classification = _s10_reference(payload, surface, root)
        # Passing proof and approved rescope are mutually exclusive. Invalid/missing S10 artifacts
        # remain blockers only when the approval cites the affected surface explicitly below.
        if classification == "passing" and record.get("passing") is True:
            errors.add(f"proof.{surface}", "approved_rescope is only valid when runtime proof is blocked")
        if record.get("passing") is True or record.get("classification") == "passing":
            errors.add(f"proof.{surface}.classification", "approved_rescope must not classify proof as passing")
        if s10_errors and not _blocker_codes_for(payload, surface):
            errors.add(f"proof.{surface}.{path}", "missing or malformed S10 artifact must be represented as an explicit blocker citation")

    rescope = _as_mapping(payload.get("approved_rescope"))
    if not rescope:
        errors.add("approved_rescope", "approved_rescope outcome requires approved_rescope details")
        return
    approval = _as_mapping(rescope.get("approval_source") or rescope.get("approvalSource"))
    if not approval:
        errors.add("approved_rescope.approval_source", "missing explicit approval source")
    else:
        if not _non_empty_string(approval.get("reference") or approval.get("source") or approval.get("id")):
            errors.add("approved_rescope.approval_source.reference", "approval source must include a non-empty reference")
        if not _non_empty_string(approval.get("type")):
            errors.add("approved_rescope.approval_source.type", "approval source must include a type")
    requirement_ids = {str(item) for item in _as_sequence(rescope.get("requirement_ids") or rescope.get("requirements"))}
    missing_requirements = REQUIRED_REQUIREMENTS - requirement_ids
    if missing_requirements:
        errors.add("approved_rescope.requirement_ids", f"must explicitly cover {', '.join(sorted(REQUIRED_REQUIREMENTS))}")
    criteria = _as_mapping(rescope.get("success_criteria") or rescope.get("successCriteria"))
    narrowed = [item for item in _as_sequence(criteria.get("narrowed")) if _non_empty_string(item)]
    deferred = [item for item in _as_sequence(criteria.get("deferred")) if _non_empty_string(item)]
    if not narrowed and not deferred:
        errors.add("approved_rescope.success_criteria", "must record narrowed or deferred success criteria")
    citations = _as_sequence(rescope.get("blocker_citations") or rescope.get("blockerCitations"))
    if not citations:
        errors.add("approved_rescope.blocker_citations", "must cite proof-blocking evidence")
    cited_surfaces: set[str] = set()
    for index, citation in enumerate(citations):
        entry = _as_mapping(citation)
        surface = str(entry.get("surface") or "")
        code = entry.get("code") or entry.get("blocker_code")
        evidence_path = entry.get("evidence_path") or entry.get("path")
        if surface not in SURFACES:
            errors.add(f"approved_rescope.blocker_citations[{index}].surface", "must be hermes or gsdpi")
        else:
            cited_surfaces.add(surface)
        if not _non_empty_string(code):
            errors.add(f"approved_rescope.blocker_citations[{index}].code", "must include a blocker code")
        if not _non_empty_string(evidence_path):
            errors.add(f"approved_rescope.blocker_citations[{index}].evidence_path", "must cite an evidence path")
    missing_citations = set(SURFACES) - cited_surfaces
    if missing_citations:
        errors.add("approved_rescope.blocker_citations", f"must cite blockers for {', '.join(sorted(missing_citations))}")
    if rescope.get("no_capability_promotions") is not True:
        errors.add("approved_rescope.no_capability_promotions", "approved rescope must explicitly prohibit capability promotions")


def _target_from_capability_row(row: Mapping[str, Any]) -> str | None:
    key = str(row.get("key") or "").lower()
    if key in {"hermes.execution", "runtime.hermes_execution"}:
        return "hermes"
    if key in {"gsdpi.execution", "gsd-pi.execution", "runtime.gsdpi_execution"}:
        return "gsdpi"
    identity = " ".join(str(row.get(field) or "") for field in ("key", "paperclip_surface_name")).lower()
    has_execution = "execution" in identity or "runtime" in identity
    if "hermes" in identity and has_execution:
        return "hermes"
    if ("gsdpi" in identity or "gsd-pi" in identity or "gsd_pi" in identity) and has_execution:
        return "gsdpi"
    return None


def _validate_docs_and_matrix(root: Path, payload: Mapping[str, Any], outcome: str, errors: ErrorCollector) -> None:
    inputs = _as_mapping(payload.get("inputs"))
    report_path = _relative_path_from(root, inputs.get("report_path"), DEFAULT_REPORT_PATH)
    health_path = _relative_path_from(root, inputs.get("health_path"), DEFAULT_HEALTH_PATH)
    matrix_path = _relative_path_from(root, inputs.get("capability_matrix_path") or inputs.get("matrix_path"), DEFAULT_MATRIX_PATH)
    report = _read_text(_resolve_path(root, report_path), str(report_path), errors, required=False)
    health = _read_text(_resolve_path(root, health_path), str(health_path), errors, required=False)
    combined = f"{report}\n{health}".lower()
    promotion_phrases = (
        "hermes execution confirmed",
        "hermes runtime execution confirmed",
        "gsd-pi execution confirmed",
        "gsdpi execution confirmed",
        "gsd-pi runtime execution confirmed",
        "runtime execution support confirmed",
    )
    if outcome != "runtime_proof":
        for phrase in promotion_phrases:
            if phrase in combined:
                errors.add("docs", f"promotion phrase {phrase!r} requires runtime_proof")
                break
    loaded = _load_json(_resolve_path(root, matrix_path), str(matrix_path), errors, required=False)
    if loaded is None:
        return
    if not isinstance(loaded, Mapping):
        errors.add(str(matrix_path), "capability matrix must be a JSON object")
        return
    capabilities = loaded.get("capabilities")
    if not isinstance(capabilities, list):
        errors.add(str(matrix_path), "capability matrix must include capabilities list")
        return
    for index, row in enumerate(capabilities):
        if not isinstance(row, Mapping):
            errors.add(f"{matrix_path}:capabilities[{index}]", "capability row must be an object")
            continue
        target = _target_from_capability_row(row)
        if target is None:
            continue
        status = str(row.get("status") or "").lower()
        if status in CONFIRMED_STATUSES and outcome != "runtime_proof":
            errors.add(f"{matrix_path}:capabilities[{index}]", f"confirmed {target} execution row requires runtime_proof")


def validate_payload(payload: Mapping[str, Any], *, root: Path = ROOT) -> tuple[list[str], str]:
    """Return (errors, classification) for an already-loaded S12 disposition."""

    errors = ErrorCollector()
    root = root.resolve()
    _validate_redaction_json(payload, errors)
    _validate_forbidden_flags(payload, errors)
    _validate_no_promotion(payload, errors)
    outcome = _validate_common_metadata(payload, errors)
    _validate_s11_posture(root, payload, errors)
    _validate_docs_and_matrix(root, payload, outcome, errors)
    if outcome == "runtime_proof":
        _validate_runtime_proof(payload, root, errors)
    elif outcome == "approved_rescope":
        _validate_rescope_approval(payload, root, errors)
    return errors.errors, outcome if outcome in OUTCOMES and not errors.errors else "invalid"


def validate(evidence_path: Path | None = None, *, root: Path = ROOT) -> tuple[list[str], str]:
    """Return (errors, classification) for an S12 evidence file."""

    root = root.resolve()
    relative_or_absolute = evidence_path or DEFAULT_OUTPUT_PATH
    path = relative_or_absolute if relative_or_absolute.is_absolute() else root / relative_or_absolute
    load_errors = ErrorCollector()
    loaded = _load_json(path, str(relative_or_absolute), load_errors)
    if not isinstance(loaded, Mapping):
        load_errors.add("evidence", "top-level JSON value must be an object")
        return load_errors.errors, "invalid"
    errors, classification = validate_payload(loaded, root=root)
    return [*load_errors.errors, *errors], classification if not load_errors.errors else "invalid"


def write_audit(path: Path, root: Path, evidence_path: Path, errors: Sequence[str], classification: str) -> None:
    payload = {
        "schema_version": "s12-runtime-proof-or-rescope-validation/v1",
        "artifact_type": "validator-audit",
        "generated_at": _utc_now(),
        "milestone": "M002",
        "slice": "S12",
        "classification": classification,
        "passed": not errors,
        "inputs": {"evidence_path": str(evidence_path)},
        "diagnostics": {"error_count": len(errors), "errors": list(errors)},
        "posture": {
            "runtime_proof_requires_both_surfaces": True,
            "approved_rescope_requires_explicit_approval": True,
            "blocker_evidence_promoted": False,
            "plaintext_credential_values_allowed": False,
            "paperclip_core_or_direct_database_mutation_allowed": False,
            "shell_string_execution_allowed": False,
        },
    }
    target = path if path.is_absolute() else root / path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=ROOT)
    parser.add_argument(
        "--evidence",
        "--artifact",
        dest="evidence",
        type=Path,
        default=DEFAULT_OUTPUT_PATH,
        help="S12 disposition artifact path; --artifact is a backwards-compatible alias for task plans.",
    )
    parser.add_argument("--write-audit", type=Path)
    parser.add_argument(
        "--phase",
        default="final",
        help="Compatibility flag for closure runners; S12 currently validates the same fail-closed rules for every phase.",
    )
    args = parser.parse_args(argv)

    errors, classification = validate(args.evidence, root=args.root)
    if args.write_audit:
        write_audit(args.write_audit, args.root, args.evidence, errors, classification)
    if errors:
        for error in errors:
            print(f"ERROR: {error}", file=sys.stderr)
        return 1
    print(f"S12 disposition validation passed: {classification}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
