#!/usr/bin/env python3
"""Validate S04 live BOS artifact-flow evidence.

The validator is standard-library-only and intentionally fail-closed. Final S04
validation requires live readback proof for issue, document, and comment surfaces;
all five BOS artifact families; zero native approvals; propagated S02 Hermes and
S03 GSD-Pi no-go posture; runtime version/build evidence; redacted diagnostics;
and no Paperclip core/private-module/direct-DB mutation claims.
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
DEFAULT_EVIDENCE = Path("runtime-evidence/M002-S04-live-artifact-flow.json")
SCHEMA_VERSION = "s04-live-artifact-flow/v1"
PASSING_ARTIFACT_TYPE = "live-evidence"
BLOCKER_ARTIFACT_TYPE = "fail-closed-blocker"
PHASES = {"contract", "live", "final"}
EVIDENCE_PHASES = {"live"}
ARTIFACT_FAMILIES = ("BPI", "Blueprint", "Betting Table", "Eval Gate", "Circuit Breaker")
SECRET_KEY_RE = re.compile(
    r"(?:secret|token|password|passwd|api[_-]?key|credential|private[_-]?key|authorization|bearer|cookie)",
    re.IGNORECASE,
)
SECRET_VALUE_RE = re.compile(
    r"("
    r"sk-[A-Za-z0-9_\-]{8,}|"
    r"gh[pousr]_[A-Za-z0-9_]{8,}|"
    r"xox[baprs]-[A-Za-z0-9\-]{8,}|"
    r"AKIA[0-9A-Z]{8,}|"
    r"(?:Bearer\s+)[A-Za-z0-9._~+/\-=]{8,}|"
    r"(?:Cookie:\s*)?[^\s=;]*(?:session|token|secret|password|api[_-]?key)[^\s=;]*=[^\s\"']+|"
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


def _as_mapping(value: Any) -> Mapping[str, Any]:
    return value if isinstance(value, Mapping) else {}


def _as_sequence(value: Any) -> Sequence[Any]:
    return value if isinstance(value, list) else []


def _non_empty_string(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _non_unknown_string(value: Any) -> bool:
    return _non_empty_string(value) and str(value).strip().lower() not in {"unknown", "n/a", "none", "null"}


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
        if key is not None and SECRET_KEY_RE.search(key) and not (key.endswith("_env") or key.endswith("Env")):
            if isinstance(value, str) and value.strip().lower() not in REDACTED_VALUES:
                errors.add(path, "secret-like field must be redacted")
            elif isinstance(value, (Mapping, list)):
                serialized = json.dumps(value, sort_keys=True)
                if "<redacted>" not in serialized and serialized not in ("{}", "[]"):
                    errors.add(path, "secret-like object/list field must contain only redacted content")
        if isinstance(value, str) and SECRET_VALUE_RE.search(value):
            errors.add(path, "secret-like string value is not redacted")


def _count(value: Any) -> int | None:
    if isinstance(value, bool):
        return int(value)
    if isinstance(value, int):
        return value
    if isinstance(value, float) and value.is_integer():
        return int(value)
    return None


def _validate_basic_contract(evidence: Mapping[str, Any], errors: ErrorCollector) -> str:
    if evidence.get("schema_version") != SCHEMA_VERSION:
        errors.add("schema_version", f"must be {SCHEMA_VERSION!r}")
    artifact_type = evidence.get("artifact_type")
    if artifact_type not in {PASSING_ARTIFACT_TYPE, BLOCKER_ARTIFACT_TYPE}:
        errors.add("artifact_type", f"must be {PASSING_ARTIFACT_TYPE!r} or {BLOCKER_ARTIFACT_TYPE!r}")
        artifact_type = "invalid"
    if evidence.get("phase") not in EVIDENCE_PHASES:
        errors.add("phase", f"must be one of {', '.join(sorted(EVIDENCE_PHASES))}")
    if not _parse_timestamp(evidence.get("generated_at")):
        errors.add("generated_at", "must be an ISO-8601 timestamp")
    inputs = _as_mapping(evidence.get("inputs"))
    for field in ("base_url", "companyId", "auth_token_env", "auth_header_name"):
        if not _non_empty_string(inputs.get(field)):
            errors.add(f"inputs.{field}", "missing required runner input echo")
    return str(artifact_type)


def _validate_runtime(evidence: Mapping[str, Any], errors: ErrorCollector) -> None:
    runtime = _as_mapping(evidence.get("runtime"))
    if not _non_unknown_string(runtime.get("version")):
        errors.add("runtime.version", "final validation requires Paperclip runtime version evidence")
    if not _non_unknown_string(runtime.get("build")):
        errors.add("runtime.build", "final validation requires Paperclip runtime build evidence")


def _validate_readback(name: str, value: Mapping[str, Any], errors: ErrorCollector) -> None:
    if not value:
        errors.add(f"readbacks.{name}", "missing readback object")
        return
    if value.get("ok") is not True:
        errors.add(f"readbacks.{name}.ok", "must be true")
    if _count(value.get("status_code")) is None:
        errors.add(f"readbacks.{name}.status_code", "missing HTTP status code")
    if not _non_empty_string(value.get("ref")):
        errors.add(f"readbacks.{name}.ref", "missing readback ref")
    if name != "issue" and not _non_empty_string(value.get("sha256")):
        errors.add(f"readbacks.{name}.sha256", "document/comment readback requires content hash")
    if name != "issue" and not _non_empty_string(value.get("snippet")):
        errors.add(f"readbacks.{name}.snippet", "document/comment readback requires bounded snippet")


def _validate_live_readbacks(evidence: Mapping[str, Any], errors: ErrorCollector) -> None:
    context = _as_mapping(evidence.get("company_issue_context"))
    for field in ("companyId", "issueId"):
        if not _non_empty_string(context.get(field)):
            errors.add(f"company_issue_context.{field}", "missing live issue context")
    refs = _as_mapping(evidence.get("artifact_refs"))
    if not _non_empty_string(refs.get("issue")):
        errors.add("artifact_refs.issue", "missing issue ref")
    if not _non_empty_string(refs.get("document")):
        errors.add("artifact_refs.document", "missing document ref")
    comments = _as_sequence(refs.get("comments"))
    if not comments or not all(_non_empty_string(item) for item in comments):
        errors.add("artifact_refs.comments", "missing comment refs")

    readbacks = _as_mapping(evidence.get("readbacks"))
    _validate_readback("issue", _as_mapping(readbacks.get("issue")), errors)
    _validate_readback("document", _as_mapping(readbacks.get("document")), errors)
    comment_readbacks = _as_sequence(readbacks.get("comments"))
    if not comment_readbacks:
        errors.add("readbacks.comments", "missing comment readback list")
    else:
        for index, readback in enumerate(comment_readbacks):
            _validate_readback(f"comments[{index}]", _as_mapping(readback), errors)


def _validate_artifact_families(evidence: Mapping[str, Any], errors: ErrorCollector) -> None:
    families = _as_mapping(evidence.get("artifact_families"))
    if not families:
        errors.add("artifact_families", "missing artifact family proof map")
        return
    for family in ARTIFACT_FAMILIES:
        entry = _as_mapping(families.get(family))
        if not entry:
            errors.add(f"artifact_families.{family}", "missing BOS artifact family")
            continue
        if entry.get("present") is not True:
            errors.add(f"artifact_families.{family}.present", "must be true")
        surfaces = set(str(surface) for surface in _as_sequence(entry.get("surfaces")))
        if not ({"document", "comment"} & surfaces):
            errors.add(f"artifact_families.{family}.surfaces", "requires document or comment readback surface")
        if not _as_sequence(entry.get("readback_refs")):
            errors.add(f"artifact_families.{family}.readback_refs", "requires readback refs")
        if not _as_sequence(entry.get("readback_hashes")):
            errors.add(f"artifact_families.{family}.readback_hashes", "requires readback hashes")


def _validate_side_effects(evidence: Mapping[str, Any], errors: ErrorCollector) -> None:
    counts = _as_mapping(evidence.get("side_effect_counts"))
    expected_zero = (
        "approval_requests_created",
        "activity_logs_written",
        "hermes_runs_started",
        "gsd_pi_runs_started",
    )
    for field in expected_zero:
        value = _count(counts.get(field))
        if value != 0:
            errors.add(f"side_effect_counts.{field}", "must be zero for S04 live artifact flow")
    if _count(counts.get("documents_created")) != 1:
        errors.add("side_effect_counts.documents_created", "expected exactly one document write")
    comments = _count(counts.get("comments_created"))
    if comments is None or comments < 1:
        errors.add("side_effect_counts.comments_created", "expected at least one comment write")


def _validate_no_go_guards(evidence: Mapping[str, Any], errors: ErrorCollector) -> None:
    guards = _as_mapping(evidence.get("no_go_guards"))
    hermes = _as_mapping(guards.get("hermes"))
    gsd_pi = _as_mapping(guards.get("gsd_pi"))
    if not hermes:
        errors.add("no_go_guards.hermes", "missing S02 Hermes no-go guard")
    else:
        if hermes.get("system") not in {"S02.Hermes", "Hermes", "S02"}:
            errors.add("no_go_guards.hermes.system", "must identify S02 Hermes")
        if hermes.get("execution_allowed") is True or hermes.get("no_go") is not True:
            errors.add("no_go_guards.hermes.no_go", "S04 must propagate Hermes execution no-go")
        if hermes.get("source_artifact_type") == "smoke-evidence" and hermes.get("result_json_bos_present") is True:
            errors.add("no_go_guards.hermes", "must not claim Hermes passing resultJson.bos proof during S04 no-go flow")
        if not _non_empty_string(hermes.get("evidence_ref")):
            errors.add("no_go_guards.hermes.evidence_ref", "missing S02 evidence ref")
    if not gsd_pi:
        errors.add("no_go_guards.gsd_pi", "missing S03 GSD-Pi no-go guard")
    else:
        if gsd_pi.get("system") not in {"S03.GSD-Pi", "GSD-Pi", "S03"}:
            errors.add("no_go_guards.gsd_pi.system", "must identify S03 GSD-Pi")
        if gsd_pi.get("execution_allowed") is True or gsd_pi.get("no_go") is not True:
            errors.add("no_go_guards.gsd_pi.no_go", "S04 must propagate GSD-Pi execution no-go")
        if gsd_pi.get("source_artifact_type") == "smoke-evidence" and gsd_pi.get("bos_adapter_result_present") is True:
            errors.add("no_go_guards.gsd_pi", "must not claim GSD-Pi passing BosAdapterResult proof during S04 no-go flow")
        if not _non_empty_string(gsd_pi.get("evidence_ref")):
            errors.add("no_go_guards.gsd_pi.evidence_ref", "missing S03 evidence ref")


def _validate_no_core_boundary(evidence: Mapping[str, Any], errors: ErrorCollector) -> None:
    proof = _as_mapping(evidence.get("no_core_modification"))
    if not proof:
        errors.add("no_core_modification", "missing R011 no-core-boundary proof")
        return
    checks = {
        "core_source_patched": proof.get("core_source_patched"),
        "direct_db_mutation": proof.get("direct_db_mutation"),
        "private_module_import": proof.get("private_module_import"),
    }
    for field, value in checks.items():
        if value not in (False, 0, "false"):
            errors.add(f"no_core_modification.{field}", "must be false")
    modified = proof.get("files_modified", [])
    if not isinstance(modified, list):
        errors.add("no_core_modification.files_modified", "must be a list")
    elif modified:
        errors.add("no_core_modification.files_modified", "must be empty for live runtime proof")
    method = str(proof.get("method") or "")
    for phrase in ("HTTP", "no Paperclip core", "direct database"):
        if phrase.lower() not in method.lower():
            errors.add("no_core_modification.method", f"must describe {phrase} boundary")

    invariants = _as_mapping(evidence.get("invariants"))
    required_true = ("no_core_patch", "no_direct_db_access", "no_secret_diagnostics", "no_native_approval")
    required_false = ("hermes_execution_attempted", "gsd_pi_execution_attempted")
    for field in required_true:
        if invariants.get(field) is not True:
            errors.add(f"invariants.{field}", "must be true")
    for field in required_false:
        if invariants.get(field) is not False:
            errors.add(f"invariants.{field}", "must be false")


def _validate_diagnostics(evidence: Mapping[str, Any], errors: ErrorCollector) -> None:
    diagnostics = _as_sequence(evidence.get("diagnostics"))
    if not diagnostics:
        errors.add("diagnostics", "missing bounded diagnostic entries")
        return
    for index, item in enumerate(diagnostics):
        diagnostic = _as_mapping(item)
        context = f"diagnostics[{index}]"
        if not _non_empty_string(diagnostic.get("phase")):
            errors.add(f"{context}.phase", "missing failed/readback API phase")
        if "status_code" not in diagnostic:
            errors.add(f"{context}.status_code", "missing status_code field")
        text = diagnostic.get("bounded_response_text")
        if isinstance(text, str) and len(text) > 1200:
            errors.add(f"{context}.bounded_response_text", "must be bounded to 1200 characters")
        if "malformed_json_reason" not in diagnostic:
            errors.add(f"{context}.malformed_json_reason", "missing malformed_json_reason field")
        if "timeout_ms" not in diagnostic:
            errors.add(f"{context}.timeout_ms", "missing timeout_ms field")
        if "fallback_used" not in diagnostic:
            errors.add(f"{context}.fallback_used", "missing fallback_used field")


def _validate_blocker(evidence: Mapping[str, Any], errors: ErrorCollector) -> None:
    if not _non_empty_string(evidence.get("blocker_reason") or evidence.get("blockerReason")):
        errors.add("blocker_reason", "fail-closed blocker artifacts require a blocker reason")
    if evidence.get("passing") is True:
        errors.add("passing", "fail-closed blocker artifact cannot mark itself passing")
    _validate_no_core_boundary(evidence, errors)
    _validate_diagnostics(evidence, errors)


def _validate_live(evidence: Mapping[str, Any], artifact_type: str, errors: ErrorCollector) -> None:
    _validate_no_core_boundary(evidence, errors)
    _validate_diagnostics(evidence, errors)
    _validate_no_go_guards(evidence, errors)
    if artifact_type == BLOCKER_ARTIFACT_TYPE:
        _validate_blocker(evidence, errors)
        return
    _validate_runtime(evidence, errors)
    _validate_live_readbacks(evidence, errors)
    _validate_artifact_families(evidence, errors)
    _validate_side_effects(evidence, errors)


def _validate_final(evidence: Mapping[str, Any], artifact_type: str, errors: ErrorCollector) -> None:
    if artifact_type != PASSING_ARTIFACT_TYPE:
        errors.add("artifact_type", "final S04 validation requires live-evidence, not fallback/blocker-only claims")
    _validate_runtime(evidence, errors)
    _validate_live_readbacks(evidence, errors)
    _validate_artifact_families(evidence, errors)
    _validate_side_effects(evidence, errors)
    _validate_no_go_guards(evidence, errors)
    _validate_no_core_boundary(evidence, errors)
    _validate_diagnostics(evidence, errors)


def validate(evidence_path: Path, phase_override: str | None = None) -> tuple[list[str], str]:
    errors = ErrorCollector()
    loaded = _load_json(evidence_path, "evidence", errors)
    if not isinstance(loaded, Mapping):
        errors.add("evidence", "top-level JSON value must be an object")
        return errors.errors, "invalid"

    evidence: Mapping[str, Any] = loaded
    _validate_redaction(evidence, errors)
    artifact_type = _validate_basic_contract(evidence, errors)
    if phase_override and phase_override not in PHASES:
        errors.add("phase", f"override must be one of {', '.join(sorted(PHASES))}")

    phase = phase_override or str(evidence.get("phase") or "")
    if phase == "contract":
        _validate_no_core_boundary(evidence, errors)
        _validate_diagnostics(evidence, errors)
    elif phase == "live":
        _validate_live(evidence, artifact_type, errors)
    elif phase == "final":
        _validate_final(evidence, artifact_type, errors)
    elif not phase_override:
        errors.add("phase", "missing or invalid phase")

    classification = "invalid"
    if not errors.errors:
        classification = "blocker" if artifact_type == BLOCKER_ARTIFACT_TYPE else "passing"
    return errors.errors, classification


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Validate S04 live BOS artifact-flow runtime evidence.")
    parser.add_argument("evidence_path", type=Path, nargs="?", default=DEFAULT_EVIDENCE, help="Path to S04 live evidence JSON.")
    parser.add_argument("--evidence", dest="evidence_option", type=Path, help="Path to S04 live evidence JSON; compatibility form for task plans.")
    parser.add_argument("--phase", choices=sorted(PHASES), help="Validation phase: contract, live, or final.")
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    evidence_path = args.evidence_option or args.evidence_path
    errors, classification = validate(evidence_path, args.phase)
    if errors:
        print("S04 live artifact-flow evidence validation failed:", file=sys.stderr)
        for error in errors:
            print(f"- {error}", file=sys.stderr)
        return 1
    if classification == "blocker":
        print("S04 live artifact-flow blocker artifact OK: fail-closed diagnostics are valid, but this is not final live proof.")
        return 2
    print("S04 live artifact-flow evidence OK: final live artifact proof contract is satisfied.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
