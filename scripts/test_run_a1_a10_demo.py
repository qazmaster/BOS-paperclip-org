#!/usr/bin/env python3
"""Unit coverage for scripts/run_a1_a10_demo.py."""

from __future__ import annotations

import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path
from typing import Any, Sequence

SCRIPT_PATH = Path(__file__).resolve().parent / "run_a1_a10_demo.py"
SPEC = importlib.util.spec_from_file_location("run_a1_a10_demo", SCRIPT_PATH)
assert SPEC is not None and SPEC.loader is not None
runner_module = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = runner_module
SPEC.loader.exec_module(runner_module)


FIXTURE_SEED = [
    {
        "title": "Create onboarding page for BOS Light demo",
        "expected_value": 0.8,
        "urgency": 0.7,
        "estimated_token_cost": 12000,
        "risk_factor": 1.1,
    }
]


DEMO_REPORT = {
    "schema_version": "1.0",
    "demo_id": "fixture_demo",
    "generated_at": "2026-02-01T00:00:00.000Z",
    "seed_issue_count": 1,
    "runtime_capability_posture": {
        "source": "fixture-adapter",
        "native_support_confirmed": False,
        "surfaces": {
            "documents_native": "fixture-exercised-unproven",
            "comments_native": "fixture-exercised-unproven",
            "approvals_native": "fixture-exercised-unproven",
            "issues_native": "fixture-exercised-unproven",
            "cache_overlay": "in-memory-not-durable",
        },
        "boundary_rules": [],
    },
    "runtime_gap_ledger": [
        {
            "surface": "runtime.native_support",
            "posture": "fixture-only",
            "reason": "Fixture adapter success is not live Paperclip runtime proof.",
            "artifact_ref": None,
        }
    ],
    "A3": {
        "phase": "Product Blueprint artifact flow",
        "timestamp": "2026-02-01T00:00:00.000Z",
        "selected_surfaces": {"issue_1": "documents.native"},
        "artifact_refs": {"issue_1": "paperclip://issues/issue_1/documents/doc_1"},
        "cache_overlay": {},
        "fallback": {},
    },
    "A4": {
        "phase": "Betting Table cycle",
        "timestamp": "2026-02-01T00:00:00.000Z",
        "selected_surface": "cache-overlay",
        "selected_issue_ids": ["issue_1"],
        "blueprint_ids": {"issue_1": "blueprint_issue_1"},
        "fallback": {"reason": None},
    },
    "A5": {
        "phase": "Approval request",
        "timestamp": "2026-02-01T00:00:00.000Z",
        "selected_surface": "approvals.native",
        "artifact_ref": "paperclip://approvals/approval_1",
        "cache_overlay": {},
        "fallback": {"reason": None},
        "native_support_confirmed": False,
    },
    "A6": {
        "phase": "Eval Gate pass evidence",
        "timestamp": "2026-02-01T00:00:00.000Z",
        "selected_surface": "comments.native",
        "artifact_ref": "paperclip://comments/pass",
        "cache_overlay": {},
        "fallback": {"reason": None},
    },
    "A7": {
        "phase": "Eval Gate warning/failure visibility",
        "timestamp": "2026-02-01T00:00:00.000Z",
        "selected_surface": "comments.native",
        "artifact_ref": "paperclip://comments/fail",
        "cache_overlay": {},
        "fallback": {"reason": None},
    },
    "A8": {
        "phase": "Circuit Breaker open evidence",
        "timestamp": "2026-02-01T00:00:00.000Z",
        "selected_surface": "issues.native",
        "artifact_ref": "paperclip://issues/escalation_1",
        "cache_overlay": {},
        "fallback": {"reason": None},
    },
    "A9": {
        "phase": "Circuit Breaker half-open evidence",
        "timestamp": "2026-02-01T00:00:00.000Z",
        "selected_surface": "activity.logging",
        "artifact_ref": "paperclip://activity/half_open",
        "cache_overlay": {},
        "fallback": {"reason": None},
    },
    "A10": {
        "phase": "Circuit Breaker recovery evidence",
        "timestamp": "2026-02-01T00:00:00.000Z",
        "selected_surface": "activity.logging",
        "artifact_ref": "paperclip://activity/recovered",
        "cache_overlay": {},
        "fallback": {"reason": None},
    },
}


PROBE_REPORT = {
    "schema_version": "0.1",
    "probe": "paperclip-runtime-health",
    "posture": {
        "status": "honest-unvalidated",
        "exit_code": 0,
        "reason": "Absence or malformation of runtime evidence is reported as health posture.",
        "external_processes_spawned": 0,
    },
    "paperclip": {
        "provided": False,
        "availability": "not-provided",
        "status": "unvalidated",
        "malformed_evidence": [],
    },
    "capabilities": [],
}


class FakeRunner:
    def __init__(self, overrides: dict[str, dict[str, Any]] | None = None):
        self.overrides = overrides or {}
        self.calls: list[list[str]] = []
        self.labels: list[str] = []

    def __call__(self, command: Sequence[str], _timeout_seconds: int, _cwd: Path):
        command_list = list(command)
        self.calls.append(command_list)
        label = self._label_for(command_list)
        self.labels.append(label)
        if label in self.overrides:
            return self.overrides[label]
        if label == "paperclip-runtime-probe":
            return {"exit_code": 0, "stdout": json.dumps(PROBE_REPORT), "stderr": "", "duration_ms": 5}
        if label == "integrated-demo-report":
            return {"exit_code": 0, "stdout": json.dumps(DEMO_REPORT), "stderr": "", "duration_ms": 5}
        return {"exit_code": 0, "stdout": f"{label} ok", "stderr": "", "duration_ms": 5}

    @staticmethod
    def _label_for(command: list[str]) -> str:
        joined = " ".join(command)
        if "validate_company_template.py" in joined:
            return "company-template-validator"
        if "validate_runtime_capabilities.py" in joined:
            return "runtime-capability-validator"
        if "probe_paperclip_runtime.py" in joined:
            return "paperclip-runtime-probe"
        if "vite-node" in joined:
            return "integrated-demo-report"
        if command[:1] == ["npm"]:
            return "integrated-demo-vitest"
        return "unknown"


class RunA1A10DemoTests(unittest.TestCase):
    def with_seed_root(self, callback):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "scripts").mkdir()
            (root / "scripts" / "demo-seed-issues.json").write_text(json.dumps(FIXTURE_SEED), encoding="utf-8")
            return callback(root)

    def test_success_report_shape_and_command_assembly(self):
        def run(root: Path):
            fake = FakeRunner()
            report = runner_module.build_report(
                root=root,
                runner=fake,
                now="2026-02-01T00:00:00.000Z",
            )
            return report, fake

        report, fake = self.with_seed_root(run)
        self.assertEqual("passed", report["status"])
        self.assertEqual(
            [
                "company-template-validator",
                "runtime-capability-validator",
                "paperclip-runtime-probe",
                "integrated-demo-report",
                "integrated-demo-vitest",
            ],
            fake.labels,
        )
        self.assertEqual("passed", report["phases"]["A1"]["status"])
        self.assertEqual("passed", report["phases"]["A10"]["status"])
        self.assertEqual("documents.native", report["phases"]["A3"]["selected_surfaces"]["issue_1"])
        self.assertFalse(report["runtime_capability_posture"]["native_support_confirmed"])
        self.assertEqual("not-provided", report["runtime_capability_posture"]["paperclip_path"]["availability"])
        self.assertTrue(any(item["surface"] == "runtime.evidence_path" for item in report["gap_ledger"]))
        vitest_command = fake.calls[-1]
        self.assertEqual(["npm", "--prefix"], vitest_command[:2])
        self.assertEqual("integratedDemo.test.ts", vitest_command[-1])

    def test_nonzero_command_records_phase_exit_code_and_bounded_digest(self):
        long_stdout = "x" * 2000
        def run(root: Path):
            fake = FakeRunner(
                {
                    "runtime-capability-validator": {
                        "exit_code": 17,
                        "stdout": long_stdout,
                        "stderr": "matrix failed SECRET_TOKEN=should-redact",
                        "duration_ms": 9,
                    }
                }
            )
            return runner_module.build_report(root=root, runner=fake, now="2026-02-01T00:00:00.000Z")

        report = self.with_seed_root(run)
        self.assertEqual("failed", report["status"])
        failure = next(item for item in report["failures"] if item["label"] == "runtime-capability-validator")
        self.assertEqual("A2", failure["phase"])
        self.assertEqual(17, failure["exit_code"])
        self.assertLessEqual(len(failure["stdout_digest"]), runner_module.OUTPUT_DIGEST_CHARS + 32)
        self.assertIn("<redacted>", failure["stderr_digest"])

    def test_timeout_records_timeout_diagnostics_and_fails_demo(self):
        def run(root: Path):
            fake = FakeRunner(
                {
                    "integrated-demo-vitest": {
                        "exit_code": None,
                        "stdout": "partial output",
                        "stderr": "still running",
                        "timed_out": True,
                        "duration_ms": 120000,
                    }
                }
            )
            return runner_module.build_report(root=root, runner=fake, now="2026-02-01T00:00:00.000Z")

        report = self.with_seed_root(run)
        self.assertEqual("failed", report["status"])
        failure = next(item for item in report["failures"] if item["label"] == "integrated-demo-vitest")
        self.assertEqual("timeout", failure["status"])
        self.assertIsNone(failure["exit_code"])
        self.assertEqual("A3-A10", failure["phase"])

    def test_missing_seed_file_fails_before_subprocesses(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            fake = FakeRunner()
            report = runner_module.build_report(root=root, runner=fake, now="2026-02-01T00:00:00.000Z")
        self.assertEqual("failed", report["status"])
        self.assertEqual("missing", report["seed"]["status"])
        self.assertEqual([], fake.calls)
        self.assertEqual("skipped", report["phases"]["A3"]["status"])

    def test_malformed_seed_json_fails_before_partial_demo_output(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "scripts").mkdir()
            (root / "scripts" / "demo-seed-issues.json").write_text('{ "title": ', encoding="utf-8")
            fake = FakeRunner()
            report = runner_module.build_report(root=root, runner=fake, now="2026-02-01T00:00:00.000Z")
        self.assertEqual("failed", report["status"])
        self.assertEqual("malformed", report["seed"]["status"])
        self.assertIn("malformed JSON", report["seed"]["error"])
        self.assertEqual([], fake.calls)

    def test_optional_runtime_path_missing_or_malformed_stays_unvalidated_with_gap(self):
        def missing_run(root: Path):
            fake = FakeRunner()
            return runner_module.build_report(
                root=root,
                runtime_evidence_path=root / "missing-paperclip",
                runner=fake,
                now="2026-02-01T00:00:00.000Z",
            )

        missing_report = self.with_seed_root(missing_run)
        self.assertEqual("passed", missing_report["status"])
        self.assertEqual("fixture-plus-local-runtime-evidence", missing_report["mode"])
        self.assertTrue(any("does not exist" in item["reason"] for item in missing_report["gap_ledger"]))
        self.assertFalse(missing_report["runtime_capability_posture"]["native_support_confirmed"])

        def malformed_run(root: Path):
            runtime_file = root / "not-a-directory.json"
            runtime_file.write_text("{}", encoding="utf-8")
            probe = dict(PROBE_REPORT)
            probe["paperclip"] = {
                "provided": True,
                "path": str(runtime_file),
                "availability": "not-a-directory",
                "status": "unvalidated",
                "malformed_evidence": [f"{runtime_file}: not a directory"],
            }
            fake = FakeRunner({"paperclip-runtime-probe": {"exit_code": 0, "stdout": json.dumps(probe), "stderr": "", "duration_ms": 5}})
            return runner_module.build_report(
                root=root,
                runtime_evidence_path=runtime_file,
                runner=fake,
                now="2026-02-01T00:00:00.000Z",
            )

        malformed_report = self.with_seed_root(malformed_run)
        self.assertEqual("passed", malformed_report["status"])
        self.assertEqual("not-a-directory", malformed_report["runtime_capability_posture"]["paperclip_path"]["availability"])
        self.assertTrue(any("not a directory" in item["reason"] for item in malformed_report["gap_ledger"]))


if __name__ == "__main__":
    unittest.main(verbosity=2)
