#!/usr/bin/env python3
"""Fixture coverage for scripts/validate_s10_runtime_execution.py."""

from __future__ import annotations

import importlib.util
import json
import tempfile
import unittest
from pathlib import Path
from typing import Any

SCRIPT_PATH = Path(__file__).resolve().parent / "validate_s10_runtime_execution.py"
SPEC = importlib.util.spec_from_file_location("validate_s10_runtime_execution", SCRIPT_PATH)
assert SPEC is not None and SPEC.loader is not None
validator = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(validator)


GENERATED_AT = "2026-05-29T20:31:42Z"


def no_core_modification() -> dict[str, Any]:
    return {
        "method": "supported Paperclip agent API lifecycle/readback only",
        "core_source_patched": False,
        "direct_db_mutation": False,
        "private_internal_imports": [],
    }


def hermes_proof() -> dict[str, Any]:
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
            "runId": "run-hermes-1",
            "status": "succeeded",
            "wakeCountDelta": 1,
            "approvalCounts": {"created": 0},
            "resultJson": {
                "bos": {
                    "schemaVersion": "s10-hermes-result/v1",
                    "runId": "run-hermes-1",
                    "status": "succeeded",
                }
            },
        },
        "no_core_modification": no_core_modification(),
        "capability_promotions": ["hermes.execution"],
    }


def gsdpi_proof() -> dict[str, Any]:
    return {
        "schema_version": validator.SCHEMA_VERSION,
        "artifact_type": validator.PASSING_ARTIFACT_TYPE,
        "phase": "gsdpi",
        "generated_at": GENERATED_AT,
        "adapter": {
            "adapterType": "gsdpi_local",
            "registry_readback": {"adapterType": "gsdpi_local", "supported": True, "loaded": True},
            "testEnvironment": {"status": "pass"},
        },
        "run": {
            "runId": "run-gsdpi-1",
            "status": "succeeded",
            "resultJson": {
                "bosAdapterResult": {
                    "schemaVersion": "s10-gsdpi-result/v1",
                    "adapterType": "gsdpi_local",
                    "runId": "run-gsdpi-1",
                    "status": "succeeded",
                }
            },
        },
        "no_core_modification": no_core_modification(),
        "capability_promotions": ["gsdpi.execution"],
    }


def blocker(phase: str = "hermes") -> dict[str, Any]:
    adapter_type = "hermes_local" if phase == "hermes" else "gsdpi_local"
    return {
        "schema_version": validator.SCHEMA_VERSION,
        "artifact_type": validator.BLOCKER_ARTIFACT_TYPE,
        "phase": phase,
        "generated_at": GENERATED_AT,
        "selected_path": validator.SELECTED_HERMES_PATH if phase == "hermes" else None,
        "adapter": {"adapterType": adapter_type},
        "blocker_reason": "runtime_execution_not_proven",
        "diagnostics": {"error": "adapter_failed", "token": "<redacted>"},
        "capability_promotions": [],
        "no_core_modification": no_core_modification(),
    }


def matrix(rows: list[dict[str, Any]] | None = None) -> dict[str, Any]:
    return {
        "schema_version": "fixture",
        "plugin_key": "bos-light",
        "status_enum": ["confirmed", "unsupported", "fallback-only", "unvalidated"],
        "capabilities": rows
        if rows is not None
        else [
            {
                "key": "issues.native",
                "status": "confirmed",
                "paperclip_surface_name": "Native issue read/write/create API",
                "evidence_source": "S04 native artifact proof only; does not confirm Hermes or GSD-Pi runtime execution.",
            }
        ],
    }


class FixtureRoot:
    def __enter__(self) -> Path:
        self.tmp = tempfile.TemporaryDirectory()
        root = Path(self.tmp.name)
        self.write_text(root, validator.REPORT_PATH, "# Report\nS10 runtime execution posture remains proof-gated.\n")
        self.write_text(root, validator.HEALTH_PATH, "# Health\nHermes and GSD-Pi execution require S10 proof artifacts.\n")
        self.write_json(root, validator.MATRIX_PATH, matrix())
        return root

    def __exit__(self, exc_type, exc, tb) -> None:
        self.tmp.cleanup()

    @staticmethod
    def write_text(root: Path, path: Path, text: str) -> None:
        target = root / path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(text, encoding="utf-8")

    @staticmethod
    def write_json(root: Path, path: Path, payload: dict[str, Any]) -> None:
        FixtureRoot.write_text(root, path, json.dumps(payload, indent=2, sort_keys=True) + "\n")


def run_artifact(root: Path, relative_path: Path, payload: dict[str, Any], phase: str) -> tuple[list[str], str]:
    FixtureRoot.write_json(root, relative_path, payload)
    return validator.validate(root / relative_path, root=root, phase_override=phase)


class ValidateS10RuntimeExecutionTests(unittest.TestCase):
    def test_passing_hermes_and_gsdpi_proofs_pass(self) -> None:
        with FixtureRoot() as root:
            hermes_errors, hermes_classification = run_artifact(root, Path("runtime-evidence/M002-S10-hermes-proof.json"), hermes_proof(), "hermes")
            self.assertEqual([], hermes_errors)
            self.assertEqual("passing", hermes_classification)

            gsdpi_errors, gsdpi_classification = run_artifact(root, Path("runtime-evidence/M002-S10-gsdpi-proof.json"), gsdpi_proof(), "gsdpi")
            self.assertEqual([], gsdpi_errors)
            self.assertEqual("passing", gsdpi_classification)

    def test_fail_closed_blocker_is_valid_diagnostic_but_not_proof(self) -> None:
        with FixtureRoot() as root:
            errors, classification = run_artifact(root, Path("runtime-evidence/M002-S10-hermes-blocker.json"), blocker("hermes"), "hermes")
            self.assertEqual([], errors)
            self.assertEqual("blocker", classification)

    def test_duplicate_wake_fails_with_path_specific_error(self) -> None:
        with FixtureRoot() as root:
            payload = hermes_proof()
            payload["run"]["wakeCountDelta"] = 2
            errors, classification = run_artifact(root, Path("runtime-evidence/M002-S10-hermes-proof.json"), payload, "hermes")
            self.assertEqual("invalid", classification)
            self.assertTrue(any("run.wakeCountDelta" in error and "exactly one wake" in error for error in errors), errors)

    def test_missing_result_json_bos_fails_hermes_proof(self) -> None:
        with FixtureRoot() as root:
            payload = hermes_proof()
            payload["run"]["resultJson"] = {"notBos": {"ok": True}}
            errors, _classification = run_artifact(root, Path("runtime-evidence/M002-S10-hermes-proof.json"), payload, "hermes")
            self.assertTrue(any("run.resultJson.bos" in error for error in errors), errors)

    def test_missing_bos_adapter_result_fails_gsdpi_proof(self) -> None:
        with FixtureRoot() as root:
            payload = gsdpi_proof()
            payload["run"]["resultJson"] = {"message": "no BosAdapterResult"}
            errors, _classification = run_artifact(root, Path("runtime-evidence/M002-S10-gsdpi-proof.json"), payload, "gsdpi")
            self.assertTrue(any("run.resultJson.bosAdapterResult" in error for error in errors), errors)

    def test_unredacted_token_strings_fail_any_phase(self) -> None:
        with FixtureRoot() as root:
            payload = blocker("gsdpi")
            payload["diagnostics"]["raw"] = "Authorization: Bearer abcdefghijklmnopqrstuvwxyz"
            errors, _classification = run_artifact(root, Path("runtime-evidence/M002-S10-gsdpi-blocker.json"), payload, "gsdpi")
            self.assertTrue(any("secret-like string value" in error for error in errors), errors)

    def test_direct_db_core_patch_and_private_import_flags_fail(self) -> None:
        with FixtureRoot() as root:
            payload = hermes_proof()
            payload["no_core_modification"]["direct_db_mutation"] = True
            payload["no_core_modification"]["core_source_patched"] = True
            payload["no_core_modification"]["private_internal_imports"] = ["paperclip/server/internal/db"]
            errors, _classification = run_artifact(root, Path("runtime-evidence/M002-S10-hermes-proof.json"), payload, "hermes")
            joined = "\n".join(errors)
            self.assertIn("direct database mutation", joined)
            self.assertIn("Paperclip core patches", joined)
            self.assertIn("private internal imports", joined)

    def test_malformed_timestamp_fails(self) -> None:
        with FixtureRoot() as root:
            payload = gsdpi_proof()
            payload["generated_at"] = "May 29, 2026"
            errors, _classification = run_artifact(root, Path("runtime-evidence/M002-S10-gsdpi-proof.json"), payload, "gsdpi")
            self.assertTrue(any("generated_at" in error and "ISO-8601" in error for error in errors), errors)

    def test_final_matrix_promotion_drift_requires_matching_s10_proof(self) -> None:
        with FixtureRoot() as root:
            rows = [
                {
                    "key": "hermes.execution",
                    "status": "confirmed",
                    "paperclip_surface_name": "Hermes runtime execution",
                    "evidence_source": "Hermes execution confirmed from old S08 prose, without an S10 proof artifact.",
                }
            ]
            FixtureRoot.write_json(root, validator.MATRIX_PATH, matrix(rows))
            errors, classification = validator.validate(root=root, phase_override="final")
            self.assertEqual("invalid", classification)
            self.assertTrue(any("confirmed hermes execution row requires" in error for error in errors), errors)

    def test_cli_returns_zero_for_valid_fail_closed_blocker(self) -> None:
        with FixtureRoot() as root:
            blocker_path = root / "runtime-evidence/M002-S10-hermes-blocker.json"
            FixtureRoot.write_json(root, Path("runtime-evidence/M002-S10-hermes-blocker.json"), blocker("hermes"))
            exit_code = validator.main(["--evidence", str(blocker_path), "--phase", "hermes", "--root", str(root)])
            self.assertEqual(0, exit_code)

    def test_cli_write_audit_persists_final_closeout_json(self) -> None:
        with FixtureRoot() as root:
            audit_path = Path("runtime-evidence/M002-S10-runtime-execution-closeout.json")
            exit_code = validator.main(["--phase", "final", "--root", str(root), "--write-audit", str(audit_path)])
            self.assertEqual(0, exit_code)
            payload = json.loads((root / audit_path).read_text(encoding="utf-8"))
            self.assertEqual("s10-runtime-execution-closeout/v1", payload["schema_version"])
            self.assertEqual("validator-audit", payload["artifact_type"])
            self.assertEqual("final", payload["phase"])
            self.assertEqual("final", payload["classification"])
            self.assertTrue(payload["passed"])
            self.assertEqual(0, payload["diagnostics"]["error_count"])

    def test_final_confirmed_rows_pass_only_when_referenced_s10_artifacts_pass(self) -> None:
        with FixtureRoot() as root:
            proof_path = Path("runtime-evidence/M002-S10-hermes-proof.json")
            FixtureRoot.write_json(root, proof_path, hermes_proof())
            rows = [
                {
                    "key": "hermes.execution",
                    "status": "confirmed",
                    "paperclip_surface_name": "Hermes runtime execution",
                    "evidence_source": f"Confirmed by {proof_path}",
                    "proof_command": f"python3 scripts/validate_s10_runtime_execution.py --evidence {proof_path} --phase hermes",
                }
            ]
            FixtureRoot.write_json(root, validator.MATRIX_PATH, matrix(rows))
            errors, classification = validator.validate(root=root, phase_override="final")
            self.assertEqual([], errors)
            self.assertEqual("final", classification)

    def test_final_fail_closed_rows_must_cite_s10_evidence_path(self) -> None:
        with FixtureRoot() as root:
            rows = [
                {
                    "key": "gsdpi.execution",
                    "status": "fallback-only",
                    "paperclip_surface_name": "GSD-Pi runtime execution",
                    "evidence_source": "Blocked by diagnostics but no explicit S10 artifact path.",
                }
            ]
            FixtureRoot.write_json(root, validator.MATRIX_PATH, matrix(rows))
            errors, _classification = validator.validate(root=root, phase_override="final")
            self.assertTrue(any("must cite explicit S10" in error for error in errors), errors)


if __name__ == "__main__":
    unittest.main()
