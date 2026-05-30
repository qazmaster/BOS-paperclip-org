#!/usr/bin/env python3
"""Fixture tests for scripts/run_m002_regression_closure.py."""

from __future__ import annotations

import importlib.util
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

SCRIPT_PATH = Path(__file__).resolve().parent / "run_m002_regression_closure.py"
SPEC = importlib.util.spec_from_file_location("run_m002_regression_closure", SCRIPT_PATH)
assert SPEC is not None and SPEC.loader is not None
runner = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = runner
SPEC.loader.exec_module(runner)


class M002RegressionClosureRunnerTests(unittest.TestCase):
    def make_root(self) -> tempfile.TemporaryDirectory[str]:
        return tempfile.TemporaryDirectory()

    def command(self, command_id: str, code: str):
        return runner.CommandSpec(command_id, f"fixture {command_id}", (sys.executable, "-c", code))

    def test_build_command_plan_uses_explicit_arrays_without_shell_strings(self):
        plan = runner.build_command_plan(python_executable="python3")
        self.assertGreaterEqual(len(plan), 5)
        for spec in plan:
            self.assertIsInstance(spec.command, tuple)
            self.assertGreater(len(spec.command), 0)
            self.assertTrue(all(isinstance(part, str) and part for part in spec.command))
        flattened = [list(spec.command) for spec in plan]
        self.assertIn(["python3", "scripts/validate_runtime_capabilities.py"], flattened)
        self.assertIn(
            [
                "python3",
                "scripts/validate_s10_runtime_execution.py",
                "--phase",
                "final",
                "--write-audit",
                "runtime-evidence/M002-S10-runtime-execution-closeout.json",
            ],
            flattened,
        )
        s11_command = [
            "python3",
            "scripts/validate_m002_validation_artifacts.py",
            "--root",
            ".",
            "--write-audit",
            "runtime-evidence/M002-S11-validation-artifact-repair.json",
        ]
        self.assertIn(s11_command, flattened)
        s12_command = [
            "python3",
            "scripts/validate_s12_runtime_proof_or_rescope.py",
            "--phase",
            "final",
            "--write-audit",
            "runtime-evidence/M002-S12-validation-closeout.json",
        ]
        self.assertIn(s12_command, flattened)
        s13_command = [
            "python3",
            "scripts/validate_s13_requirement_coverage.py",
            "--phase",
            "final",
            "--ledger",
            "runtime-evidence/M002-S13-requirement-coverage.json",
            "--write-audit",
            "runtime-evidence/M002-S13-validation-closeout.json",
        ]
        self.assertIn(s13_command, flattened)
        self.assertIn(["python3", "scripts/validate_m002_closeout.py", "--phase", "final"], flattened)
        self.assertIn(["npm", "--prefix", "plugin-bos-light", "run", "typecheck"], flattened)
        unit_test_command = next(spec.command for spec in plan if spec.id == "python-regression-unittests")
        self.assertIn("scripts/test_validate_s10_runtime_execution.py", unit_test_command)
        self.assertIn("scripts/test_validate_m002_validation_artifacts.py", unit_test_command)
        self.assertIn("scripts/test_validate_s12_runtime_proof_or_rescope.py", unit_test_command)
        self.assertIn("scripts/test_validate_s13_requirement_coverage.py", unit_test_command)
        plan_ids = [spec.id for spec in plan]
        self.assertIn("s11-validation-artifact-repair-validator", plan_ids)
        self.assertIn("s12-runtime-proof-or-rescope-validator", plan_ids)
        self.assertIn("s13-requirement-coverage-final-validator", plan_ids)
        self.assertLess(plan_ids.index("s10-runtime-execution-final-validator"), plan_ids.index("s11-validation-artifact-repair-validator"))
        self.assertLess(plan_ids.index("s11-validation-artifact-repair-validator"), plan_ids.index("s12-runtime-proof-or-rescope-validator"))
        self.assertLess(plan_ids.index("s12-runtime-proof-or-rescope-validator"), plan_ids.index("s13-requirement-coverage-final-validator"))
        self.assertLess(plan_ids.index("s13-requirement-coverage-final-validator"), plan_ids.index("m002-closeout-validator"))
        runner.validate_command_plan(plan, enforce_required_gates=True)

    def test_empty_command_plan_fails_closed(self):
        with self.assertRaisesRegex(ValueError, "command plan is empty"):
            runner.validate_command_plan([])

    def test_malformed_command_plan_entry_fails_closed(self):
        plan = [runner.CommandSpec("bad", "missing command", tuple())]
        with self.assertRaisesRegex(ValueError, "non-empty command array"):
            runner.validate_command_plan(plan)

    def test_shell_style_command_string_fails_closed(self):
        plan = [runner.CommandSpec("bad", "shell string", ("python3 scripts/validate_runtime_capabilities.py",))]
        with self.assertRaisesRegex(ValueError, "shell-style command string"):
            runner.validate_command_plan(plan)

    def test_shell_wrapper_command_fails_closed(self):
        plan = [runner.CommandSpec("bad", "shell wrapper", ("bash", "-lc", "python3 scripts/validate_runtime_capabilities.py"))]
        with self.assertRaisesRegex(ValueError, "shell wrapper"):
            runner.validate_command_plan(plan)

    def test_required_gate_removal_wrong_order_and_audit_path_fail_closed(self):
        plan = runner.build_command_plan(python_executable="python3")
        without_s12 = [spec for spec in plan if spec.id != "s12-runtime-proof-or-rescope-validator"]
        with self.assertRaisesRegex(ValueError, "missing required gates: s12-runtime-proof-or-rescope-validator"):
            runner.validate_command_plan(without_s12, enforce_required_gates=True)

        wrong_order = list(plan)
        s12_index = next(i for i, spec in enumerate(wrong_order) if spec.id == "s12-runtime-proof-or-rescope-validator")
        closeout_index = next(i for i, spec in enumerate(wrong_order) if spec.id == "m002-closeout-validator")
        wrong_order[s12_index], wrong_order[closeout_index] = wrong_order[closeout_index], wrong_order[s12_index]
        with self.assertRaisesRegex(ValueError, "out of order"):
            runner.validate_command_plan(wrong_order, enforce_required_gates=True)

        wrong_audit = [
            runner.CommandSpec(spec.id, spec.description, spec.command)
            for spec in plan
        ]
        index = next(i for i, spec in enumerate(wrong_audit) if spec.id == "s12-runtime-proof-or-rescope-validator")
        wrong_audit[index] = runner.CommandSpec(
            "s12-runtime-proof-or-rescope-validator",
            "wrong audit",
            ("python3", "scripts/validate_s12_runtime_proof_or_rescope.py", "--phase", "final"),
        )
        with self.assertRaisesRegex(ValueError, "required write-audit path"):
            runner.validate_command_plan(wrong_audit, enforce_required_gates=True)

    def test_s13_gate_removal_order_and_audit_path_fail_closed(self):
        plan = runner.build_command_plan(python_executable="python3")
        without_s13 = [spec for spec in plan if spec.id != "s13-requirement-coverage-final-validator"]
        with self.assertRaisesRegex(ValueError, "missing required gates: s13-requirement-coverage-final-validator"):
            runner.validate_command_plan(without_s13, enforce_required_gates=True)

        s13_before_s12 = list(plan)
        s12_index = next(i for i, spec in enumerate(s13_before_s12) if spec.id == "s12-runtime-proof-or-rescope-validator")
        s13_index = next(i for i, spec in enumerate(s13_before_s12) if spec.id == "s13-requirement-coverage-final-validator")
        s13_before_s12[s12_index], s13_before_s12[s13_index] = s13_before_s12[s13_index], s13_before_s12[s12_index]
        with self.assertRaisesRegex(ValueError, "out of order"):
            runner.validate_command_plan(s13_before_s12, enforce_required_gates=True)

        s13_after_closeout = list(plan)
        s13_index = next(i for i, spec in enumerate(s13_after_closeout) if spec.id == "s13-requirement-coverage-final-validator")
        closeout_index = next(i for i, spec in enumerate(s13_after_closeout) if spec.id == "m002-closeout-validator")
        s13_after_closeout[s13_index], s13_after_closeout[closeout_index] = s13_after_closeout[closeout_index], s13_after_closeout[s13_index]
        with self.assertRaisesRegex(ValueError, "out of order"):
            runner.validate_command_plan(s13_after_closeout, enforce_required_gates=True)

        wrong_audit = [runner.CommandSpec(spec.id, spec.description, spec.command) for spec in plan]
        index = next(i for i, spec in enumerate(wrong_audit) if spec.id == "s13-requirement-coverage-final-validator")
        wrong_audit[index] = runner.CommandSpec(
            "s13-requirement-coverage-final-validator",
            "wrong audit",
            (
                "python3",
                "scripts/validate_s13_requirement_coverage.py",
                "--phase",
                "final",
                "--ledger",
                "runtime-evidence/M002-S13-requirement-coverage.json",
            ),
        )
        with self.assertRaisesRegex(ValueError, "S13 validation command"):
            runner.validate_command_plan(wrong_audit, enforce_required_gates=True)

    def test_redaction_preserves_key_name_without_secret_value(self):
        secret = "sk-abcdefghijklmnopqrstuvwxyz123456"
        assignment = "OPENAI_API_KEY=abcdefghijklmnopqrstuvwxyz1234567890"
        redacted, labels = runner.redact_text(f"token {secret}\n{assignment}\nAuthorization: Bearer abcdefghijklmnopqrstuvwxyz123456")
        self.assertNotIn(secret, redacted)
        self.assertNotIn("abcdefghijklmnopqrstuvwxyz1234567890", redacted)
        self.assertIn("OPENAI_API_KEY=", redacted)
        self.assertIn("<redacted>", redacted)
        self.assertIn("openai-style-api-key", labels)
        self.assertIn("inline-secret-assignment", labels)
        self.assertIn("authorization-bearer-token", labels)

    def test_run_closure_writes_schema_and_pass_verdict(self):
        with self.make_root() as tmp:
            root = Path(tmp)
            (root / "runtime-evidence").mkdir()
            evidence = runner.run_closure(
                root=root,
                plan=[self.command("ok", "print('ok')")],
                timeout_seconds=10,
            )
            artifact = root / runner.DEFAULT_ARTIFACT_PATH
            self.assertTrue(artifact.exists())
            loaded = json.loads(artifact.read_text(encoding="utf-8"))
            self.assertEqual(evidence, loaded)
            self.assertEqual("regression-closure-evidence", loaded["artifact_type"])
            self.assertEqual("1.0", loaded["schema_version"])
            self.assertEqual("M002", loaded["milestone"])
            self.assertEqual("S06", loaded["slice"])
            self.assertEqual("aggregate", loaded["mode"])
            self.assertEqual("pass", loaded["overall_verdict"])
            self.assertEqual(1, len(loaded["commands"]))
            command = loaded["commands"][0]
            for key in ("command", "exit_code", "duration_ms", "verdict", "stdout_digest", "stderr_digest", "started_at", "completed_at"):
                self.assertIn(key, command)
            self.assertEqual(0, command["exit_code"])
            self.assertEqual("pass", command["verdict"])

    def test_nonzero_exit_is_recorded_and_aggregate_continues(self):
        with self.make_root() as tmp:
            root = Path(tmp)
            (root / "runtime-evidence").mkdir()
            evidence = runner.run_closure(
                root=root,
                plan=[
                    self.command("fail", "import sys; print('bad'); sys.exit(7)"),
                    self.command("after", "print('after')"),
                ],
                timeout_seconds=10,
            )
            self.assertEqual("fail", evidence["overall_verdict"])
            self.assertEqual(2, len(evidence["commands"]))
            self.assertEqual(7, evidence["commands"][0]["exit_code"])
            self.assertEqual("fail", evidence["commands"][0]["verdict"])
            self.assertEqual("pass", evidence["commands"][1]["verdict"])

    def test_run_command_disables_shell_expansion(self):
        class Completed:
            returncode = 0
            stdout = "ok"
            stderr = ""

        captured = {}

        def fake_run(command, **kwargs):
            captured["command"] = command
            captured["shell"] = kwargs.get("shell")
            return Completed()

        with mock.patch.object(runner.subprocess, "run", fake_run):
            result = runner.run_command(self.command("ok", "print('ok')"), cwd=Path.cwd(), timeout_seconds=10)

        self.assertEqual("pass", result.verdict)
        self.assertIs(captured["shell"], False)
        self.assertIsInstance(captured["command"], list)

    def test_fail_fast_stops_after_first_failure(self):
        with self.make_root() as tmp:
            root = Path(tmp)
            (root / "runtime-evidence").mkdir()
            evidence = runner.run_closure(
                root=root,
                plan=[
                    self.command("fail", "import sys; sys.exit(3)"),
                    self.command("after", "raise SystemExit(0)"),
                ],
                timeout_seconds=10,
                fail_fast=True,
            )
            self.assertEqual("fail-fast", evidence["mode"])
            self.assertEqual("fail", evidence["overall_verdict"])
            self.assertEqual(["fail"], [command["id"] for command in evidence["commands"]])

    def test_secret_looking_stdout_is_redacted_before_artifact_write(self):
        secret = "sk-abcdefghijklmnopqrstuvwxyz123456"
        with self.make_root() as tmp:
            root = Path(tmp)
            (root / "runtime-evidence").mkdir()
            runner.run_closure(
                root=root,
                plan=[self.command("secret", f"print({secret!r})")],
                timeout_seconds=10,
            )
            text = (root / runner.DEFAULT_ARTIFACT_PATH).read_text(encoding="utf-8")
            self.assertNotIn(secret, text)
            loaded = json.loads(text)
            self.assertIn("openai-style-api-key", loaded["commands"][0]["redaction_labels"])

    def test_missing_artifact_parent_fails_without_creating_directory(self):
        with self.make_root() as tmp:
            root = Path(tmp)
            with self.assertRaises(FileNotFoundError):
                runner.run_closure(root=root, plan=[self.command("ok", "print('ok')")], timeout_seconds=10)
            self.assertFalse((root / "runtime-evidence").exists())

    def test_output_path_must_stay_inside_repo(self):
        with self.make_root() as tmp:
            root = Path(tmp).resolve()
            (root / "runtime-evidence").mkdir()
            outside = root.parent / f"outside-{os.getpid()}.json"
            try:
                with self.assertRaisesRegex(ValueError, "inside repository root"):
                    runner.run_closure(root=root, output_path=outside, plan=[self.command("ok", "print('ok')")], timeout_seconds=10)
            finally:
                if outside.exists():
                    outside.unlink()
    def test_relative_output_path_cannot_escape_repo(self):
        with self.make_root() as tmp:
            root = Path(tmp).resolve()
            (root / "runtime-evidence").mkdir()
            with self.assertRaisesRegex(ValueError, "inside repository root"):
                runner.run_closure(root=root, output_path=Path("../escape.json"), plan=[self.command("ok", "print('ok')")], timeout_seconds=10)


if __name__ == "__main__":
    unittest.main(verbosity=2)
