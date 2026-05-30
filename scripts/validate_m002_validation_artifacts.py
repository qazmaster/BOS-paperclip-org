#!/usr/bin/env python3
"""Validate M002 closeout validation artifacts and no-promotion posture.

This validator is intentionally standard-library-only. It reads local markdown and
JSON artifacts, writes an optional redacted audit JSON, and performs no network,
shell, subprocess, or database access. It fails closed when canonical S09/S10
assessment artifacts are missing, S01 is not clearly superseded for closeout, or
Hermes/GSD-Pi runtime execution is promoted without passing S10 proof.
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
SCHEMA_VERSION = "m002-validation-artifact-repair/v1"

DOC_PATHS: tuple[Path, ...] = (
    Path(".gsd/milestones/M002/M002-CONTEXT.md"),
    Path(".gsd/milestones/M002/M002-ASSESSMENT.md"),
    Path(".gsd/milestones/M002/slices/S09/S09-ASSESSMENT.md"),
    Path(".gsd/milestones/M002/slices/S10/S10-ASSESSMENT.md"),
)
REQUIREMENT_SCOPE_PATH = Path("runtime-evidence/M002-S10-requirement-scope-resolution.json")
S10_CLOSEOUT_PATH = Path("runtime-evidence/M002-S10-runtime-execution-closeout.json")
CAPABILITY_MATRIX_PATH = Path("plugin-bos-light/capabilities.paperclip-runtime.json")
JSON_PATHS: tuple[Path, ...] = (REQUIREMENT_SCOPE_PATH, S10_CLOSEOUT_PATH, CAPABILITY_MATRIX_PATH)

TARGETS = ("hermes", "gsdpi")
FAIL_CLOSED_STATUSES = {"unvalidated", "fallback-only", "unsupported"}
CONFIRMED_STATUSES = {"confirmed"}
S10_EVIDENCE_RE = re.compile(r"runtime-evidence/M002-S10-[A-Za-z0-9_.\-/]+\.json")

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
    """Collect concise, path-specific diagnostics without secret values."""

    def __init__(self) -> None:
        self.errors: list[str] = []

    def add(self, context: str, message: str) -> None:
        self.errors.append(f"{context}: {message}")


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


def _json_text(value: Any) -> str:
    try:
        return json.dumps(value, ensure_ascii=False, sort_keys=True)
    except TypeError:
        return str(value)


def _truthy(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        return value.strip().lower() in {"true", "yes", "pass", "passed", "ok", "success", "succeeded"}
    return bool(value)


def _is_false_or_empty(value: Any) -> bool:
    if value in (False, 0, None, "", [], {}):
        return True
    if isinstance(value, str) and value.strip().lower() in {"false", "no", "none", "null", "not promoted", "unpromoted"}:
        return True
    return False


def _is_safe_secret_reference(value: str) -> bool:
    normalized = value.strip().lower()
    return normalized in SAFE_SECRET_VALUES or normalized.startswith(SAFE_SECRET_PREFIXES)


def _validate_secret_free_text(text: str, label: str, errors: ErrorCollector) -> None:
    if SECRET_VALUE_RE.search(text):
        errors.add(label, "secret-like text value is not redacted")


def _validate_secret_free_json(value: Any, errors: ErrorCollector) -> None:
    for path, key, child in _walk_json(value):
        if isinstance(child, str) and SECRET_VALUE_RE.search(child):
            errors.add(path, "secret-like string value is not redacted")
        if key is None or not SECRET_KEY_RE.search(key):
            continue
        if _is_false_or_empty(child):
            continue
        if isinstance(child, str) and _is_safe_secret_reference(child):
            continue
        errors.add(path, "secret-like field must be false, empty, redacted, or a safe secret reference")


def _read_required_text(root: Path, relative_path: Path, errors: ErrorCollector, checked: list[dict[str, Any]]) -> str:
    path = root / relative_path
    record: dict[str, Any] = {"path": str(relative_path), "type": "text", "exists": path.exists(), "non_empty": False}
    checked.append(record)
    if not path.exists():
        errors.add(str(relative_path), "missing required artifact")
        return ""
    try:
        text = path.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        errors.add(str(relative_path), "artifact is not valid UTF-8 text")
        return ""
    except OSError as exc:
        errors.add(str(relative_path), f"unable to read artifact: {exc.strerror or exc}")
        return ""
    record["non_empty"] = bool(text.strip())
    if not text.strip():
        errors.add(str(relative_path), "required artifact is empty")
    _validate_secret_free_text(text, str(relative_path), errors)
    return text


def _load_required_json(root: Path, relative_path: Path, errors: ErrorCollector, checked: list[dict[str, Any]]) -> Any | None:
    path = root / relative_path
    record: dict[str, Any] = {"path": str(relative_path), "type": "json", "exists": path.exists(), "non_empty": False}
    checked.append(record)
    if not path.exists():
        errors.add(str(relative_path), "missing required JSON artifact")
        return None
    try:
        raw = path.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        errors.add(str(relative_path), "JSON artifact is not valid UTF-8 text")
        return None
    except OSError as exc:
        errors.add(str(relative_path), f"unable to read JSON artifact: {exc.strerror or exc}")
        return None
    record["non_empty"] = bool(raw.strip())
    if not raw.strip():
        errors.add(str(relative_path), "required JSON artifact is empty")
        return None
    try:
        loaded = json.loads(raw)
    except json.JSONDecodeError as exc:
        errors.add(str(relative_path), f"malformed JSON at line {exc.lineno}, column {exc.colno}: {exc.msg}")
        return None
    _validate_secret_free_json(loaded, errors)
    return loaded


def _has_all_words(text: str, words: Sequence[str]) -> bool:
    return all(word in text for word in words)


def _validate_posture_text(docs: Mapping[Path, str], errors: ErrorCollector) -> None:
    combined = "\n".join(docs.values())
    lower = combined.lower()

    if not ("s01" in lower and "historical" in lower and "superseded" in lower and "closeout" in lower):
        errors.add("docs.posture.s01", "S01 must be described as historical or superseded for closeout")
    if not ("s09" in lower and "s10" in lower and "current" in lower and ("closeout source" in lower or "canonical closeout" in lower or "source of truth" in lower)):
        errors.add("docs.posture.s09_s10", "S09/S10 must be identified as current closeout sources")
    if not re.search(r"hermes[^.\n]{0,160}(fail-closed|unpromoted)", lower):
        errors.add("docs.posture.hermes", "Hermes execution must remain fail-closed or unpromoted")
    if not re.search(r"(?:gsd-pi|gsdpi)[^.\n]{0,160}(fail-closed|unpromoted)", lower):
        errors.add("docs.posture.gsdpi", "GSD-Pi execution must remain fail-closed or unpromoted")
    if not (("blocker evidence rather than runtime proof" in lower) or ("not runtime proof" in lower and "fail-closed" in lower)):
        errors.add("docs.posture.blocker_evidence", "fail-closed blocker evidence must not be treated as runtime proof")
    for requirement_id in ("r009", "r010", "r011"):
        if requirement_id not in lower or not re.search(rf"{requirement_id}[^.\n]{{0,220}}(preserved|remain|intact|not reinterpreted)", lower):
            errors.add(f"docs.posture.{requirement_id.upper()}", f"{requirement_id.upper()} must be preserved")

    overclaim_patterns = (
        r"\bhermes(?:\s+runtime)?\s+execution\s+(?:is\s+)?(?:confirmed|promoted|proven|supported|passing)\b",
        r"\b(?:gsd-pi|gsdpi)(?:\s+runtime)?\s+execution\s+(?:is\s+)?(?:confirmed|promoted|proven|supported|passing)\b",
        r"\bconfirmed\s+(?:hermes|gsd-pi|gsdpi)(?:\s+runtime)?\s+execution\b",
        r"\bpromoted\s+(?:hermes|gsd-pi|gsdpi)(?:\s+runtime)?\s+execution\b",
    )
    for pattern in overclaim_patterns:
        if re.search(pattern, lower):
            errors.add("docs.posture.runtime_overclaim", "Hermes/GSD-Pi runtime execution promotion language requires replacing S10 blocker evidence with passing proof")
            break


def _target_from_text(text: str) -> str | None:
    lower = text.lower()
    has_execution = "execution" in lower or "runtime" in lower
    if "hermes" in lower and has_execution:
        return "hermes"
    if ("gsdpi" in lower or "gsd-pi" in lower or "gsd_pi" in lower) and has_execution:
        return "gsdpi"
    return None


def _target_from_capability_row(row: Mapping[str, Any]) -> str | None:
    key = str(row.get("key") or "").lower()
    if key in {"hermes.execution", "runtime.hermes_execution"}:
        return "hermes"
    if key in {"gsdpi.execution", "gsd-pi.execution", "runtime.gsdpi_execution"}:
        return "gsdpi"
    identity = " ".join(str(row.get(field) or "") for field in ("key", "paperclip_surface_name"))
    return _target_from_text(identity)


def _validate_requirement_scope(scope: Any, errors: ErrorCollector) -> dict[str, bool]:
    passing_proof = {"hermes": False, "gsdpi": False}
    if not isinstance(scope, Mapping):
        errors.add(str(REQUIREMENT_SCOPE_PATH), "top-level JSON value must be an object")
        return passing_proof

    proof_posture = scope.get("proof_posture")
    if not isinstance(proof_posture, Mapping):
        errors.add(f"{REQUIREMENT_SCOPE_PATH}.proof_posture", "missing proof_posture object")
        proof_posture = {}
    for target in TARGETS:
        entry = proof_posture.get(target)
        context = f"{REQUIREMENT_SCOPE_PATH}.proof_posture.{target}"
        if not isinstance(entry, Mapping):
            errors.add(context, "missing target proof posture")
            continue
        artifact_type = str(entry.get("artifact_type") or "")
        is_passing = _truthy(entry.get("passing"))
        promoted = not _is_false_or_empty(entry.get("capability_promoted"))
        if artifact_type == "runtime-execution-proof" and is_passing:
            passing_proof[target] = True
        if artifact_type == "fail-closed-blocker" and is_passing:
            errors.add(context, "fail-closed blocker cannot mark passing=true")
        if artifact_type == "fail-closed-blocker" and promoted:
            errors.add(context, "fail-closed blocker cannot promote runtime capability")
        if artifact_type != "fail-closed-blocker" and not passing_proof[target]:
            errors.add(context, "current target posture must be fail-closed blocker unless passing runtime-execution-proof exists")
        evidence_path = str(entry.get("evidence_path") or "")
        if not S10_EVIDENCE_RE.search(evidence_path):
            errors.add(context, "target posture must cite an explicit runtime-evidence/M002-S10-*.json artifact")

    requirement_resolution = scope.get("requirement_resolution")
    if not isinstance(requirement_resolution, Mapping):
        errors.add(f"{REQUIREMENT_SCOPE_PATH}.requirement_resolution", "missing requirement_resolution object")
        return passing_proof
    for requirement_id in ("R009", "R010", "R011"):
        entry = requirement_resolution.get(requirement_id)
        context = f"{REQUIREMENT_SCOPE_PATH}.requirement_resolution.{requirement_id}"
        if not isinstance(entry, Mapping):
            errors.add(context, "missing requirement resolution")
            continue
        if entry.get("covered_by_existing_requirement") is not True:
            errors.add(context, "must remain covered by existing requirement")
        if entry.get("requirement_update_used") is not False:
            errors.add(context, "requirement update/rescope is not allowed")
    return passing_proof


def _validate_s10_closeout(closeout: Any, errors: ErrorCollector) -> None:
    if not isinstance(closeout, Mapping):
        errors.add(str(S10_CLOSEOUT_PATH), "top-level JSON value must be an object")
        return
    checks = {
        "artifact_type": closeout.get("artifact_type") == "validator-audit",
        "classification": closeout.get("classification") == "final",
        "passed": closeout.get("passed") is True,
    }
    for key, ok in checks.items():
        if not ok:
            errors.add(f"{S10_CLOSEOUT_PATH}.{key}", "S10 final audit must record a passing final validator state")
    diagnostics = closeout.get("diagnostics")
    if not isinstance(diagnostics, Mapping) or diagnostics.get("error_count") != 0:
        errors.add(f"{S10_CLOSEOUT_PATH}.diagnostics", "S10 final audit must have diagnostics.error_count=0")
    posture = closeout.get("posture")
    if not isinstance(posture, Mapping):
        errors.add(f"{S10_CLOSEOUT_PATH}.posture", "missing S10 posture object")
        return
    required_true = ("capability_promotions_require_passing_s10_proof", "fail_closed_rows_must_cite_s10_evidence", "unsupported_boundaries_rejected")
    for key in required_true:
        if posture.get(key) is not True:
            errors.add(f"{S10_CLOSEOUT_PATH}.posture.{key}", "must be true")
    required_false = ("plaintext_credential_values_allowed", "paperclip_core_or_direct_database_mutation_allowed")
    for key in required_false:
        if posture.get(key) is not False:
            errors.add(f"{S10_CLOSEOUT_PATH}.posture.{key}", "must be false")


def _promotion_items(value: Any) -> list[str]:
    if isinstance(value, str) and value.strip():
        return [value.strip()]
    if isinstance(value, list):
        return [str(item) for item in value if str(item).strip()]
    if isinstance(value, Mapping):
        return [key for key, child in value.items() if not _is_false_or_empty(child)]
    return []


def _validate_capability_matrix(matrix: Any, passing_proof: Mapping[str, bool], errors: ErrorCollector) -> None:
    if not isinstance(matrix, Mapping):
        errors.add(str(CAPABILITY_MATRIX_PATH), "top-level JSON value must be an object")
        return

    for path, key, child in _walk_json(matrix):
        if key in {"capability_promotions", "promoted_capabilities", "runtime_capability_promotions"}:
            for item in _promotion_items(child):
                target = _target_from_text(item) or ("hermes" if "hermes" in item.lower() else "gsdpi" if any(term in item.lower() for term in ("gsdpi", "gsd-pi", "gsd_pi")) else None)
                if target in TARGETS and not passing_proof.get(target, False):
                    errors.add(path, f"{target} capability promotion requires passing S10 runtime proof")
                elif target is None and item.strip():
                    errors.add(path, "non-empty capability promotion list is not allowed for this closeout validator")

    guardrail = str(matrix.get("guardrail") or "").lower()
    if guardrail and not ("fail-closed" in guardrail or "unpromoted" in guardrail):
        errors.add(f"{CAPABILITY_MATRIX_PATH}.guardrail", "matrix guardrail must preserve fail-closed/unpromoted runtime posture")

    capabilities = matrix.get("capabilities")
    if not isinstance(capabilities, list):
        errors.add(f"{CAPABILITY_MATRIX_PATH}.capabilities", "missing capabilities list")
        return

    for index, row in enumerate(capabilities):
        if not isinstance(row, Mapping):
            errors.add(f"{CAPABILITY_MATRIX_PATH}.capabilities[{index}]", "capability row must be an object")
            continue
        target = _target_from_capability_row(row)
        if target is None:
            continue
        status = str(row.get("status") or "").lower()
        context = f"{CAPABILITY_MATRIX_PATH}.capabilities[{index}] ({row.get('key', 'unknown')})"
        row_text = _json_text(row)
        s10_paths = S10_EVIDENCE_RE.findall(row_text)
        if status in CONFIRMED_STATUSES:
            if not passing_proof.get(target, False):
                errors.add(context, f"confirmed {target} execution requires passing S10 runtime proof")
            if not s10_paths:
                errors.add(context, f"confirmed {target} execution row must cite explicit S10 proof path")
        elif status in FAIL_CLOSED_STATUSES:
            if not s10_paths:
                errors.add(context, f"fail-closed {target} execution row must cite explicit S10 evidence path")
        else:
            errors.add(context, f"{target} execution status must be confirmed with proof or fail-closed")


def validate(root: Path = ROOT) -> tuple[list[str], list[dict[str, Any]]]:
    """Return (diagnostics, checked_paths) for M002 validation artifact repair."""

    root = root.resolve()
    errors = ErrorCollector()
    checked: list[dict[str, Any]] = []

    docs = {path: _read_required_text(root, path, errors, checked) for path in DOC_PATHS}
    json_artifacts = {path: _load_required_json(root, path, errors, checked) for path in JSON_PATHS}

    _validate_posture_text(docs, errors)
    passing_proof = _validate_requirement_scope(json_artifacts[REQUIREMENT_SCOPE_PATH], errors)
    _validate_s10_closeout(json_artifacts[S10_CLOSEOUT_PATH], errors)
    _validate_capability_matrix(json_artifacts[CAPABILITY_MATRIX_PATH], passing_proof, errors)

    return errors.errors, checked


def _audit_payload(errors: Sequence[str], checked_paths: Sequence[Mapping[str, Any]]) -> dict[str, Any]:
    return {
        "schema_version": SCHEMA_VERSION,
        "artifact_type": "validator-audit",
        "generated_at": datetime.now(UTC).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        "milestone": "M002",
        "slice": "S11",
        "task": "T02",
        "passed": not errors,
        "checked_paths": list(checked_paths),
        "diagnostics": {
            "error_count": len(errors),
            "errors": list(errors[:50]),
            "truncated": len(errors) > 50,
        },
        "posture": {
            "s01_historical_or_superseded_for_closeout_required": True,
            "s09_s10_current_closeout_sources_required": True,
            "runtime_promotions_require_passing_s10_proof": True,
            "fail_closed_blocker_evidence_is_not_runtime_proof": True,
            "secret_values_allowed_in_diagnostics": False,
            "shell_network_or_database_access_used": False,
        },
    }


def write_audit(path: Path, root: Path, errors: Sequence[str], checked_paths: Sequence[Mapping[str, Any]]) -> None:
    target = path if path.is_absolute() else root.resolve() / path
    payload = _audit_payload(errors, checked_paths)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Validate M002 closeout validation artifact completeness and no-promotion posture.")
    parser.add_argument("--root", type=Path, default=ROOT, help="Repository root containing .gsd/, runtime-evidence/, and plugin-bos-light/.")
    parser.add_argument("--write-audit", type=Path, help="Write redacted validator audit JSON, relative to --root unless absolute.")
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    errors, checked_paths = validate(args.root)
    if args.write_audit:
        write_audit(args.write_audit, args.root, errors, checked_paths)
    if errors:
        print("M002 validation artifact repair check failed:", file=sys.stderr)
        for error in errors[:50]:
            print(f"- {error}", file=sys.stderr)
        if len(errors) > 50:
            print(f"- ... {len(errors) - 50} additional diagnostics truncated", file=sys.stderr)
        return 1
    print("M002 validation artifacts OK: S09/S10 closeout posture is complete, proof-gated, and redacted.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
