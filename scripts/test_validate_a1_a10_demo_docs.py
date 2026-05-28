#!/usr/bin/env python3
"""Negative coverage for scripts/validate_a1_a10_demo_docs.py."""

from __future__ import annotations

import importlib.util
import sys
import unittest
from pathlib import Path

SCRIPT_PATH = Path(__file__).resolve().parent / "validate_a1_a10_demo_docs.py"
SPEC = importlib.util.spec_from_file_location("validate_a1_a10_demo_docs", SCRIPT_PATH)
assert SPEC is not None and SPEC.loader is not None
validator = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = validator
SPEC.loader.exec_module(validator)


VALID_DEMO = """# 10 - A1-A10 Baseline Demo Runbook and Gap Ledger

## Purpose and Proof Boundary
Fixture proof boundary: adapter-seam evidence only. `native_support_confirmed: false` keeps live support unconfirmed. `plugin-bos-light/capabilities.paperclip-runtime.json` remains source of truth.

## Reproduce the Baseline
Run `python3 scripts/run_a1_a10_demo.py` or `python3 scripts/run_a1_a10_demo.py --runtime-evidence /tmp/paperclip`.

## Evidence Sources
Uses `scripts/demo-seed-issues.json`, `plugin-bos-light/src/integratedDemo.ts`, and `plugin-bos-light/tests/integratedDemo.test.ts`.

## A1-A10 Evidence Map
| Step | Runner phase label | Notes |
|---|---|---|
| A1 | Company template validator | phases.A1 |
| A2 | Runtime capability posture | phases.A2 |
| A3 | Product Blueprint artifact flow | phases.A3 |
| A4 | Betting Table cycle | phases.A4 |
| A5 | Approval request | phases.A5 |
| A6 | Eval Gate pass evidence | phases.A6 |
| A7 | Eval Gate warning/failure visibility | phases.A7 |
| A8 | Circuit Breaker open evidence | phases.A8 |
| A9 | Circuit Breaker half-open evidence | phases.A9 |
| A10 | Circuit Breaker recovery evidence | phases.A10 |

## Expected Fixture Output
The JSON includes `runtime_capability_posture`, `gap_ledger`, phases.A1, phases.A2, phases.A3, phases.A4, phases.A5, phases.A6, phases.A7, phases.A8, phases.A9, and phases.A10.

## Live Runtime Smoke Instructions
Run the command with `--runtime-evidence` only for bounded local inspection.

## Live Runtime Gap Ledger
Gap ledger headings stay explicit.

## Failure Modes
Subprocess and filesystem failures bubble as validation errors.

## Load Profile
Bounded local CLI.

## Negative Tests
Negative tests mutate this bundle.

## Observability and Diagnostics
Inspect commands and failures.
"""

VALID_ACCEPTANCE = """# 06
S06 A1-A10 baseline references `python3 scripts/run_a1_a10_demo.py`, preserves the fixture proof boundary, and records the gap ledger.
"""

VALID_RUNTIME = """# 08
See docs/10_A1_A10_DEMO.md. The `python3 scripts/run_a1_a10_demo.py` output contains runtime_capability_posture and gap_ledger.
"""

VALID_BACKLOG = """# 09
A1-A10 follow-up: use docs/10_A1_A10_DEMO.md and `python3 scripts/run_a1_a10_demo.py` before promoting live Paperclip runtime claims.
"""

VALID_RUNNER = """A_PHASE_LABELS = {'A1': 'Company template validator'}\n"""


def bundle(**overrides):
    values = {
        "demo": VALID_DEMO,
        "acceptance": VALID_ACCEPTANCE,
        "runtime_health": VALID_RUNTIME,
        "backlog": VALID_BACKLOG,
        "runner": VALID_RUNNER,
    }
    values.update(overrides)
    return validator.DocBundle(**values)


class ValidateA1A10DemoDocsTests(unittest.TestCase):
    def test_valid_minimal_bundle_passes(self):
        self.assertEqual([], validator.validate_bundle(bundle()))

    def test_missing_a_step_entry_is_rejected(self):
        broken = VALID_DEMO.replace("| A7 | Eval Gate warning/failure visibility | phases.A7 |\n", "")
        failures = validator.validate_bundle(bundle(demo=broken))
        self.assertTrue(any("missing row for A7" in failure for failure in failures))

    def test_missing_fixture_boundary_is_rejected(self):
        broken = VALID_DEMO.replace("Fixture proof boundary", "Fixture seam note")
        failures = validator.validate_bundle(bundle(demo=broken))
        self.assertTrue(any("Fixture proof boundary" in failure for failure in failures))

    def test_missing_gap_ledger_heading_is_rejected(self):
        broken = VALID_DEMO.replace("## Live Runtime Gap Ledger", "## Runtime Follow Ups")
        failures = validator.validate_bundle(bundle(demo=broken))
        self.assertTrue(any("Live Runtime Gap Ledger" in failure for failure in failures))

    def test_missing_runner_command_is_rejected(self):
        broken_demo = VALID_DEMO.replace("python3 scripts/run_a1_a10_demo.py", "python3 scripts/old_demo.py")
        broken_acceptance = VALID_ACCEPTANCE.replace("python3 scripts/run_a1_a10_demo.py", "python3 scripts/old_demo.py")
        failures = validator.validate_bundle(bundle(demo=broken_demo, acceptance=broken_acceptance))
        self.assertTrue(any("run_a1_a10_demo.py" in failure for failure in failures))


if __name__ == "__main__":
    unittest.main()
