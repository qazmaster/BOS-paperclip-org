#!/usr/bin/env python3
"""Validate M005 S04 git operations + hybrid state persistence probe evidence artifacts.

This validator is standard-library-only and fail-closed. It accepts redacted
fail-closed blocker artifacts as diagnostic evidence, but passing proof must come
from supported runtime boundaries:

* Git binary available and responsive.
* Git ls-remote probe succeeded (or was attempted with valid credentials).
* Hybrid persistence smoke test succeeded.
* State reconstruction smoke test succeeded.

All phases reject plaintext secret values, direct database mutation, Paperclip
core patch flags, private internal imports, malformed timestamps, unsupported
paths, and capability promotion without matching proof.
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

SCHEMA_VERSION = "m005-s04-git-hybrid/v1"
PASSING_ARTIFACT_TYPE = "runtime-execution-proof"
BLOCKER_ARTIFACT_TYPE = "fail-closed-blocker"
PHASE = "git_hybrid"
STATUS_PASS = {"pass", "passed", "ok", "success", "succeeded"}

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
    r"glpat-[A-Za-z0-9_\-]{20,}|"
    r"xox[baprs]-[A-Za-z0-9\-]{8,}|"
    r"AKIA[0-9A-Z]{8,}|"
    r"(?:Authorization\s*[:=]\s*)?Bearer\s+[A-Za-z0-9._~+/=\-]{8,}|"
    r"[A-Za-z_][A-Za-z0-9_]*(?:TOKEN|SECRET|PASSWORD|API_KEY)=[^\s\"']+"
    r")",
    re.IGNORECASE,
)
REDACTED_VALUES = {"<redacted>", "[redacted]", "redacted", "***", ""}
SAFE_SECRET_REF_PREFIXES = ("secret_ref:", "paperclip-secret:", "vault:", "env:")


class ErrorCollector:
    """Collect path-specific validation failures."""

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
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        errors.add(label, f"malformed JSON at line {exc.lineno}, column {exc.colno}: {exc.msg}")
    except OSError as exc:
        errors.add(label, f"unable to read file: {exc.strerror or exc}")
    return None


def _as_mapping(value: Any) -> Mapping[str, Any]:
    if isinstance(value, str):
        stripped = value.strip()
        if stripped.startswith("{"):
            try:
                parsed = json.loads(stripped)
            except json.JSONDecodeError:
                return {}
            return parsed if isinstance(parsed, Mapping) else {}
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


def _json_text(value: Any) -> str:
    try:
        return json.dumps(value, sort_keys=True, ensure_ascii=False)
    except TypeError:
        return str(value)


def _nested_get(value: Any, path: str) -> Any:
    current = value
    for part in path.split("."):
        if not isinstance(current, Mapping):
            return None
        current = current.get(part)
    return current


def _flag_value_is_false_or_empty(value: Any) -> bool:
    if value in (False, 0, "false", "False", "no", "No", None):
        return True
    if value in ([], {}, ""):
        return True
    return False


def _validate_redaction_json(value: Any, errors: ErrorCollector) -> None:
    for path, key, child in _walk_json(value):
        if isinstance(child, str) and SECRET_VALUE_RE.search(child):
            errors.add(path, "secret-like string value is not redacted")
        if key is None or not SECRET_KEY_RE.search(key):
            continue
        if isinstance(child, str):
            normalized = child.strip().lower()
            if normalized in REDACTED_VALUES or normalized.startswith(SAFE_SECRET_REF_PREFIXES):
                continue
            errors.add(path, "secret-like field must be redacted or represented only as a safe secret reference")
        elif isinstance(child, (Mapping, list)):
            serialized = _json_text(child)
            if serialized not in ("{}", "[]") and "<redacted>" not in serialized.lower() and "redacted" not in serialized.lower():
                errors.add(path, "secret-like object/list field must contain only redacted content")


def _validate_supported_boundary_flags(evidence: Mapping[str, Any], errors: ErrorCollector) -> None:
    bad_key_patterns = {
        "direct_db_mutation": "direct database mutation is forbidden",
        "directdatabasemutation": "direct database mutation is forbidden",
        "database_rows_patched": "direct database mutation is forbidden",
        "core_source_patched": "Paperclip core patches are forbidden",
        "paperclip_core_patched": "Paperclip core patches are forbidden",
        "corepatched": "Paperclip core patches are forbidden",
        "private_internal_imports": "private internal imports are forbidden",
        "privateimports": "private internal imports are forbidden",
        "used_private_imports": "private internal imports are forbidden",
    }
    for path, key, value in _walk_json(evidence):
        if key is None:
            continue
        normalized = re.sub(r"[^a-z0-9]", "", key.lower())
        snakeish = re.sub(r"[^a-z0-9_]", "_", key.lower()).strip("_")
        for pattern, message in bad_key_patterns.items():
            pattern_normalized = re.sub(r"[^a-z0-9]", "", pattern.lower())
            if normalized == pattern_normalized or snakeish == pattern:
                if not _flag_value_is_false_or_empty(value):
                    errors.add(path, f"{message}; expected false/empty, got {value!r}")
    unsupported_used = (
        evidence.get("unsupported_paths_used")
        or evidence.get("unsupportedPathsUsed")
        or _nested_get(evidence, "safety.unsupported_paths_used")
        or _nested_get(evidence, "safety.unsupportedPathsUsed")
    )
    if isinstance(unsupported_used, list) and unsupported_used:
        errors.add("unsupported_paths_used", "unsupported paths must not be used for M005 S04 proof")


def _validate_no_core_modification(evidence: Mapping[str, Any], errors: ErrorCollector) -> None:
    proof = _as_mapping(evidence.get("no_core_modification") or evidence.get("supported_boundary") or evidence.get("safety"))
    if not proof:
        errors.add("no_core_modification", "passing proof requires explicit no core patch / no direct DB / no private import proof")
        return
    for key in ("core_source_patched", "paperclip_core_patched", "direct_db_mutation", "directDatabaseMutation"):
        if key in proof and not _flag_value_is_false_or_empty(proof.get(key)):
            errors.add(f"no_core_modification.{key}", "must be false")
    private_imports = proof.get("private_internal_imports") or proof.get("privateImports") or proof.get("used_private_imports")
    if not _flag_value_is_false_or_empty(private_imports):
        errors.add("no_core_modification.private_internal_imports", "must be false/empty")
    if not _non_empty_string(proof.get("method") or proof.get("boundary") or proof.get("supported_boundary")):
        errors.add("no_core_modification.method", "must describe the supported boundary used")


def _validate_common_metadata(evidence: Mapping[str, Any], errors: ErrorCollector) -> str:
    if evidence.get("schema_version") != SCHEMA_VERSION:
        errors.add("schema_version", f"must be {SCHEMA_VERSION!r}")
    artifact_type = str(evidence.get("artifact_type") or "")
    if artifact_type not in {PASSING_ARTIFACT_TYPE, BLOCKER_ARTIFACT_TYPE}:
        errors.add("artifact_type", f"must be {PASSING_ARTIFACT_TYPE!r} or {BLOCKER_ARTIFACT_TYPE!r}")
    phase = str(evidence.get("phase") or "")
    if phase != PHASE:
        errors.add("phase", f"must be {PHASE!r}")
    if not _parse_timestamp(evidence.get("generated_at")):
        errors.add("generated_at", "must be an ISO-8601 timestamp")
    _validate_redaction_json(evidence, errors)
    _validate_supported_boundary_flags(evidence, errors)
    return artifact_type


def _validate_blocker(evidence: Mapping[str, Any], errors: ErrorCollector) -> None:
    if not _non_empty_string(evidence.get("blocker_reason") or evidence.get("blockerReason")):
        errors.add("blocker_reason", "fail-closed blocker artifacts require a blocker reason")
    blocker_codes = _as_sequence(evidence.get("blocker_codes") or evidence.get("blockerCodes"))
    if not blocker_codes:
        errors.add("blocker_codes", "fail-closed blocker artifacts require precise blocker codes")
    if evidence.get("passing") is True:
        errors.add("passing", "fail-closed blocker artifact cannot mark itself passing")
    promotions = evidence.get("capability_promotions") or evidence.get("promoted_capabilities")
    if promotions:
        errors.add("capability_promotions", "fail-closed blocker artifacts must not promote runtime execution capability")
    diagnostics = evidence.get("diagnostics") or evidence.get("blocker_evidence") or evidence.get("blockerEvidence")
    # S04 probe embeds diagnostics in structured sub-fields; accept those as valid diagnostic evidence
    has_structured_diagnostics = any(
        _as_mapping(evidence.get(key))
        for key in ("git_binary_check", "git_env_discovery", "git_ls_remote", "hybrid_persistence_smoke", "state_reconstruction_smoke")
    )
    if not diagnostics and not has_structured_diagnostics:
        errors.add("diagnostics", "fail-closed blocker artifacts require redacted diagnostic evidence")

    # Zero mutation side effects in blocker artifacts
    side_effects = _as_mapping(evidence.get("side_effect_counters") or evidence.get("sideEffectCounters"))
    for key in ("comments_created", "documents_created", "escalation_issues_created"):
        value = side_effects.get(key)
        if isinstance(value, int) and value > 0:
            errors.add(f"side_effect_counters.{key}", "fail-closed blocker artifacts must have zero mutation side effects")


def _validate_git_binary_check(evidence: Mapping[str, Any], errors: ErrorCollector) -> None:
    git_binary = _as_mapping(evidence.get("git_binary_check"))
    if not git_binary:
        errors.add("git_binary_check", "passing proof requires git binary check")
        return
    if git_binary.get("available") is not True:
        errors.add("git_binary_check.available", "passing proof requires git binary available")


def _validate_git_ls_remote(evidence: Mapping[str, Any], errors: ErrorCollector) -> None:
    ls_remote = _as_mapping(evidence.get("git_ls_remote"))
    if not ls_remote:
        errors.add("git_ls_remote", "passing proof requires git ls-remote probe result")
        return
    if ls_remote.get("ok") is not True:
        errors.add("git_ls_remote.ok", "passing proof requires git ls-remote to succeed")
    if ls_remote.get("skipped") is True:
        errors.add("git_ls_remote.skipped", "passing proof cannot have skipped ls-remote")


def _validate_hybrid_persistence_smoke(evidence: Mapping[str, Any], errors: ErrorCollector) -> None:
    hybrid = _as_mapping(evidence.get("hybrid_persistence_smoke"))
    if not hybrid:
        errors.add("hybrid_persistence_smoke", "passing proof requires hybrid persistence smoke test")
        return
    if hybrid.get("ok") is not True:
        errors.add("hybrid_persistence_smoke.ok", "passing proof requires hybrid persistence smoke test to succeed")


def _validate_state_reconstruction_smoke(evidence: Mapping[str, Any], errors: ErrorCollector) -> None:
    recon = _as_mapping(evidence.get("state_reconstruction_smoke"))
    if not recon:
        errors.add("state_reconstruction_smoke", "passing proof requires state reconstruction smoke test")
        return
    if recon.get("ok") is not True:
        errors.add("state_reconstruction_smoke.ok", "passing proof requires state reconstruction smoke test to succeed")


def _validate_passing_proof(evidence: Mapping[str, Any], errors: ErrorCollector) -> None:
    _validate_git_binary_check(evidence, errors)
    _validate_git_ls_remote(evidence, errors)
    _validate_hybrid_persistence_smoke(evidence, errors)
    _validate_state_reconstruction_smoke(evidence, errors)
    _validate_no_core_modification(evidence, errors)

    capability_promotions = _as_sequence(evidence.get("capability_promotions") or evidence.get("promoted_capabilities"))
    if not capability_promotions:
        errors.add("capability_promotions", "passing proof should list promoted capabilities")


def _validate_artifact(evidence_path: Path, root: Path) -> tuple[list[str], str]:
    errors = ErrorCollector()
    loaded = _load_json(evidence_path, str(evidence_path), errors)
    if not isinstance(loaded, Mapping):
        errors.add("evidence", "top-level JSON value must be an object")
        return errors.errors, "invalid"
    evidence: Mapping[str, Any] = loaded
    artifact_type = _validate_common_metadata(evidence, errors)
    if artifact_type == BLOCKER_ARTIFACT_TYPE:
        _validate_blocker(evidence, errors)
    elif artifact_type == PASSING_ARTIFACT_TYPE:
        _validate_passing_proof(evidence, errors)
    classification = "invalid"
    if not errors.errors:
        classification = "blocker" if artifact_type == BLOCKER_ARTIFACT_TYPE else "passing"
    return errors.errors, classification


def validate(evidence_path: Path | None = None, root: Path = ROOT) -> tuple[list[str], str]:
    """Return (errors, classification) for M005 S04 evidence."""

    root = root.resolve()
    if evidence_path is None:
        return ["evidence: provide an evidence path for validation"], "invalid"
    return _validate_artifact(evidence_path, root)


def _write_audit(path: Path, root: Path, evidence_path: Path | None, errors: Sequence[str], classification: str) -> None:
    """Persist a redacted machine-readable closeout/audit result."""

    payload = {
        "schema_version": "m005-s04-git-hybrid-closeout/v1",
        "artifact_type": "validator-audit",
        "generated_at": datetime.now(UTC).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        "phase": PHASE,
        "classification": classification,
        "passed": not errors,
        "inputs": {
            "evidence_path": str(evidence_path) if evidence_path else None,
        },
        "diagnostics": {
            "error_count": len(errors),
            "errors": list(errors),
        },
        "posture": {
            "capability_promotions_require_passing_proof": True,
            "fail_closed_blocker_artifacts_accepted": True,
            "unsupported_boundaries_rejected": True,
            "plaintext_credential_values_allowed": False,
            "paperclip_core_or_direct_database_mutation_allowed": False,
        },
    }
    target = path if path.is_absolute() else root / path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Validate M005 S04 git + hybrid persistence probe evidence artifacts.")
    parser.add_argument("evidence_path", type=Path, nargs="?", help="Path to one runtime-evidence/*.json artifact.")
    parser.add_argument("--evidence", dest="evidence_option", type=Path, help="Path to one runtime-evidence/*.json artifact; compatibility form for task plans.")
    parser.add_argument("--root", type=Path, default=ROOT, help="Repository root.")
    parser.add_argument("--write-audit", type=Path, help="Write redacted validator closeout JSON to this path, relative to --root unless absolute.")
    parser.add_argument(
        "--allow-blocker",
        action="store_true",
        help="Compatibility no-op: valid fail-closed blocker artifacts already return 0 while preserving blocker classification.",
    )
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    evidence_path = args.evidence_option or args.evidence_path
    errors, classification = validate(evidence_path, args.root)
    if args.write_audit:
        _write_audit(args.write_audit, args.root.resolve(), evidence_path, errors, classification)
    if errors:
        print("M005 S04 git+hybrid probe validation failed:", file=sys.stderr)
        for error in errors:
            print(f"- {error}", file=sys.stderr)
        return 1
    if classification == "blocker":
        print("M005 S04 git+hybrid probe blocker artifact OK: fail-closed diagnostics are valid, but this is not passing runtime proof.")
        return 0
    print("M005 S04 git+hybrid probe proof OK: supported-boundary runtime execution contract is satisfied.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
