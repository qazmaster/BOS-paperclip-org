#!/usr/bin/env python3
"""Validate S02 Hermes BOS smoke evidence artifacts.

The validator is intentionally standard-library-only and fail-closed. It reads a
single redacted runtime-evidence JSON artifact plus the reader-facing runtime
report, runtime health doc, and capability matrix paths that explain the S02
proof boundary. Passing smoke evidence must prove Hermes adapter readback,
runtime environment success, exactly one bounded wake, no created approvals, and
`resultJson.bos` content. Fail-closed blocker artifacts are accepted only as
blocker records, never as passing smoke proof.
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

SCHEMA_VERSION = "s02-hermes-smoke/v1"
PASSING_ARTIFACT_TYPE = "smoke-evidence"
BLOCKER_ARTIFACT_TYPE = "fail-closed-blocker"
PHASES = {"environment", "agent-smoke", "final"}
EVIDENCE_PHASES = {"environment", "agent-smoke"}
STATUS_PASS = {"pass", "passed", "ok", "success", "succeeded"}
BOS_STATUSES = {"succeeded", "failed", "blocked", "needs_input"}

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
    """Accumulate all failures so live operators get one actionable report."""

    def __init__(self) -> None:
        self.errors: list[str] = []

    def add(self, context: str, message: str) -> None:
        self.errors.append(f"{context}: {message}")

    def extend(self, context: str, messages: Iterable[str]) -> None:
        for message in messages:
            self.add(context, message)


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


def _as_sequence(value: Any) -> Sequence[Any]:
    return value if isinstance(value, list) else []


def _non_empty_string(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _status_is_pass(value: Any) -> bool:
    return isinstance(value, str) and value.strip().lower() in STATUS_PASS


def _parse_timestamp(value: Any) -> bool:
    if not isinstance(value, str) or not value.strip():
        return False
    normalized = value.strip().replace("Z", "+00:00")
    try:
        datetime.fromisoformat(normalized)
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


def _load_expected_docs(root: Path, report_path: Path, health_path: Path, matrix_path: Path, errors: ErrorCollector) -> Mapping[str, Any]:
    report_text = _read_text(root / report_path, str(report_path), errors)
    health_text = _read_text(root / health_path, str(health_path), errors)
    matrix = _load_json(root / matrix_path, str(matrix_path), errors)

    if report_text:
        for phrase in ("hermes_local", "resultJson.bos", "no approvals"):
            if phrase not in report_text:
                errors.add(str(report_path), f"missing expected S02 boundary phrase {phrase!r}")
    if health_text:
        for phrase in ("no live Paperclip runtime evidence", "plugin-bos-light/capabilities.paperclip-runtime.json"):
            if phrase not in health_text:
                errors.add(str(health_path), f"missing runtime-boundary phrase {phrase!r}")

    entries_by_key: dict[str, Mapping[str, Any]] = {}
    if isinstance(matrix, Mapping):
        capabilities = matrix.get("capabilities")
        if not isinstance(capabilities, list):
            errors.add(str(matrix_path), "missing top-level capabilities list")
        else:
            for index, entry in enumerate(capabilities):
                if not isinstance(entry, Mapping):
                    errors.add(str(matrix_path), f"capabilities[{index}] must be an object")
                    continue
                key = entry.get("key")
                if isinstance(key, str) and key.strip():
                    entries_by_key[key] = entry
    for key in ("plugin.runtime.version_build", "plugin.runtime.registration", "approvals.native"):
        if key not in entries_by_key:
            errors.add(str(matrix_path), f"missing required capability key {key!r}")
    return entries_by_key


def _adapter_type_from(value: Mapping[str, Any]) -> Any:
    for key in ("adapterType", "adapter_type", "type", "id", "key", "name"):
        candidate = value.get(key)
        if candidate == "hermes_local":
            return candidate
    return value.get("adapterType") or value.get("adapter_type") or value.get("type")


def _validate_adapter(evidence: Mapping[str, Any], artifact_type: str, errors: ErrorCollector) -> None:
    adapter = _as_mapping(evidence.get("adapter"))
    adapter_type = _adapter_type_from(adapter)
    if adapter_type != "hermes_local":
        errors.add("adapter.adapterType", "must be hermes_local")

    test_environment = _as_mapping(adapter.get("testEnvironment") or adapter.get("test_environment"))
    if artifact_type == PASSING_ARTIFACT_TYPE and not _status_is_pass(test_environment.get("status")):
        errors.add("adapter.testEnvironment.status", "passing smoke evidence requires a passing Hermes testEnvironment result")

    registry_readback = _as_mapping(adapter.get("registry_readback") or adapter.get("registryReadback"))
    if artifact_type == PASSING_ARTIFACT_TYPE:
        if not registry_readback:
            errors.add("adapter.registry_readback", "passing smoke evidence requires adapter registry readback")
        elif _adapter_type_from(registry_readback) != "hermes_local":
            errors.add("adapter.registry_readback.adapterType", "registry readback must identify hermes_local")


def _validate_environment_phase(evidence: Mapping[str, Any], artifact_type: str, errors: ErrorCollector) -> None:
    _validate_adapter(evidence, artifact_type, errors)
    if artifact_type == PASSING_ARTIFACT_TYPE:
        paperclip = _as_mapping(evidence.get("paperclip"))
        if not _non_empty_string(paperclip.get("version")) or not _non_empty_string(paperclip.get("build")):
            errors.add("paperclip.version_build", "passing environment evidence requires Paperclip version and build")


def _count_delta(counts: Mapping[str, Any], field: str) -> int | None:
    value = counts.get(field)
    if isinstance(value, bool):
        return int(value)
    if isinstance(value, int):
        return value
    if isinstance(value, float) and value.is_integer():
        return int(value)
    return None


def _validate_bos_result(run: Mapping[str, Any], errors: ErrorCollector) -> None:
    result_json = _as_mapping(run.get("resultJson") or run.get("result_json"))
    bos = _as_mapping(result_json.get("bos"))
    if not bos:
        errors.add("run.resultJson.bos", "missing required BOS result evidence")
        return
    for field in ("schemaVersion", "runId", "issueId", "division", "role", "status"):
        if not _non_empty_string(bos.get(field)):
            errors.add(f"run.resultJson.bos.{field}", "missing required non-empty BOS field")
    status = bos.get("status")
    if isinstance(status, str) and status not in BOS_STATUSES:
        errors.add("run.resultJson.bos.status", f"must be one of {', '.join(sorted(BOS_STATUSES))}")


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
        errors.add("no_core_modification.files_modified", "must be empty for S02 smoke evidence")
    if not _non_empty_string(proof.get("method")):
        errors.add("no_core_modification.method", "must describe the supported API/browser-auth boundary used")


def _validate_agent_smoke_phase(evidence: Mapping[str, Any], artifact_type: str, errors: ErrorCollector) -> None:
    _validate_adapter(evidence, artifact_type, errors)
    if artifact_type != PASSING_ARTIFACT_TYPE:
        return

    agent = _as_mapping(evidence.get("agent"))
    config = _as_mapping(agent.get("config"))
    readback = _as_mapping(agent.get("readback"))
    if _adapter_type_from(config) != "hermes_local":
        errors.add("agent.config.adapterType", "agent config must request hermes_local")
    if _adapter_type_from(readback) != "hermes_local":
        errors.add("agent.readback.adapterType", "agent readback must prove hermes_local")
    if not _non_empty_string(agent.get("companyId")):
        errors.add("agent.companyId", "missing company id")
    if not _non_empty_string(agent.get("agentId")):
        errors.add("agent.agentId", "missing agent id")

    run = _as_mapping(evidence.get("run"))
    if not _non_empty_string(run.get("runId")):
        errors.add("run.runId", "missing run id")
    _validate_bos_result(run, errors)

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

    _validate_no_core_modification(evidence, errors)


def _promoted_capability_keys(evidence: Mapping[str, Any], entries_by_key: Mapping[str, Mapping[str, Any]]) -> list[str]:
    explicit = evidence.get("capability_promotions") or evidence.get("promoted_capabilities") or []
    promoted = [str(item) for item in explicit if isinstance(item, str) and item.strip()]
    for key, entry in entries_by_key.items():
        if entry.get("status") == "confirmed" and key not in promoted:
            promoted.append(key)
    return promoted


def _validate_promoted_capability_proof(
    evidence: Mapping[str, Any],
    entries_by_key: Mapping[str, Mapping[str, Any]],
    errors: ErrorCollector,
) -> None:
    promoted = _promoted_capability_keys(evidence, entries_by_key)
    if not promoted:
        return
    paperclip = _as_mapping(evidence.get("paperclip"))
    adapter = _as_mapping(evidence.get("adapter"))
    agent = _as_mapping(evidence.get("agent"))
    registry = _as_mapping(adapter.get("registry_readback") or adapter.get("registryReadback"))
    readback = _as_mapping(agent.get("readback"))
    if not _non_empty_string(paperclip.get("version")):
        errors.add("paperclip.version", f"promoted capabilities {promoted} require Paperclip version proof")
    if not _non_empty_string(paperclip.get("build")):
        errors.add("paperclip.build", f"promoted capabilities {promoted} require Paperclip build proof")
    if _adapter_type_from(registry) != "hermes_local":
        errors.add("adapter.registry_readback", f"promoted capabilities {promoted} require Hermes adapter registry readback")
    if _adapter_type_from(readback) != "hermes_local":
        errors.add("agent.readback", f"promoted capabilities {promoted} require Hermes agent readback proof")


def _validate_blocker(evidence: Mapping[str, Any], errors: ErrorCollector) -> None:
    reason = evidence.get("blocker_reason") or evidence.get("blockerReason")
    if not _non_empty_string(reason):
        errors.add("blocker_reason", "fail-closed blocker artifacts require a blocker reason")
    phase = evidence.get("phase")
    diagnostics = evidence.get("diagnostics")
    adapter = _as_mapping(evidence.get("adapter"))
    test_environment = _as_mapping(adapter.get("testEnvironment") or adapter.get("test_environment"))
    if phase == "environment" and not test_environment and not diagnostics:
        errors.add("diagnostics", "environment blocker must include testEnvironment output or diagnostics")
    if evidence.get("passing") is True:
        errors.add("passing", "fail-closed blocker artifact cannot mark itself passing")


def _validate_final_docs(
    evidence: Mapping[str, Any],
    artifact_type: str,
    root: Path,
    report_path: Path,
    health_path: Path,
    matrix_path: Path,
    entries_by_key: Mapping[str, Mapping[str, Any]],
    errors: ErrorCollector,
) -> None:
    """Validate the S02 closure docs without promoting blocked smoke evidence."""

    report_text = _read_text(root / report_path, str(report_path), errors)
    health_text = _read_text(root / health_path, str(health_path), errors)
    matrix = _load_json(root / matrix_path, str(matrix_path), errors)

    required_report_phrases = (
        "Execution-time secret materialization",
        "Missing Authentication header",
        "No Paperclip core source, package code, or database rows were patched directly",
        "Approvals created | `0`",
        "not passing smoke proof",
    )
    for phrase in required_report_phrases:
        if phrase not in report_text:
            errors.add(str(report_path), f"final docs missing S02 closure phrase {phrase!r}")

    required_health_phrases = (
        "T03 remains blocked",
        "execution-time secret materialization",
        "Do not treat the S02 Hermes adapter as a passing runtime execution surface",
    )
    for phrase in required_health_phrases:
        if phrase not in health_text:
            errors.add(str(health_path), f"final health report missing conservative blocker phrase {phrase!r}")

    if isinstance(matrix, Mapping):
        for key, entry in entries_by_key.items():
            if entry.get("status") == "confirmed":
                errors.add(str(matrix_path), f"final S02 blocker docs must not leave capability {key!r} confirmed")

    plugin_version = entries_by_key.get("plugin.runtime.version_build")
    if plugin_version and plugin_version.get("status") != "unvalidated":
        errors.add(str(matrix_path), "plugin.runtime.version_build must remain unvalidated without passing runtime version/build proof")
    plugin_registration = entries_by_key.get("plugin.runtime.registration")
    if plugin_registration and plugin_registration.get("status") != "unvalidated":
        errors.add(str(matrix_path), "plugin.runtime.registration must remain unvalidated without live plugin load proof")

    if artifact_type == BLOCKER_ARTIFACT_TYPE:
        blocker_reason = evidence.get("blocker_reason") or evidence.get("blockerReason")
        if not _non_empty_string(blocker_reason):
            errors.add("blocker_reason", "final blocker evidence requires a blocker reason")
    else:
        _validate_agent_smoke_phase(evidence, artifact_type, errors)


def validate(
    evidence_path: Path,
    root: Path = ROOT,
    report_path: Path = REPORT_PATH,
    health_path: Path = HEALTH_PATH,
    matrix_path: Path = MATRIX_PATH,
    phase_override: str | None = None,
) -> tuple[list[str], str]:
    """Return (errors, classification) for one S02 evidence artifact."""

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
    if not _parse_timestamp(evidence.get("generated_at")):
        errors.add("generated_at", "must be an ISO-8601 timestamp")

    if phase_override == "final":
        if artifact_type == BLOCKER_ARTIFACT_TYPE:
            _validate_blocker(evidence, errors)
        _validate_final_docs(evidence, artifact_type, root, report_path, health_path, matrix_path, entries_by_key, errors)
    elif artifact_type == BLOCKER_ARTIFACT_TYPE:
        _validate_blocker(evidence, errors)
    elif phase == "environment":
        _validate_environment_phase(evidence, artifact_type, errors)
    elif phase == "agent-smoke":
        _validate_agent_smoke_phase(evidence, artifact_type, errors)

    _validate_promoted_capability_proof(evidence, entries_by_key, errors)

    classification = "invalid"
    if not errors.errors:
        classification = "blocker" if artifact_type == BLOCKER_ARTIFACT_TYPE else "passing"
    return errors.errors, classification


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Validate an S02 Hermes BOS smoke runtime-evidence JSON artifact.")
    parser.add_argument("evidence_path", type=Path, nargs="?", help="Path to one runtime-evidence/*.json artifact.")
    parser.add_argument("--evidence", dest="evidence_option", type=Path, help="Path to one runtime-evidence/*.json artifact; compatibility form for task plans.")
    parser.add_argument("--phase", choices=sorted(PHASES), help="Require the evidence artifact to have this phase; compatibility form for task plans.")
    parser.add_argument("--root", type=Path, default=ROOT, help="Repository root containing docs/ and plugin-bos-light/.")
    parser.add_argument("--report", type=Path, default=REPORT_PATH, help="Live validation report path relative to root.")
    parser.add_argument("--health", type=Path, default=HEALTH_PATH, help="Runtime capability health doc path relative to root.")
    parser.add_argument("--matrix", type=Path, default=MATRIX_PATH, help="Capability matrix path relative to root.")
    parser.add_argument(
        "--allow-blocker",
        action="store_true",
        help="Return 0 for a valid fail-closed blocker artifact. Without this flag blockers return 2.",
    )
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    evidence_path = args.evidence_option or args.evidence_path
    if evidence_path is None:
        print("S02 Hermes smoke evidence validation failed:", file=sys.stderr)
        print("- evidence: provide an evidence path either positionally or with --evidence", file=sys.stderr)
        return 1
    errors, classification = validate(evidence_path, args.root, args.report, args.health, args.matrix, args.phase)
    if args.phase and args.phase != "final" and not errors:
        loaded = _load_json(evidence_path, "evidence", ErrorCollector())
        if not isinstance(loaded, Mapping) or loaded.get("phase") != args.phase:
            errors = [f"phase: expected {args.phase!r} in {evidence_path}"]
    if errors:
        print("S02 Hermes smoke evidence validation failed:", file=sys.stderr)
        for error in errors:
            print(f"- {error}", file=sys.stderr)
        return 1
    if classification == "blocker":
        print("S02 Hermes smoke blocker artifact OK: fail-closed evidence is valid, but this is not passing smoke proof.")
        return 0 if args.allow_blocker or args.phase == "final" else 2
    print("S02 Hermes smoke evidence OK: Hermes environment/agent smoke contract is satisfied.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
