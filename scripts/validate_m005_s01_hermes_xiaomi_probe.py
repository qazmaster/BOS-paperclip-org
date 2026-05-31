#!/usr/bin/env python3
"""Validate M005 S01 Hermes Xiaomi probe evidence artifacts.

This validator is standard-library-only and fail-closed. It accepts redacted
fail-closed blocker artifacts as diagnostic evidence, but passing proof must come
from supported Paperclip runtime boundaries:

* Hermes Xiaomi: selected path hermes_local_with_xiaomi_backend, Paperclip-owned
  lifecycle/readback, hermes_local adapter readback, exactly one wake, safe/no
  approval creation, succeeded run status, and resultJson.bos.

All phases reject plaintext secret values, direct database mutation, Paperclip
core patch flags, private internal imports, malformed timestamps, and capability
promotion without matching proof.
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

SCHEMA_VERSION = "m005-s01-hermes-xiaomi/v1"
PASSING_ARTIFACT_TYPE = "runtime-execution-proof"
BLOCKER_ARTIFACT_TYPE = "fail-closed-blocker"
PHASE = "hermes"
SELECTED_HERMES_PATH = "hermes_local_with_xiaomi_backend"
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


def _status_is_pass(value: Any) -> bool:
    return isinstance(value, str) and value.strip().lower() in STATUS_PASS


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


def _adapter_type_from(value: Mapping[str, Any]) -> Any:
    for key in ("adapterType", "adapter_type", "type", "id", "key", "name"):
        candidate = value.get(key)
        if candidate == "hermes_local":
            return candidate
    return value.get("adapterType") or value.get("adapter_type") or value.get("type")


def _count_delta(counts: Mapping[str, Any], field: str) -> int | None:
    value = counts.get(field)
    if isinstance(value, bool):
        return int(value)
    if isinstance(value, int):
        return value
    if isinstance(value, float) and value.is_integer():
        return int(value)
    return None


def _counter_delta(container: Mapping[str, Any], names: Sequence[str], field: str = "delta") -> int | None:
    counts: Mapping[str, Any] = {}
    for name in names:
        candidate = container.get(name)
        if isinstance(candidate, Mapping):
            counts = candidate
            break
    if not counts:
        return None
    delta = _count_delta(counts, field)
    if delta is not None:
        return delta
    before = _count_delta(counts, "before")
    after = _count_delta(counts, "after")
    if before is not None and after is not None:
        return after - before
    return None


def _result_json(run: Mapping[str, Any]) -> Mapping[str, Any]:
    return _as_mapping(run.get("resultJson") or run.get("result_json") or _nested_get(run, "final_readback.json.resultJson"))


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


def _flag_value_is_false_or_empty(value: Any) -> bool:
    if value in (False, 0, "false", "False", "no", "No", None):
        return True
    if value in ([], {}, ""):
        return True
    return False


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
    unsupported_used = evidence.get("unsupported_paths_used") or evidence.get("unsupportedPathsUsed")
    if isinstance(unsupported_used, list) and unsupported_used:
        errors.add("unsupported_paths_used", "unsupported paths must not be used for M005 S01 proof")


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
        errors.add("no_core_modification.method", "must describe the supported Paperclip boundary used")


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
    if evidence.get("passing") is True:
        errors.add("passing", "fail-closed blocker artifact cannot mark itself passing")
    if evidence.get("capability_promotions") or evidence.get("promoted_capabilities"):
        errors.add("capability_promotions", "fail-closed blocker artifacts must not promote runtime execution capability")
    diagnostics = evidence.get("diagnostics") or evidence.get("blocker_evidence") or evidence.get("blockerEvidence")
    if not diagnostics:
        errors.add("diagnostics", "fail-closed blocker artifacts require redacted diagnostic evidence")
    adapter = _as_mapping(evidence.get("adapter"))
    if adapter and _adapter_type_from(adapter) != "hermes_local":
        errors.add("adapter.adapterType", "blocker diagnostics for hermes must identify hermes_local when adapter is present")


def _validate_paperclip_lifecycle(evidence: Mapping[str, Any], errors: ErrorCollector) -> None:
    lifecycle = _as_mapping(_nested_get(evidence, "paperclip.lifecycle") or evidence.get("paperclip_lifecycle"))
    if lifecycle:
        for key in ("agentCreated", "runCreated", "runReadback"):
            alternate = key[0].lower() + re.sub(r"([A-Z])", r"_\1", key[1:]).lower()
            if lifecycle.get(key) is not True and lifecycle.get(alternate) is not True:
                errors.add(f"paperclip.lifecycle.{key}", "passing Hermes proof requires Paperclip-owned lifecycle/readback=true")
        return
    agent = _as_mapping(evidence.get("agent"))
    run = _as_mapping(evidence.get("run"))
    if _nested_get(agent, "create_response.ok") is not True:
        errors.add("paperclip.lifecycle.agentCreated", "passing Hermes proof requires Paperclip-owned agent create lifecycle proof")
    if not (_non_empty_string(run.get("runId")) or _non_empty_string(run.get("id"))):
        errors.add("paperclip.lifecycle.runCreated", "passing Hermes proof requires Paperclip-owned run id")
    if not (run.get("final_readback") or run.get("readback") or evidence.get("readback")):
        errors.add("paperclip.lifecycle.runReadback", "passing Hermes proof requires Paperclip-owned run readback")


def _validate_hermes_xiaomi_proof(evidence: Mapping[str, Any], errors: ErrorCollector) -> None:
    if evidence.get("selected_path") != SELECTED_HERMES_PATH:
        errors.add("selected_path", f"must be {SELECTED_HERMES_PATH!r}")
    adapter = _as_mapping(evidence.get("adapter"))
    if _adapter_type_from(adapter) != "hermes_local":
        errors.add("adapter.adapterType", "must be hermes_local")
    agent = _as_mapping(evidence.get("agent"))
    if agent:
        config = _as_mapping(agent.get("config") or agent.get("create_body"))
        readback = _as_mapping(agent.get("readback") or agent.get("create_response", {}).get("json") if isinstance(agent.get("create_response"), Mapping) else None)
        if config and _adapter_type_from(config) != "hermes_local":
            errors.add("agent.config.adapterType", "agent config must request hermes_local")
        if readback and _adapter_type_from(readback) != "hermes_local":
            errors.add("agent.readback.adapterType", "agent/Paperclip readback must prove hermes_local")
    _validate_paperclip_lifecycle(evidence, errors)

    run = _as_mapping(evidence.get("run"))
    status = run.get("status") or run.get("runStatus") or _nested_get(run, "final_readback.json.status") or _nested_get(run, "final_readback.json.resultStatus")
    if not _status_is_pass(status):
        errors.add("run.status", "passing Hermes proof requires status succeeded")
    result_json = _result_json(run)
    bos = _as_mapping(result_json.get("bos"))
    if not bos:
        errors.add("run.resultJson.bos", "passing Hermes proof requires parseable resultJson.bos")
    elif not _non_empty_string(bos.get("schemaVersion") or bos.get("schema_version")):
        errors.add("run.resultJson.bos.schemaVersion", "BOS result must include schemaVersion")

    wake_delta = _counter_delta(run, ("wakeCounts", "wake_counts"))
    if wake_delta is None:
        direct_wake = run.get("wakeCountDelta") or run.get("wake_count_delta")
        wake_delta = direct_wake if isinstance(direct_wake, int) and not isinstance(direct_wake, bool) else None
    if wake_delta != 1:
        errors.add("run.wakeCountDelta", "expected exactly one wake and no duplicate wake side effect")

    approvals_created = _counter_delta(run, ("approvalCounts", "approval_counts"), "created")
    if approvals_created is None:
        direct_approvals = run.get("approvalsCreated") or run.get("approvals_created")
        approvals_created = direct_approvals if isinstance(direct_approvals, int) and not isinstance(direct_approvals, bool) else 0
    safety = _as_mapping(evidence.get("safety"))
    if approvals_created and not (safety.get("created_approvals_declared_safe") is True and _non_empty_string(safety.get("created_approvals_safety_rationale"))):
        errors.add("run.approvalCounts.created", "created approvals require explicit safe declaration and rationale")
    _validate_no_core_modification(evidence, errors)


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
        _validate_hermes_xiaomi_proof(evidence, errors)
    classification = "invalid"
    if not errors.errors:
        classification = "blocker" if artifact_type == BLOCKER_ARTIFACT_TYPE else "passing"
    return errors.errors, classification


def validate(evidence_path: Path | None = None, root: Path = ROOT) -> tuple[list[str], str]:
    """Return (errors, classification) for M005 S01 evidence."""

    root = root.resolve()
    if evidence_path is None:
        return ["evidence: provide an evidence path for validation"], "invalid"
    return _validate_artifact(evidence_path, root)


def _write_audit(path: Path, root: Path, evidence_path: Path | None, errors: Sequence[str], classification: str) -> None:
    """Persist a redacted machine-readable closeout/audit result."""

    payload = {
        "schema_version": "m005-s01-hermes-xiaomi-closeout/v1",
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
    parser = argparse.ArgumentParser(description="Validate M005 S01 Hermes Xiaomi probe evidence artifacts.")
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
        print("M005 S01 Hermes Xiaomi probe validation failed:", file=sys.stderr)
        for error in errors:
            print(f"- {error}", file=sys.stderr)
        return 1
    if classification == "blocker":
        print("M005 S01 Hermes Xiaomi probe blocker artifact OK: fail-closed diagnostics are valid, but this is not passing runtime proof.")
        return 0
    print("M005 S01 Hermes Xiaomi probe proof OK: supported-boundary runtime execution contract is satisfied.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
