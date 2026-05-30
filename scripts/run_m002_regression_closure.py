#!/usr/bin/env python3
"""Run the M002/S06 regression closure gates and write JSON evidence.

The runner is intentionally standard-library only and uses subprocess command
arrays with shell expansion disabled. It is conservative: every child command is
recorded with a redacted digest, and the top-level verdict fails if any gate
fails, times out, or if the evidence artifact cannot be written safely.
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Iterable, Sequence

DEFAULT_ARTIFACT_PATH = Path("runtime-evidence/M002-S06-regression-closure.json")
DEFAULT_TIMEOUT_SECONDS = 300
DIGEST_LIMIT_CHARS = 4000
REQUIRED_DEFAULT_COMMAND_IDS = (
    "s04-live-artifact-validator",
    "s05-plugin-ui-surface-validator",
    "runtime-capabilities-validator",
    "s10-runtime-execution-final-validator",
    "s11-validation-artifact-repair-validator",
    "s12-runtime-proof-or-rescope-validator",
    "s13-requirement-coverage-final-validator",
    "m002-closeout-validator",
    "python-regression-unittests",
    "plugin-bos-light-typecheck",
)
S12_FINAL_VALIDATION_COMMAND = (
    "scripts/validate_s12_runtime_proof_or_rescope.py",
    "--phase",
    "final",
    "--write-audit",
    "runtime-evidence/M002-S12-validation-closeout.json",
)
S13_FINAL_VALIDATION_COMMAND = (
    "scripts/validate_s13_requirement_coverage.py",
    "--phase",
    "final",
    "--ledger",
    "runtime-evidence/M002-S13-requirement-coverage.json",
    "--write-audit",
    "runtime-evidence/M002-S13-validation-closeout.json",
)

SECRET_PATTERNS: tuple[tuple[re.Pattern[str], str, str | Callable[[re.Match[str]], str]], ...] = (
    (
        re.compile(r"-----BEGIN (?:RSA |DSA |EC |OPENSSH |)?PRIVATE KEY-----.*?-----END (?:RSA |DSA |EC |OPENSSH |)?PRIVATE KEY-----", re.DOTALL),
        "private-key-block",
        "<redacted:private-key-block>",
    ),
    (re.compile(r"\bsk-[A-Za-z0-9_-]{20,}\b"), "openai-style-api-key", "<redacted:api-key>"),
    (re.compile(r"\b(?:ghp|github_pat)_[A-Za-z0-9_]{30,}\b"), "github-token", "<redacted:github-token>"),
    (re.compile(r"\bAKIA[0-9A-Z]{16}\b"), "aws-access-key", "<redacted:aws-access-key>"),
    (
        re.compile(r"\b(Authorization\s*[:=]\s*Bearer\s+)[A-Za-z0-9._~+/=-]{24,}\b", re.IGNORECASE),
        "authorization-bearer-token",
        lambda match: f"{match.group(1)}<redacted>",
    ),
    (
        re.compile(r"\b([A-Z0-9_]*(?:API[_-]?KEY|TOKEN|SECRET|PASSWORD)[A-Z0-9_]*\s*[:=]\s*)['\"]?[A-Za-z0-9._~+/=-]{12,}['\"]?", re.IGNORECASE),
        "inline-secret-assignment",
        lambda match: f"{match.group(1)}<redacted>",
    ),
)


@dataclass(frozen=True)
class CommandSpec:
    """A single closure gate command."""

    id: str
    description: str
    command: tuple[str, ...]


@dataclass(frozen=True)
class CommandResult:
    """Normalized command result used for JSON evidence."""

    id: str
    description: str
    command: tuple[str, ...]
    exit_code: int
    duration_ms: int
    verdict: str
    started_at: str
    completed_at: str
    stdout_digest: str
    stderr_digest: str
    redaction_labels: tuple[str, ...]
    timed_out: bool = False


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def build_command_plan(python_executable: str | None = None) -> list[CommandSpec]:
    """Return the deterministic command plan for M002/S06 closeout."""

    py = python_executable or sys.executable or "python3"
    return [
        CommandSpec(
            "s04-live-artifact-validator",
            "Validate bounded S04 native issue/document/comment artifact proof.",
            (
                py,
                "scripts/validate_s04_live_artifact_flow.py",
                "--evidence",
                "runtime-evidence/M002-S04-live-artifact-flow.json",
                "--phase",
                "final",
            ),
        ),
        CommandSpec(
            "s05-plugin-ui-surface-validator",
            "Validate S05 plugin/UI probe posture and fallback-only ledger.",
            (
                py,
                "scripts/validate_s05_plugin_ui_surface_probe.py",
                "--evidence",
                "runtime-evidence/M002-S05-plugin-ui-surface-probe.json",
                "--phase",
                "final",
            ),
        ),
        CommandSpec(
            "runtime-capabilities-validator",
            "Validate runtime capability matrix and docs alignment.",
            (py, "scripts/validate_runtime_capabilities.py"),
        ),
        CommandSpec(
            "s10-runtime-execution-final-validator",
            "Validate S10 Hermes/GSD-Pi runtime execution posture and write final closeout audit.",
            (
                py,
                "scripts/validate_s10_runtime_execution.py",
                "--phase",
                "final",
                "--write-audit",
                "runtime-evidence/M002-S10-runtime-execution-closeout.json",
            ),
        ),
        CommandSpec(
            "s11-validation-artifact-repair-validator",
            "Validate S11 canonical validation artifact repair posture and write repair audit.",
            (
                py,
                "scripts/validate_m002_validation_artifacts.py",
                "--root",
                ".",
                "--write-audit",
                "runtime-evidence/M002-S11-validation-artifact-repair.json",
            ),
        ),
        CommandSpec(
            "s12-runtime-proof-or-rescope-validator",
            "Validate S12 runtime proof or approved-rescope disposition and write final closeout audit.",
            (
                py,
                *S12_FINAL_VALIDATION_COMMAND,
            ),
        ),
        CommandSpec(
            "s13-requirement-coverage-final-validator",
            "Validate S13 active R012-R015 coverage reconciliation and write final closeout audit.",
            (
                py,
                *S13_FINAL_VALIDATION_COMMAND,
            ),
        ),
        CommandSpec(
            "m002-closeout-validator",
            "Validate M002 closeout docs, evidence, secret hygiene, and no-core boundaries.",
            (py, "scripts/validate_m002_closeout.py", "--phase", "final"),
        ),
        CommandSpec(
            "python-regression-unittests",
            "Run regression unit tests for validators and the closure runner.",
            (
                py,
                "-m",
                "unittest",
                "scripts/test_validate_s04_live_artifact_flow.py",
                "scripts/test_validate_s05_plugin_ui_surface_probe.py",
                "scripts/test_validate_runtime_capabilities.py",
                "scripts/test_validate_s10_runtime_execution.py",
                "scripts/test_validate_m002_validation_artifacts.py",
                "scripts/test_validate_s12_runtime_proof_or_rescope.py",
                "scripts/test_validate_s13_requirement_coverage.py",
                "scripts/test_validate_m002_closeout.py",
                "scripts/test_run_m002_regression_closure.py",
            ),
        ),
        CommandSpec(
            "plugin-bos-light-typecheck",
            "Run plugin-bos-light TypeScript typecheck.",
            ("npm", "--prefix", "plugin-bos-light", "run", "typecheck"),
        ),
    ]


def validate_command_plan(plan: Sequence[CommandSpec], *, enforce_required_gates: bool = False) -> None:
    if not plan:
        raise ValueError("regression closure command plan is empty")
    for index, spec in enumerate(plan):
        if not spec.id.strip():
            raise ValueError(f"command plan entry {index} is missing an id")
        if not isinstance(spec.command, tuple):
            raise ValueError(f"command plan entry {spec.id!r} must be a command array tuple")
        if not spec.command or any(not isinstance(part, str) or not part for part in spec.command):
            raise ValueError(f"command plan entry {spec.id!r} must be a non-empty command array")
        if len(spec.command) == 1 and re.search(r"\s|&&|\|\||;|[<>]", spec.command[0]):
            raise ValueError(f"command plan entry {spec.id!r} must not be a shell-style command string")
        if spec.command[0] in {"sh", "bash", "/bin/sh", "/bin/bash"}:
            raise ValueError(f"command plan entry {spec.id!r} must not invoke a shell wrapper")
    if enforce_required_gates:
        plan_ids = [spec.id for spec in plan]
        missing = [command_id for command_id in REQUIRED_DEFAULT_COMMAND_IDS if command_id not in plan_ids]
        if missing:
            raise ValueError(f"regression closure command plan missing required gates: {', '.join(missing)}")
        positions = [plan_ids.index(command_id) for command_id in REQUIRED_DEFAULT_COMMAND_IDS]
        if positions != sorted(positions):
            raise ValueError("regression closure command plan required gates are out of order")
        s12 = next(spec for spec in plan if spec.id == "s12-runtime-proof-or-rescope-validator")
        expected_s12 = (s12.command[0], *S12_FINAL_VALIDATION_COMMAND)
        if s12.command != expected_s12:
            raise ValueError("S12 validation command must use --phase final and the required write-audit path")
        s13 = next(spec for spec in plan if spec.id == "s13-requirement-coverage-final-validator")
        expected_s13 = (s13.command[0], *S13_FINAL_VALIDATION_COMMAND)
        if s13.command != expected_s13:
            raise ValueError("S13 validation command must use --phase final, required ledger path, and the required write-audit path")


def redact_text(text: str) -> tuple[str, tuple[str, ...]]:
    """Redact secret-looking material while preserving diagnostic key names."""

    labels: list[str] = []
    redacted = text
    for pattern, label, replacement in SECRET_PATTERNS:
        if pattern.search(redacted):
            labels.append(label)
            redacted = pattern.sub(replacement, redacted)
    return redacted, tuple(sorted(set(labels)))


def digest_text(text: str, *, limit: int = DIGEST_LIMIT_CHARS) -> tuple[str, tuple[str, ...]]:
    redacted, labels = redact_text(text)
    if len(redacted) <= limit:
        return redacted, labels
    omitted = len(redacted) - limit
    return f"[truncated {omitted} chars]\n{redacted[-limit:]}", labels


def run_command(spec: CommandSpec, *, cwd: Path, timeout_seconds: int = DEFAULT_TIMEOUT_SECONDS) -> CommandResult:
    started_at = utc_now()
    start = time.monotonic()
    stdout = ""
    stderr = ""
    timed_out = False
    try:
        completed = subprocess.run(
            list(spec.command),
            cwd=cwd,
            shell=False,
            check=False,
            text=True,
            capture_output=True,
            timeout=timeout_seconds,
        )
        exit_code = int(completed.returncode)
        stdout = completed.stdout or ""
        stderr = completed.stderr or ""
    except subprocess.TimeoutExpired as exc:
        timed_out = True
        exit_code = 124
        stdout = _coerce_timeout_output(exc.stdout)
        stderr = _coerce_timeout_output(exc.stderr)
        stderr = f"{stderr}\nCommand timed out after {timeout_seconds} seconds.".strip()
    completed_at = utc_now()
    duration_ms = int((time.monotonic() - start) * 1000)
    stdout_digest, stdout_labels = digest_text(stdout)
    stderr_digest, stderr_labels = digest_text(stderr)
    verdict = "pass" if exit_code == 0 and not timed_out else "fail"
    return CommandResult(
        id=spec.id,
        description=spec.description,
        command=spec.command,
        exit_code=exit_code,
        duration_ms=duration_ms,
        verdict=verdict,
        started_at=started_at,
        completed_at=completed_at,
        stdout_digest=stdout_digest,
        stderr_digest=stderr_digest,
        redaction_labels=tuple(sorted(set(stdout_labels + stderr_labels))),
        timed_out=timed_out,
    )


def _coerce_timeout_output(value: bytes | str | None) -> str:
    if value is None:
        return ""
    if isinstance(value, bytes):
        return value.decode("utf-8", errors="replace")
    return value


def result_to_json(result: CommandResult) -> dict[str, Any]:
    redacted_command = [redact_text(part)[0] for part in result.command]
    command_redaction_labels = tuple(
        sorted({label for part in result.command for label in redact_text(part)[1]})
    )
    return {
        "id": result.id,
        "description": result.description,
        "command": redacted_command,
        "exit_code": result.exit_code,
        "duration_ms": result.duration_ms,
        "verdict": result.verdict,
        "started_at": result.started_at,
        "completed_at": result.completed_at,
        "timed_out": result.timed_out,
        "stdout_digest": result.stdout_digest,
        "stderr_digest": result.stderr_digest,
        "redaction_labels": sorted(set(result.redaction_labels + command_redaction_labels)),
    }


def build_evidence(results: Sequence[CommandResult], *, started_at: str, completed_at: str, fail_fast: bool) -> dict[str, Any]:
    overall_verdict = "pass" if results and all(result.verdict == "pass" for result in results) else "fail"
    return {
        "artifact_type": "regression-closure-evidence",
        "schema_version": "1.0",
        "milestone": "M002",
        "slice": "S06",
        "runner": "scripts/run_m002_regression_closure.py",
        "mode": "fail-fast" if fail_fast else "aggregate",
        "overall_verdict": overall_verdict,
        "started_at": started_at,
        "completed_at": completed_at,
        "commands": [result_to_json(result) for result in results],
        "invariants": {
            "shell_expansion_disabled": True,
            "secret_values_redacted": True,
            "artifact_parent_preexisted": True,
        },
    }


def write_evidence(root: Path, output_path: Path, evidence: dict[str, Any]) -> Path:
    absolute_path = output_path.resolve() if output_path.is_absolute() else (root / output_path).resolve()
    try:
        absolute_path.relative_to(root.resolve())
    except ValueError as exc:
        raise ValueError(f"output path must stay inside repository root: {absolute_path}") from exc
    parent = absolute_path.parent
    if not parent.exists():
        raise FileNotFoundError(f"artifact parent directory does not exist: {parent}")
    if not parent.is_dir():
        raise NotADirectoryError(f"artifact parent path is not a directory: {parent}")
    absolute_path.write_text(json.dumps(evidence, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return absolute_path


def run_closure(
    *,
    root: Path,
    output_path: Path = DEFAULT_ARTIFACT_PATH,
    timeout_seconds: int = DEFAULT_TIMEOUT_SECONDS,
    fail_fast: bool = False,
    plan: Sequence[CommandSpec] | None = None,
) -> dict[str, Any]:
    root = root.resolve()
    command_plan = list(plan) if plan is not None else build_command_plan()
    validate_command_plan(command_plan, enforce_required_gates=plan is None)
    started_at = utc_now()
    results: list[CommandResult] = []
    for spec in command_plan:
        result = run_command(spec, cwd=root, timeout_seconds=timeout_seconds)
        results.append(result)
        if fail_fast and result.verdict != "pass":
            break
    completed_at = utc_now()
    evidence = build_evidence(results, started_at=started_at, completed_at=completed_at, fail_fast=fail_fast)
    write_evidence(root, output_path, evidence)
    return evidence


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Run M002/S06 regression closure gates and write JSON evidence.")
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[1], help="Repository root.")
    parser.add_argument(
        "--output",
        type=Path,
        default=DEFAULT_ARTIFACT_PATH,
        help="Evidence JSON path. Relative paths are resolved inside the repository root; parent must already exist.",
    )
    parser.add_argument("--timeout-sec", type=int, default=DEFAULT_TIMEOUT_SECONDS, help="Per-command timeout in seconds.")
    parser.add_argument("--fail-fast", action="store_true", help="Stop after the first failing command instead of aggregating all gates.")
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        evidence = run_closure(root=args.root, output_path=args.output, timeout_seconds=args.timeout_sec, fail_fast=args.fail_fast)
    except Exception as exc:  # fail closed with clear operator-facing error
        print(f"M002 regression closure failed before evidence write: {exc}", file=sys.stderr)
        return 1

    output_path = args.output if args.output.is_absolute() else args.root / args.output
    print(f"M002 regression closure {evidence['overall_verdict']}: wrote {output_path}")
    return 0 if evidence["overall_verdict"] == "pass" else 1


if __name__ == "__main__":
    raise SystemExit(main())
