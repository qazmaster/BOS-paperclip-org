#!/usr/bin/env python3
"""Fixture coverage for scripts/validate_m005_s01_hermes_xiaomi_probe.py."""

from __future__ import annotations

import importlib.util
import json
import tempfile
import unittest
from pathlib import Path
from typing import Any

SCRIPT_PATH = Path(__file__).resolve().parent / "validate_m005_s01_hermes_xiaomi_probe.py"
SPEC = importlib.util.spec_from_file_location("validate_m005_s01_hermes_xiaomi_probe", SCRIPT_PATH)
assert SPEC is not None and SPEC.loader is not None
validator = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(validator)


GENERATED_AT = "2026-05-31T17:21:35Z"


def no_core_modification() -> dict[str, Any]:
    return {
        "method": "supported Paperclip agent API lifecycle/readback only",
        "core_source_patched": False,
        "direct_db_mutation": False,
        "private_internal_imports": [],
    }


def hermes_xiaomi_proof() -> dict[str, Any]:
    return {
        "schema_version": validator.SCHEMA_VERSION,
        "artifact_type": validator.PASSING_ARTIFACT_TYPE,
        "phase": "hermes",
        "generated_at": GENERATED_AT,
        "selected_path": validator.SELECTED_HERMES_PATH,
        "paperclip": {"lifecycle": {"agentCreated": True, "runCreated": True, "runReadback": True}},
        "adapter": {"adapterType": "hermes_local"},
        "agent": {
            "config": {"adapterType": "hermes_local"},
            "readback": {"adapterType": "hermes_local"},
        },
        "run": {
            "runId": "run-xiaomi-1",
            "status": "succeeded",
            "wakeCountDelta": 1,
            "approvalCounts": {"created": 0},
            "resultJson": {
                "bos": {
                    "schemaVersion": "m005-s01-hermes-xiaomi/v1",
                    "runId": "run-xiaomi-1",
                    "status": "succeeded",
                }
            },
        },
        "no_core_modification": no_core_modification(),
        "capability_promotions": ["hermes.xiaomi_execution"],
    }


def blocker() -> dict[str, Any]:
    return {
        "schema_version": validator.SCHEMA_VERSION,
        "artifact_type": validator.BLOCKER_ARTIFACT_TYPE,
        "phase": "hermes",
        "generated_at": GENERATED_AT,
        "selected_path": validator.SELECTED_HERMES_PATH,
        "adapter": {"adapterType": "hermes_local"},
        "blocker_reason": "runtime_execution_not_proven",
        "diagnostics": {"error": "adapter_failed", "token": "<redacted>"},
        "capability_promotions": [],
        "no_core_modification": no_core_modification(),
    }


class FixtureRoot:
    def __enter__(self) -> Path:
        self.tmp = tempfile.TemporaryDirectory()
        root = Path(self.tmp.name)
        return root

    def __exit__(self, exc_type, exc, tb) -> None:
        self.tmp.cleanup()

    @staticmethod
    def write_json(root: Path, path: Path, payload: dict[str, Any]) -> None:
        target = root / path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def run_artifact(root: Path, relative_path: Path, payload: dict[str, Any]) -> tuple[list[str], str]:
    FixtureRoot.write_json(root, relative_path, payload)
    return validator.validate(root / relative_path, root=root)


class ValidateM005S01HermesXiaomiProbeTests(unittest.TestCase):
    def test_passing_hermes_xiaomi_proof_passes(self) -> None:
        with FixtureRoot() as root:
            errors, classification = run_artifact(
                root, Path("runtime-evidence/M005-S01-hermes-xiaomi-proof.json"), hermes_xiaomi_proof()
            )
            self.assertEqual([], errors)
            self.assertEqual("passing", classification)

    def test_fail_closed_blocker_is_valid_diagnostic_but_not_proof(self) -> None:
        with FixtureRoot() as root:
            errors, classification = run_artifact(
                root, Path("runtime-evidence/M005-S01-hermes-xiaomi-blocker.json"), blocker()
            )
            self.assertEqual([], errors)
            self.assertEqual("blocker", classification)

    def test_duplicate_wake_fails_with_path_specific_error(self) -> None:
        with FixtureRoot() as root:
            payload = hermes_xiaomi_proof()
            payload["run"]["wakeCountDelta"] = 2
            errors, classification = run_artifact(
                root, Path("runtime-evidence/M005-S01-hermes-xiaomi-proof.json"), payload
            )
            self.assertEqual("invalid", classification)
            self.assertTrue(
                any("run.wakeCountDelta" in error and "exactly one wake" in error for error in errors), errors
            )

    def test_missing_result_json_bos_fails_hermes_proof(self) -> None:
        with FixtureRoot() as root:
            payload = hermes_xiaomi_proof()
            payload["run"]["resultJson"] = {"notBos": {"ok": True}}
            errors, _classification = run_artifact(
                root, Path("runtime-evidence/M005-S01-hermes-xiaomi-proof.json"), payload
            )
            self.assertTrue(any("run.resultJson.bos" in error for error in errors), errors)

    def test_unredacted_token_strings_fail(self) -> None:
        with FixtureRoot() as root:
            payload = blocker()
            payload["diagnostics"]["raw"] = "Authorization: Bearer abcdefghijklmnopqrstuvwxyz"
            errors, _classification = run_artifact(
                root, Path("runtime-evidence/M005-S01-hermes-xiaomi-blocker.json"), payload
            )
            self.assertTrue(any("secret-like string value" in error for error in errors), errors)

    def test_direct_db_core_patch_and_private_import_flags_fail(self) -> None:
        with FixtureRoot() as root:
            payload = hermes_xiaomi_proof()
            payload["no_core_modification"]["direct_db_mutation"] = True
            payload["no_core_modification"]["core_source_patched"] = True
            payload["no_core_modification"]["private_internal_imports"] = ["paperclip/server/internal/db"]
            errors, _classification = run_artifact(
                root, Path("runtime-evidence/M005-S01-hermes-xiaomi-proof.json"), payload
            )
            joined = "\n".join(errors)
            self.assertIn("direct database mutation", joined)
            self.assertIn("Paperclip core patches", joined)
            self.assertIn("private internal imports", joined)

    def test_malformed_timestamp_fails(self) -> None:
        with FixtureRoot() as root:
            payload = hermes_xiaomi_proof()
            payload["generated_at"] = "May 31, 2026"
            errors, _classification = run_artifact(
                root, Path("runtime-evidence/M005-S01-hermes-xiaomi-proof.json"), payload
            )
            self.assertTrue(any("generated_at" in error and "ISO-8601" in error for error in errors), errors)

    def test_cli_returns_zero_for_valid_fail_closed_blocker(self) -> None:
        with FixtureRoot() as root:
            blocker_path = root / "runtime-evidence/M005-S01-hermes-xiaomi-blocker.json"
            FixtureRoot.write_json(root, Path("runtime-evidence/M005-S01-hermes-xiaomi-blocker.json"), blocker())
            exit_code = validator.main(["--evidence", str(blocker_path), "--root", str(root)])
            self.assertEqual(0, exit_code)

    def test_cli_write_audit_persists_closeout_json(self) -> None:
        with FixtureRoot() as root:
            evidence_path = Path("runtime-evidence/M005-S01-hermes-xiaomi-blocker.json")
            audit_path = Path("runtime-evidence/M005-S01-hermes-xiaomi-closeout.json")
            FixtureRoot.write_json(root, evidence_path, blocker())
            exit_code = validator.main(["--evidence", str(root / evidence_path), "--root", str(root), "--write-audit", str(audit_path)])
            self.assertEqual(0, exit_code)
            payload = json.loads((root / audit_path).read_text(encoding="utf-8"))
            self.assertEqual("m005-s01-hermes-xiaomi-closeout/v1", payload["schema_version"])
            self.assertEqual("validator-audit", payload["artifact_type"])
            self.assertEqual("hermes", payload["phase"])
            self.assertEqual("blocker", payload["classification"])
            self.assertTrue(payload["passed"])
            self.assertEqual(0, payload["diagnostics"]["error_count"])

    def test_wrong_schema_version_fails(self) -> None:
        with FixtureRoot() as root:
            payload = hermes_xiaomi_proof()
            payload["schema_version"] = "s10-runtime-execution/v1"
            errors, classification = run_artifact(
                root, Path("runtime-evidence/M005-S01-hermes-xiaomi-proof.json"), payload
            )
            self.assertEqual("invalid", classification)
            self.assertTrue(any("schema_version" in error for error in errors), errors)

    def test_wrong_selected_path_fails(self) -> None:
        with FixtureRoot() as root:
            payload = hermes_xiaomi_proof()
            payload["selected_path"] = "hermes_local_with_codex_cli_backend"
            errors, classification = run_artifact(
                root, Path("runtime-evidence/M005-S01-hermes-xiaomi-proof.json"), payload
            )
            self.assertEqual("invalid", classification)
            self.assertTrue(any("selected_path" in error for error in errors), errors)


if __name__ == "__main__":
    unittest.main()
