#!/usr/bin/env python3
"""Probe Paperclip runtime capability evidence without requiring a runtime.

The probe is deliberately conservative: it never starts Paperclip, never shells out,
never recursively scans a checkout, and never upgrades capability status to
"confirmed" from local metadata alone. Missing runtime evidence is reported as an
honest unvalidated health result so downstream agents do not simulate support.
"""

from __future__ import annotations

import argparse
import importlib.util
import json
import re
from pathlib import Path
from typing import Any, Mapping, Sequence

ROOT = Path(__file__).resolve().parents[1]
CAPABILITY_MATRIX_PATH = Path("plugin-bos-light/capabilities.paperclip-runtime.json")
COMPANY_TEMPLATE_VALIDATOR = Path(__file__).resolve().parent / "validate_company_template.py"
MAX_METADATA_BYTES = 64 * 1024
MAX_TEXT_SNIPPET_CHARS = 240

SAFE_METADATA_KEYS = {
    "name",
    "version",
    "build",
    "build_id",
    "build_sha",
    "commit",
    "commit_sha",
    "schema_version",
    "plugin_schema_version",
    "runtime_version",
    "paperclip_version",
}
SECRET_KEY_RE = re.compile(r"(secret|token|password|passwd|api[_-]?key|credential|private[_-]?key|auth|bearer)", re.IGNORECASE)
SECRET_VALUE_RE = re.compile(
    r"("
    r"sk-[A-Za-z0-9_\-]{8,}|"
    r"gh[pousr]_[A-Za-z0-9_]{8,}|"
    r"xox[baprs]-[A-Za-z0-9\-]{8,}|"
    r"AKIA[0-9A-Z]{8,}|"
    r"(?:Bearer\s+)[A-Za-z0-9._\-]{8,}|"
    r"[A-Za-z_][A-Za-z0-9_]*(?:TOKEN|SECRET|PASSWORD|API_KEY)=[^\s]+"
    r")",
    re.IGNORECASE,
)

METADATA_FILES = (
    Path("package.json"),
    Path("paperclip.json"),
    Path("paperclip.config.json"),
    Path("metadata.json"),
    Path("runtime.json"),
    Path("version.json"),
    Path("build.json"),
    Path("VERSION"),
    Path("BUILD"),
)

SPEC_FILES_BY_SURFACE = {
    "company_template.import_export": (
        Path("IMPORT_EXPORT_SPEC.md"),
        Path("docs/import-export.md"),
        Path("docs/import_export.md"),
        Path("docs/companies.md"),
        Path("companies.sh"),
    ),
    "agents.syntax": (
        Path("AGENTS.md"),
        Path("docs/AGENTS.md"),
        Path("docs/agents.md"),
        Path("docs/agent-profiles.md"),
    ),
    "plugin.runtime.registration": (
        Path("PLUGIN_SPEC.md"),
        Path("PLUGIN_RUNTIME.md"),
        Path("docs/plugin-spec.md"),
        Path("docs/plugins.md"),
        Path("docs/runtime.md"),
    ),
    "registration.tools": (Path("docs/tools.md"), Path("PLUGIN_SPEC.md")),
    "registration.data": (Path("docs/data.md"), Path("PLUGIN_SPEC.md")),
    "registration.actions": (Path("docs/actions.md"), Path("PLUGIN_SPEC.md")),
    "issues.native": (Path("docs/issues.md"), Path("api/issues.md")),
    "documents.native": (Path("docs/documents.md"), Path("api/documents.md")),
    "comments.native": (Path("docs/comments.md"), Path("api/comments.md")),
    "approvals.native": (Path("docs/approvals.md"), Path("api/approvals.md")),
}

STATUS_ENUM = {"confirmed", "unsupported", "fallback-only", "unvalidated"}
SAFE_REPORTED_STATUSES = {"unsupported", "fallback-only", "unvalidated"}


def _load_company_validator() -> Any:
    spec = importlib.util.spec_from_file_location("validate_company_template", COMPANY_TEMPLATE_VALIDATOR)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"unable to load company template validator from {COMPANY_TEMPLATE_VALIDATOR}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _display_path(root: Path, path: Path) -> str:
    try:
        return str(path.resolve().relative_to(root.resolve()))
    except ValueError:
        return str(path)


def _redact_string(value: str) -> str:
    if SECRET_VALUE_RE.search(value):
        return SECRET_VALUE_RE.sub("<redacted>", value)
    return value


def _redact_value(key: str, value: Any) -> Any:
    if SECRET_KEY_RE.search(key):
        return "<redacted>"
    if isinstance(value, str):
        return _redact_string(value)
    if isinstance(value, Mapping):
        return {str(child_key): _redact_value(str(child_key), child_value) for child_key, child_value in value.items()}
    if isinstance(value, list):
        return [_redact_value(key, item) for item in value]
    return value


def _safe_metadata_subset(data: Mapping[str, Any]) -> dict[str, Any]:
    subset: dict[str, Any] = {}
    for key, value in sorted(data.items(), key=lambda item: str(item[0])):
        key_text = str(key)
        include = key_text in SAFE_METADATA_KEYS or SECRET_KEY_RE.search(key_text)
        if not include and isinstance(value, str) and SECRET_VALUE_RE.search(value):
            include = True
        if not include:
            continue
        if isinstance(value, (str, int, float, bool)) or value is None:
            subset[key_text] = _redact_value(key_text, value)
        elif isinstance(value, list):
            primitive_items = [item for item in value if isinstance(item, (str, int, float, bool)) or item is None]
            if primitive_items:
                subset[key_text] = _redact_value(key_text, primitive_items[:10])
        elif isinstance(value, Mapping):
            nested = _safe_metadata_subset(value)
            if nested:
                subset[key_text] = _redact_value(key_text, nested)
    return subset


def _read_limited_text(path: Path) -> tuple[str | None, str | None]:
    try:
        with path.open("rb") as handle:
            data = handle.read(MAX_METADATA_BYTES + 1)
    except OSError as exc:
        return None, f"unable to read file: {exc.strerror or exc}"
    if len(data) > MAX_METADATA_BYTES:
        return None, f"file exceeds {MAX_METADATA_BYTES} byte inspection limit"
    try:
        return data.decode("utf-8"), None
    except UnicodeDecodeError as exc:
        return None, f"unable to decode as UTF-8 at byte {exc.start}"


def _load_capability_matrix(root: Path) -> tuple[list[dict[str, Any]], list[str]]:
    matrix_file = root / CAPABILITY_MATRIX_PATH
    if not matrix_file.exists():
        return [], [f"{CAPABILITY_MATRIX_PATH}: missing capability matrix"]
    text, error = _read_limited_text(matrix_file)
    if error is not None or text is None:
        return [], [f"{CAPABILITY_MATRIX_PATH}: {error}"]
    try:
        loaded = json.loads(text)
    except json.JSONDecodeError as exc:
        return [], [f"{CAPABILITY_MATRIX_PATH}: malformed JSON at line {exc.lineno}, column {exc.colno}: {exc.msg}"]
    if not isinstance(loaded, dict) or not isinstance(loaded.get("capabilities"), list):
        return [], [f"{CAPABILITY_MATRIX_PATH}: missing top-level capabilities list"]

    capabilities: list[dict[str, Any]] = []
    for index, entry in enumerate(loaded["capabilities"]):
        if not isinstance(entry, dict):
            capabilities.append(
                {
                    "key": f"capabilities[{index}]",
                    "status": "unvalidated",
                    "evidence": "Malformed capability matrix entry: entry is not an object.",
                    "fallback": "Use capability matrix validator before relying on this probe output.",
                    "blocker": "Capability matrix entry shape is invalid.",
                }
            )
            continue
        raw_status = entry.get("status")
        status = raw_status if raw_status in STATUS_ENUM else "unvalidated"
        if status == "confirmed":
            # Local metadata inspection is not proof of host behavior. Preserve the
            # guardrail even if a future matrix accidentally overclaims support.
            status = "unvalidated"
        capabilities.append(
            {
                "key": str(entry.get("key") or f"capabilities[{index}]"),
                "status": status if status in SAFE_REPORTED_STATUSES else "unvalidated",
                "paperclip_surface_name": str(entry.get("paperclip_surface_name") or "unknown Paperclip surface"),
                "evidence": str(entry.get("evidence_source") or "No runtime evidence recorded."),
                "runtime_evidence_field": str(entry.get("runtime_evidence_field") or ""),
                "fallback": str(entry.get("fallback_path") or ""),
                "blocker": str(entry.get("blocker_text") or ""),
            }
        )
    return capabilities, []


def _validate_local_company_template(root: Path) -> dict[str, Any]:
    try:
        validator = _load_company_validator()
        errors = validator.validate(root)
    except Exception as exc:  # defensive diagnostic; still no runtime blocker
        return {
            "status": "unsupported",
            "validator": "scripts/validate_company_template.py",
            "errors": [f"validator failed unexpectedly: {type(exc).__name__}: {exc}"],
        }
    return {
        "status": "local-contract-valid" if not errors else "local-contract-invalid",
        "validator": "scripts/validate_company_template.py",
        "errors": errors,
    }


def _metadata_field(metadata_files: list[dict[str, Any]], *names: str) -> Any:
    for file_report in metadata_files:
        fields = file_report.get("fields")
        if not isinstance(fields, Mapping):
            continue
        for name in names:
            value = fields.get(name)
            if value not in (None, "", "<redacted>"):
                return value
    return None


def _inspect_metadata_file(root: Path, paperclip_dir: Path, relative_path: Path) -> dict[str, Any] | None:
    candidate = paperclip_dir / relative_path
    if not candidate.exists():
        return None
    report: dict[str, Any] = {"path": _display_path(root, candidate)}
    if not candidate.is_file():
        report.update({"status": "malformed", "error": "path exists but is not a file"})
        return report

    text, error = _read_limited_text(candidate)
    if error is not None or text is None:
        report.update({"status": "malformed", "error": error})
        return report

    if candidate.suffix == ".json":
        try:
            loaded = json.loads(text)
        except json.JSONDecodeError as exc:
            report.update(
                {
                    "status": "malformed",
                    "error": f"malformed JSON at line {exc.lineno}, column {exc.colno}: {exc.msg}",
                }
            )
            return report
        if not isinstance(loaded, dict):
            report.update({"status": "malformed", "error": "top-level JSON value is not an object"})
            return report
        report.update({"status": "parsed", "fields": _safe_metadata_subset(loaded)})
        return report

    sanitized = _redact_string(" ".join(line.strip() for line in text.splitlines() if line.strip()))
    report.update({"status": "read", "snippet": sanitized[:MAX_TEXT_SNIPPET_CHARS]})
    return report


def _inspect_spec_file(root: Path, paperclip_dir: Path, surface_key: str, relative_path: Path) -> dict[str, Any] | None:
    candidate = paperclip_dir / relative_path
    if not candidate.exists():
        return None
    report: dict[str, Any] = {"surface": surface_key, "path": _display_path(root, candidate)}
    if not candidate.is_file():
        report.update({"status": "malformed", "error": "path exists but is not a file"})
        return report
    text, error = _read_limited_text(candidate)
    if error is not None or text is None:
        report.update({"status": "malformed", "error": error})
        return report
    report.update({"status": "present", "bytes": len(text.encode("utf-8"))})
    return report


def _inspect_paperclip_dir(root: Path, paperclip_dir: Path | str | None) -> dict[str, Any]:
    if paperclip_dir is None or (isinstance(paperclip_dir, str) and paperclip_dir.strip() == ""):
        return {
            "provided": False,
            "availability": "not-provided",
            "status": "unvalidated",
            "evidence": "No --paperclip-dir supplied; runtime evidence was not collected.",
            "metadata_files": [],
            "spec_files": [],
            "malformed_evidence": [],
        }

    resolved = Path(paperclip_dir).expanduser().resolve()
    if not resolved.exists():
        return {
            "provided": True,
            "path": str(resolved),
            "availability": "missing",
            "status": "unvalidated",
            "evidence": "Provided Paperclip path does not exist; runtime support remains unvalidated.",
            "metadata_files": [],
            "spec_files": [],
            "malformed_evidence": [f"{resolved}: path does not exist"],
        }
    if not resolved.is_dir():
        return {
            "provided": True,
            "path": str(resolved),
            "availability": "not-a-directory",
            "status": "unvalidated",
            "evidence": "Provided Paperclip path is not a directory; runtime support remains unvalidated.",
            "metadata_files": [],
            "spec_files": [],
            "malformed_evidence": [f"{resolved}: not a directory"],
        }

    metadata_files = [
        report for relative_path in METADATA_FILES if (report := _inspect_metadata_file(root, resolved, relative_path)) is not None
    ]
    spec_files: list[dict[str, Any]] = []
    for surface_key, relative_paths in SPEC_FILES_BY_SURFACE.items():
        for relative_path in relative_paths:
            report = _inspect_spec_file(root, resolved, surface_key, relative_path)
            if report is not None:
                spec_files.append(report)

    malformed = [
        f"{report.get('path', '<unknown>')}: {report.get('error', 'malformed evidence')}"
        for report in metadata_files + spec_files
        if report.get("status") == "malformed"
    ]
    version = _metadata_field(metadata_files, "paperclip_version", "runtime_version", "version")
    build = _metadata_field(metadata_files, "build", "build_id", "build_sha", "commit_sha", "commit")
    return {
        "provided": True,
        "path": str(resolved),
        "availability": "present",
        "status": "unvalidated",
        "evidence": "Paperclip directory exists; only bounded local metadata/spec inspection was performed.",
        "version": version or "unknown",
        "build": build or "unknown",
        "metadata_files": metadata_files,
        "spec_files": spec_files,
        "malformed_evidence": malformed,
    }


def _annotate_capabilities(capabilities: list[dict[str, Any]], paperclip: Mapping[str, Any]) -> list[dict[str, Any]]:
    found_specs: dict[str, list[str]] = {}
    for item in paperclip.get("spec_files", []):
        if not isinstance(item, Mapping) or item.get("status") != "present":
            continue
        surface = str(item.get("surface") or "unknown")
        found_specs.setdefault(surface, []).append(str(item.get("path") or "<unknown>"))

    annotated: list[dict[str, Any]] = []
    for capability in capabilities:
        entry = dict(capability)
        key = str(entry.get("key") or "")
        if key in found_specs:
            entry["paperclip_local_spec_evidence"] = found_specs[key]
            entry["evidence"] = (
                f"Local Paperclip spec file(s) found: {', '.join(found_specs[key])}. "
                "Status remains unvalidated until live runtime behavior is exercised."
            )
        if key == "plugin.runtime.version_build" and paperclip.get("availability") == "present":
            entry["runtime_version"] = paperclip.get("version", "unknown")
            entry["runtime_build"] = paperclip.get("build", "unknown")
            entry["evidence"] = "Runtime metadata path inspected; version/build are informational, not capability proof."
        annotated.append(entry)
    return annotated


def build_report(root: Path = ROOT, paperclip_dir: Path | str | None = None) -> dict[str, Any]:
    root = root.resolve()
    local_contract = _validate_local_company_template(root)
    capabilities, matrix_errors = _load_capability_matrix(root)
    paperclip = _inspect_paperclip_dir(root, paperclip_dir)
    capabilities = _annotate_capabilities(capabilities, paperclip)

    report = {
        "schema_version": "0.1",
        "probe": "paperclip-runtime-health",
        "posture": {
            "status": "honest-unvalidated",
            "exit_code": 0,
            "reason": "Absence or malformation of runtime evidence is reported as health posture, not simulated success.",
            "external_processes_spawned": 0,
            "recursive_scan": False,
        },
        "local_contract": {
            "company_template": local_contract,
            "capability_matrix_errors": matrix_errors,
        },
        "paperclip": paperclip,
        "capabilities": capabilities,
    }
    return _redact_value("report", report)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Probe Paperclip runtime metadata/spec evidence without starting Paperclip or claiming live support."
    )
    parser.add_argument(
        "--root",
        type=Path,
        default=ROOT,
        help="Repository root containing company-template/ and plugin-bos-light/ (default: parent of scripts/).",
    )
    parser.add_argument(
        "--paperclip-dir",
        type=str,
        default=None,
        help="Optional local Paperclip checkout/runtime directory to inspect using bounded known metadata/spec paths.",
    )
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    report = build_report(args.root, args.paperclip_dir)
    print(json.dumps(report, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
