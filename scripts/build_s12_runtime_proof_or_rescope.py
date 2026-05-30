#!/usr/bin/env python3
"""Build the S12 runtime proof or approved rescope disposition artifact.

The resolver reads S10 Hermes/GSD-Pi smoke artifacts plus S11 no-promotion
posture, then writes runtime-evidence/M002-S12-runtime-proof-or-rescope.json.
It promotes runtime_proof only when both S10 surfaces validate as passing through
supported Paperclip boundaries. If proof is blocked, it writes approved_rescope
only from an explicit rescope approval JSON supplied by --rescope-approval.
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Mapping, Sequence

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

import validate_s10_runtime_execution as s10_validator  # noqa: E402 - local stdlib-only validator.
import validate_s12_runtime_proof_or_rescope as s12_validator  # noqa: E402 - local stdlib-only validator.

ROOT = Path(__file__).resolve().parents[1]


def _utc_now() -> str:
    return datetime.now(UTC).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def _resolve(root: Path, path: Path) -> Path:
    return path if path.is_absolute() else root / path


def _load_json(root: Path, path: Path) -> Any | None:
    try:
        return json.loads(_resolve(root, path).read_text(encoding="utf-8"))
    except (OSError, UnicodeDecodeError, json.JSONDecodeError):
        return None


def _as_mapping(value: Any) -> Mapping[str, Any]:
    return value if isinstance(value, Mapping) else {}


def _as_list(value: Any) -> list[Any]:
    return value if isinstance(value, list) else []


def _result_json(run: Mapping[str, Any]) -> Mapping[str, Any]:
    value = run.get("resultJson") or run.get("result_json")
    if isinstance(value, Mapping):
        return value
    if isinstance(value, str) and value.strip().startswith("{"):
        try:
            parsed = json.loads(value)
        except json.JSONDecodeError:
            return {}
        return parsed if isinstance(parsed, Mapping) else {}
    return {}


def _s10_record(root: Path, path: Path, surface: str) -> dict[str, Any]:
    errors, classification = s10_validator.validate(_resolve(root, path), root=root, phase_override=surface)
    loaded = _as_mapping(_load_json(root, path))
    blocker_codes = [str(item) for item in _as_list(loaded.get("blocker_codes") or loaded.get("blockerCodes")) if str(item).strip()]
    if not blocker_codes and loaded.get("blocker_reason"):
        blocker_codes = [str(loaded.get("blocker_reason"))]
    if errors and not blocker_codes:
        blocker_codes = ["missing_or_malformed_s10_artifact"]
    record: dict[str, Any] = {
        "evidence_path": str(path),
        "classification": classification,
        "passing": classification == "passing",
        "validation_errors": errors[:20],
        "error_count": len(errors),
    }
    if blocker_codes:
        record["blocker_codes"] = blocker_codes
    if classification == "passing":
        record["supported_boundary"] = True
        run = _as_mapping(loaded.get("run") or loaded.get("execute"))
        result_json = _result_json(run)
        if surface == "hermes":
            record["result_json_bos_present"] = isinstance(result_json.get("bos"), Mapping)
        else:
            result = result_json.get("bosAdapterResult") or result_json.get("BosAdapterResult") or result_json.get("bos_adapter_result") or run.get("bosAdapterResult")
            record["bos_adapter_result_present"] = isinstance(result, Mapping) or isinstance(result_json.get("bos"), Mapping)
    return record


def _base_payload(root: Path, hermes_path: Path, gsdpi_path: Path, s11_path: Path, matrix_path: Path, report_path: Path, health_path: Path) -> dict[str, Any]:
    return {
        "schema_version": s12_validator.SCHEMA_VERSION,
        "artifact_type": s12_validator.ARTIFACT_TYPE,
        "generated_at": _utc_now(),
        "milestone": "M002",
        "slice": "S12",
        "inputs": {
            "hermes_evidence_path": str(hermes_path),
            "gsdpi_evidence_path": str(gsdpi_path),
            "s11_validation_artifact_path": str(s11_path),
            "capability_matrix_path": str(matrix_path),
            "report_path": str(report_path),
            "health_path": str(health_path),
        },
        "proof": {
            "hermes": _s10_record(root, hermes_path, "hermes"),
            "gsdpi": _s10_record(root, gsdpi_path, "gsdpi"),
        },
        "no_promotion": {
            "blocker_evidence_promoted": False,
            "unsupported_promotions": [],
            "requirements_broadened": False,
            "success_criteria_broadened": False,
        },
        "safety": {
            "plaintext_secrets_requested_or_logged": False,
            "core_source_patched": False,
            "paperclip_core_patched": False,
            "direct_db_mutation": False,
            "private_internal_imports": [],
            "shell_string_execution": False,
            "unsupported_paths_used": [],
        },
        "diagnostics": {"redacted": True, "error_count": 0, "errors": []},
    }


def _extract_rescope_approval(root: Path, approval_path: Path | None) -> Mapping[str, Any] | None:
    if approval_path is None:
        return None
    loaded = _load_json(root, approval_path)
    if not isinstance(loaded, Mapping):
        return None
    nested = loaded.get("approved_rescope") or loaded.get("approvedRescope")
    return nested if isinstance(nested, Mapping) else loaded


def _synthesized_blocker_citations(payload: Mapping[str, Any]) -> list[dict[str, Any]]:
    citations: list[dict[str, Any]] = []
    proof = _as_mapping(payload.get("proof"))
    for surface in ("hermes", "gsdpi"):
        record = _as_mapping(proof.get(surface))
        codes = _as_list(record.get("blocker_codes")) or ["runtime_proof_blocked"]
        for code in codes:
            citations.append({"surface": surface, "code": str(code), "evidence_path": str(record.get("evidence_path") or "")})
    return citations


def build_payload(
    *,
    root: Path = ROOT,
    hermes_path: Path = s12_validator.DEFAULT_HERMES_PATH,
    gsdpi_path: Path = s12_validator.DEFAULT_GSDPI_PATH,
    s11_path: Path = s12_validator.DEFAULT_S11_PATH,
    matrix_path: Path = s12_validator.DEFAULT_MATRIX_PATH,
    report_path: Path = s12_validator.DEFAULT_REPORT_PATH,
    health_path: Path = s12_validator.DEFAULT_HEALTH_PATH,
    rescope_approval_path: Path | None = None,
) -> dict[str, Any]:
    root = root.resolve()
    payload = _base_payload(root, hermes_path, gsdpi_path, s11_path, matrix_path, report_path, health_path)
    proof = _as_mapping(payload["proof"])
    both_passing = all(_as_mapping(proof.get(surface)).get("classification") == "passing" for surface in ("hermes", "gsdpi"))
    if both_passing:
        payload["outcome"] = "runtime_proof"
        payload["diagnostics"] = {"redacted": True, "error_count": 0, "errors": []}
        return payload

    approval = _extract_rescope_approval(root, rescope_approval_path)
    if approval:
        merged = dict(approval)
        if not merged.get("blocker_citations") and not merged.get("blockerCitations"):
            merged["blocker_citations"] = _synthesized_blocker_citations(payload)
        payload["outcome"] = "approved_rescope"
        payload["approved_rescope"] = merged
        payload["diagnostics"] = {
            "redacted": True,
            "error_count": sum(int(_as_mapping(proof.get(surface)).get("error_count") or 0) for surface in ("hermes", "gsdpi")),
            "errors": [
                error
                for surface in ("hermes", "gsdpi")
                for error in _as_list(_as_mapping(proof.get(surface)).get("validation_errors"))
            ][:20],
        }
        return payload

    payload["outcome"] = "blocked_requires_approval"
    payload["diagnostics"] = {
        "redacted": True,
        "error_count": 1,
        "errors": ["S12 runtime proof is blocked and no explicit approved rescope source was supplied."],
    }
    return payload


def write_payload(root: Path, output: Path, payload: Mapping[str, Any]) -> Path:
    target = output if output.is_absolute() else root / output
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return target


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=ROOT)
    parser.add_argument("--hermes", type=Path, default=s12_validator.DEFAULT_HERMES_PATH)
    parser.add_argument("--gsdpi", type=Path, default=s12_validator.DEFAULT_GSDPI_PATH)
    parser.add_argument("--s11", type=Path, default=s12_validator.DEFAULT_S11_PATH)
    parser.add_argument("--matrix", type=Path, default=s12_validator.DEFAULT_MATRIX_PATH)
    parser.add_argument("--report", type=Path, default=s12_validator.DEFAULT_REPORT_PATH)
    parser.add_argument("--health", type=Path, default=s12_validator.DEFAULT_HEALTH_PATH)
    parser.add_argument("--rescope-approval", type=Path)
    parser.add_argument("--output", type=Path, default=s12_validator.DEFAULT_OUTPUT_PATH)
    args = parser.parse_args(argv)

    payload = build_payload(
        root=args.root,
        hermes_path=args.hermes,
        gsdpi_path=args.gsdpi,
        s11_path=args.s11,
        matrix_path=args.matrix,
        report_path=args.report,
        health_path=args.health,
        rescope_approval_path=args.rescope_approval,
    )
    target = write_payload(args.root, args.output, payload)
    errors, classification = s12_validator.validate(target, root=args.root)
    if errors:
        for error in errors:
            print(f"ERROR: {error}", file=sys.stderr)
        return 1
    print(f"Wrote S12 disposition {classification}: {target}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
