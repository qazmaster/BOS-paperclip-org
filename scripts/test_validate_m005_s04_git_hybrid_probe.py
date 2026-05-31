#!/usr/bin/env python3
"""Fixture coverage for scripts/validate_m005_s04_git_hybrid_probe.py."""

from __future__ import annotations

import importlib.util
import json
import tempfile
import unittest
from pathlib import Path
from typing import Any

SCRIPT_PATH = Path(__file__).resolve().parent / "validate_m005_s04_git_hybrid_probe.py"
SPEC = importlib.util.spec_from_file_location("validate_m005_s04_git_hybrid_probe", SCRIPT_PATH)
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
        "phase": "git_hybrid",
        "generated_at": GENERATED_AT,
        "passing": True,
        "no_core_modification": no_core_modification(),
        "capability_promotions": [
            "git.operations.clone_branch_commit_push",
            "state.hybrid_persistence.mirror",
            "state.reconstruction.from_artifacts",
        ],
        "safety": {
            "plaintext_secrets_requested_or_logged": False,
            "unsupported_paths_used": [],
            "runner_exit_policy": "exit_zero_for_valid_proof_or_valid_fail_closed_blocker",
        },
    }


def git_binary_available() -> dict[str, Any]:
    return {
        "available": True,
        "version": "git version 2.43.0",
        "version_hash": "afe546045563315286ad2bcfb4a042a4e8e0aea3d76e2d31beeb1f549d19b865",
        "returncode": 0,
        "stderr_redacted": None,
    }


def git_ls_remote_success() -> dict[str, Any]:
    return {
        "ok": True,
        "returncode": 0,
        "duration_ms": 1234,
        "stdout_lines": 5,
        "stdout_hash": "abc123def456",
        "stderr_redacted": None,
        "error_category": "none",
    }


def hybrid_persistence_smoke_ok() -> dict[str, Any]:
    return {
        "ok": True,
        "issue_id": "BOS-M005-S04-SMOKE",
        "bpi_ok": True,
        "status_ok": True,
        "gate_ok": True,
        "betting_table_count": 2,
        "mirror_diagnostics": {
            "artifact_refs": [
                {"type": "document", "issue_id": "BOS-M005-S04-SMOKE", "ref_id": "doc_1", "created_at": GENERATED_AT},
                {"type": "comment", "issue_id": "BOS-M005-S04-SMOKE", "ref_id": "comment_1", "created_at": GENERATED_AT},
                {"type": "document", "issue_id": "BOS-M005-S04-SMOKE", "ref_id": "doc_2", "created_at": GENERATED_AT},
            ],
            "last_error": None,
            "last_error_at": None,
            "last_mirror_at": GENERATED_AT,
            "total_comments": 1,
            "total_documents": 2,
        },
        "memory_keys": [
            "bpi:BOS-M005-S04-SMOKE",
            "status:BOS-M005-S04-SMOKE",
            "gate:BOS-M005-S04-SMOKE",
            "betting_table:M005-S04",
        ],
    }


def state_reconstruction_smoke_ok() -> dict[str, Any]:
    return {
        "ok": True,
        "issue_id": "BOS-M005-S04-SMOKE",
        "envelope": {
            "schema_version": "1.0",
            "issue_id": "BOS-M005-S04-SMOKE",
            "reconstructed_at": GENERATED_AT,
            "found": {
                "bpi": {
                    "score": 82.0,
                    "formula": "(ev * confidence) / risk",
                    "scored_by": "Div4.Production",
                    "scored_at": GENERATED_AT,
                },
                "status": {
                    "status": "amber",
                    "cycle_id": "M005-S04",
                },
                "gate_result": {
                    "verdict": "flag",
                },
            },
            "missing": [],
            "fallback_used": False,
            "diagnostics": {
                "documents_scraped": 2,
                "comments_scraped": 1,
                "parse_errors": [],
            },
        },
        "reconstruction_success": True,
    }


def passing_git_hybrid_proof() -> dict[str, Any]:
    payload = base_passing()
    payload.update({
        "inputs": {
            "auth": {"selected_env_name": "PAPERCLIP_API_KEY", "available_env": []},
            "origin_present": False,
        },
        "git_binary_check": git_binary_available(),
        "git_ls_remote": git_ls_remote_success(),
        "hybrid_persistence_smoke": hybrid_persistence_smoke_ok(),
        "state_reconstruction_smoke": state_reconstruction_smoke_ok(),
        "side_effect_counters": {
            "comments_created": 1,
            "documents_created": 2,
            "escalation_issues_created": 0,
        },
    })
    return payload


def blocker_missing_auth() -> dict[str, Any]:
    return {
        "schema_version": validator.SCHEMA_VERSION,
        "artifact_type": validator.BLOCKER_ARTIFACT_TYPE,
        "phase": "git_hybrid",
        "generated_at": GENERATED_AT,
        "passing": False,
        "blocker_reason": "missing_git_credentials",
        "blocker_codes": ["missing_git_credentials"],
        "inputs": {
            "auth": {"selected_env_name": None, "available_env": []},
            "origin_present": False,
        },
        "git_binary_check": git_binary_available(),
        "git_env_discovery": {
            "AIPAY_GIT_URL": {"present": False, "description": "Git URL for aipay.kz repository", "value_redacted": None},
            "GIT_SSH_KEY": {"present": False, "description": "SSH private key path for git authentication", "value_redacted": None},
            "GITHUB_TOKEN": {"present": False, "description": "GitHub personal access token for HTTPS auth", "value_redacted": None},
            "GITLAB_TOKEN": {"present": False, "description": "GitLab personal access token for HTTPS auth", "value_redacted": None},
        },
        "git_ls_remote": {
            "ok": False,
            "skipped": True,
            "reason": "missing_git_credentials",
        },
        "hybrid_persistence_smoke": hybrid_persistence_smoke_ok(),
        "state_reconstruction_smoke": state_reconstruction_smoke_ok(),
        "diagnostics": {
            "config_discovery": "No git credentials present; skipping ls-remote probe",
        },
        "side_effect_counters": {
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


def blocker_missing_git_binary() -> dict[str, Any]:
    payload = blocker_missing_auth()
    payload["blocker_reason"] = "missing_git_binary"
    payload["blocker_codes"] = ["missing_git_binary"]
    payload["git_binary_check"] = {
        "available": False,
        "version": None,
        "version_hash": None,
        "returncode": None,
        "error": "git_binary_not_found",
    }
    payload["git_ls_remote"] = {
        "ok": False,
        "skipped": True,
        "reason": "git_binary_unavailable_or_no_url",
    }
    payload["diagnostics"] = {
        "config_discovery": "Git binary not found in PATH",
    }
    return payload


def blocker_missing_git_url() -> dict[str, Any]:
    payload = blocker_missing_auth()
    payload["blocker_reason"] = "missing_aipay_git_url"
    payload["blocker_codes"] = ["missing_aipay_git_url"]
    payload["git_env_discovery"] = {
        "AIPAY_GIT_URL": {"present": False, "description": "Git URL for aipay.kz repository", "value_redacted": None},
        "GIT_SSH_KEY": {"present": True, "description": "SSH private key path for git authentication", "value_redacted": "<redacted>"},
        "GITHUB_TOKEN": {"present": False, "description": "GitHub personal access token for HTTPS auth", "value_redacted": None},
        "GITLAB_TOKEN": {"present": False, "description": "GitLab personal access token for HTTPS auth", "value_redacted": None},
    }
    payload["git_ls_remote"] = {
        "ok": False,
        "skipped": True,
        "reason": "missing_aipay_git_url",
    }
    payload["diagnostics"] = {
        "config_discovery": "Git credentials present but AIPAY_GIT_URL is missing",
    }
    return payload


def blocker_unsupported_endpoint() -> dict[str, Any]:
    payload = blocker_missing_auth()
    payload["blocker_reason"] = "git_ls_remote_failed"
    payload["blocker_codes"] = ["git_ls_remote_failed"]
    payload["git_env_discovery"] = {
        "AIPAY_GIT_URL": {"present": True, "description": "Git URL for aipay.kz repository", "value_redacted": "<redacted>"},
        "GIT_SSH_KEY": {"present": True, "description": "SSH private key path for git authentication", "value_redacted": "<redacted>"},
        "GITHUB_TOKEN": {"present": False, "description": "GitHub personal access token for HTTPS auth", "value_redacted": None},
        "GITLAB_TOKEN": {"present": False, "description": "GitLab personal access token for HTTPS auth", "value_redacted": None},
    }
    payload["git_ls_remote"] = {
        "ok": False,
        "returncode": 128,
        "duration_ms": 500,
        "stdout_lines": 0,
        "stdout_hash": None,
        "stderr_redacted": "fatal: unable to access 'https://unsupported-git.example.com/': Could not resolve host",
        "error_category": "generic",
    }
    payload["diagnostics"] = {
        "config_discovery": "Git ls-remote failed on unsupported endpoint",
    }
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


class ValidateM005S04GitHybridProbeTests(unittest.TestCase):
    def test_passing_git_hybrid_proof(self) -> None:
        with FixtureRoot() as root:
            errors, classification = run_artifact(
                root, Path("runtime-evidence/M005-S04-passing-git.json"), passing_git_hybrid_proof()
            )
            self.assertEqual([], errors)
            self.assertEqual("passing", classification)

    def test_passing_reconstruction_proof(self) -> None:
        with FixtureRoot() as root:
            payload = passing_git_hybrid_proof()
            payload["capability_promotions"] = ["state.reconstruction.from_artifacts"]
            errors, classification = run_artifact(
                root, Path("runtime-evidence/M005-S04-passing-recon.json"), payload
            )
            self.assertEqual([], errors)
            self.assertEqual("passing", classification)

    def test_fail_closed_blocker_missing_auth(self) -> None:
        with FixtureRoot() as root:
            errors, classification = run_artifact(
                root, Path("runtime-evidence/M005-S04-blocker-missing-auth.json"), blocker_missing_auth()
            )
            self.assertEqual([], errors)
            self.assertEqual("blocker", classification)

    def test_fail_closed_blocker_missing_git_binary(self) -> None:
        with FixtureRoot() as root:
            errors, classification = run_artifact(
                root, Path("runtime-evidence/M005-S04-blocker-missing-binary.json"), blocker_missing_git_binary()
            )
            self.assertEqual([], errors)
            self.assertEqual("blocker", classification)

    def test_fail_closed_blocker_missing_git_url(self) -> None:
        with FixtureRoot() as root:
            errors, classification = run_artifact(
                root, Path("runtime-evidence/M005-S04-blocker-missing-url.json"), blocker_missing_git_url()
            )
            self.assertEqual([], errors)
            self.assertEqual("blocker", classification)

    def test_fail_closed_blocker_unsupported_endpoint(self) -> None:
        with FixtureRoot() as root:
            errors, classification = run_artifact(
                root, Path("runtime-evidence/M005-S04-blocker-endpoint.json"), blocker_unsupported_endpoint()
            )
            self.assertEqual([], errors)
            self.assertEqual("blocker", classification)

    def test_partial_hybrid_mirror_failure(self) -> None:
        with FixtureRoot() as root:
            payload = passing_git_hybrid_proof()
            payload["hybrid_persistence_smoke"]["ok"] = False
            payload["hybrid_persistence_smoke"]["bpi_ok"] = False
            payload["hybrid_persistence_smoke"]["mirror_diagnostics"]["last_error"] = "Adapter timeout"
            errors, classification = run_artifact(
                root, Path("runtime-evidence/M005-S04-partial-hybrid.json"), payload
            )
            self.assertEqual("invalid", classification)
            self.assertTrue(
                any("hybrid_persistence_smoke.ok" in error for error in errors),
                errors,
            )

    def test_unredacted_secrets_in_diagnostics(self) -> None:
        with FixtureRoot() as root:
            payload = blocker_missing_auth()
            payload["diagnostics"]["raw"] = "Authorization: Bearer abcdefghijklmnopqrstuvwxyz"
            errors, _classification = run_artifact(
                root, Path("runtime-evidence/M005-S04-unredacted.json"), payload
            )
            self.assertTrue(any("secret-like string value" in error for error in errors), errors)

    def test_malformed_timestamp(self) -> None:
        with FixtureRoot() as root:
            payload = passing_git_hybrid_proof()
            payload["generated_at"] = "May 31, 2026"
            errors, _classification = run_artifact(
                root, Path("runtime-evidence/M005-S04-bad-ts.json"), payload
            )
            self.assertTrue(any("generated_at" in error and "ISO-8601" in error for error in errors), errors)

    def test_unsupported_paths_used(self) -> None:
        with FixtureRoot() as root:
            payload = passing_git_hybrid_proof()
            payload["safety"]["unsupported_paths_used"] = ["direct_db_mutation"]
            errors, classification = run_artifact(
                root, Path("runtime-evidence/M005-S04-unsupported.json"), payload
            )
            self.assertEqual("invalid", classification)
            self.assertTrue(any("unsupported_paths_used" in error for error in errors), errors)

    def test_capability_promotion_in_blocker_artifact(self) -> None:
        with FixtureRoot() as root:
            payload = blocker_missing_auth()
            payload["capability_promotions"] = ["git.operations.clone_branch_commit_push"]
            errors, classification = run_artifact(
                root, Path("runtime-evidence/M005-S04-blocker-promotion.json"), payload
            )
            self.assertEqual("invalid", classification)
            self.assertTrue(any("capability_promotions" in error for error in errors), errors)

    def test_cli_write_audit_persists_closeout_json(self) -> None:
        with FixtureRoot() as root:
            evidence_path = Path("runtime-evidence/M005-S04-blocker.json")
            audit_path = Path("runtime-evidence/M005-S04-closeout.json")
            FixtureRoot.write_json(root, evidence_path, blocker_missing_auth())
            exit_code = validator.main([
                "--evidence", str(root / evidence_path),
                "--root", str(root),
                "--write-audit", str(audit_path),
            ])
            self.assertEqual(0, exit_code)
            payload = json.loads((root / audit_path).read_text(encoding="utf-8"))
            self.assertEqual("m005-s04-git-hybrid-closeout/v1", payload["schema_version"])
            self.assertEqual("validator-audit", payload["artifact_type"])
            self.assertEqual("git_hybrid", payload["phase"])
            self.assertEqual("blocker", payload["classification"])
            self.assertTrue(payload["passed"])
            self.assertEqual(0, payload["diagnostics"]["error_count"])


if __name__ == "__main__":
    unittest.main()
