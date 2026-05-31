#!/usr/bin/env python3
"""Fixture coverage for scripts/validate_m005_s02_company_template_probe.py."""

from __future__ import annotations

import importlib.util
import json
import tempfile
import unittest
from pathlib import Path
from typing import Any

SCRIPT_PATH = Path(__file__).resolve().parent / "validate_m005_s02_company_template_probe.py"
SPEC = importlib.util.spec_from_file_location("validate_m005_s02_company_template_probe", SCRIPT_PATH)
assert SPEC is not None and SPEC.loader is not None
validator = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(validator)


GENERATED_AT = "2026-05-31T17:21:35Z"


def no_core_modification() -> dict[str, Any]:
    return {
        "method": "Supported Paperclip HTTP/admin routes only; no Paperclip source patch, private import, subprocess bypass, or direct database mutation.",
        "core_source_patched": False,
        "direct_db_mutation": False,
        "private_internal_imports": False,
    }


def base_passing() -> dict[str, Any]:
    return {
        "schema_version": validator.SCHEMA_VERSION,
        "artifact_type": validator.PASSING_ARTIFACT_TYPE,
        "phase": "company_template_import",
        "generated_at": GENERATED_AT,
        "no_core_modification": no_core_modification(),
        "capability_promotions": ["company_template.import", "agent.profile_activation", "routing.rules"],
        "safety": {
            "max_agent_creations": 7,
            "plaintext_secrets_requested_or_logged": False,
            "runner_exit_policy": "exit_zero_for_valid_proof_or_valid_fail_closed_blocker",
            "unsupported_paths_used": [],
        },
    }


def full_agent_activation() -> dict[str, Any]:
    return {
        "divisions_present": [
            "Div1.HCO",
            "Div2.MasterPlanner",
            "Div3.Treasury",
            "Div4.Production",
            "Div5.QualificationsLibraryLearning",
            "Div6.External",
            "Div7.MissionControl",
        ],
        "divisions_missing": [],
        "agents_created": 7,
        "profile_attached": 7,
        "creation_results": [{"name": "Div1.HCO", "ok": True}],
    }


def full_routing() -> dict[str, Any]:
    return {
        "rules_active": 8,
        "rule_names": [
            "backlog_shaping",
            "budget_capacity",
            "complex_decision",
            "external_io_request",
            "high_level_mission",
            "implementation",
            "paid_credentialed_external_io_request",
            "qa_security_review",
        ],
        "test_route_result": "routed_to_Div2.MasterPlanner",
    }


def full_readback() -> dict[str, Any]:
    return {
        "all_v141_present": True,
        "total_agents": 7,
        "v141_agents_present": 7,
        "v141_agents_missing": [],
    }


def import_success_proof() -> dict[str, Any]:
    payload = base_passing()
    payload.update({
        "import_attempt": {
            "surface": "template_import",
            "status": "success",
            "side_effect_counters": {
                "agents_created": 7,
                "agents_updated": 0,
                "approvals_created": 0,
                "issues_created": 0,
                "paperclip_api_calls": 9,
            },
            "blocker_codes": [],
        },
        "agent_activation": full_agent_activation(),
        "routing_validation": full_routing(),
        "readback": full_readback(),
        "side_effect_counters": {
            "agents_created": 7,
            "agents_updated": 0,
            "approvals_created": 0,
            "issues_created": 0,
            "paperclip_api_calls": 9,
        },
    })
    return payload


def direct_creation_proof() -> dict[str, Any]:
    payload = base_passing()
    payload.update({
        "import_attempt": {
            "surface": "direct_creation_api",
            "status": "fallback_created",
            "side_effect_counters": {
                "agents_created": 7,
                "agents_updated": 0,
                "approvals_created": 0,
                "issues_created": 0,
                "paperclip_api_calls": 14,
            },
            "blocker_codes": [],
        },
        "agent_activation": full_agent_activation(),
        "routing_validation": full_routing(),
        "readback": full_readback(),
        "side_effect_counters": {
            "agents_created": 7,
            "agents_updated": 0,
            "approvals_created": 0,
            "issues_created": 0,
            "paperclip_api_calls": 14,
        },
    })
    return payload


def blocker_missing_auth() -> dict[str, Any]:
    return {
        "schema_version": validator.SCHEMA_VERSION,
        "artifact_type": validator.BLOCKER_ARTIFACT_TYPE,
        "phase": "company_template_import",
        "generated_at": GENERATED_AT,
        "blocker_reason": "missing_auth",
        "blocker_codes": ["missing_auth"],
        "diagnostics": {
            "health": {
                "ok": True,
                "status": 200,
                "url": "https://paperclip.oysana.com/api/health",
            },
            "token": "<redacted>",
        },
        "capability_promotions": [],
        "no_core_modification": no_core_modification(),
        "import_attempt": {
            "surface": None,
            "status": "preflight_blocked",
            "blocker_codes": ["missing_auth"],
            "side_effect_counters": {
                "agents_created": 0,
                "agents_updated": 0,
                "approvals_created": 0,
                "issues_created": 0,
                "paperclip_api_calls": 1,
            },
        },
        "agent_activation": {
            "divisions_present": [],
            "divisions_missing": validator.EXPECTED_DIVISIONS,
            "agents_created": 0,
            "profile_attached": 0,
            "creation_results": [],
        },
        "routing_validation": {
            "rules_active": 8,
            "rule_names": validator.EXPECTED_ROUTING_RULES,
            "test_route_result": "n/a-preflight-blocked",
        },
        "readback": {
            "all_v141_present": False,
            "total_agents": None,
            "v141_agents_present": 0,
            "v141_agents_missing": validator.EXPECTED_DIVISIONS,
        },
        "side_effect_counters": {
            "agents_created": 0,
            "agents_updated": 0,
            "approvals_created": 0,
            "issues_created": 0,
            "paperclip_api_calls": 1,
        },
        "safety": {
            "max_agent_creations": 7,
            "plaintext_secrets_requested_or_logged": False,
            "runner_exit_policy": "exit_zero_for_valid_proof_or_valid_fail_closed_blocker",
            "unsupported_paths_used": [],
        },
    }


def blocker_unsupported_endpoint() -> dict[str, Any]:
    payload = blocker_missing_auth()
    payload["blocker_reason"] = "unsupported_endpoint"
    payload["blocker_codes"] = ["unsupported_endpoint"]
    payload["import_attempt"]["blocker_codes"] = ["unsupported_endpoint"]
    payload["diagnostics"]["error"] = "endpoint_not_found"
    return payload


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


class ValidateM005S02CompanyTemplateProbeTests(unittest.TestCase):
    def test_passing_import_proof_passes(self) -> None:
        with FixtureRoot() as root:
            errors, classification = run_artifact(
                root, Path("runtime-evidence/M005-S02-company-template-proof.json"), import_success_proof()
            )
            self.assertEqual([], errors)
            self.assertEqual("passing", classification)

    def test_passing_direct_creation_proof_passes(self) -> None:
        with FixtureRoot() as root:
            errors, classification = run_artifact(
                root, Path("runtime-evidence/M005-S02-direct-creation-proof.json"), direct_creation_proof()
            )
            self.assertEqual([], errors)
            self.assertEqual("passing", classification)

    def test_fail_closed_blocker_missing_auth_is_valid_diagnostic(self) -> None:
        with FixtureRoot() as root:
            errors, classification = run_artifact(
                root, Path("runtime-evidence/M005-S02-blocker-missing-auth.json"), blocker_missing_auth()
            )
            self.assertEqual([], errors)
            self.assertEqual("blocker", classification)

    def test_fail_closed_blocker_unsupported_endpoint_is_valid_diagnostic(self) -> None:
        with FixtureRoot() as root:
            errors, classification = run_artifact(
                root, Path("runtime-evidence/M005-S02-blocker-unsupported.json"), blocker_unsupported_endpoint()
            )
            self.assertEqual([], errors)
            self.assertEqual("blocker", classification)

    def test_partial_import_fails_when_divisions_missing(self) -> None:
        with FixtureRoot() as root:
            payload = import_success_proof()
            payload["agent_activation"]["divisions_present"] = [
                "Div1.HCO",
                "Div2.MasterPlanner",
                "Div3.Treasury",
            ]
            payload["agent_activation"]["divisions_missing"] = [
                "Div4.Production",
                "Div5.QualificationsLibraryLearning",
                "Div6.External",
                "Div7.MissionControl",
            ]
            payload["agent_activation"]["agents_created"] = 3
            payload["agent_activation"]["profile_attached"] = 3
            errors, classification = run_artifact(
                root, Path("runtime-evidence/M005-S02-partial.json"), payload
            )
            self.assertEqual("invalid", classification)
            self.assertTrue(
                any("divisions_present" in error and "expected 7 divisions" in error for error in errors),
                errors,
            )

    def test_unredacted_token_strings_fail(self) -> None:
        with FixtureRoot() as root:
            payload = blocker_missing_auth()
            payload["diagnostics"]["raw"] = "Authorization: Bearer abcdefghijklmnopqrstuvwxyz"
            errors, _classification = run_artifact(
                root, Path("runtime-evidence/M005-S02-unredacted.json"), payload
            )
            self.assertTrue(any("secret-like string value" in error for error in errors), errors)

    def test_direct_db_core_patch_and_private_import_flags_fail(self) -> None:
        with FixtureRoot() as root:
            payload = import_success_proof()
            payload["no_core_modification"]["direct_db_mutation"] = True
            payload["no_core_modification"]["core_source_patched"] = True
            payload["no_core_modification"]["private_internal_imports"] = ["paperclip/server/internal/db"]
            errors, _classification = run_artifact(
                root, Path("runtime-evidence/M005-S02-bad-flags.json"), payload
            )
            joined = "\n".join(errors)
            self.assertIn("direct database mutation", joined)
            self.assertIn("Paperclip core patches", joined)
            self.assertIn("private internal imports", joined)

    def test_malformed_timestamp_fails(self) -> None:
        with FixtureRoot() as root:
            payload = import_success_proof()
            payload["generated_at"] = "May 31, 2026"
            errors, _classification = run_artifact(
                root, Path("runtime-evidence/M005-S02-bad-ts.json"), payload
            )
            self.assertTrue(any("generated_at" in error and "ISO-8601" in error for error in errors), errors)

    def test_cli_returns_zero_for_valid_fail_closed_blocker(self) -> None:
        with FixtureRoot() as root:
            blocker_path = root / "runtime-evidence/M005-S02-blocker.json"
            FixtureRoot.write_json(root, Path("runtime-evidence/M005-S02-blocker.json"), blocker_missing_auth())
            exit_code = validator.main(["--evidence", str(blocker_path), "--root", str(root)])
            self.assertEqual(0, exit_code)

    def test_cli_write_audit_persists_closeout_json(self) -> None:
        with FixtureRoot() as root:
            evidence_path = Path("runtime-evidence/M005-S02-blocker.json")
            audit_path = Path("runtime-evidence/M005-S02-closeout.json")
            FixtureRoot.write_json(root, evidence_path, blocker_missing_auth())
            exit_code = validator.main([
                "--evidence", str(root / evidence_path),
                "--root", str(root),
                "--write-audit", str(audit_path),
            ])
            self.assertEqual(0, exit_code)
            payload = json.loads((root / audit_path).read_text(encoding="utf-8"))
            self.assertEqual("m005-s02-company-template-closeout/v1", payload["schema_version"])
            self.assertEqual("validator-audit", payload["artifact_type"])
            self.assertEqual("company_template_import", payload["phase"])
            self.assertEqual("blocker", payload["classification"])
            self.assertTrue(payload["passed"])
            self.assertEqual(0, payload["diagnostics"]["error_count"])

    def test_wrong_schema_version_fails(self) -> None:
        with FixtureRoot() as root:
            payload = import_success_proof()
            payload["schema_version"] = "s10-runtime-execution/v1"
            errors, classification = run_artifact(
                root, Path("runtime-evidence/M005-S02-wrong-schema.json"), payload
            )
            self.assertEqual("invalid", classification)
            self.assertTrue(any("schema_version" in error for error in errors), errors)

    def test_routing_placeholder_fails(self) -> None:
        with FixtureRoot() as root:
            payload = import_success_proof()
            payload["routing_validation"]["test_route_result"] = "n/a-preflight-blocked"
            errors, classification = run_artifact(
                root, Path("runtime-evidence/M005-S02-bad-route.json"), payload
            )
            self.assertEqual("invalid", classification)
            self.assertTrue(
                any("test_route_result" in error and "actual routing result" in error for error in errors),
                errors,
            )


if __name__ == "__main__":
    unittest.main()
