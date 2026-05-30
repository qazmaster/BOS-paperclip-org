#!/usr/bin/env python3
"""Fixture-based negative coverage for scripts/validate_s09_reconciliation.py."""

from __future__ import annotations

import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

SCRIPT_PATH = Path(__file__).resolve().parent / "validate_s09_reconciliation.py"
SPEC = importlib.util.spec_from_file_location("validate_s09_reconciliation", SCRIPT_PATH)
assert SPEC is not None and SPEC.loader is not None
validator = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(validator)


S08_ARTIFACT_TEXT = """---
id: S08
---
# S08 Reconstructed Closeout
S08 selected `hermes_local_with_codex_cli_backend` for Hermes local with Codex CLI backend.
The bounded runtime smoke failed closed with `adapter_failed`.
Duplicate wake protection observed `wakeCountDelta=1`, a no-duplicate-wake result.
There is no passing `resultJson.bos`; the blocker is `missing_resultJson_bos`.
Adapter registration readiness was `ready_with_warning`.
This was not promoted and records no capability promotion.
"""

DOC_TEXT = """# Runtime Report
S02 is historical context only. S08 is now the localized runtime outcome.
S08 selected `hermes_local_with_codex_cli_backend` / Codex and failed closed with `adapter_failed`.
S08 observed `wakeCountDelta=1` with no duplicate wake.
S08 has no passing `resultJson.bos` and was not promoted; no capability promotion is allowed.
"""


def smoke_evidence() -> dict:
    return {
        "artifact_type": "runtime-smoke",
        "selected_path": validator.SELECTED_PATH,
        "blocker_reason": "run_status_not_succeeded,missing_resultJson_bos",
        "run": {
            "wakeCountDelta": 1,
            "invoke_response": {"json": {"resultJson": None}},
            "final_readback": {
                "json": {
                    "errorCode": validator.ADAPTER_FAILED,
                    "resultJson": {"stopReason": validator.ADAPTER_FAILED, "result": "provider failed before BOS output"},
                }
            },
            "readback_history_tail": [
                {"json": {"errorCode": validator.ADAPTER_FAILED, "resultJson": {"stopReason": validator.ADAPTER_FAILED}}}
            ],
            "runListAfter": {"json": [{"errorCode": validator.ADAPTER_FAILED, "resultJson": {"stopReason": validator.ADAPTER_FAILED}}]},
        },
    }


def registration_evidence() -> dict:
    return {
        "selected_path": validator.SELECTED_PATH,
        "readiness_assessment": {
            "status": validator.READY_WITH_WARNING,
            "remaining_warning_codes": ["hermes_no_api_keys"],
        },
    }


def capability_matrix(promote_execution: bool = False) -> dict:
    rows = [
        {
            "key": "issues.native",
            "status": "confirmed",
            "paperclip_surface_name": "Native issue read/write/create API",
            "notes": "Confirmed only for native issue readback; does not confirm Hermes or GSD-Pi runtime execution.",
        },
        {
            "key": "plugin.runtime.registration",
            "status": "fallback-only",
            "paperclip_surface_name": "Plugin runtime registration",
            "notes": "Do not treat plugin registration as runtime execution support.",
        },
    ]
    if promote_execution:
        rows.append(
            {
                "key": "hermes.execution",
                "status": "confirmed",
                "paperclip_surface_name": "Hermes runtime execution",
                "notes": "Hermes execution confirmed for Paperclip runtime execution support confirmed.",
            }
        )
    return {
        "schema_version": "fixture",
        "plugin_key": "bos-light",
        "guardrail": "Do not promote Hermes or GSD-Pi execution; native proof does not confirm runtime execution.",
        "capabilities": rows,
    }


def generic_evidence(name: str) -> dict:
    return {
        "artifact_type": name,
        "selected_path": validator.SELECTED_PATH,
        "status": "fail-closed",
        "readiness_assessment": {"status": validator.READY_WITH_WARNING},
        "summary": "adapter_failed with wakeCountDelta=1, missing_resultJson_bos, no capability promotion, not promoted",
    }


class FixtureRoot:
    def __enter__(self) -> Path:
        self.tmp = tempfile.TemporaryDirectory()
        root = Path(self.tmp.name)
        for path in validator.S08_ARTIFACT_PATHS:
            self.write_text(root, path, S08_ARTIFACT_TEXT)
        evidence_by_name = {
            "M002-S08-runtime-execution-smoke.json": smoke_evidence(),
            "M002-S08-adapter-registration-evidence.json": registration_evidence(),
        }
        for path in validator.S08_EVIDENCE_PATHS:
            payload = evidence_by_name.get(path.name, generic_evidence(path.name))
            self.write_json(root, path, payload)
        self.write_text(root, validator.LIVE_REPORT_PATH, DOC_TEXT)
        self.write_text(root, validator.RUNTIME_HEALTH_PATH, DOC_TEXT)
        self.write_json(root, validator.CAPABILITY_MATRIX_PATH, capability_matrix())
        return root

    def __exit__(self, exc_type, exc, tb) -> None:
        self.tmp.cleanup()

    @staticmethod
    def write_text(root: Path, path: Path, text: str) -> None:
        target = root / path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(text, encoding="utf-8")

    @staticmethod
    def write_json(root: Path, path: Path, payload: dict) -> None:
        FixtureRoot.write_text(root, path, json.dumps(payload, indent=2, sort_keys=True) + "\n")


def run_validator(root: Path) -> tuple[bool, list[str], dict]:
    return validator.validate(root)


class ValidateS09ReconciliationTests(unittest.TestCase):
    def test_valid_fixture_passes_and_writes_redacted_audit_shape(self) -> None:
        with FixtureRoot() as root:
            ok, errors, audit = run_validator(root)
            self.assertTrue(ok, errors)
            self.assertEqual([], errors)
            self.assertEqual(validator.ADAPTER_FAILED, audit["s08_runtime_evidence"]["structured_checks"]["adapter_error_code"])
            self.assertFalse(audit["s08_runtime_evidence"]["structured_checks"]["passing_resultJson_bos_present"])
            self.assertFalse(audit["redaction"]["secret_values_recorded"])

    def test_missing_s08_artifact_fails_with_path(self) -> None:
        with FixtureRoot() as root:
            missing_path = root / validator.S08_ARTIFACT_PATHS[0]
            missing_path.unlink()
            ok, errors, _audit = run_validator(root)
            self.assertFalse(ok)
            self.assertTrue(any(str(validator.S08_ARTIFACT_PATHS[0]) in error and "missing required text file" in error for error in errors), errors)

    def test_missing_adapter_failed_runtime_marker_fails_closed(self) -> None:
        with FixtureRoot() as root:
            smoke = smoke_evidence()
            smoke["run"]["final_readback"]["json"]["errorCode"] = "succeeded"
            smoke["run"]["final_readback"]["json"]["resultJson"] = {"result": "no adapter failure"}
            smoke["run"]["readback_history_tail"] = []
            smoke["run"]["runListAfter"] = {"json": []}
            FixtureRoot.write_json(root, Path("runtime-evidence/M002-S08-runtime-execution-smoke.json"), smoke)
            ok, errors, _audit = run_validator(root)
            self.assertFalse(ok)
            self.assertTrue(any("adapter_failed" in error for error in errors), errors)

    def test_docs_without_s08_outcome_fail_even_if_s02_is_present(self) -> None:
        with FixtureRoot() as root:
            FixtureRoot.write_text(
                root,
                validator.LIVE_REPORT_PATH,
                "# Old Report\nS02 Hermes secret-materialization blocker has no passing `resultJson.bos`.\n",
            )
            ok, errors, _audit = run_validator(root)
            self.assertFalse(ok)
            self.assertTrue(any(str(validator.LIVE_REPORT_PATH) in error and "s08" in error.lower() for error in errors), errors)

    def test_capability_matrix_promotion_of_execution_support_fails(self) -> None:
        with FixtureRoot() as root:
            FixtureRoot.write_json(root, validator.CAPABILITY_MATRIX_PATH, capability_matrix(promote_execution=True))
            ok, errors, _audit = run_validator(root)
            self.assertFalse(ok)
            self.assertTrue(any("Hermes/GSD-Pi execution capability row is marked confirmed" in error for error in errors), errors)

    def test_malformed_json_identifies_file(self) -> None:
        with FixtureRoot() as root:
            target = root / Path("runtime-evidence/M002-S08-runtime-execution-smoke.json")
            target.write_text("{not-json\n", encoding="utf-8")
            ok, errors, _audit = run_validator(root)
            self.assertFalse(ok)
            self.assertTrue(any("M002-S08-runtime-execution-smoke.json" in error and "malformed JSON" in error for error in errors), errors)


if __name__ == "__main__":
    unittest.main()
