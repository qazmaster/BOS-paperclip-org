#!/usr/bin/env python3
"""Fixture coverage for scripts/validate_m005_s03_resource_intake_probe.py."""

from __future__ import annotations

import importlib.util
import json
import tempfile
import unittest
from pathlib import Path
from typing import Any

SCRIPT_PATH = Path(__file__).resolve().parent / "validate_m005_s03_resource_intake_probe.py"
SPEC = importlib.util.spec_from_file_location("validate_m005_s03_resource_intake_probe", SCRIPT_PATH)
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
        "phase": "resource_intake",
        "generated_at": GENERATED_AT,
        "passing": True,
        "no_core_modification": no_core_modification(),
        "capability_promotions": ["resource_intake.credential_checklist"],
        "safety": {
            "plaintext_secrets_requested_or_logged": False,
            "unsupported_paths_used": [],
            "runner_exit_policy": "exit_zero_for_valid_proof_or_valid_fail_closed_blocker",
        },
    }


def all_resources_present() -> list[dict[str, Any]]:
    return [
        {"category": "paperclip_api_key", "present": True, "source": "env:PAPERCLIP_API_KEY", "description": "Paperclip API key"},
        {"category": "paperclip_base_url", "present": True, "source": "env:PAPERCLIP_BASE_URL", "description": "Paperclip base URL"},
        {"category": "company_token_budget", "present": True, "source": "company-template/bos-company-template.json", "description": "Company token budget", "value": 100000},
        {"category": "aipay_git_access", "present": True, "source": "env:GIT_SSH_KEY", "description": "Git access for aipay.kz"},
        {"category": "xiaomi_api_key", "present": True, "source": "env:XIAOMI_API_KEY", "description": "Xiaomi API key"},
        {"category": "xiaomi_base_url", "present": True, "source": "env:XIAOMI_BASE_URL", "description": "Xiaomi base URL"},
    ]


def full_request_artifacts() -> list[dict[str, Any]]:
    return [
        {"phase": "comments.native", "ok": True, "status": 201, "issue_id": "BOS-M005-S03"},
        {"phase": "documents.native", "ok": True, "status": 201, "issue_id": "BOS-M005-S03"},
    ]


def full_side_effects() -> dict[str, Any]:
    return {
        "paperclip_api_calls": 3,
        "comments_created": 1,
        "documents_created": 1,
        "escalation_issues_created": 0,
    }


def passing_proof() -> dict[str, Any]:
    payload = base_passing()
    payload.update({
        "inputs": {
            "base_url_present": True,
            "base_url_source": "env",
            "company_id_present": True,
            "auth": {"selected_env_name": "PAPERCLIP_API_KEY", "available_env": []},
            "origin_present": False,
            "company_token_budget_ref": 100000,
            "template_path": "company-template/bos-company-template.json",
            "template_schema_version": "0.1-v1.4.1",
        },
        "resources": all_resources_present(),
        "missing_resources": [],
        "diagnostics": {
            "health": {"ok": True, "status": 200, "url": "https://paperclip.oysana.com/api/health"},
            "version": {"ok": True, "status": 200},
        },
        "request_artifacts": full_request_artifacts(),
        "side_effect_counters": full_side_effects(),
        "paperclip": {"version": "1.4.1", "build": "abc123"},
    })
    return payload


def blocker_missing_auth() -> dict[str, Any]:
    return {
        "schema_version": validator.SCHEMA_VERSION,
        "artifact_type": validator.BLOCKER_ARTIFACT_TYPE,
        "phase": "resource_intake",
        "generated_at": GENERATED_AT,
        "passing": False,
        "blocker_reason": "missing_paperclip_auth,missing_paperclip_base_url",
        "blocker_codes": ["missing_paperclip_auth", "missing_paperclip_base_url"],
        "inputs": {
            "base_url_present": False,
            "base_url_source": "missing",
            "company_id_present": False,
            "auth": {"selected_env_name": None, "available_env": []},
            "origin_present": False,
            "company_token_budget_ref": 100000,
            "template_path": "company-template/bos-company-template.json",
            "template_schema_version": "0.1-v1.4.1",
        },
        "resources": [
            {"category": "paperclip_api_key", "present": False, "source": None, "description": "Paperclip API key"},
            {"category": "paperclip_base_url", "present": False, "source": None, "description": "Paperclip base URL"},
            {"category": "company_token_budget", "present": True, "source": "company-template", "description": "Company token budget", "value": 100000},
            {"category": "aipay_git_access", "present": False, "source": None, "description": "Git access for aipay.kz"},
            {"category": "xiaomi_api_key", "present": False, "source": None, "description": "Xiaomi API key"},
            {"category": "xiaomi_base_url", "present": False, "source": None, "description": "Xiaomi base URL"},
        ],
        "missing_resources": ["paperclip_api_key", "paperclip_base_url", "aipay_git_access", "xiaomi_api_key", "xiaomi_base_url"],
        "diagnostics": {
            "config_discovery": "missing Paperclip base URL or company id; no HTTP attempt made",
        },
        "request_artifacts": [],
        "side_effect_counters": {
            "paperclip_api_calls": 0,
            "comments_created": 0,
            "documents_created": 0,
            "escalation_issues_created": 0,
        },
        "capability_promotions": [],
        "no_core_modification": no_core_modification(),
        "safety": {
            "plaintext_secrets_requested_or_logged": False,
            "unsupported_paths_used": [],
            "runner_exit_policy": "exit_zero_for_valid_proof_or_valid_fail_closed_blocker",
        },
    }


def blocker_missing_xiaomi() -> dict[str, Any]:
    payload = blocker_missing_auth()
    payload["blocker_reason"] = "missing_xiaomi_api_key,missing_xiaomi_base_url"
    payload["blocker_codes"] = ["missing_xiaomi_api_key", "missing_xiaomi_base_url"]
    payload["resources"] = [
        {"category": "paperclip_api_key", "present": True, "source": "env:PAPERCLIP_API_KEY", "description": "Paperclip API key"},
        {"category": "paperclip_base_url", "present": True, "source": "env:PAPERCLIP_BASE_URL", "description": "Paperclip base URL"},
        {"category": "company_token_budget", "present": True, "source": "company-template", "description": "Company token budget", "value": 100000},
        {"category": "aipay_git_access", "present": True, "source": "env:GIT_SSH_KEY", "description": "Git access for aipay.kz"},
        {"category": "xiaomi_api_key", "present": False, "source": None, "description": "Xiaomi API key"},
        {"category": "xiaomi_base_url", "present": False, "source": None, "description": "Xiaomi base URL"},
    ]
    payload["missing_resources"] = ["xiaomi_api_key", "xiaomi_base_url"]
    payload["diagnostics"] = {
        "health": {"ok": True, "status": 200, "url": "https://paperclip.oysana.com/api/health"},
        "config_discovery": "Xiaomi credentials missing",
    }
    payload["side_effect_counters"]["paperclip_api_calls"] = 1
    return payload


def blocker_missing_git() -> dict[str, Any]:
    payload = blocker_missing_auth()
    payload["blocker_reason"] = "missing_aipay_git_access"
    payload["blocker_codes"] = ["missing_aipay_git_access"]
    payload["resources"] = [
        {"category": "paperclip_api_key", "present": True, "source": "env:PAPERCLIP_API_KEY", "description": "Paperclip API key"},
        {"category": "paperclip_base_url", "present": True, "source": "env:PAPERCLIP_BASE_URL", "description": "Paperclip base URL"},
        {"category": "company_token_budget", "present": True, "source": "company-template", "description": "Company token budget", "value": 100000},
        {"category": "aipay_git_access", "present": False, "source": None, "description": "Git access for aipay.kz"},
        {"category": "xiaomi_api_key", "present": True, "source": "env:XIAOMI_API_KEY", "description": "Xiaomi API key"},
        {"category": "xiaomi_base_url", "present": True, "source": "env:XIAOMI_BASE_URL", "description": "Xiaomi base URL"},
    ]
    payload["missing_resources"] = ["aipay_git_access"]
    payload["diagnostics"] = {
        "health": {"ok": True, "status": 200, "url": "https://paperclip.oysana.com/api/health"},
        "config_discovery": "Git access missing",
    }
    payload["side_effect_counters"]["paperclip_api_calls"] = 1
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


class ValidateM005S03ResourceIntakeProbeTests(unittest.TestCase):
    def test_passing_checklist_passes(self) -> None:
        with FixtureRoot() as root:
            errors, classification = run_artifact(
                root, Path("runtime-evidence/M005-S03-passing.json"), passing_proof()
            )
            self.assertEqual([], errors)
            self.assertEqual("passing", classification)

    def test_fail_closed_blocker_missing_auth_is_valid_diagnostic(self) -> None:
        with FixtureRoot() as root:
            errors, classification = run_artifact(
                root, Path("runtime-evidence/M005-S03-blocker-missing-auth.json"), blocker_missing_auth()
            )
            self.assertEqual([], errors)
            self.assertEqual("blocker", classification)

    def test_fail_closed_blocker_missing_xiaomi_is_valid_diagnostic(self) -> None:
        with FixtureRoot() as root:
            errors, classification = run_artifact(
                root, Path("runtime-evidence/M005-S03-blocker-missing-xiaomi.json"), blocker_missing_xiaomi()
            )
            self.assertEqual([], errors)
            self.assertEqual("blocker", classification)

    def test_fail_closed_blocker_missing_git_is_valid_diagnostic(self) -> None:
        with FixtureRoot() as root:
            errors, classification = run_artifact(
                root, Path("runtime-evidence/M005-S03-blocker-missing-git.json"), blocker_missing_git()
            )
            self.assertEqual([], errors)
            self.assertEqual("blocker", classification)

    def test_partial_checklist_fails(self) -> None:
        with FixtureRoot() as root:
            payload = passing_proof()
            payload["resources"][2]["present"] = False  # company_token_budget missing
            payload["missing_resources"] = ["company_token_budget"]
            errors, classification = run_artifact(
                root, Path("runtime-evidence/M005-S03-partial.json"), payload
            )
            self.assertEqual("invalid", classification)
            self.assertTrue(
                any("resources" in error and "company_token_budget" in error for error in errors),
                errors,
            )

    def test_unredacted_secrets_in_diagnostics_fails(self) -> None:
        with FixtureRoot() as root:
            payload = blocker_missing_auth()
            payload["diagnostics"]["raw"] = "Authorization: Bearer abcdefghijklmnopqrstuvwxyz"
            errors, _classification = run_artifact(
                root, Path("runtime-evidence/M005-S03-unredacted.json"), payload
            )
            self.assertTrue(any("secret-like string value" in error for error in errors), errors)

    def test_malformed_timestamp_fails(self) -> None:
        with FixtureRoot() as root:
            payload = passing_proof()
            payload["generated_at"] = "May 31, 2026"
            errors, _classification = run_artifact(
                root, Path("runtime-evidence/M005-S03-bad-ts.json"), payload
            )
            self.assertTrue(any("generated_at" in error and "ISO-8601" in error for error in errors), errors)

    def test_unsupported_paths_used_fails(self) -> None:
        with FixtureRoot() as root:
            payload = passing_proof()
            payload["safety"]["unsupported_paths_used"] = ["direct_db_mutation"]
            errors, classification = run_artifact(
                root, Path("runtime-evidence/M005-S03-unsupported.json"), payload
            )
            self.assertEqual("invalid", classification)
            self.assertTrue(any("unsupported_paths_used" in error for error in errors), errors)

    def test_wrong_schema_version_fails(self) -> None:
        with FixtureRoot() as root:
            payload = passing_proof()
            payload["schema_version"] = "s10-runtime-execution/v1"
            errors, classification = run_artifact(
                root, Path("runtime-evidence/M005-S03-wrong-schema.json"), payload
            )
            self.assertEqual("invalid", classification)
            self.assertTrue(any("schema_version" in error for error in errors), errors)

    def test_capability_promotion_in_blocker_artifact_fails(self) -> None:
        with FixtureRoot() as root:
            payload = blocker_missing_auth()
            payload["capability_promotions"] = ["resource_intake.credential_checklist"]
            errors, classification = run_artifact(
                root, Path("runtime-evidence/M005-S03-blocker-promotion.json"), payload
            )
            self.assertEqual("invalid", classification)
            self.assertTrue(any("capability_promotions" in error for error in errors), errors)

    def test_cli_write_audit_persists_closeout_json(self) -> None:
        with FixtureRoot() as root:
            evidence_path = Path("runtime-evidence/M005-S03-blocker.json")
            audit_path = Path("runtime-evidence/M005-S03-closeout.json")
            FixtureRoot.write_json(root, evidence_path, blocker_missing_auth())
            exit_code = validator.main([
                "--evidence", str(root / evidence_path),
                "--root", str(root),
                "--write-audit", str(audit_path),
            ])
            self.assertEqual(0, exit_code)
            payload = json.loads((root / audit_path).read_text(encoding="utf-8"))
            self.assertEqual("m005-s03-resource-intake-closeout/v1", payload["schema_version"])
            self.assertEqual("validator-audit", payload["artifact_type"])
            self.assertEqual("resource_intake", payload["phase"])
            self.assertEqual("blocker", payload["classification"])
            self.assertTrue(payload["passed"])
            self.assertEqual(0, payload["diagnostics"]["error_count"])

    def test_zero_side_effects_in_blocker_artifact(self) -> None:
        with FixtureRoot() as root:
            payload = blocker_missing_auth()
            payload["side_effect_counters"]["comments_created"] = 1
            payload["side_effect_counters"]["documents_created"] = 2
            errors, classification = run_artifact(
                root, Path("runtime-evidence/M005-S03-blocker-side-effects.json"), payload
            )
            self.assertEqual("invalid", classification)
            joined = "\n".join(errors)
            self.assertIn("comments_created", joined)
            self.assertIn("documents_created", joined)
            self.assertIn("zero mutation side effects", joined)


if __name__ == "__main__":
    unittest.main()
