#!/usr/bin/env python3
"""Fixture coverage for scripts/validate_s12_runtime_proof_or_rescope.py."""

from __future__ import annotations

import importlib.util
import json
import tempfile
import unittest
from pathlib import Path
from typing import Any

SCRIPT_DIR = Path(__file__).resolve().parent
VALIDATOR_PATH = SCRIPT_DIR / "validate_s12_runtime_proof_or_rescope.py"
BUILDER_PATH = SCRIPT_DIR / "build_s12_runtime_proof_or_rescope.py"

SPEC = importlib.util.spec_from_file_location("validate_s12_runtime_proof_or_rescope", VALIDATOR_PATH)
assert SPEC is not None and SPEC.loader is not None
validator = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(validator)

BUILDER_SPEC = importlib.util.spec_from_file_location("build_s12_runtime_proof_or_rescope", BUILDER_PATH)
assert BUILDER_SPEC is not None and BUILDER_SPEC.loader is not None
builder = importlib.util.module_from_spec(BUILDER_SPEC)
BUILDER_SPEC.loader.exec_module(builder)

GENERATED_AT = "2026-05-30T08:00:00Z"


def no_core_modification() -> dict[str, Any]:
    return {
        "method": "supported Paperclip HTTP/admin/agent/adapter routes only",
        "core_source_patched": False,
        "paperclip_core_patched": False,
        "direct_db_mutation": False,
        "private_internal_imports": [],
    }


def hermes_proof() -> dict[str, Any]:
    return {
        "schema_version": "s10-runtime-execution/v1",
        "artifact_type": "runtime-execution-proof",
        "phase": "hermes",
        "generated_at": GENERATED_AT,
        "selected_path": "hermes_local_with_codex_cli_backend",
        "paperclip": {"lifecycle": {"agentCreated": True, "runCreated": True, "runReadback": True}},
        "adapter": {"adapterType": "hermes_local"},
        "agent": {"config": {"adapterType": "hermes_local"}, "readback": {"adapterType": "hermes_local"}},
        "run": {
            "runId": "run-hermes-1",
            "status": "succeeded",
            "wakeCountDelta": 1,
            "approvalCounts": {"created": 0},
            "resultJson": {"bos": {"schemaVersion": "s12-hermes-result/v1", "runId": "run-hermes-1", "status": "succeeded"}},
        },
        "capability_promotions": ["hermes.execution"],
        "no_core_modification": no_core_modification(),
    }


def gsdpi_proof() -> dict[str, Any]:
    return {
        "schema_version": "s10-runtime-execution/v1",
        "artifact_type": "runtime-execution-proof",
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
                    "schemaVersion": "s12-gsdpi-result/v1",
                    "adapterType": "gsdpi_local",
                    "runId": "run-gsdpi-1",
                    "status": "succeeded",
                }
            },
        },
        "capability_promotions": ["gsdpi.execution"],
        "no_core_modification": no_core_modification(),
    }


def blocker(phase: str) -> dict[str, Any]:
    return {
        "schema_version": "s10-runtime-execution/v1",
        "artifact_type": "fail-closed-blocker",
        "phase": phase,
        "generated_at": GENERATED_AT,
        "selected_path": "hermes_local_with_codex_cli_backend" if phase == "hermes" else None,
        "adapter": {"adapterType": "hermes_local" if phase == "hermes" else "gsdpi_local"},
        "passing": False,
        "blocker_reason": f"{phase}_runtime_not_proven",
        "blocker_codes": [f"{phase}_runtime_not_proven"],
        "diagnostics": {"message": "blocked before supported runtime execution", "token": "<redacted>"},
        "capability_promotions": [],
        "no_core_modification": no_core_modification(),
    }


def s11_audit() -> dict[str, Any]:
    return {
        "schema_version": "m002-validation-artifact-repair/v1",
        "artifact_type": "validator-audit",
        "generated_at": GENERATED_AT,
        "passed": True,
        "diagnostics": {"error_count": 0, "errors": []},
        "posture": {
            "fail_closed_blocker_evidence_is_not_runtime_proof": True,
            "runtime_promotions_require_passing_s10_proof": True,
            "secret_values_allowed_in_diagnostics": False,
            "shell_network_or_database_access_used": False,
        },
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
                "key": "hermes.execution",
                "status": "fallback-only",
                "paperclip_surface_name": "Hermes runtime execution",
                "evidence_source": "Blocked by runtime-evidence/M002-S10-hermes-runtime-execution-proof.json; not promoted.",
            },
            {
                "key": "gsdpi.execution",
                "status": "fallback-only",
                "paperclip_surface_name": "GSD-Pi runtime execution",
                "evidence_source": "Blocked by runtime-evidence/M002-S10-gsdpi-runtime-execution-proof.json; not promoted.",
            },
        ],
    }


class FixtureRoot:
    def __enter__(self) -> Path:
        self.tmp = tempfile.TemporaryDirectory()
        root = Path(self.tmp.name)
        self.write_json(root, validator.DEFAULT_HERMES_PATH, hermes_proof())
        self.write_json(root, validator.DEFAULT_GSDPI_PATH, gsdpi_proof())
        self.write_json(root, validator.DEFAULT_S11_PATH, s11_audit())
        self.write_json(root, validator.DEFAULT_MATRIX_PATH, matrix())
        self.write_text(root, validator.DEFAULT_REPORT_PATH, "# Report\nS12 keeps runtime execution proof-gated.\n")
        self.write_text(root, validator.DEFAULT_HEALTH_PATH, "# Health\nHermes and GSD-Pi remain unpromoted without S12 runtime proof.\n")
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


def runtime_proof_payload() -> dict[str, Any]:
    return {
        "schema_version": validator.SCHEMA_VERSION,
        "artifact_type": validator.ARTIFACT_TYPE,
        "generated_at": GENERATED_AT,
        "milestone": "M002",
        "slice": "S12",
        "outcome": "runtime_proof",
        "proof": {
            "hermes": {
                "evidence_path": str(validator.DEFAULT_HERMES_PATH),
                "classification": "passing",
                "passing": True,
                "supported_boundary": True,
                "result_json_bos_present": True,
            },
            "gsdpi": {
                "evidence_path": str(validator.DEFAULT_GSDPI_PATH),
                "classification": "passing",
                "passing": True,
                "supported_boundary": True,
                "bos_adapter_result_present": True,
            },
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


def approved_rescope_payload() -> dict[str, Any]:
    payload = runtime_proof_payload()
    payload["outcome"] = "approved_rescope"
    payload["proof"] = {
        "hermes": {
            "evidence_path": str(validator.DEFAULT_HERMES_PATH),
            "classification": "blocker",
            "passing": False,
            "blocker_codes": ["hermes_runtime_not_proven"],
        },
        "gsdpi": {
            "evidence_path": str(validator.DEFAULT_GSDPI_PATH),
            "classification": "blocker",
            "passing": False,
            "blocker_codes": ["gsdpi_runtime_not_proven"],
        },
    }
    payload["approved_rescope"] = {
        "approval_source": {
            "type": "gsd_requirement_update",
            "reference": "R009/R010/R011 approved S12 rescope in DECISION-DRAFT fixture",
            "approved_at": GENERATED_AT,
        },
        "requirement_ids": ["R009", "R010", "R011"],
        "success_criteria": {
            "deferred": ["Live Hermes resultJson.bos proof deferred until supported Paperclip auth is available."],
            "narrowed": ["S12 closeout accepts only explicit no-promotion blocker posture for unavailable runtime surfaces."],
        },
        "blocker_citations": [
            {"surface": "hermes", "code": "hermes_runtime_not_proven", "evidence_path": str(validator.DEFAULT_HERMES_PATH)},
            {"surface": "gsdpi", "code": "gsdpi_runtime_not_proven", "evidence_path": str(validator.DEFAULT_GSDPI_PATH)},
        ],
        "no_capability_promotions": True,
    }
    return payload


def write_evidence(root: Path, payload: dict[str, Any]) -> Path:
    FixtureRoot.write_json(root, validator.DEFAULT_OUTPUT_PATH, payload)
    return root / validator.DEFAULT_OUTPUT_PATH


class ValidateS12RuntimeProofOrRescopeTests(unittest.TestCase):
    def test_accepts_runtime_proof_when_both_s10_surfaces_pass(self) -> None:
        with FixtureRoot() as root:
            evidence_path = write_evidence(root, runtime_proof_payload())
            errors, classification = validator.validate(evidence_path, root=root)
            self.assertEqual([], errors)
            self.assertEqual("runtime_proof", classification)

    def test_accepts_approved_rescope_when_proof_blocked_and_approval_present(self) -> None:
        with FixtureRoot() as root:
            FixtureRoot.write_json(root, validator.DEFAULT_HERMES_PATH, blocker("hermes"))
            FixtureRoot.write_json(root, validator.DEFAULT_GSDPI_PATH, blocker("gsdpi"))
            evidence_path = write_evidence(root, approved_rescope_payload())
            errors, classification = validator.validate(evidence_path, root=root)
            self.assertEqual([], errors)
            self.assertEqual("approved_rescope", classification)

    def test_cli_accepts_artifact_alias_for_evidence_path(self) -> None:
        with FixtureRoot() as root:
            FixtureRoot.write_json(root, validator.DEFAULT_HERMES_PATH, blocker("hermes"))
            FixtureRoot.write_json(root, validator.DEFAULT_GSDPI_PATH, blocker("gsdpi"))
            write_evidence(root, approved_rescope_payload())
            exit_code = validator.main(["--root", str(root), "--artifact", str(validator.DEFAULT_OUTPUT_PATH)])
            self.assertEqual(0, exit_code)

    def test_builder_writes_runtime_proof_for_two_passing_s10_artifacts(self) -> None:
        with FixtureRoot() as root:
            output = root / validator.DEFAULT_OUTPUT_PATH
            exit_code = builder.main(["--root", str(root), "--output", str(validator.DEFAULT_OUTPUT_PATH)])
            self.assertEqual(0, exit_code)
            payload = json.loads(output.read_text(encoding="utf-8"))
            self.assertEqual("runtime_proof", payload["outcome"])
            self.assertTrue(payload["proof"]["hermes"]["result_json_bos_present"])
            self.assertTrue(payload["proof"]["gsdpi"]["bos_adapter_result_present"])

    def test_builder_writes_approved_rescope_from_approval_fixture_when_proof_blocked(self) -> None:
        with FixtureRoot() as root:
            FixtureRoot.write_json(root, validator.DEFAULT_HERMES_PATH, blocker("hermes"))
            FixtureRoot.write_json(root, validator.DEFAULT_GSDPI_PATH, blocker("gsdpi"))
            approval_path = Path("runtime-evidence/approval.json")
            FixtureRoot.write_json(root, approval_path, approved_rescope_payload()["approved_rescope"])
            exit_code = builder.main(["--root", str(root), "--rescope-approval", str(approval_path), "--output", str(validator.DEFAULT_OUTPUT_PATH)])
            self.assertEqual(0, exit_code)
            payload = json.loads((root / validator.DEFAULT_OUTPUT_PATH).read_text(encoding="utf-8"))
            self.assertEqual("approved_rescope", payload["outcome"])

    def test_malformed_json_fails_closed(self) -> None:
        with FixtureRoot() as root:
            target = root / validator.DEFAULT_OUTPUT_PATH
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text("{not-json", encoding="utf-8")
            errors, classification = validator.validate(target, root=root)
            self.assertEqual("invalid", classification)
            self.assertTrue(any("malformed JSON" in error for error in errors), errors)

    def test_secret_like_diagnostics_fail(self) -> None:
        with FixtureRoot() as root:
            payload = approved_rescope_payload()
            FixtureRoot.write_json(root, validator.DEFAULT_HERMES_PATH, blocker("hermes"))
            FixtureRoot.write_json(root, validator.DEFAULT_GSDPI_PATH, blocker("gsdpi"))
            payload["diagnostics"]["raw"] = "Authorization: Bearer abcdefghijklmnopqrstuvwxyz"
            errors, classification = validator.validate(write_evidence(root, payload), root=root)
            self.assertEqual("invalid", classification)
            self.assertTrue(any("secret-like string value" in error for error in errors), errors)

    def test_one_sided_proof_fails_runtime_proof(self) -> None:
        with FixtureRoot() as root:
            FixtureRoot.write_json(root, validator.DEFAULT_GSDPI_PATH, blocker("gsdpi"))
            payload = runtime_proof_payload()
            payload["proof"]["gsdpi"]["classification"] = "blocker"
            payload["proof"]["gsdpi"]["passing"] = False
            errors, classification = validator.validate(write_evidence(root, payload), root=root)
            self.assertEqual("invalid", classification)
            self.assertTrue(any("runtime_proof requires passing S10 proof for both hermes and gsdpi" in error for error in errors), errors)

    def test_blocker_promotion_fails_approved_rescope(self) -> None:
        with FixtureRoot() as root:
            FixtureRoot.write_json(root, validator.DEFAULT_HERMES_PATH, blocker("hermes"))
            FixtureRoot.write_json(root, validator.DEFAULT_GSDPI_PATH, blocker("gsdpi"))
            payload = approved_rescope_payload()
            payload["capability_promotions"] = ["hermes.execution"]
            payload["approved_rescope"]["no_capability_promotions"] = False
            errors, classification = validator.validate(write_evidence(root, payload), root=root)
            self.assertEqual("invalid", classification)
            self.assertTrue(any("promotions" in error.lower() for error in errors), errors)

    def test_rescope_without_approval_fails(self) -> None:
        with FixtureRoot() as root:
            FixtureRoot.write_json(root, validator.DEFAULT_HERMES_PATH, blocker("hermes"))
            FixtureRoot.write_json(root, validator.DEFAULT_GSDPI_PATH, blocker("gsdpi"))
            payload = approved_rescope_payload()
            del payload["approved_rescope"]["approval_source"]
            errors, classification = validator.validate(write_evidence(root, payload), root=root)
            self.assertEqual("invalid", classification)
            self.assertTrue(any("approval_source" in error for error in errors), errors)

    def test_db_core_private_import_and_shell_string_flags_fail(self) -> None:
        with FixtureRoot() as root:
            payload = runtime_proof_payload()
            payload["safety"]["direct_db_mutation"] = True
            payload["safety"]["core_source_patched"] = True
            payload["safety"]["private_internal_imports"] = ["paperclip/server/internal/db"]
            payload["safety"]["shell_string_execution"] = "python script.py && mutate-db"
            errors, classification = validator.validate(write_evidence(root, payload), root=root)
            self.assertEqual("invalid", classification)
            joined = "\n".join(errors)
            self.assertIn("direct database mutation", joined)
            self.assertIn("Paperclip core patches", joined)
            self.assertIn("private internal imports", joined)
            self.assertIn("shell-string execution", joined)

    def test_docs_or_matrix_confirmation_without_proof_fails(self) -> None:
        with FixtureRoot() as root:
            FixtureRoot.write_json(root, validator.DEFAULT_HERMES_PATH, blocker("hermes"))
            FixtureRoot.write_json(root, validator.DEFAULT_GSDPI_PATH, blocker("gsdpi"))
            FixtureRoot.write_json(
                root,
                validator.DEFAULT_MATRIX_PATH,
                matrix(
                    [
                        {
                            "key": "hermes.execution",
                            "status": "confirmed",
                            "paperclip_surface_name": "Hermes runtime execution",
                            "evidence_source": "Confirmed by docs only, without supported S10 proof.",
                        }
                    ]
                ),
            )
            errors, classification = validator.validate(write_evidence(root, approved_rescope_payload()), root=root)
            self.assertEqual("invalid", classification)
            self.assertTrue(any("confirmed hermes execution row requires runtime_proof" in error for error in errors), errors)


if __name__ == "__main__":
    unittest.main()
