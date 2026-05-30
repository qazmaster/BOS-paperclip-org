#!/usr/bin/env python3
"""Validate S03 GSD-Pi local adapter smoke evidence artifacts.

The validator is standard-library-only and fail-closed. Passing evidence must prove
`gsdpi_local` adapter readback and the relevant phase contract. Blocker artifacts
are accepted as diagnostic evidence only, never as passing runtime proof.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from datetime import datetime
from pathlib import Path
from typing import Any, Iterable, Mapping, Sequence

ROOT = Path(__file__).resolve().parents[1]
REPORT_PATH = Path("PAPERCLIP_LIVE_VALIDATION_REPORT.md")
HEALTH_PATH = Path("docs/08_RUNTIME_CAPABILITY_HEALTH.md")
MATRIX_PATH = Path("plugin-bos-light/capabilities.paperclip-runtime.json")

SCHEMA_VERSION = "s03-gsdpi-smoke/v1"
PASSING_ARTIFACT_TYPE = "smoke-evidence"
BLOCKER_ARTIFACT_TYPE = "fail-closed-blocker"
PHASES = {"environment", "registration", "execute", "final"}
EVIDENCE_PHASES = {"environment", "registration", "execute"}
STATUS_PASS = {"pass", "passed", "ok", "success", "succeeded"}
RESULT_STATUSES = {"succeeded", "failed", "blocked", "needs_input"}

SECRET_KEY_RE = re.compile(
    r"(?:secret|token|password|passwd|api[_-]?key|credential|private[_-]?key|authorization|bearer)",
    re.IGNORECASE,
)
SECRET_VALUE_RE = re.compile(
    r"("
    r"sk-[A-Za-z0-9_\-]{8,}|"
    r"gh[pousr]_[A-Za-z0-9_]{8,}|"
    r"xox[baprs]-[A-Za-z0-9\-]{8,}|"
    r"AKIA[0-9A-Z]{8,}|"
    r"(?:Bearer\s+)[A-Za-z0-9._\-]{8,}|"
    r"[A-Za-z_][A-Za-z0-9_]*(?:TOKEN|SECRET|PASSWORD|API_KEY)=[^\s\"']+"
    r")",
    re.IGNORECASE,
)
REDACTED_VALUES = {"<redacted>", "[redacted]", "redacted", "***", ""}


class ErrorCollector:
    def __init__(self) -> None:
        self.errors: list[str] = []

    def add(self, context: str, message: str) -> None:
        self.errors.append(f"{context}: {message}")


def _load_json(path: Path, label: str, errors: ErrorCollector) -> Any | None:
    if not path.exists():
        errors.add(label, f"missing JSON file at {path}")
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        errors.add(label, f"malformed JSON at line {exc.lineno}, column {exc.colno}: {exc.msg}")
    except OSError as exc:
        errors.add(label, f"unable to read file: {exc.strerror or exc}")
    return None


def _read_text(path: Path, label: str, errors: ErrorCollector) -> str:
    if not path.exists():
        errors.add(label, f"missing text file at {path}")
        return ""
    try:
        return path.read_text(encoding="utf-8")
    except OSError as exc:
        errors.add(label, f"unable to read file: {exc.strerror or exc}")
        return ""


def _as_mapping(value: Any) -> Mapping[str, Any]:
    return value if isinstance(value, Mapping) else {}


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


def _validate_redaction(evidence: Mapping[str, Any], errors: ErrorCollector) -> None:
    for path, key, value in _walk_json(evidence):
        if key is not None and SECRET_KEY_RE.search(key):
            if isinstance(value, str) and value.strip().lower() not in REDACTED_VALUES:
                errors.add(path, "secret-like field must be redacted")
            elif isinstance(value, (Mapping, list)):
                serialized = json.dumps(value, sort_keys=True)
                if "<redacted>" not in serialized and serialized not in ("{}", "[]"):
                    errors.add(path, "secret-like object/list field must contain only redacted content")
        if isinstance(value, str) and SECRET_VALUE_RE.search(value):
            errors.add(path, "secret-like string value is not redacted")


def _adapter_type_from(value: Mapping[str, Any]) -> Any:
    for key in ("adapterType", "adapter_type", "type", "id", "key", "name"):
        candidate = value.get(key)
        if candidate == "gsdpi_local":
            return candidate
    return value.get("adapterType") or value.get("adapter_type") or value.get("type")


def _load_expected_docs(root: Path, report_path: Path, health_path: Path, matrix_path: Path, errors: ErrorCollector) -> Mapping[str, Mapping[str, Any]]:
    report_text = _read_text(root / report_path, str(report_path), errors)
    health_text = _read_text(root / health_path, str(health_path), errors)
    matrix = _load_json(root / matrix_path, str(matrix_path), errors)

    if report_text:
        for phrase in ("gsdpi_local", "BosAdapterResult", "No Paperclip core"):
            if phrase not in report_text:
                errors.add(str(report_path), f"missing expected S03 boundary phrase {phrase!r}")
    if health_text:
        for phrase in ("unvalidated", "plugin-bos-light/capabilities.paperclip-runtime.json"):
            if phrase not in health_text:
                errors.add(str(health_path), f"missing runtime-boundary phrase {phrase!r}")

    entries_by_key: dict[str, Mapping[str, Any]] = {}
    if isinstance(matrix, Mapping):
        capabilities = matrix.get("capabilities")
        if isinstance(capabilities, list):
            for entry in capabilities:
                if isinstance(entry, Mapping) and isinstance(entry.get("key"), str):
                    entries_by_key[entry["key"]] = entry
        else:
            errors.add(str(matrix_path), "missing top-level capabilities list")
    for key in ("plugin.runtime.version_build", "plugin.runtime.registration", "registration.tools"):
        if key not in entries_by_key:
            errors.add(str(matrix_path), f"missing required capability key {key!r}")
    return entries_by_key


def _validate_adapter(evidence: Mapping[str, Any], artifact_type: str, errors: ErrorCollector) -> None:
    adapter = _as_mapping(evidence.get("adapter"))
    if _adapter_type_from(adapter) != "gsdpi_local":
        errors.add("adapter.adapterType", "must be gsdpi_local")
    if artifact_type == PASSING_ARTIFACT_TYPE:
        registry = _as_mapping(adapter.get("registry_readback") or adapter.get("registryReadback"))
        if registry and _adapter_type_from(registry) != "gsdpi_local":
            errors.add("adapter.registry_readback.adapterType", "registry readback must identify gsdpi_local")


def _validate_no_core_modification(evidence: Mapping[str, Any], errors: ErrorCollector) -> None:
    proof = _as_mapping(evidence.get("no_core_modification"))
    if not proof:
        errors.add("no_core_modification", "missing proof that Paperclip core was not modified")
        return
    if proof.get("core_source_patched") not in (False, 0, "false"):
        errors.add("no_core_modification.core_source_patched", "must be false")
    if proof.get("direct_db_mutation") not in (False, 0, "false"):
        errors.add("no_core_modification.direct_db_mutation", "must be false")
    modified = proof.get("files_modified", [])
    if not isinstance(modified, list):
        errors.add("no_core_modification.files_modified", "must be a list")
    elif modified:
        errors.add("no_core_modification.files_modified", "must be empty for S03 smoke evidence")
    if not _non_empty_string(proof.get("method")):
        errors.add("no_core_modification.method", "must describe the supported boundary used")


def _validate_environment_phase(evidence: Mapping[str, Any], artifact_type: str, errors: ErrorCollector) -> None:
    _validate_adapter(evidence, artifact_type, errors)
    if artifact_type != PASSING_ARTIFACT_TYPE:
        return
    test_environment = _as_mapping(_as_mapping(evidence.get("adapter")).get("testEnvironment") or _as_mapping(evidence.get("adapter")).get("test_environment"))
    if not _status_is_pass(test_environment.get("status")):
        errors.add("adapter.testEnvironment.status", "passing environment evidence requires a passing GSD-Pi testEnvironment result")
    runtime = _as_mapping(evidence.get("runtime"))
    if not _non_empty_string(runtime.get("command")):
        errors.add("runtime.command", "passing environment evidence requires command path/name")
    _validate_no_core_modification(evidence, errors)


def _validate_registration_phase(evidence: Mapping[str, Any], artifact_type: str, errors: ErrorCollector) -> None:
    _validate_environment_phase(evidence, artifact_type, errors)
    if artifact_type != PASSING_ARTIFACT_TYPE:
        return
    registration = _as_mapping(evidence.get("registration"))
    if registration.get("registered") is not True:
        errors.add("registration.registered", "passing registration evidence requires registered=true")
    if _adapter_type_from(registration) != "gsdpi_local":
        errors.add("registration.adapterType", "registration must identify gsdpi_local")


def _count_delta(counts: Mapping[str, Any], field: str) -> int | None:
    value = counts.get(field)
    if isinstance(value, bool):
        return int(value)
    if isinstance(value, int):
        return value
    if isinstance(value, float) and value.is_integer():
        return int(value)
    return None


def _validate_bos_adapter_result(run: Mapping[str, Any], errors: ErrorCollector) -> None:
    result_json = _as_mapping(run.get("resultJson") or run.get("result_json"))
    result = _as_mapping(result_json.get("bosAdapterResult") or result_json.get("bos_adapter_result"))
    bos = _as_mapping(result_json.get("bos"))
    if not result and not bos:
        errors.add("run.resultJson.bosAdapterResult", "missing required BosAdapterResult or BOS result evidence")
        return
    target = result or bos
    required = ("schemaVersion", "runId", "status") if result else ("schemaVersion", "runId", "issueId", "division", "role", "status")
    for field in required:
        if not _non_empty_string(target.get(field)):
            errors.add(f"run.resultJson.{field}", "missing required non-empty result field")
    if result and target.get("adapterType") != "gsdpi_local":
        errors.add("run.resultJson.bosAdapterResult.adapterType", "must be gsdpi_local")
    status = target.get("status")
    if isinstance(status, str) and status not in RESULT_STATUSES:
        errors.add("run.resultJson.status", f"must be one of {', '.join(sorted(RESULT_STATUSES))}")


def _validate_execute_phase(evidence: Mapping[str, Any], artifact_type: str, errors: ErrorCollector) -> None:
    _validate_environment_phase(evidence, artifact_type, errors)
    if artifact_type != PASSING_ARTIFACT_TYPE:
        return
    agent = _as_mapping(evidence.get("agent"))
    if _adapter_type_from(_as_mapping(agent.get("config"))) != "gsdpi_local":
        errors.add("agent.config.adapterType", "agent config must request gsdpi_local")
    if _adapter_type_from(_as_mapping(agent.get("readback"))) != "gsdpi_local":
        errors.add("agent.readback.adapterType", "agent readback must prove gsdpi_local")
    if not _non_empty_string(agent.get("agentId")):
        errors.add("agent.agentId", "missing agent id")

    run = _as_mapping(evidence.get("run"))
    if not _non_empty_string(run.get("runId")):
        errors.add("run.runId", "missing run id")
    _validate_bos_adapter_result(run, errors)

    wake_counts = _as_mapping(run.get("wakeCounts") or run.get("wake_counts"))
    wake_delta = _count_delta(wake_counts, "delta")
    if wake_delta is None:
        before = _count_delta(wake_counts, "before")
        after = _count_delta(wake_counts, "after")
        if before is not None and after is not None:
            wake_delta = after - before
    if wake_delta != 1:
        errors.add("run.wakeCounts.delta", "expected exactly one wake and no duplicate wake side effect")

    approval_counts = _as_mapping(run.get("approvalCounts") or run.get("approval_counts"))
    approvals_created = _count_delta(approval_counts, "created")
    if approvals_created is None:
        before = _count_delta(approval_counts, "before")
        after = _count_delta(approval_counts, "after")
        if before is not None and after is not None:
            approvals_created = after - before
    if approvals_created != 0:
        errors.add("run.approvalCounts.created", "expected zero created approvals")

    source_writes = _as_mapping(run.get("sourceWriteCounts") or run.get("source_write_counts"))
    for field in ("created", "modified", "deleted"):
        if _count_delta(source_writes, field) not in (0, None):
            errors.add(f"run.sourceWriteCounts.{field}", "expected zero source writes")


def _validate_blocker(evidence: Mapping[str, Any], errors: ErrorCollector) -> None:
    if not _non_empty_string(evidence.get("blocker_reason") or evidence.get("blockerReason")):
        errors.add("blocker_reason", "fail-closed blocker artifacts require a blocker reason")
    if evidence.get("passing") is True:
        errors.add("passing", "fail-closed blocker artifact cannot mark itself passing")
    _validate_adapter(evidence, BLOCKER_ARTIFACT_TYPE, errors)
    _validate_no_core_modification(evidence, errors)


def _validate_final_docs(
    root: Path,
    report_path: Path,
    health_path: Path,
    entries_by_key: Mapping[str, Mapping[str, Any]],
    errors: ErrorCollector,
) -> None:
    report_text = _read_text(root / report_path, str(report_path), errors)
    health_text = _read_text(root / health_path, str(health_path), errors)
    for phrase in ("S03 GSD-Pi", "gsdpi_local", "No Paperclip core"):
        if phrase not in report_text:
            errors.add(str(report_path), f"final docs missing S03 closure phrase {phrase!r}")
    if "GSD-Pi adapter execution remains unvalidated" not in health_text and "gsdpi_local" not in health_text:
        errors.add(str(health_path), "final health report must mention GSD-Pi adapter execution posture")
    for phrase in ("S04", "document/comment/markdown fallbacks", "BosAdapterResult execution"):
        if phrase not in health_text:
            errors.add(str(health_path), f"final health report must preserve downstream S04 GSD-Pi fallback guidance phrase {phrase!r}")
    for key, entry in entries_by_key.items():
        if entry.get("status") == "confirmed":
            errors.add(str(MATRIX_PATH), f"final S03 docs must not leave capability {key!r} confirmed")


def _validate_promoted_capability_proof(evidence: Mapping[str, Any], entries_by_key: Mapping[str, Mapping[str, Any]], errors: ErrorCollector) -> None:
    promoted = [key for key, entry in entries_by_key.items() if entry.get("status") == "confirmed"]
    explicit = evidence.get("capability_promotions") or evidence.get("promoted_capabilities") or []
    promoted.extend(str(item) for item in explicit if isinstance(item, str) and item.strip())
    if not promoted:
        return
    paperclip = _as_mapping(evidence.get("paperclip"))
    adapter = _as_mapping(evidence.get("adapter"))
    registry = _as_mapping(adapter.get("registry_readback") or adapter.get("registryReadback"))
    if not _non_empty_string(paperclip.get("version")):
        errors.add("paperclip.version", f"promoted capabilities {promoted} require Paperclip version proof")
    if not _non_empty_string(paperclip.get("build")):
        errors.add("paperclip.build", f"promoted capabilities {promoted} require Paperclip build proof")
    if _adapter_type_from(registry) != "gsdpi_local":
        errors.add("adapter.registry_readback", f"promoted capabilities {promoted} require gsdpi_local registry readback")


def validate(
    evidence_path: Path,
    root: Path = ROOT,
    report_path: Path = REPORT_PATH,
    health_path: Path = HEALTH_PATH,
    matrix_path: Path = MATRIX_PATH,
    phase_override: str | None = None,
) -> tuple[list[str], str]:
    root = root.resolve()
    errors = ErrorCollector()
    loaded = _load_json(evidence_path, "evidence", errors)
    entries_by_key = _load_expected_docs(root, report_path, health_path, matrix_path, errors)
    if not isinstance(loaded, Mapping):
        errors.add("evidence", "top-level JSON value must be an object")
        return errors.errors, "invalid"

    evidence: Mapping[str, Any] = loaded
    _validate_redaction(evidence, errors)

    if evidence.get("schema_version") != SCHEMA_VERSION:
        errors.add("schema_version", f"must be {SCHEMA_VERSION!r}")
    artifact_type = evidence.get("artifact_type")
    if artifact_type not in {PASSING_ARTIFACT_TYPE, BLOCKER_ARTIFACT_TYPE}:
        errors.add("artifact_type", f"must be {PASSING_ARTIFACT_TYPE!r} or {BLOCKER_ARTIFACT_TYPE!r}")
        artifact_type = "invalid"
    phase = evidence.get("phase")
    if phase not in EVIDENCE_PHASES:
        errors.add("phase", f"must be one of {', '.join(sorted(EVIDENCE_PHASES))}")
    if phase_override and phase_override not in PHASES:
        errors.add("phase", f"override must be one of {', '.join(sorted(PHASES))}")
    if not _parse_timestamp(evidence.get("generated_at")):
        errors.add("generated_at", "must be an ISO-8601 timestamp")

    if phase_override == "final":
        if artifact_type == BLOCKER_ARTIFACT_TYPE:
            _validate_blocker(evidence, errors)
        elif phase == "execute":
            _validate_execute_phase(evidence, artifact_type, errors)
        else:
            errors.add("phase", "final S03 validation requires execute evidence or a fail-closed blocker")
        _validate_final_docs(root, report_path, health_path, entries_by_key, errors)
    elif artifact_type == BLOCKER_ARTIFACT_TYPE:
        _validate_blocker(evidence, errors)
    elif phase == "environment":
        _validate_environment_phase(evidence, artifact_type, errors)
    elif phase == "registration":
        _validate_registration_phase(evidence, artifact_type, errors)
    elif phase == "execute":
        _validate_execute_phase(evidence, artifact_type, errors)

    _validate_promoted_capability_proof(evidence, entries_by_key, errors)

    classification = "invalid"
    if not errors.errors:
        classification = "blocker" if artifact_type == BLOCKER_ARTIFACT_TYPE else "passing"
    return errors.errors, classification


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Validate an S03 GSD-Pi local adapter smoke runtime-evidence JSON artifact.")
    parser.add_argument("evidence_path", type=Path, nargs="?", help="Path to one runtime-evidence/*.json artifact.")
    parser.add_argument("--evidence", dest="evidence_option", type=Path, help="Path to one runtime-evidence/*.json artifact; compatibility form for task plans.")
    parser.add_argument("--phase", choices=sorted(PHASES), help="Require this validation phase.")
    parser.add_argument("--root", type=Path, default=ROOT, help="Repository root containing docs/ and plugin-bos-light/.")
    parser.add_argument("--report", type=Path, default=REPORT_PATH, help="Live validation report path relative to root.")
    parser.add_argument("--health", type=Path, default=HEALTH_PATH, help="Runtime capability health doc path relative to root.")
    parser.add_argument("--matrix", type=Path, default=MATRIX_PATH, help="Capability matrix path relative to root.")
    parser.add_argument("--allow-blocker", action="store_true", help="Return 0 for a valid fail-closed blocker artifact.")
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    evidence_path = args.evidence_option or args.evidence_path
    if evidence_path is None:
        print("S03 GSD-Pi smoke evidence validation failed:", file=sys.stderr)
        print("- evidence: provide an evidence path either positionally or with --evidence", file=sys.stderr)
        return 1
    errors, classification = validate(evidence_path, args.root, args.report, args.health, args.matrix, args.phase)
    if args.phase and args.phase != "final" and not errors:
        loaded = _load_json(evidence_path, "evidence", ErrorCollector())
        if not isinstance(loaded, Mapping) or loaded.get("phase") != args.phase:
            errors = [f"phase: expected {args.phase!r} in {evidence_path}"]
    if errors:
        print("S03 GSD-Pi smoke evidence validation failed:", file=sys.stderr)
        for error in errors:
            print(f"- {error}", file=sys.stderr)
        return 1
    if classification == "blocker":
        print("S03 GSD-Pi smoke blocker artifact OK: fail-closed evidence is valid, but this is not passing adapter proof.")
        return 0 if args.allow_blocker or args.phase == "final" else 2
    print("S03 GSD-Pi smoke evidence OK: GSD-Pi adapter smoke contract is satisfied.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
