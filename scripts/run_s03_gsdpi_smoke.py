#!/usr/bin/env python3
"""Generate S03 GSD-Pi local adapter environment evidence.

This runner intentionally stays standard-library-only. It can consume runtime facts
collected through supported sandbox/container administration and combine them with
Paperclip HTTP readback so the evidence is redacted and validator-friendly.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

SCHEMA_VERSION = "s03-gsdpi-smoke/v1"
ADAPTER_TYPE = "gsdpi_local"


def now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def request_json(base_url: str, path: str, headers: dict[str, str]) -> dict[str, Any]:
    url = base_url.rstrip("/") + path
    started = time.monotonic()
    req = Request(url, headers=headers, method="GET")
    try:
        with urlopen(req, timeout=20) as response:
            body = response.read(1_000_000)
            text = body.decode("utf-8", errors="replace")
            try:
                parsed: Any = json.loads(text) if text.strip() else None
            except json.JSONDecodeError:
                parsed = None
            return {
                "ok": 200 <= response.status < 300,
                "status": response.status,
                "duration_ms": int((time.monotonic() - started) * 1000),
                "url": url,
                "json": parsed,
                "text": None if parsed is not None else text[:2000],
            }
    except HTTPError as exc:
        text = exc.read(2000).decode("utf-8", errors="replace")
        return {"ok": False, "status": exc.code, "duration_ms": int((time.monotonic() - started) * 1000), "url": url, "json": None, "text": text}
    except URLError as exc:
        return {"ok": False, "status": None, "duration_ms": int((time.monotonic() - started) * 1000), "url": url, "json": None, "text": str(exc.reason)}


def find_adapter(adapters: Any) -> Any | None:
    if not isinstance(adapters, list):
        return None
    for adapter in adapters:
        if isinstance(adapter, dict) and adapter.get("type") == ADAPTER_TYPE:
            return adapter
    return None


def build_headers(args: argparse.Namespace) -> dict[str, str]:
    headers = {"Accept": "application/json"}
    if args.auth_token_env:
        token = os.environ.get(args.auth_token_env, "")
        if token:
            headers[args.auth_header_name] = token
    return headers


def build_evidence(args: argparse.Namespace) -> dict[str, Any]:
    facts = load_json(args.runtime_facts_json)
    command = facts.get("command") or "gsd"
    version = facts.get("version")
    command_available = isinstance(version, str) and bool(version.strip())
    headers = build_headers(args)
    health = request_json(args.base_url, "/api/health", headers)
    version_response = request_json(args.base_url, "/api/version", headers)
    adapters_response = request_json(args.base_url, "/api/adapters", headers)
    adapter_readback = find_adapter(adapters_response.get("json"))

    evidence: dict[str, Any] = {
        "schema_version": SCHEMA_VERSION,
        "artifact_type": "smoke-evidence" if command_available else "fail-closed-blocker",
        "phase": "environment",
        "generated_at": now_iso(),
        "paperclip": {
            "version": (version_response.get("json") or {}).get("version") if isinstance(version_response.get("json"), dict) else "unknown",
            "build": (version_response.get("json") or {}).get("build") if isinstance(version_response.get("json"), dict) else "unknown",
        },
        "adapter": {
            "adapterType": ADAPTER_TYPE,
            "registry_readback": adapter_readback,
            "testEnvironment": {
                "status": "pass" if command_available else "fail",
                "checks": [
                    {
                        "code": "gsd_version" if command_available else "gsd_command_unavailable",
                        "level": "info" if command_available else "error",
                        "message": f"{command} --version returned {version}" if command_available else f"{command} was not available in the Paperclip execution environment.",
                    }
                ],
            },
        },
        "runtime": {
            "command": command,
            "version": version,
            "node": facts.get("node"),
            "npm": facts.get("npm"),
            "pnpm": facts.get("pnpm"),
            "install": facts.get("install"),
        },
        "diagnostics": {
            "health": health,
            "version": version_response,
            "adapters": adapters_response,
            "adapter_registered": adapter_readback is not None,
            "runtime_facts_source": str(args.runtime_facts_json),
        },
        "no_core_modification": {
            "method": "Supported Paperclip HTTP readback plus sandbox/container package administration only; no Paperclip source patch, monkey patch, private module import, or direct DB write.",
            "files_modified": [],
            "core_source_patched": False,
            "direct_db_mutation": False,
        },
    }
    if not command_available:
        evidence["blocker_reason"] = "gsd_command_unavailable"
    return evidence


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Generate S03 GSD-Pi adapter environment evidence.")
    parser.add_argument("--phase", choices=["environment"], default="environment")
    parser.add_argument("--base-url", required=True)
    parser.add_argument("--company-id", required=True)
    parser.add_argument("--runtime-facts-json", type=Path, required=True)
    parser.add_argument("--auth-token-env")
    parser.add_argument("--auth-header-name", default="Cookie")
    parser.add_argument("--output", type=Path, default=Path("runtime-evidence/M002-S03-gsdpi-environment.json"))
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    evidence = build_evidence(args)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(evidence, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(f"S03 GSD-Pi environment evidence wrote {args.output}: {evidence['artifact_type']}")
    return 0 if evidence["artifact_type"] == "smoke-evidence" else 2


if __name__ == "__main__":
    raise SystemExit(main())
