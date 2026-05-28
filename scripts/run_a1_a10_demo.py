#!/usr/bin/env python3
"""Run the BOS Light A1-A10 baseline demo as one machine-readable command.

The runner is intentionally standard-library Python. It composes existing local
validators/probes and the TypeScript fixture demo without requiring secrets,
network access, a live Paperclip runtime, or background services. Runtime support
remains explicitly unvalidated unless separate live evidence is supplied and
validated by future work.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
import tempfile
import textwrap
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Mapping, Sequence

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_SEED_PATH = Path("scripts/demo-seed-issues.json")
COMPANY_TEMPLATE_VALIDATOR = Path("scripts/validate_company_template.py")
RUNTIME_CAPABILITY_VALIDATOR = Path("scripts/validate_runtime_capabilities.py")
PAPERCLIP_RUNTIME_PROBE = Path("scripts/probe_paperclip_runtime.py")
PLUGIN_DIR = Path("plugin-bos-light")
INTEGRATED_DEMO_SOURCE = Path("plugin-bos-light/src/integratedDemo.ts")
INTEGRATED_DEMO_TEST = Path("plugin-bos-light/tests/integratedDemo.test.ts")
VITE_NODE_BIN = Path("plugin-bos-light/node_modules/.bin/vite-node")
OUTPUT_DIGEST_CHARS = 1_200
DEFAULT_TIMEOUT_SECONDS = 120

SECRET_VALUE_RE = re.compile(
    r"(sk-[A-Za-z0-9_\-]{8,}|gh[pousr]_[A-Za-z0-9_]{8,}|xox[baprs]-[A-Za-z0-9\-]{8,}|"
    r"AKIA[0-9A-Z]{8,}|(?:Bearer\s+)[A-Za-z0-9._\-]{8,}|"
    r"[A-Za-z_][A-Za-z0-9_]*(?:TOKEN|SECRET|PASSWORD|API_KEY)=[^\s]+)",
    re.IGNORECASE,
)

A_PHASE_LABELS = {
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


@dataclass
class RawCommandResult:
    exit_code: int | None
    stdout: str = ""
    stderr: str = ""
    timed_out: bool = False
    duration_ms: int = 0


CommandRunner = Callable[[Sequence[str], int, Path], RawCommandResult | Mapping[str, Any]]


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _redact(text: str) -> str:
    return SECRET_VALUE_RE.sub("<redacted>", text)


def bounded_digest(text: str, limit: int = OUTPUT_DIGEST_CHARS) -> str:
    sanitized = _redact(text or "").replace("\r", "")
    if len(sanitized) <= limit:
        return sanitized
    return f"<truncated {len(sanitized) - limit} chars>" + sanitized[-limit:]


def display_path(root: Path, path: Path) -> str:
    try:
        return str(path.resolve().relative_to(root.resolve()))
    except ValueError:
        return str(path)


def default_subprocess_runner(command: Sequence[str], timeout_seconds: int, cwd: Path) -> RawCommandResult:
    started = time.monotonic()
    try:
        completed = subprocess.run(
            list(command),
            cwd=cwd,
            text=True,
            capture_output=True,
            timeout=timeout_seconds,
            check=False,
        )
        return RawCommandResult(
            exit_code=completed.returncode,
            stdout=completed.stdout or "",
            stderr=completed.stderr or "",
            timed_out=False,
            duration_ms=int((time.monotonic() - started) * 1000),
        )
    except subprocess.TimeoutExpired as exc:
        stdout = exc.stdout if isinstance(exc.stdout, str) else (exc.stdout or b"").decode("utf-8", "replace")
        stderr = exc.stderr if isinstance(exc.stderr, str) else (exc.stderr or b"").decode("utf-8", "replace")
        return RawCommandResult(
            exit_code=None,
            stdout=stdout,
            stderr=stderr,
            timed_out=True,
            duration_ms=int((time.monotonic() - started) * 1000),
        )


def _coerce_raw_result(value: RawCommandResult | Mapping[str, Any]) -> RawCommandResult:
    if isinstance(value, RawCommandResult):
        return value
    return RawCommandResult(
        exit_code=value.get("exit_code"),
        stdout=str(value.get("stdout") or ""),
        stderr=str(value.get("stderr") or ""),
        timed_out=bool(value.get("timed_out", False)),
        duration_ms=int(value.get("duration_ms") or 0),
    )


def command_status(label: str, phase: str, command: Sequence[str], raw: RawCommandResult) -> dict[str, Any]:
    if raw.timed_out:
        status = "timeout"
    elif raw.exit_code == 0:
        status = "passed"
    else:
        status = "failed"
    return {
        "label": label,
        "phase": phase,
        "status": status,
        "command": list(command),
        "exit_code": raw.exit_code,
        "duration_ms": raw.duration_ms,
        "stdout_digest": bounded_digest(raw.stdout),
        "stderr_digest": bounded_digest(raw.stderr),
    }


def run_command(
    label: str,
    phase: str,
    command: Sequence[str],
    *,
    root: Path,
    timeout_seconds: int,
    runner: CommandRunner,
) -> tuple[dict[str, Any], RawCommandResult]:
    raw = _coerce_raw_result(runner(command, timeout_seconds, root))
    return command_status(label, phase, command, raw), raw


def load_seed_file(root: Path, seed_path: Path) -> tuple[list[Any] | None, dict[str, Any]]:
    resolved = seed_path if seed_path.is_absolute() else root / seed_path
    diagnostic: dict[str, Any] = {"path": display_path(root, resolved)}
    if not resolved.exists():
        diagnostic.update({"status": "missing", "error": "seed file does not exist"})
        return None, diagnostic
    if not resolved.is_file():
        diagnostic.update({"status": "malformed", "error": "seed path is not a file"})
        return None, diagnostic
    try:
        loaded = json.loads(resolved.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        diagnostic.update(
            {
                "status": "malformed",
                "error": f"malformed JSON at line {exc.lineno}, column {exc.colno}: {exc.msg}",
            }
        )
        return None, diagnostic
    except OSError as exc:
        diagnostic.update({"status": "unreadable", "error": exc.strerror or str(exc)})
        return None, diagnostic
    if not isinstance(loaded, list):
        diagnostic.update({"status": "malformed", "error": "top-level seed JSON value must be an array"})
        return None, diagnostic
    diagnostic.update({"status": "loaded", "issue_count": len(loaded)})
    return loaded, diagnostic


def runtime_path_gaps(runtime_evidence_path: Path | None) -> list[dict[str, Any]]:
    if runtime_evidence_path is None:
        return [
            {
                "surface": "runtime.evidence_path",
                "posture": "unvalidated",
                "reason": "No --runtime-evidence path supplied; live Paperclip runtime support was not probed.",
                "artifact_ref": None,
            }
        ]
    resolved = runtime_evidence_path.expanduser().resolve()
    if not resolved.exists():
        return [
            {
                "surface": "runtime.evidence_path",
                "posture": "unvalidated",
                "reason": f"Provided runtime evidence path does not exist: {resolved}",
                "artifact_ref": None,
            }
        ]
    if not resolved.is_dir():
        return [
            {
                "surface": "runtime.evidence_path",
                "posture": "unvalidated",
                "reason": f"Provided runtime evidence path is not a directory: {resolved}",
                "artifact_ref": None,
            }
        ]
    return []


def write_integrated_demo_script(directory: Path) -> Path:
    script = directory / "run-integrated-demo.mjs"
    script.write_text(
        textwrap.dedent(
            """
            import { readFileSync } from "node:fs";
            import { pathToFileURL } from "node:url";

            const [modulePath, seedPath, now] = process.argv.slice(2);
            const { runA1ToA10FixtureDemo } = await import(pathToFileURL(modulePath).href);
            const seedIssues = JSON.parse(readFileSync(seedPath, "utf8"));
            const report = await runA1ToA10FixtureDemo({ seedIssues, now });
            console.log(JSON.stringify(report));
            """
        ).strip()
        + "\n",
        encoding="utf-8",
    )
    return script


def build_phase_skeleton() -> dict[str, dict[str, Any]]:
    return {phase: {"label": label, "status": "not_run"} for phase, label in A_PHASE_LABELS.items()}


def parse_json_output(raw: RawCommandResult, label: str) -> tuple[Any | None, dict[str, Any] | None]:
    try:
        return json.loads(raw.stdout), None
    except json.JSONDecodeError as exc:
        return None, {
            "label": label,
            "status": "malformed-json-output",
            "error": f"malformed JSON at line {exc.lineno}, column {exc.colno}: {exc.msg}",
            "stdout_digest": bounded_digest(raw.stdout),
            "stderr_digest": bounded_digest(raw.stderr),
        }


def summarize_integrated_phases(phases: dict[str, dict[str, Any]], demo_report: Mapping[str, Any] | None) -> None:
    if not isinstance(demo_report, Mapping):
        for phase in ("A3", "A4", "A5", "A6", "A7", "A8", "A9", "A10"):
            phases[phase].update({"status": "failed", "reason": "integrated demo report unavailable"})
        return

    phase_fields = {
        "A3": ("selected_surfaces", "artifact_refs", "cache_overlay", "fallback"),
        "A4": ("selected_surface", "selected_issue_ids", "blueprint_ids", "fallback"),
        "A5": ("selected_surface", "artifact_ref", "cache_overlay", "fallback", "native_support_confirmed"),
        "A6": ("selected_surface", "artifact_ref", "cache_overlay", "fallback"),
        "A7": ("selected_surface", "artifact_ref", "cache_overlay", "fallback"),
        "A8": ("selected_surface", "artifact_ref", "cache_overlay", "fallback"),
        "A9": ("selected_surface", "artifact_ref", "cache_overlay", "fallback"),
        "A10": ("selected_surface", "artifact_ref", "cache_overlay", "fallback"),
    }
    for phase, fields in phase_fields.items():
        payload = demo_report.get(phase)
        if not isinstance(payload, Mapping):
            phases[phase].update({"status": "missing", "reason": f"{phase} missing from integrated demo report"})
            continue
        phases[phase].update({"status": "passed", "phase": payload.get("phase"), "timestamp": payload.get("timestamp")})
        for field in fields:
            if field in payload:
                phases[phase][field] = payload[field]


def build_report(
    *,
    root: Path = ROOT,
    seed_path: Path = DEFAULT_SEED_PATH,
    runtime_evidence_path: Path | None = None,
    timeout_seconds: int = DEFAULT_TIMEOUT_SECONDS,
    runner: CommandRunner = default_subprocess_runner,
    now: str | None = None,
) -> dict[str, Any]:
    root = root.resolve()
    now = now or utc_now()
    seed_path = seed_path if seed_path.is_absolute() else root / seed_path
    runtime_evidence_path = runtime_evidence_path.expanduser() if runtime_evidence_path is not None else None
    commands: list[dict[str, Any]] = []
    failures: list[dict[str, Any]] = []
    gap_ledger: list[dict[str, Any]] = runtime_path_gaps(runtime_evidence_path)
    phases = build_phase_skeleton()

    evidence_paths = {
        "seed_issues": display_path(root, seed_path),
        "company_template": "company-template/bos-company-template.json",
        "runtime_capability_matrix": "plugin-bos-light/capabilities.paperclip-runtime.json",
        "runtime_evidence": str(runtime_evidence_path.expanduser().resolve()) if runtime_evidence_path is not None else None,
        "integrated_demo_source": str(INTEGRATED_DEMO_SOURCE),
        "integrated_demo_test": str(INTEGRATED_DEMO_TEST),
    }

    seed_rows, seed_diagnostic = load_seed_file(root, seed_path)
    if seed_rows is None:
        failure = {"phase": "seed_validation", "label": "seed-file", **seed_diagnostic}
        failures.append(failure)
        for phase in ("A3", "A4", "A5", "A6", "A7", "A8", "A9", "A10"):
            phases[phase].update({"status": "skipped", "reason": "seed validation failed"})
        return {
            "schema_version": "1.0",
            "demo": "A1-A10 baseline",
            "generated_at": now,
            "status": "failed",
            "mode": "fixture-only" if runtime_evidence_path is None else "fixture-plus-local-runtime-evidence",
            "seed": seed_diagnostic,
            "evidence_paths": evidence_paths,
            "phases": phases,
            "commands": commands,
            "runtime_capability_posture": {"status": "unvalidated", "native_support_confirmed": False},
            "gap_ledger": gap_ledger,
            "failures": failures,
        }

    with tempfile.TemporaryDirectory() as temp_dir_text:
        demo_script = write_integrated_demo_script(Path(temp_dir_text))
        command_specs: list[tuple[str, str, list[str]]] = [
            (
                "company-template-validator",
                "A1",
                [sys.executable, str(root / COMPANY_TEMPLATE_VALIDATOR), "--root", str(root)],
            ),
            (
                "runtime-capability-validator",
                "A2",
                [sys.executable, str(root / RUNTIME_CAPABILITY_VALIDATOR), "--root", str(root)],
            ),
            (
                "paperclip-runtime-probe",
                "A2",
                [sys.executable, str(root / PAPERCLIP_RUNTIME_PROBE), "--root", str(root)]
                + (["--paperclip-dir", str(runtime_evidence_path)] if runtime_evidence_path is not None else []),
            ),
            (
                "integrated-demo-report",
                "A3-A10",
                [
                    str(root / VITE_NODE_BIN),
                    "--root",
                    str(root / PLUGIN_DIR),
                    str(demo_script),
                    str(root / INTEGRATED_DEMO_SOURCE),
                    str(seed_path),
                    now,
                ],
            ),
            (
                "integrated-demo-vitest",
                "A3-A10",
                ["npm", "--prefix", str(root / PLUGIN_DIR), "test", "--", INTEGRATED_DEMO_TEST.name],
            ),
        ]

        raw_by_label: dict[str, RawCommandResult] = {}
        for label, phase, command in command_specs:
            status, raw = run_command(label, phase, command, root=root, timeout_seconds=timeout_seconds, runner=runner)
            commands.append(status)
            raw_by_label[label] = raw
            if status["status"] != "passed":
                failures.append(
                    {
                        "phase": phase,
                        "label": label,
                        "command": status["command"],
                        "exit_code": status["exit_code"],
                        "status": status["status"],
                        "stdout_digest": status["stdout_digest"],
                        "stderr_digest": status["stderr_digest"],
                    }
                )

    phases["A1"].update({"status": commands[0]["status"], "command_label": commands[0]["label"]})
    phases["A2"].update(
        {
            "status": "passed" if commands[1]["status"] == "passed" and commands[2]["status"] == "passed" else "failed",
            "command_labels": [commands[1]["label"], commands[2]["label"]],
        }
    )

    probe_report: Mapping[str, Any] | None = None
    probe_parse_error: dict[str, Any] | None = None
    if raw_by_label.get("paperclip-runtime-probe") and raw_by_label["paperclip-runtime-probe"].exit_code == 0:
        parsed_probe, probe_parse_error = parse_json_output(raw_by_label["paperclip-runtime-probe"], "paperclip-runtime-probe")
        if isinstance(parsed_probe, Mapping):
            probe_report = parsed_probe
        elif probe_parse_error:
            failures.append({"phase": "A2", **probe_parse_error})

    demo_report: Mapping[str, Any] | None = None
    demo_parse_error: dict[str, Any] | None = None
    if raw_by_label.get("integrated-demo-report") and raw_by_label["integrated-demo-report"].exit_code == 0:
        parsed_demo, demo_parse_error = parse_json_output(raw_by_label["integrated-demo-report"], "integrated-demo-report")
        if isinstance(parsed_demo, Mapping):
            demo_report = parsed_demo
        elif demo_parse_error:
            failures.append({"phase": "A3-A10", **demo_parse_error})

    summarize_integrated_phases(phases, demo_report)

    if probe_report is not None:
        paperclip = probe_report.get("paperclip") if isinstance(probe_report.get("paperclip"), Mapping) else {}
        for item in paperclip.get("malformed_evidence", []) if isinstance(paperclip, Mapping) else []:
            gap_ledger.append(
                {
                    "surface": "runtime.evidence_path",
                    "posture": "unvalidated",
                    "reason": str(item),
                    "artifact_ref": str(paperclip.get("path")) if paperclip.get("path") else None,
                }
            )

    if demo_report is not None:
        for item in demo_report.get("runtime_gap_ledger", []):
            if isinstance(item, Mapping):
                gap_ledger.append(dict(item))

    integrated_posture = demo_report.get("runtime_capability_posture") if isinstance(demo_report, Mapping) else None
    paperclip_probe_posture = probe_report.get("posture") if isinstance(probe_report, Mapping) else None
    paperclip_path_report = probe_report.get("paperclip") if isinstance(probe_report, Mapping) else None
    runtime_capability_posture = {
        "status": "unvalidated",
        "native_support_confirmed": False,
        "matrix_validator": commands[1]["status"],
        "paperclip_probe": paperclip_probe_posture or {"status": "unvalidated"},
        "paperclip_path": paperclip_path_report or {"availability": "not-run", "status": "unvalidated"},
        "integrated_fixture": integrated_posture or {"source": "fixture-adapter", "native_support_confirmed": False},
    }

    overall_failed = bool(failures)
    return {
        "schema_version": "1.0",
        "demo": "A1-A10 baseline",
        "generated_at": now,
        "status": "failed" if overall_failed else "passed",
        "mode": "fixture-only" if runtime_evidence_path is None else "fixture-plus-local-runtime-evidence",
        "seed": seed_diagnostic,
        "evidence_paths": evidence_paths,
        "phases": phases,
        "commands": commands,
        "runtime_capability_posture": runtime_capability_posture,
        "gap_ledger": gap_ledger,
        "failures": failures,
    }


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Run the BOS Light A1-A10 baseline demo and emit a JSON evidence envelope."
    )
    parser.add_argument("--root", type=Path, default=ROOT, help="Repository root (default: parent of scripts/).")
    parser.add_argument(
        "--seed",
        type=Path,
        default=DEFAULT_SEED_PATH,
        help="Seed issue JSON path, absolute or relative to root (default: scripts/demo-seed-issues.json).",
    )
    parser.add_argument(
        "--runtime-evidence",
        type=Path,
        default=None,
        help="Optional local Paperclip checkout/runtime directory for bounded no-runtime-safe evidence inspection.",
    )
    parser.add_argument(
        "--timeout-seconds",
        type=int,
        default=DEFAULT_TIMEOUT_SECONDS,
        help="Per-subprocess timeout in seconds (default: 120).",
    )
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    report = build_report(
        root=args.root,
        seed_path=args.seed,
        runtime_evidence_path=args.runtime_evidence,
        timeout_seconds=max(1, args.timeout_seconds),
    )
    print(json.dumps(report, indent=2, sort_keys=True))
    return 0 if report.get("status") == "passed" else 1


if __name__ == "__main__":
    raise SystemExit(main())
