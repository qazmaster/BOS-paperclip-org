#!/usr/bin/env python3
"""Validate S10 Hermes/GSD-Pi runtime execution proof artifacts.

This validator is standard-library-only and fail-closed. It accepts redacted
fail-closed blocker artifacts as diagnostic evidence, but passing proof must come
from supported Paperclip runtime boundaries:

* Hermes: selected path hermes_local_with_codex_cli_backend, Paperclip-owned
  lifecycle/readback, hermes_local adapter readback, exactly one wake, safe/no
  approval creation, succeeded run status, and resultJson.bos.
* GSD-Pi: gsdpi_local adapter registry/readback, passing testEnvironment,
  succeeded execute status, and resultJson.bosAdapterResult (or an equivalent
  BosAdapterResult payload).
* Final: docs and the capability matrix may confirm Hermes/GSD-Pi execution only
  when their S10 proof artifacts validate; fail-closed execution rows must stay
  unvalidated, fallback-only, or unsupported and cite explicit S10 evidence.

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
REPORT_PATH = Path("PAPERCLIP_LIVE_VALIDATION_REPORT.md")
HEALTH_PATH = Path("docs/08_RUNTIME_CAPABILITY_HEALTH.md")
MATRIX_PATH = Path("plugin-bos-light/capabilities.paperclip-runtime.json")

SCHEMA_VERSION = "s10-runtime-execution/v1"
PASSING_ARTIFACT_TYPE = "runtime-execution-proof"
BLOCKER_ARTIFACT_TYPE = "fail-closed-blocker"
PHASES = {"hermes", "gsdpi", "final"}
EVIDENCE_PHASES = {"hermes", "gsdpi"}
SELECTED_HERMES_PATH = "hermes_local_with_codex_cli_backend"
STATUS_PASS = {"pass", "passed", "ok", "success", "succeeded"}
EXECUTION_CONFIRMED_STATUSES = {"confirmed"}
FAIL_CLOSED_STATUSES = {"unvalidated", "fallback-only", "unsupported"}
TARGET_CAPABILITY_KEYS = {"hermes.execution", "gsdpi.execution", "gsd-pi.execution", "runtime.hermes_execution", "runtime.gsdpi_execution"}

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
S10_EVIDENCE_RE = re.compile(r"runtime-evidence/M002-S10-[A-Za-z0-9_.\-/]+\.json")


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


def _read_text(path: Path, label: str, errors: ErrorCollector, *, required: bool = True) -> str:
    if not path.exists():
        if required:
            errors.add(label, f"missing text file at {path}")
        return ""
    try:
        return path.read_text(encoding="utf-8")
    except UnicodeDecodeError as exc:
        errors.add(label, f"not valid UTF-8 text: {exc}")
    except OSError as exc:
        errors.add(label, f"unable to read file: {exc.strerror or exc}")
    return ""


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
        if candidate in {"hermes_local", "gsdpi_local"}:
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


def _validate_redaction_text(text: str, label: str, errors: ErrorCollector) -> None:
    match = SECRET_VALUE_RE.search(text)
    if match:
        errors.add(label, f"secret-like text value is not redacted near {match.group(0)[:24]!r}")


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
        errors.add("unsupported_paths_used", "unsupported paths must not be used for S10 proof")


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


def _validate_common_metadata(evidence: Mapping[str, Any], phase_hint: str | None, errors: ErrorCollector) -> tuple[str, str]:
    if evidence.get("schema_version") != SCHEMA_VERSION:
        errors.add("schema_version", f"must be {SCHEMA_VERSION!r}")
    artifact_type = str(evidence.get("artifact_type") or "")
    if artifact_type not in {PASSING_ARTIFACT_TYPE, BLOCKER_ARTIFACT_TYPE}:
        errors.add("artifact_type", f"must be {PASSING_ARTIFACT_TYPE!r} or {BLOCKER_ARTIFACT_TYPE!r}")
    phase = str(evidence.get("phase") or phase_hint or "")
    if phase not in EVIDENCE_PHASES:
        errors.add("phase", f"must be one of {', '.join(sorted(EVIDENCE_PHASES))}")
    if phase_hint in EVIDENCE_PHASES and phase != phase_hint:
        errors.add("phase", f"expected {phase_hint!r} for this validation phase")
    if not _parse_timestamp(evidence.get("generated_at")):
        errors.add("generated_at", "must be an ISO-8601 timestamp")
    _validate_redaction_json(evidence, errors)
    _validate_supported_boundary_flags(evidence, errors)
    return artifact_type, phase


def _validate_blocker(evidence: Mapping[str, Any], phase: str, errors: ErrorCollector) -> None:
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
    expected_adapter = "hermes_local" if phase == "hermes" else "gsdpi_local"
    if adapter and _adapter_type_from(adapter) != expected_adapter:
        errors.add("adapter.adapterType", f"blocker diagnostics for {phase} must identify {expected_adapter} when adapter is present")


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


def _validate_hermes_proof(evidence: Mapping[str, Any], errors: ErrorCollector) -> None:
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


def _validate_bos_adapter_result(run: Mapping[str, Any], errors: ErrorCollector) -> None:
    result_json = _result_json(run)
    result = _as_mapping(
        result_json.get("bosAdapterResult")
        or result_json.get("BosAdapterResult")
        or result_json.get("bos_adapter_result")
        or run.get("BosAdapterResult")
        or run.get("bosAdapterResult")
    )
    equivalent_bos = _as_mapping(result_json.get("bos"))
    if not result and not equivalent_bos:
        errors.add("run.resultJson.bosAdapterResult", "missing required BosAdapterResult or equivalent BOS adapter result evidence")
        return
    target = result or equivalent_bos
    for field in ("schemaVersion", "runId", "status"):
        if not _non_empty_string(target.get(field) or target.get(field[0].lower() + field[1:])):
            errors.add(f"run.resultJson.bosAdapterResult.{field}", "missing required non-empty result field")
    if result and target.get("adapterType") != "gsdpi_local":
        errors.add("run.resultJson.bosAdapterResult.adapterType", "must be gsdpi_local")


def _validate_gsdpi_proof(evidence: Mapping[str, Any], errors: ErrorCollector) -> None:
    adapter = _as_mapping(evidence.get("adapter"))
    if _adapter_type_from(adapter) != "gsdpi_local":
        errors.add("adapter.adapterType", "must be gsdpi_local")
    registry = _as_mapping(adapter.get("registry_readback") or adapter.get("registryReadback") or evidence.get("registry_readback"))
    if _adapter_type_from(registry) != "gsdpi_local":
        errors.add("adapter.registry_readback.adapterType", "passing GSD-Pi proof requires supported registry/readback for gsdpi_local")
    if registry.get("supported") is False or registry.get("loaded") is False:
        errors.add("adapter.registry_readback.supported", "registry/readback must not report unsupported or unloaded")
    test_environment = _as_mapping(adapter.get("testEnvironment") or adapter.get("test_environment"))
    if not _status_is_pass(test_environment.get("status")):
        errors.add("adapter.testEnvironment.status", "passing GSD-Pi proof requires passing testEnvironment")

    run = _as_mapping(evidence.get("run") or evidence.get("execute"))
    status = run.get("status") or run.get("executeStatus") or run.get("resultStatus")
    if not _status_is_pass(status):
        errors.add("run.status", "passing GSD-Pi proof requires execute status succeeded")
    _validate_bos_adapter_result(run, errors)
    _validate_no_core_modification(evidence, errors)


def _target_kind_from_text(text: str) -> str | None:
    lower = text.lower()
    has_execution = "execution" in lower or "runtime" in lower
    if "hermes" in lower and has_execution:
        return "hermes"
    if ("gsdpi" in lower or "gsd-pi" in lower or "gsd_pi" in lower) and has_execution:
        return "gsdpi"
    return None


def _capability_target(entry: Mapping[str, Any]) -> str | None:
    key = str(entry.get("key") or "")
    if key in {"hermes.execution", "runtime.hermes_execution"}:
        return "hermes"
    if key in {"gsdpi.execution", "gsd-pi.execution", "runtime.gsdpi_execution"}:
        return "gsdpi"
    # Only row identity fields decide whether a matrix row is an execution row.
    # Conservative notes on unrelated confirmed rows often say they do *not*
    # confirm Hermes/GSD-Pi execution; those warnings must not be treated as
    # promotions. Once a row is identified as execution, all fields are still
    # scanned for explicit S10 evidence paths below.
    combined_identity = " ".join(str(entry.get(field) or "") for field in ("key", "paperclip_surface_name"))
    return _target_kind_from_text(combined_identity)


def _s10_paths_from_text(text: str) -> list[Path]:
    return [Path(match.group(0)) for match in S10_EVIDENCE_RE.finditer(text)]


def _validate_artifact_capability_promotions(evidence: Mapping[str, Any], phase: str, artifact_type: str, errors: ErrorCollector) -> None:
    explicit = evidence.get("capability_promotions") or evidence.get("promoted_capabilities") or []
    if not explicit:
        return
    if artifact_type != PASSING_ARTIFACT_TYPE:
        errors.add("capability_promotions", "capability promotion requires passing S10 proof, not blocker evidence")
        return
    for item in explicit:
        text = str(item)
        target = _target_kind_from_text(text) or ("hermes" if "hermes" in text.lower() else "gsdpi" if "gsdpi" in text.lower() or "gsd-pi" in text.lower() else None)
        if target and target != phase:
            errors.add("capability_promotions", f"{text!r} does not match {phase} proof")


def _validate_one_artifact(evidence_path: Path, root: Path, phase_hint: str | None = None) -> tuple[list[str], str]:
    errors = ErrorCollector()
    loaded = _load_json(evidence_path, str(evidence_path), errors)
    if not isinstance(loaded, Mapping):
        errors.add("evidence", "top-level JSON value must be an object")
        return errors.errors, "invalid"
    evidence: Mapping[str, Any] = loaded
    artifact_type, phase = _validate_common_metadata(evidence, phase_hint, errors)
    if artifact_type == BLOCKER_ARTIFACT_TYPE:
        _validate_blocker(evidence, phase, errors)
    elif artifact_type == PASSING_ARTIFACT_TYPE:
        if phase == "hermes":
            _validate_hermes_proof(evidence, errors)
        elif phase == "gsdpi":
            _validate_gsdpi_proof(evidence, errors)
    _validate_artifact_capability_promotions(evidence, phase, artifact_type, errors)
    classification = "invalid"
    if not errors.errors:
        classification = "blocker" if artifact_type == BLOCKER_ARTIFACT_TYPE else "passing"
    return errors.errors, classification


def _validate_final_docs(root: Path, report_path: Path, health_path: Path, matrix_path: Path, errors: ErrorCollector) -> None:
    report_text = _read_text(root / report_path, str(report_path), errors, required=False)
    health_text = _read_text(root / health_path, str(health_path), errors, required=False)
    matrix = _load_json(root / matrix_path, str(matrix_path), errors)
    _validate_redaction_text(report_text, str(report_path), errors)
    _validate_redaction_text(health_text, str(health_path), errors)

    combined_docs = f"{report_text}\n{health_text}"
    suspicious_promotions = (
        "hermes execution confirmed",
        "hermes runtime execution confirmed",
        "gsd-pi execution confirmed",
        "gsdpi execution confirmed",
        "gsd-pi runtime execution confirmed",
        "runtime execution support confirmed",
    )
    for phrase in suspicious_promotions:
        if phrase in combined_docs.lower() and not _s10_paths_from_text(combined_docs):
            errors.add("docs", f"promotion phrase {phrase!r} requires explicit S10 proof artifact path")

    if not isinstance(matrix, Mapping):
        errors.add(str(matrix_path), "top-level JSON value must be an object")
        return
    _validate_redaction_json(matrix, errors)
    capabilities = matrix.get("capabilities")
    if not isinstance(capabilities, list):
        errors.add(str(matrix_path), "missing top-level capabilities list")
        return

    for index, entry in enumerate(capabilities):
        if not isinstance(entry, Mapping):
            errors.add(f"{matrix_path}:capabilities[{index}]", "capability row must be an object")
            continue
        target = _capability_target(entry)
        if target is None:
            continue
        status = str(entry.get("status") or "")
        row_label = f"{matrix_path}:capabilities[{index}] ({entry.get('key', 'unknown')})"
        row_text = _json_text(entry)
        s10_paths = _s10_paths_from_text(row_text)
        if status in EXECUTION_CONFIRMED_STATUSES:
            if not s10_paths:
                errors.add(row_label, f"confirmed {target} execution row requires an explicit runtime-evidence/M002-S10-*.json proof path")
                continue
            for relative_path in s10_paths:
                artifact_errors, classification = _validate_one_artifact(root / relative_path, root, target)
                if artifact_errors:
                    for artifact_error in artifact_errors:
                        errors.add(f"{row_label}->{relative_path}", artifact_error)
                if classification != "passing":
                    errors.add(row_label, f"confirmed {target} execution requires passing S10 proof, got {classification}")
        elif status in FAIL_CLOSED_STATUSES:
            if not s10_paths:
                errors.add(row_label, f"fail-closed {target} execution row must cite explicit S10 blocker/proof evidence path")
        else:
            errors.add(row_label, f"{target} execution status must be confirmed only with proof, or one of {', '.join(sorted(FAIL_CLOSED_STATUSES))}")


def validate(
    evidence_path: Path | None = None,
    root: Path = ROOT,
    report_path: Path = REPORT_PATH,
    health_path: Path = HEALTH_PATH,
    matrix_path: Path = MATRIX_PATH,
    phase_override: str | None = None,
) -> tuple[list[str], str]:
    """Return (errors, classification) for S10 evidence or final docs/matrix."""

    root = root.resolve()
    if phase_override == "final":
        errors = ErrorCollector()
        _validate_final_docs(root, report_path, health_path, matrix_path, errors)
        return errors.errors, "final" if not errors.errors else "invalid"
    if evidence_path is None:
        return ["evidence: provide an evidence path for hermes or gsdpi validation"], "invalid"
    return _validate_one_artifact(evidence_path, root, phase_override)


def _write_audit(path: Path, root: Path, phase: str | None, evidence_path: Path | None, errors: Sequence[str], classification: str) -> None:
    """Persist a redacted machine-readable closeout/audit result."""

    payload = {
        "schema_version": "s10-runtime-execution-closeout/v1",
        "artifact_type": "validator-audit",
        "generated_at": datetime.now(UTC).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        "phase": phase or "artifact",
        "classification": classification,
        "passed": not errors,
        "inputs": {
            "evidence_path": str(evidence_path) if evidence_path else None,
            "report_path": str(REPORT_PATH),
            "health_path": str(HEALTH_PATH),
            "matrix_path": str(MATRIX_PATH),
        },
        "diagnostics": {
            "error_count": len(errors),
            "errors": list(errors),
        },
        "posture": {
            "capability_promotions_require_passing_s10_proof": True,
            "fail_closed_rows_must_cite_s10_evidence": True,
            "unsupported_boundaries_rejected": True,
            "plaintext_credential_values_allowed": False,
            "paperclip_core_or_direct_database_mutation_allowed": False,
        },
    }
    target = path if path.is_absolute() else root / path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Validate S10 Hermes/GSD-Pi runtime execution proof artifacts.")
    parser.add_argument("evidence_path", type=Path, nargs="?", help="Path to one runtime-evidence/*.json artifact.")
    parser.add_argument("--evidence", dest="evidence_option", type=Path, help="Path to one runtime-evidence/*.json artifact; compatibility form for task plans.")
    parser.add_argument("--phase", choices=sorted(PHASES), help="Validation phase: hermes, gsdpi, or final.")
    parser.add_argument("--root", type=Path, default=ROOT, help="Repository root containing docs/ and plugin-bos-light/.")
    parser.add_argument("--report", type=Path, default=REPORT_PATH, help="Live validation report path relative to root.")
    parser.add_argument("--health", type=Path, default=HEALTH_PATH, help="Runtime capability health doc path relative to root.")
    parser.add_argument("--matrix", type=Path, default=MATRIX_PATH, help="Capability matrix path relative to root.")
    parser.add_argument("--write-audit", type=Path, help="Write redacted validator closeout JSON to this path, relative to --root unless absolute.")
    parser.add_argument(
        "--allow-blocker",
        action="store_true",
        help="Compatibility no-op: valid fail-closed blocker artifacts already return 0 while preserving blocker classification.",
    )
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    phase = args.phase
    evidence_path = args.evidence_option or args.evidence_path
    errors, classification = validate(evidence_path, args.root, args.report, args.health, args.matrix, phase)
    if args.write_audit:
        _write_audit(args.write_audit, args.root.resolve(), phase, evidence_path, errors, classification)
    if errors:
        print("S10 runtime execution validation failed:", file=sys.stderr)
        for error in errors:
            print(f"- {error}", file=sys.stderr)
        return 1
    if classification == "blocker":
        print("S10 runtime execution blocker artifact OK: fail-closed diagnostics are valid, but this is not passing runtime proof.")
        return 0
    if classification == "final":
        print("S10 runtime execution final docs/matrix OK: execution capability posture is proof-gated.")
        return 0
    print("S10 runtime execution proof OK: supported-boundary runtime execution contract is satisfied.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
