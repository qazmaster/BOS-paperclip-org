#!/usr/bin/env python3
"""Validate the A1-A10 baseline demo runbook and doc references.

This validator is intentionally standard-library only. It checks that the S06
runbook keeps the integrated demo command, A1-A10 evidence map, fixture proof
boundary, and live runtime gap ledger visible to future agents.
"""

from __future__ import annotations

import argparse
import re
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Mapping, Sequence

ROOT = Path(__file__).resolve().parents[1]
DEMO_DOC = Path("docs/10_A1_A10_DEMO.md")
ACCEPTANCE_DOC = Path("docs/06_ACCEPTANCE_TESTS.md")
RUNTIME_HEALTH_DOC = Path("docs/08_RUNTIME_CAPABILITY_HEALTH.md")
BACKLOG_DOC = Path("docs/09_BACKLOG.md")
RUNNER = Path("scripts/run_a1_a10_demo.py")

RUNNER_COMMAND = "python3 scripts/run_a1_a10_demo.py"

REQUIRED_DEMO_HEADINGS = (
    "Purpose and Proof Boundary",
    "Reproduce the Baseline",
    "Evidence Sources",
    "A1-A10 Evidence Map",
    "Expected Fixture Output",
    "Live Runtime Smoke Instructions",
    "Live Runtime Gap Ledger",
    "Failure Modes",
    "Load Profile",
    "Negative Tests",
    "Observability and Diagnostics",
)

A_STEP_LABELS = {
    "A1": "Company template validator",
    "A2": "Runtime capability posture",
    "A3": "Product Blueprint artifact flow",
    "A4": "Betting Table cycle",
    "A5": "Approval request",
    "A6": "Eval Gate pass evidence",
    "A7": "Eval Gate warning/failure visibility",
    "A8": "Circuit Breaker open evidence",
    "A9": "Circuit Breaker half-open evidence",
    "A10": "Circuit Breaker recovery evidence",
}

REQUIRED_DEMO_PHRASES = (
    "Fixture proof boundary",
    "native_support_confirmed: false",
    "runtime_capability_posture",
    "gap_ledger",
    "plugin-bos-light/capabilities.paperclip-runtime.json",
    "scripts/demo-seed-issues.json",
    "plugin-bos-light/src/integratedDemo.ts",
    "plugin-bos-light/tests/integratedDemo.test.ts",
)

REQUIRED_REFERENCE_PHRASES = {
    ACCEPTANCE_DOC: (RUNNER_COMMAND, "A1-A10 baseline", "fixture proof boundary", "gap ledger"),
    RUNTIME_HEALTH_DOC: (RUNNER_COMMAND, "docs/10_A1_A10_DEMO.md", "runtime_capability_posture", "gap_ledger"),
    BACKLOG_DOC: (RUNNER_COMMAND, "docs/10_A1_A10_DEMO.md", "live Paperclip runtime", "A1-A10"),
}


@dataclass
class DocBundle:
    demo: str
    acceptance: str
    runtime_health: str
    backlog: str
    runner: str


class ValidationErrors:
    def __init__(self) -> None:
        self.errors: list[str] = []

    def add(self, path: Path | str, context: str, message: str) -> None:
        self.errors.append(f"{path}: {context}: {message}")

    def extend(self, failures: Sequence[str]) -> None:
        self.errors.extend(failures)


def _display_path(root: Path, path: Path) -> Path:
    try:
        return path.resolve().relative_to(root.resolve())
    except ValueError:
        return path


def _read_required(root: Path, relative_path: Path, errors: ValidationErrors) -> str:
    absolute_path = root / relative_path
    display_path = _display_path(root, absolute_path)
    if not absolute_path.exists():
        errors.add(display_path, "file", "missing required file")
        return ""
    try:
        return absolute_path.read_text(encoding="utf-8")
    except OSError as exc:
        errors.add(display_path, "file", f"unable to read file: {exc.strerror or exc}")
        return ""


def load_bundle(root: Path, errors: ValidationErrors) -> DocBundle:
    return DocBundle(
        demo=_read_required(root, DEMO_DOC, errors),
        acceptance=_read_required(root, ACCEPTANCE_DOC, errors),
        runtime_health=_read_required(root, RUNTIME_HEALTH_DOC, errors),
        backlog=_read_required(root, BACKLOG_DOC, errors),
        runner=_read_required(root, RUNNER, errors),
    )


def _has_heading(markdown: str, heading: str) -> bool:
    return bool(re.search(rf"^##\s+{re.escape(heading)}\s*$", markdown, re.MULTILINE))


def _has_table_step(markdown: str, step: str, label: str) -> bool:
    return bool(re.search(rf"^\|\s*{re.escape(step)}\s*\|[^\n]*{re.escape(label)}", markdown, re.MULTILINE))


def _contains_case_insensitive(text: str, phrase: str) -> bool:
    return phrase.lower() in text.lower()


def validate_bundle(bundle: DocBundle) -> list[str]:
    errors = ValidationErrors()

    for heading in REQUIRED_DEMO_HEADINGS:
        if not _has_heading(bundle.demo, heading):
            errors.add(DEMO_DOC, "heading", f"missing required section '## {heading}'")

    if RUNNER_COMMAND not in bundle.demo:
        errors.add(DEMO_DOC, "command", f"missing runner command reference '{RUNNER_COMMAND}'")

    for phrase in REQUIRED_DEMO_PHRASES:
        if phrase not in bundle.demo:
            errors.add(DEMO_DOC, "proof-boundary", f"missing required phrase '{phrase}'")

    for step, label in A_STEP_LABELS.items():
        if not _has_table_step(bundle.demo, step, label):
            errors.add(DEMO_DOC, "A1-A10 Evidence Map", f"missing row for {step} with label '{label}'")

    for step in A_STEP_LABELS:
        phase_ref = f"phases.{step}"
        if phase_ref not in bundle.demo:
            errors.add(DEMO_DOC, "Expected Fixture Output", f"missing expected output reference '{phase_ref}'")

    if "--runtime-evidence" not in bundle.demo:
        errors.add(DEMO_DOC, "live runtime smoke", "missing optional --runtime-evidence instructions")

    for path, phrases in REQUIRED_REFERENCE_PHRASES.items():
        text = {
            ACCEPTANCE_DOC: bundle.acceptance,
            RUNTIME_HEALTH_DOC: bundle.runtime_health,
            BACKLOG_DOC: bundle.backlog,
        }[path]
        for phrase in phrases:
            if not _contains_case_insensitive(text, phrase):
                errors.add(path, "cross-reference", f"missing required phrase '{phrase}'")

    if "A_PHASE_LABELS" not in bundle.runner or RUNNER_COMMAND.split()[-1] not in str(RUNNER):
        errors.add(RUNNER, "runner", "runner script no longer exposes the expected A-phase labels")

    return errors.errors


def validate_root(root: Path) -> list[str]:
    errors = ValidationErrors()
    bundle = load_bundle(root.resolve(), errors)
    errors.extend(validate_bundle(bundle))
    return errors.errors


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Validate A1-A10 baseline demo documentation.")
    parser.add_argument("--root", type=Path, default=ROOT, help="Repository root (default: parent of scripts/).")
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    failures = validate_root(args.root)
    if failures:
        for failure in failures:
            print(f"A1-A10 demo docs validation failed: {failure}", file=sys.stderr)
        return 1
    print("A1-A10 demo docs OK: runbook, references, A-step map, proof boundary, and gap ledger are present.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
