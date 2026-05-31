#!/usr/bin/env python3
"""Unit tests for validate_m004_s08_requirement_scope.

Tests exercise the validator against temporary fixture roots so they never
touch .gsd, .planning, or .audits paths from the repository.  All fixtures
are created in ephemeral temp directories that are cleaned up after each test.
"""

from __future__ import annotations

import copy
import json
import sys
import tempfile
import unittest
from pathlib import Path

# Ensure scripts/ is importable.
sys.path.insert(0, str(Path(__file__).resolve().parent))

import validate_m004_s08_requirement_scope as mod


# ---------------------------------------------------------------------------
# Canonical fixture helpers
# ---------------------------------------------------------------------------

def _make_citation(
    *,
    path: str = "evidence/stub.md",
    validation_class: str = "Contract",
    problem_kind: str = "requirement_definition",
    note: str = "A" * 25,
) -> dict:
    """Return a minimal valid citation dict."""
    return {
        "path": path,
        "validation_class": validation_class,
        "problem_kind": problem_kind,
        "note": note,
    }


def _make_citations_for_requirement(stub_dir: str) -> list[dict]:
    """Return 6 citations covering all four validation classes."""
    return [
        _make_citation(
            path=f"{stub_dir}/m003-context.md",
            validation_class="Contract",
            problem_kind="requirement_definition",
            note="M003 CONTEXT defines the requirement for this scope.",
        ),
        _make_citation(
            path=f"{stub_dir}/m004-validation.md",
            validation_class="Integration",
            problem_kind="coverage_gap_acknowledgment",
            note="M004 VALIDATION requirement coverage audit marks as covered.",
        ),
        _make_citation(
            path=f"{stub_dir}/source.ts",
            validation_class="Contract",
            problem_kind="source_boundary_preservation",
            note="Source file preserves boundary constraints and posture.",
        ),
        _make_citation(
            path=f"{stub_dir}/runtime-health.md",
            validation_class="Integration",
            problem_kind="boundary_documentation",
            note="Runtime health doc documents adapter contract rules.",
        ),
        _make_citation(
            path=f"{stub_dir}/regression-closure.json",
            validation_class="Operational",
            problem_kind="regression_closure_proof",
            note="Regression closure passes all validators confirming posture.",
        ),
        _make_citation(
            path=f"{stub_dir}/validation.md",
            validation_class="UAT",
            problem_kind="coverage_gap_acknowledgment",
            note="VALIDATION requirement coverage audit reconciles disposition.",
        ),
    ]


def _make_requirement_entry(
    requirement_id: str,
    *,
    status: str = "active",
    req_class: str = "constraint",
    disposition: str = "traceability_only_out_of_scope_for_m004",
    origin: str = "m003_owned",
    citations: list | None = None,
    canonical: str = "R003 active constraint: preserves Paperclip as the system of record and prevents BOS Light from owning governance state.",
    summary: str = "M004 does not alter disposition. " * 10,
    runtime_proof_claimed: bool = False,
    live_runtime_capability_promoted: bool = False,
    owner_normalized_to_s08: bool = False,
) -> dict:
    """Return a minimal valid requirement dict."""
    return {
        "requirement_id": requirement_id,
        "status": status,
        "requirement_class": req_class,
        "canonical_requirement_text": canonical,
        "primary_owner_provenance": {
            "origin": origin,
            "existing_primary_owner_text": f"Milestone-owned requirement for {requirement_id}.",
            "owner_normalized_to_s08": owner_normalized_to_s08,
            "owner_reconciliation": f"S08 preserves {requirement_id} and records coverage.",
        },
        "m004_disposition": disposition,
        "m004_coverage_summary": summary,
        "runtime_proof_claimed": runtime_proof_claimed,
        "live_runtime_capability_promoted": live_runtime_capability_promoted,
        "evidence_citations": citations or [],
    }


def _make_posture_assertions() -> dict:
    return {key: True for key in mod.REQUIRED_POSTURE_ASSERTIONS}


def _make_safety() -> dict:
    return {
        "traceability_only": True,
        "r003_r008_preserved_as_active": True,
        "r009_r010_r011_preserved_as_validated": True,
        "no_requirement_ownership_reassigned": True,
        "no_validated_requirements_reopened": True,
        "requirements_broadened": False,
        "success_criteria_broadened": False,
        "runtime_proof_boundary_preserved": True,
        "live_runtime_capability_promoted": False,
        "no_capability_promotions": True,
        "capability_promotions": [],
        "blocker_evidence_promoted": False,
        "network_access_required": False,
        "local_json_only": True,
        "secret_like_values_copied": False,
        "plaintext_credentials_logged": False,
    }


def _build_happy_ledger(stub_dir: str) -> dict:
    """Return a complete, valid ledger JSON dict."""
    return {
        "schema_version": mod.SCHEMA_VERSION,
        "artifact_type": mod.ARTIFACT_TYPE,
        "generated_at": "2026-06-01T00:00:00Z",
        "milestone": "M004-osbua3",
        "slice": "S08",
        "validation_round": 1,
        "source_of_truth": "Test fixture for happy path validation.",
        "inputs": {},
        "reconciliation_scope": {
            "required_requirement_ids": list(mod.REQUIRED_REQUIREMENT_IDS),
            "total_requirements": 5,
            "posture_summary": "Test posture summary.",
        },
        "requirements": [
            _make_requirement_entry(
                "R003",
                status="active",
                req_class="constraint",
                disposition="traceability_only_out_of_scope_for_m004",
                origin="m003_owned",
                citations=_make_citations_for_requirement(stub_dir),
            ),
            _make_requirement_entry(
                "R008",
                status="active",
                req_class="constraint",
                disposition="traceability_only_out_of_scope_for_m004",
                origin="m003_owned",
                citations=_make_citations_for_requirement(stub_dir),
            ),
            _make_requirement_entry(
                "R009",
                status="validated",
                req_class="primary-user-loop",
                disposition="validated_no_reopen_needed",
                origin="m002_m003_validated",
                citations=_make_citations_for_requirement(stub_dir),
                canonical="R009 validated primary-user-loop: extends Eval Gate evidence posture by making gate-driven decisions visible when needed.",
                summary="M004 does not reopen R009. " * 10,
            ),
            _make_requirement_entry(
                "R010",
                status="validated",
                req_class="primary-user-loop",
                disposition="validated_no_reopen_needed",
                origin="m002_m003_validated",
                citations=_make_citations_for_requirement(stub_dir),
                canonical="R010 validated primary-user-loop: extends Circuit Breaker fallback behavior by adding visible decision records.",
                summary="M004 does not reopen R010. " * 10,
            ),
            _make_requirement_entry(
                "R011",
                status="validated",
                req_class="constraint",
                disposition="validated_no_reopen_needed",
                origin="m002_m003_validated",
                citations=_make_citations_for_requirement(stub_dir),
                canonical="R011 validated constraint: defines balanced proof boundaries; supported boundaries remain mandatory.",
                summary="M004 does not reopen R011. " * 10,
            ),
        ],
        "posture_assertions": _make_posture_assertions(),
        "safety": _make_safety(),
    }


# ---------------------------------------------------------------------------
# Fixture-writing helper
# ---------------------------------------------------------------------------

def _write_fixture_ledger(tmpdir: Path, data: dict) -> Path:
    """Write a fixture ledger JSON and create stub citation files."""
    ledger_path = tmpdir / "runtime-evidence" / "ledger.json"
    ledger_path.parent.mkdir(parents=True, exist_ok=True)
    ledger_path.write_text(json.dumps(data, indent=2), encoding="utf-8")

    # Create every citation path referenced in the requirements array
    created: set[str] = set()
    for req in data.get("requirements", []):
        for cit in req.get("evidence_citations", []):
            p = cit.get("path", "")
            if p and p not in created:
                fp = tmpdir / p
                fp.parent.mkdir(parents=True, exist_ok=True)
                if not fp.exists():
                    fp.write_text("stub citation evidence", encoding="utf-8")
                created.add(p)

    return ledger_path


# ---------------------------------------------------------------------------
# Test class
# ---------------------------------------------------------------------------

class TestValidateM004S08RequirementScope(unittest.TestCase):
    """Unit tests for the S08 requirement scope reconciliation validator."""

    def setUp(self) -> None:
        self.tmpdir = Path(tempfile.mkdtemp(prefix="s08-test-"))
        self._orig_root = mod.ROOT

    def tearDown(self) -> None:
        mod.ROOT = self._orig_root
        # Best-effort cleanup
        import shutil
        shutil.rmtree(self.tmpdir, ignore_errors=True)

    def _set_root(self) -> None:
        """Point the validator's ROOT at our temp directory."""
        mod.ROOT = self.tmpdir

    # ------------------------------------------------------------------
    # Happy path: all 5 requirements present, validator passes
    # ------------------------------------------------------------------
    def test_happy_path_all_five_requirements_pass(self) -> None:
        """Validator passes when all 5 requirements are present and well-formed."""
        self._set_root()
        data = _build_happy_ledger(str(Path("stub")))
        ledger_path = _write_fixture_ledger(self.tmpdir, data)

        errors = mod.ErrorCollector()
        mod.validate_ledger(ledger_path, errors)
        self.assertTrue(errors.ok, f"Expected no errors, got: {errors.errors}")

    def test_happy_path_build_audit_passes(self) -> None:
        """build_audit returns passed=True for a valid ledger."""
        self._set_root()
        data = _build_happy_ledger(str(Path("stub")))
        ledger_path = _write_fixture_ledger(self.tmpdir, data)

        errors = mod.ErrorCollector()
        mod.validate_ledger(ledger_path, errors)
        audit = mod.build_audit(ledger_path, self.tmpdir / "audit.json", errors)
        self.assertTrue(audit["passed"])
        self.assertEqual(audit["classification"], "final_ready")

    # ------------------------------------------------------------------
    # Missing requirement
    # ------------------------------------------------------------------
    def test_missing_requirement_detected(self) -> None:
        """Removing one required requirement produces an error."""
        self._set_root()
        data = _build_happy_ledger(str(Path("stub")))
        # Remove R011
        data["requirements"] = [
            r for r in data["requirements"] if r["requirement_id"] != "R011"
        ]
        ledger_path = _write_fixture_ledger(self.tmpdir, data)

        errors = mod.ErrorCollector()
        mod.validate_ledger(ledger_path, errors)
        self.assertFalse(errors.ok)
        missing_msgs = [e for e in errors.errors if "missing required requirements" in e]
        self.assertTrue(missing_msgs, f"Expected missing-requirement error, got: {errors.errors}")
        self.assertIn("R011", missing_msgs[0])

    def test_all_requirements_missing(self) -> None:
        """Empty requirements array produces error listing all five."""
        self._set_root()
        data = _build_happy_ledger(str(Path("stub")))
        data["requirements"] = []
        ledger_path = _write_fixture_ledger(self.tmpdir, data)

        errors = mod.ErrorCollector()
        mod.validate_ledger(ledger_path, errors)
        self.assertFalse(errors.ok)
        missing_msgs = [e for e in errors.errors if "missing required requirements" in e]
        self.assertTrue(missing_msgs)
        for rid in mod.REQUIRED_REQUIREMENTS:
            self.assertIn(rid, missing_msgs[0])

    # ------------------------------------------------------------------
    # Citation file missing
    # ------------------------------------------------------------------
    def test_citation_file_missing_detected(self) -> None:
        """A citation path that does not exist on disk produces an error."""
        self._set_root()
        data = _build_happy_ledger(str(Path("stub")))
        # Inject a citation with a non-existent path
        data["requirements"][0]["evidence_citations"].append(
            _make_citation(
                path="evidence/does-not-exist.md",
                validation_class="UAT",
                problem_kind="uat_readability",
                note="This citation points to a file that does not exist.",
            )
        )
        ledger_path = _write_fixture_ledger(self.tmpdir, data)

        # Write fixture but delete the specific bad file to ensure it's absent
        bad_file = self.tmpdir / "evidence" / "does-not-exist.md"
        if bad_file.exists():
            bad_file.unlink()

        errors = mod.ErrorCollector()
        mod.validate_ledger(ledger_path, errors)
        self.assertFalse(errors.ok)
        path_msgs = [e for e in errors.errors if "does not exist on disk" in e]
        self.assertTrue(path_msgs, f"Expected missing-citation error, got: {errors.errors}")

    # ------------------------------------------------------------------
    # Secret-like value in ledger
    # ------------------------------------------------------------------
    def test_secret_like_value_detected(self) -> None:
        """A secret-like value (e.g. sk- token) in the ledger is flagged."""
        self._set_root()
        data = _build_happy_ledger(str(Path("stub")))
        # Inject a secret-like string into the source_of_truth field
        data["source_of_truth"] = "Some text with sk-ABCDEFghijklmnopqrstuvwx12345678 embedded."
        ledger_path = _write_fixture_ledger(self.tmpdir, data)

        errors = mod.ErrorCollector()
        mod.validate_ledger(ledger_path, errors)
        self.assertFalse(errors.ok)
        secret_msgs = [e for e in errors.errors if "secret-like" in e.lower()]
        self.assertTrue(secret_msgs, f"Expected secret-safety error, got: {errors.errors}")

    def test_secret_like_key_detected(self) -> None:
        """A dict key named 'api_key' with a secret-like value is flagged."""
        self._set_root()
        data = _build_happy_ledger(str(Path("stub")))
        data["extra_metadata"] = {
            "api_key": "AKIA1234567890ABCDEF",
        }
        ledger_path = _write_fixture_ledger(self.tmpdir, data)

        errors = mod.ErrorCollector()
        mod.validate_ledger(ledger_path, errors)
        self.assertFalse(errors.ok)
        secret_msgs = [e for e in errors.errors if "secret-like" in e.lower()]
        self.assertTrue(secret_msgs, f"Expected secret-safety error, got: {errors.errors}")

    def test_redacted_secret_value_allowed(self) -> None:
        """A 'redacted' value in a secret-key field is allowed."""
        self._set_root()
        data = _build_happy_ledger(str(Path("stub")))
        data["extra_metadata"] = {
            "api_key": "<redacted>",
        }
        ledger_path = _write_fixture_ledger(self.tmpdir, data)

        errors = mod.ErrorCollector()
        mod.validate_ledger(ledger_path, errors)
        self.assertTrue(errors.ok, f"Expected no errors, got: {errors.errors}")

    # ------------------------------------------------------------------
    # Runtime-promotion flag false
    # ------------------------------------------------------------------
    def test_runtime_proof_claimed_must_be_false(self) -> None:
        """runtime_proof_claimed=true on a requirement is rejected."""
        self._set_root()
        data = _build_happy_ledger(str(Path("stub")))
        data["requirements"][0]["runtime_proof_claimed"] = True
        ledger_path = _write_fixture_ledger(self.tmpdir, data)

        errors = mod.ErrorCollector()
        mod.validate_ledger(ledger_path, errors)
        self.assertFalse(errors.ok)
        rp_msgs = [e for e in errors.errors if "runtime_proof_claimed" in e]
        self.assertTrue(rp_msgs, f"Expected runtime_proof_claimed error, got: {errors.errors}")

    def test_live_runtime_capability_promoted_must_be_false(self) -> None:
        """live_runtime_capability_promoted=true on a requirement is rejected."""
        self._set_root()
        data = _build_happy_ledger(str(Path("stub")))
        data["requirements"][1]["live_runtime_capability_promoted"] = True
        ledger_path = _write_fixture_ledger(self.tmpdir, data)

        errors = mod.ErrorCollector()
        mod.validate_ledger(ledger_path, errors)
        self.assertFalse(errors.ok)
        lr_msgs = [e for e in errors.errors if "live_runtime_capability_promoted" in e]
        self.assertTrue(lr_msgs, f"Expected live_runtime_capability_promoted error, got: {errors.errors}")

    # ------------------------------------------------------------------
    # Ownership-shift flag false for R003/R008
    # ------------------------------------------------------------------
    def test_owner_normalized_to_s08_must_be_false(self) -> None:
        """owner_normalized_to_s08=true is rejected (no ownership reassignment)."""
        self._set_root()
        data = _build_happy_ledger(str(Path("stub")))
        data["requirements"][0]["primary_owner_provenance"]["owner_normalized_to_s08"] = True
        ledger_path = _write_fixture_ledger(self.tmpdir, data)

        errors = mod.ErrorCollector()
        mod.validate_ledger(ledger_path, errors)
        self.assertFalse(errors.ok)
        own_msgs = [e for e in errors.errors if "owner_normalized_to_s08" in e]
        self.assertTrue(own_msgs, f"Expected ownership error, got: {errors.errors}")

    def test_r003_origin_must_be_m003_owned(self) -> None:
        """R003 with origin != 'm003_owned' is rejected."""
        self._set_root()
        data = _build_happy_ledger(str(Path("stub")))
        data["requirements"][0]["primary_owner_provenance"]["origin"] = "m002_m003_validated"
        ledger_path = _write_fixture_ledger(self.tmpdir, data)

        errors = mod.ErrorCollector()
        mod.validate_ledger(ledger_path, errors)
        self.assertFalse(errors.ok)
        origin_msgs = [e for e in errors.errors if "m003_owned" in e]
        self.assertTrue(origin_msgs, f"Expected origin error for R003, got: {errors.errors}")

    def test_r008_origin_must_be_m003_owned(self) -> None:
        """R008 with origin != 'm003_owned' is rejected."""
        self._set_root()
        data = _build_happy_ledger(str(Path("stub")))
        data["requirements"][1]["primary_owner_provenance"]["origin"] = "m002_m003_validated"
        ledger_path = _write_fixture_ledger(self.tmpdir, data)

        errors = mod.ErrorCollector()
        mod.validate_ledger(ledger_path, errors)
        self.assertFalse(errors.ok)
        origin_msgs = [e for e in errors.errors if "m003_owned" in e]
        self.assertTrue(origin_msgs, f"Expected origin error for R008, got: {errors.errors}")

    def test_r009_origin_must_be_m002_m003_validated(self) -> None:
        """R009 with origin != 'm002_m003_validated' is rejected."""
        self._set_root()
        data = _build_happy_ledger(str(Path("stub")))
        data["requirements"][2]["primary_owner_provenance"]["origin"] = "m003_owned"
        ledger_path = _write_fixture_ledger(self.tmpdir, data)

        errors = mod.ErrorCollector()
        mod.validate_ledger(ledger_path, errors)
        self.assertFalse(errors.ok)
        origin_msgs = [e for e in errors.errors if "m002_m003_validated" in e]
        self.assertTrue(origin_msgs, f"Expected origin error for R009, got: {errors.errors}")

    # ------------------------------------------------------------------
    # Malformed JSON
    # ------------------------------------------------------------------
    def test_malformed_json_detected(self) -> None:
        """A file with invalid JSON is caught and reported."""
        self._set_root()
        ledger_path = self.tmpdir / "runtime-evidence" / "bad.json"
        ledger_path.parent.mkdir(parents=True, exist_ok=True)
        ledger_path.write_text("{not valid json!!!", encoding="utf-8")

        errors = mod.ErrorCollector()
        result = mod.validate_ledger(ledger_path, errors)
        self.assertIsNone(result)
        self.assertFalse(errors.ok)
        json_msgs = [e for e in errors.errors if "malformed JSON" in e]
        self.assertTrue(json_msgs, f"Expected malformed-JSON error, got: {errors.errors}")

    def test_file_not_found_detected(self) -> None:
        """A non-existent ledger path is caught and reported."""
        self._set_root()
        ledger_path = self.tmpdir / "runtime-evidence" / "missing.json"

        errors = mod.ErrorCollector()
        result = mod.validate_ledger(ledger_path, errors)
        self.assertIsNone(result)
        self.assertFalse(errors.ok)
        fnf_msgs = [e for e in errors.errors if "file not found" in e]
        self.assertTrue(fnf_msgs, f"Expected file-not-found error, got: {errors.errors}")

    # ------------------------------------------------------------------
    # Schema version and artifact type
    # ------------------------------------------------------------------
    def test_wrong_schema_version_detected(self) -> None:
        """Wrong schema_version is flagged."""
        self._set_root()
        data = _build_happy_ledger(str(Path("stub")))
        data["schema_version"] = "wrong-version"
        ledger_path = _write_fixture_ledger(self.tmpdir, data)

        errors = mod.ErrorCollector()
        mod.validate_ledger(ledger_path, errors)
        self.assertFalse(errors.ok)
        sv_msgs = [e for e in errors.errors if "schema_version" in e]
        self.assertTrue(sv_msgs, f"Expected schema_version error, got: {errors.errors}")

    def test_wrong_artifact_type_detected(self) -> None:
        """Wrong artifact_type is flagged."""
        self._set_root()
        data = _build_happy_ledger(str(Path("stub")))
        data["artifact_type"] = "wrong-type"
        ledger_path = _write_fixture_ledger(self.tmpdir, data)

        errors = mod.ErrorCollector()
        mod.validate_ledger(ledger_path, errors)
        self.assertFalse(errors.ok)
        at_msgs = [e for e in errors.errors if "artifact_type" in e]
        self.assertTrue(at_msgs, f"Expected artifact_type error, got: {errors.errors}")

    # ------------------------------------------------------------------
    # Posture assertions
    # ------------------------------------------------------------------
    def test_missing_posture_assertion_detected(self) -> None:
        """A missing required posture assertion is flagged."""
        self._set_root()
        data = _build_happy_ledger(str(Path("stub")))
        del data["posture_assertions"]["no_capability_promotions"]
        ledger_path = _write_fixture_ledger(self.tmpdir, data)

        errors = mod.ErrorCollector()
        mod.validate_ledger(ledger_path, errors)
        self.assertFalse(errors.ok)
        pa_msgs = [e for e in errors.errors if "no_capability_promotions" in e]
        self.assertTrue(pa_msgs, f"Expected posture assertion error, got: {errors.errors}")

    def test_false_posture_assertion_detected(self) -> None:
        """A posture assertion set to false instead of true is flagged."""
        self._set_root()
        data = _build_happy_ledger(str(Path("stub")))
        data["posture_assertions"]["no_capability_promotions"] = False
        ledger_path = _write_fixture_ledger(self.tmpdir, data)

        errors = mod.ErrorCollector()
        mod.validate_ledger(ledger_path, errors)
        self.assertFalse(errors.ok)
        pa_msgs = [e for e in errors.errors if "no_capability_promotions" in e and "true" in e]
        self.assertTrue(pa_msgs, f"Expected posture assertion error, got: {errors.errors}")

    # ------------------------------------------------------------------
    # Safety block
    # ------------------------------------------------------------------
    def test_safety_block_missing_field_detected(self) -> None:
        """A missing required safety field is flagged."""
        self._set_root()
        data = _build_happy_ledger(str(Path("stub")))
        del data["safety"]["local_json_only"]
        ledger_path = _write_fixture_ledger(self.tmpdir, data)

        errors = mod.ErrorCollector()
        mod.validate_ledger(ledger_path, errors)
        self.assertFalse(errors.ok)
        sf_msgs = [e for e in errors.errors if "local_json_only" in e]
        self.assertTrue(sf_msgs, f"Expected safety field error, got: {errors.errors}")

    def test_safety_requirement_must_be_false_field_set_true(self) -> None:
        """requirements_broadened must be false; setting it true is flagged."""
        self._set_root()
        data = _build_happy_ledger(str(Path("stub")))
        data["safety"]["requirements_broadened"] = True
        ledger_path = _write_fixture_ledger(self.tmpdir, data)

        errors = mod.ErrorCollector()
        mod.validate_ledger(ledger_path, errors)
        self.assertFalse(errors.ok)
        rb_msgs = [e for e in errors.errors if "requirements_broadened" in e]
        self.assertTrue(rb_msgs, f"Expected safety error, got: {errors.errors}")

    # ------------------------------------------------------------------
    # Validation class coverage
    # ------------------------------------------------------------------
    def test_missing_validation_class_detected(self) -> None:
        """Missing UAT validation class in citations is flagged."""
        self._set_root()
        data = _build_happy_ledger(str(Path("stub")))
        # Remove UAT citations from R003
        r003 = data["requirements"][0]
        r003["evidence_citations"] = [
            c for c in r003["evidence_citations"] if c["validation_class"] != "UAT"
        ]
        # Re-add one non-UAT to keep >= 2 citations
        r003["evidence_citations"].append(
            _make_citation(
                path="stub/extra.md",
                validation_class="Contract",
                problem_kind="requirement_definition",
                note="Extra Contract citation to keep minimum count.",
            )
        )
        ledger_path = _write_fixture_ledger(self.tmpdir, data)

        errors = mod.ErrorCollector()
        mod.validate_ledger(ledger_path, errors)
        self.assertFalse(errors.ok)
        vc_msgs = [e for e in errors.errors if "missing validation classes" in e]
        self.assertTrue(vc_msgs, f"Expected validation class error, got: {errors.errors}")

    # ------------------------------------------------------------------
    # Malformed requirement entries
    # ------------------------------------------------------------------
    def test_missing_requirement_id_detected(self) -> None:
        """A requirement entry without requirement_id is flagged."""
        self._set_root()
        data = _build_happy_ledger(str(Path("stub")))
        data["requirements"][0] = {"status": "active"}  # no requirement_id
        ledger_path = _write_fixture_ledger(self.tmpdir, data)

        errors = mod.ErrorCollector()
        mod.validate_ledger(ledger_path, errors)
        self.assertFalse(errors.ok)
        rid_msgs = [e for e in errors.errors if "requirement_id" in e]
        self.assertTrue(rid_msgs, f"Expected requirement_id error, got: {errors.errors}")

    def test_too_few_citations_detected(self) -> None:
        """Fewer than 2 citations is flagged."""
        self._set_root()
        data = _build_happy_ledger(str(Path("stub")))
        data["requirements"][0]["evidence_citations"] = [
            _make_citation(note="Only one citation.")
        ]
        ledger_path = _write_fixture_ledger(self.tmpdir, data)

        errors = mod.ErrorCollector()
        mod.validate_ledger(ledger_path, errors)
        self.assertFalse(errors.ok)
        cit_msgs = [e for e in errors.errors if "at least 2 entries" in e]
        self.assertTrue(cit_msgs, f"Expected citation count error, got: {errors.errors}")

    def test_short_coverage_summary_detected(self) -> None:
        """A coverage summary shorter than 80 chars is flagged."""
        self._set_root()
        data = _build_happy_ledger(str(Path("stub")))
        data["requirements"][0]["m004_coverage_summary"] = "Too short."
        ledger_path = _write_fixture_ledger(self.tmpdir, data)

        errors = mod.ErrorCollector()
        mod.validate_ledger(ledger_path, errors)
        self.assertFalse(errors.ok)
        sum_msgs = [e for e in errors.errors if "m004_coverage_summary" in e]
        self.assertTrue(sum_msgs, f"Expected summary error, got: {errors.errors}")

    # ------------------------------------------------------------------
    # Extra requirements
    # ------------------------------------------------------------------
    def test_extra_requirement_detected(self) -> None:
        """An unexpected requirement ID is flagged."""
        self._set_root()
        data = _build_happy_ledger(str(Path("stub")))
        data["requirements"].append(
            _make_requirement_entry(
                "R999",
                citations=_make_citations_for_requirement("stub"),
            )
        )
        ledger_path = _write_fixture_ledger(self.tmpdir, data)

        errors = mod.ErrorCollector()
        mod.validate_ledger(ledger_path, errors)
        self.assertFalse(errors.ok)
        extra_msgs = [e for e in errors.errors if "unexpected extra" in e]
        self.assertTrue(extra_msgs, f"Expected extra-requirement error, got: {errors.errors}")

    # ------------------------------------------------------------------
    # ErrorCollector
    # ------------------------------------------------------------------
    def test_error_collector_add_and_ok(self) -> None:
        """ErrorCollector reports ok=True when empty and ok=False after add."""
        ec = mod.ErrorCollector()
        self.assertTrue(ec.ok)
        self.assertEqual(ec.as_dict()["error_count"], 0)

        ec.add("ctx", "something broke")
        self.assertFalse(ec.ok)
        d = ec.as_dict()
        self.assertEqual(d["error_count"], 1)
        self.assertIn("something broke", d["errors"][0])

    # ------------------------------------------------------------------
    # build_audit structure
    # ------------------------------------------------------------------
    def test_build_audit_structure(self) -> None:
        """build_audit returns expected keys and writes audit file."""
        self._set_root()
        data = _build_happy_ledger(str(Path("stub")))
        ledger_path = _write_fixture_ledger(self.tmpdir, data)
        audit_path = self.tmpdir / "audit-out.json"

        errors = mod.ErrorCollector()
        mod.validate_ledger(ledger_path, errors)
        audit = mod.build_audit(ledger_path, audit_path, errors, write_audit=True)

        self.assertIn("schema_version", audit)
        self.assertIn("generated_at", audit)
        self.assertIn("passed", audit)
        self.assertIn("classification", audit)
        self.assertIn("diagnostics", audit)
        self.assertIn("requirements_checked", audit)
        self.assertIn("posture_assertions_checked", audit)
        self.assertTrue(audit_path.exists())
        written = json.loads(audit_path.read_text(encoding="utf-8"))
        self.assertEqual(written["passed"], True)


if __name__ == "__main__":
    unittest.main()
