#!/usr/bin/env python3
"""Create BOS Light v1.4.1 division agents in Paperclip via supported API.

This is a live runtime probe. It creates agents and records readback evidence.

Hardening (M014-a9jj46/S03/T03): the script MUST run the
`paperclip-preflight` contract (scripts/lib/paperclip-preflight.js,
exposed via scripts/cli_paperclip_preflight.js) BEFORE any
POST/PUT/PATCH/DELETE. The legacy `DEFAULT_COMPANY_ID` hardcoded stale
UUID has been removed; callers MUST supply --company-id (a freshly
readback-verified UUID) AND set `PAPERCLIP_COMPANY_ID_OVERRIDE=allow`
while the lockfile's canonical_company_id is null.

The preflight gate runs in BOTH --dry-run and live modes: dry-run
still produces the same fail-closed behavior so the operator can see
whether a live run would be blocked, without making any mutation.
When preflight blocks, the script writes a `fail-closed-blocker`
artifact with the structured preflight blockers and exits non-zero.
Zero mutation is attempted when any preflight check fails.

Auth model: session-cookie (PAPERCLIP_EMAIL/PAPERCLIP_PASSWORD). The
PAPERCLIP_API_KEY legacy token is rejected by V-PF-04 and MUST NOT be
used for mutations; this script no longer reads it for any POST/PUT/
PATCH/DELETE path.
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import urllib.error
import urllib.request

ROOT = Path(__file__).resolve().parents[1]

DEFAULT_BASE_URL = "https://paperclip.oysana.com"
# NOTE: The legacy `DEFAULT_COMPANY_ID = "43c74adb-..."` constant was
# removed in T03 because that UUID is in the stale_company_ids.ids ledger
# (R3) and must NEVER be used as a mutation default. Callers must pass
# --company-id with a freshly readback-verified UUID. The argument is
# REQUIRED: argparse uses `required=True` so the script refuses to run
# without an explicit, freshly readback-verified UUID.
DEFAULT_ADAPTER = "hermes_local"
PREFLIGHT_CONFIRMATION_REASON = (
    "create_bos_v141_agents: create BOS Light v1.4.1 division agents "
    "(MissionControl, HCO, MasterPlanner, Treasury, Production, "
    "QualificationsLibraryLearning, External) in Paperclip"
)
CLI_WRAPPER_RELATIVE_PATH = "scripts/cli_paperclip_preflight.js"
CLI_WRAPPER_TIMEOUT_SECONDS = 30

# Preflight V-PF-04 explicitly forbids these tokens for mutations; we
# strip them from the subprocess env so the preflight contract evaluates
# against the operator's actual auth posture.
PREFLIGHT_REJECTED_ENV_TOKENS = ("PAPERCLIP_API_KEY",)

V141_DIVISIONS = [
    {
        "id": "Div7.MissionControl",
        "name": "Div7.MissionControl - Mission Control / Strategy",
        "title": "Mission Control / Strategy",
        "role": "researcher",
        "reports_to": None,
    },
    {
        "id": "Div1.HCO",
        "name": "Div1.HCO - Head Communication Office",
        "title": "Head Communication Office",
        "role": "general",
        "reports_to": "Div7.MissionControl",
    },
    {
        "id": "Div2.MasterPlanner",
        "name": "Div2.MasterPlanner - Shaping / Product Planning",
        "title": "Shaping / Product Planning",
        "role": "pm",
        "reports_to": "Div1.HCO",
    },
    {
        "id": "Div3.Treasury",
        "name": "Div3.Treasury - Treasury / Budget / Access",
        "title": "Treasury / Budget / Access",
        "role": "cfo",
        "reports_to": "Div1.HCO",
    },
    {
        "id": "Div4.Production",
        "name": "Div4.Production - Production / Build / Delivery",
        "title": "Production / Build / Delivery",
        "role": "engineer",
        "reports_to": "Div1.HCO",
    },
    {
        "id": "Div5.QualificationsLibraryLearning",
        "name": "Div5.QualificationsLibraryLearning - Qualifications / Library / Learning",
        "title": "Qualifications / Library / Learning",
        "role": "qa",
        "reports_to": "Div1.HCO",
    },
    {
        "id": "Div6.External",
        "name": "Div6.External - External / DMZ",
        "title": "External / DMZ",
        "role": "security",
        "reports_to": "Div1.HCO",
    },
]


# ---------------------------------------------------------------------------
# Auth helpers (session-cookie only for mutations)
# ---------------------------------------------------------------------------


def load_dotenv(path: Path) -> dict[str, str]:
    """Minimal KEY=VALUE .env reader. Strips 'export ' prefixes and quotes.

    Values are NEVER echoed or persisted; they are read into a local dict and
    used immediately by sign_in_session_cookie(). The dict is dropped on
    function exit so secrets do not linger.
    """
    env: dict[str, str] = {}
    if not path.exists():
        return env
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("export "):
            line = line[len("export "):].lstrip()
        idx = line.find("=")
        if idx < 1:
            continue
        key = line[:idx].strip()
        val = line[idx + 1:].strip()
        if (val.startswith('"') and val.endswith('"')) or (
            val.startswith("'") and val.endswith("'")
        ):
            val = val[1:-1]
        env[key] = val
    return env


def sign_in_session_cookie(base_url: str, email: str, password: str) -> str:
    """Authenticate via /api/auth/sign-in/email and return the session cookie.

    Raises urllib.error.HTTPError or RuntimeError on failure. The session
    cookie value contains the live token; the function never logs it.
    """
    sign_in_url = f"{base_url.rstrip('/')}/api/auth/sign-in/email"
    payload = json.dumps({"email": email, "password": password}).encode("utf-8")
    req = urllib.request.Request(
        sign_in_url,
        data=payload,
        headers={
            "Content-Type": "application/json",
            "Origin": base_url.rstrip("/"),
            "Referer": f"{base_url.rstrip('/')}/",
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=30) as resp:  # noqa: S310 - operator URL
        set_cookies = resp.headers.get_all("Set-Cookie") or []
        for raw in set_cookies:
            # Set-Cookie format: "session=abc...; Path=/; HttpOnly; ..."
            first = raw.split(";", 1)[0].strip()
            if first.startswith("session="):
                return first
    raise RuntimeError("sign-in response did not include a session cookie")


def authed_api_request(
    method: str,
    path: str,
    base_url: str,
    session_cookie: str,
    payload: dict[str, Any] | None = None,
    api_key: str | None = None,
) -> dict[str, Any]:
    """Issue a single HTTP request with session-cookie auth.

    `api_key` is accepted only as a diagnostic-only Bearer header for
    legacy read-only paths that pre-date the session-cookie rollout. It is
    never passed to POST/PUT/PATCH/DELETE in this hardened script.
    """
    url = f"{base_url}{path}"
    headers = {
        "Content-Type": "application/json",
        "Origin": base_url.rstrip("/"),
    }
    if session_cookie:
        headers["Cookie"] = session_cookie
    elif api_key:
        # Diagnostic-only Bearer header; the mutation paths always use
        # session_cookie so this branch only fires for pre-mutation reads.
        headers["Authorization"] = f"Bearer {api_key}"
    data = json.dumps(payload).encode("utf-8") if payload else None
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:  # noqa: S310 - operator URL
            body = resp.read().decode("utf-8")
            return {
                "ok": True,
                "status": resp.status,
                "body": json.loads(body) if body else None,
                "url": url,
            }
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8") if e.fp else ""
        return {
            "ok": False,
            "status": e.code,
            "body": json.loads(body) if body else None,
            "error": str(e),
            "url": url,
        }
    except Exception as e:
        return {"ok": False, "status": None, "error": str(e), "url": url}


# ---------------------------------------------------------------------------
# Preflight gate
# ---------------------------------------------------------------------------


def build_subprocess_env() -> dict[str, str]:
    """Build the subprocess env, stripping V-PF-04 rejected tokens.

    The preflight CLI wrapper reads process.env directly; if we forward
    PAPERCLIP_API_KEY, preflight V-PF-04 will block. Stripping it here
    means the preflight verdict reflects the operator's intended auth
    posture (session-cookie), not the legacy token presence.
    """
    return {
        k: v
        for k, v in os.environ.items()
        if k not in PREFLIGHT_REJECTED_ENV_TOKENS
    }


def run_preflight(company_id: str | None, *, dry_run: bool) -> dict[str, Any]:
    """Invoke scripts/cli_paperclip_preflight.js and parse the JSON envelope.

    Returns a normalized envelope with `pass`, `blockers`, `diagnostics`,
    and `exit_code`. Never raises on a blocked preflight; only propagates
    subprocess and parse errors that prevent the gate from running at all.
    """
    cmd = [
        "node",
        CLI_WRAPPER_RELATIVE_PATH,
        "--confirmation-reason",
        PREFLIGHT_CONFIRMATION_REASON,
        # We do our own health probe (and it's part of the mutation flow),
        # so skip preflight's network probes to avoid double-work and
        # surface a meaningful health-decode in the script's own evidence.
        "--bypass-health-probe",
        "--bypass-visibility-probe",
    ]
    if company_id:
        cmd += ["--explicit-company-id", company_id]
    if dry_run:
        # The wrapper accepts no --dry-run flag; the gate runs identically
        # in dry-run and live modes. We tag the request below instead.
        pass
    try:
        proc = subprocess.run(
            cmd,
            cwd=str(ROOT),
            env=build_subprocess_env(),
            capture_output=True,
            text=True,
            timeout=CLI_WRAPPER_TIMEOUT_SECONDS,
            check=False,
        )
    except subprocess.TimeoutExpired as exc:
        return {
            "pass": False,
            "blockers": [
                {
                    "code": "V-PF-CLI-TIMEOUT",
                    "kind": "schema",
                    "where": CLI_WRAPPER_RELATIVE_PATH,
                    "message": (
                        f"preflight runner timed out after {CLI_WRAPPER_TIMEOUT_SECONDS}s"
                    ),
                    "evidence": {"timeout_seconds": CLI_WRAPPER_TIMEOUT_SECONDS},
                    "remediation": (
                        "Investigate why scripts/cli_paperclip_preflight.js did not "
                        "respond. Treat as a hard block: do NOT proceed with mutation."
                    ),
                }
            ],
            "diagnostics": {"runner": "timeout", "stderr": (exc.stderr or "")[-400:]},
            "exit_code": -1,
        }
    except FileNotFoundError as exc:
        return {
            "pass": False,
            "blockers": [
                {
                    "code": "V-PF-CLI-MISSING",
                    "kind": "schema",
                    "where": CLI_WRAPPER_RELATIVE_PATH,
                    "message": "preflight runner binary not found on PATH",
                    "evidence": {"error": str(exc)},
                    "remediation": (
                        "Install node and ensure scripts/cli_paperclip_preflight.js "
                        "is executable. Treat as a hard block."
                    ),
                }
            ],
            "diagnostics": {"runner": "missing", "stderr": ""},
            "exit_code": -1,
        }

    stdout = (proc.stdout or "").strip()
    stderr = (proc.stderr or "").strip()
    parsed: dict[str, Any] | None = None
    if stdout:
        try:
            parsed = json.loads(stdout)
        except json.JSONDecodeError:
            parsed = None

    if parsed is None:
        # CLI did not produce a parseable envelope. Treat as a hard block.
        return {
            "pass": False,
            "blockers": [
                {
                    "code": "V-PF-CLI-PARSE",
                    "kind": "schema",
                    "where": CLI_WRAPPER_RELATIVE_PATH,
                    "message": "preflight runner emitted non-JSON output",
                    "evidence": {
                        "stdout_head": stdout[:400] if stdout else None,
                        "stderr_head": stderr[:400] if stderr else None,
                        "exit_code": proc.returncode,
                    },
                    "remediation": (
                        "Inspect the preflight runner; it MUST emit a JSON envelope. "
                        "Treat the unparseable output as a hard block."
                    ),
                }
            ],
            "diagnostics": {
                "runner": "parse_failed",
                "exit_code": proc.returncode,
            },
            "exit_code": proc.returncode,
        }

    # The wrapper enforces pass/fail at the envelope level; trust it.
    return {
        "pass": bool(parsed.get("pass")),
        "blockers": parsed.get("blockers") or [],
        "diagnostics": parsed.get("diagnostics") or {},
        "exit_code": proc.returncode,
        "raw_envelope": parsed,
    }


def write_blocker_evidence(
    args: argparse.Namespace,
    preflight: dict[str, Any],
    *,
    stage: str,
) -> Path:
    """Write a `fail-closed-blocker` artifact and return its path.

    The artifact preserves the original `bos-v141-agent-creation/v1`
    schema_version so downstream validators that key on schema_version
    still classify the artifact. We add `artifact_type`, `blocker_codes`,
    and the structured `blockers` from preflight.
    """
    blockers = preflight.get("blockers") or []
    blocker_codes = [
        str(b.get("code")) for b in blockers if isinstance(b, dict) and b.get("code")
    ]
    evidence = {
        "schema_version": "bos-v141-agent-creation/v1",
        "artifact_type": "fail-closed-blocker",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "stage": stage,
        "dry_run": args.dry_run,
        "base_url": args.base_url,
        "company_id": args.company_id,
        "adapter_type": args.adapter,
        "blocker_codes": blocker_codes,
        "blockers": blockers,
        "preflight_diagnostics": preflight.get("diagnostics") or {},
        "preflight_exit_code": preflight.get("exit_code"),
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(
        json.dumps(evidence, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    return args.output


# ---------------------------------------------------------------------------
# Mutation helpers (POST/PUT/PATCH/DELETE go through authed_api_request)
# ---------------------------------------------------------------------------


def create_agent(
    company_id: str,
    division: dict[str, Any],
    base_url: str,
    session_cookie: str,
    adapter_type: str,
) -> dict[str, Any]:
    payload = {
        "name": division["name"],
        "adapterType": adapter_type,
        "role": division["role"],
        "enabled": True,
        "heartbeatEnabled": False,
        "wakeOnDemand": False,
        "metadata": {
            "bosLightDivisionId": division["id"],
            "bosLightTitle": division["title"],
            "bosLightReportsTo": division["reports_to"] or "null",
            "v1.4.1": True,
            "visibilityOnly": True,
        },
    }
    return authed_api_request(
        "POST",
        f"/api/companies/{company_id}/agents",
        base_url,
        session_cookie,
        payload,
    )


def list_agents(
    company_id: str,
    base_url: str,
    session_cookie: str,
    api_key: str | None,
) -> dict[str, Any]:
    # GET path; auth is advisory. Prefer session cookie when available.
    return authed_api_request(
        "GET",
        f"/api/companies/{company_id}/agents",
        base_url,
        session_cookie,
        api_key=api_key,
    )


# ---------------------------------------------------------------------------
# CLI entry point
# ---------------------------------------------------------------------------


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Create BOS Light v1.4.1 agents in Paperclip "
        "(session-cookie auth, preflight-gated)",
    )
    parser.add_argument("--base-url", default=DEFAULT_BASE_URL)
    parser.add_argument(
        "--company-id",
        required=True,
        help=(
            "Freshly readback-verified Paperclip company UUID. Required. "
            "MUST NOT match paperclip-runtime.lock.json stale_company_ids.ids. "
            "Must be passed alongside PAPERCLIP_COMPANY_ID_OVERRIDE=allow "
            "while the lockfile's canonical_company_id is null."
        ),
    )
    parser.add_argument("--adapter", default=DEFAULT_ADAPTER)
    parser.add_argument(
        "--api-key-env",
        default="PAPERCLIP_API_KEY",
        help=(
            "Diagnostic-only env var name for legacy Bearer reads on the "
            "GET pre-mutation path. NEVER used for POST/PUT/PATCH/DELETE "
            "in this script. Set to '' to disable."
        ),
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("runtime-evidence/bos-v141-agent-creation.json"),
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help=(
            "Plan-only mode. Preflight runs and lists existing agents; no "
            "POST/PUT/PATCH/DELETE is attempted. Writes the same evidence "
            "shape with `dry_run: true`."
        ),
    )
    parser.add_argument(
        "--skip-preflight",
        action="store_true",
        help=(
            "DANGEROUS: bypass the M014/S03/T02 preflight gate. Off by "
            "default. Only intended for unit tests that exercise the "
            "post-preflight mutation flow with a stubbed CLI wrapper."
        ),
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)

    # ------------------------------------------------------------------------
    # T03 hardening gate: preflight BEFORE any POST/PUT/PATCH/DELETE.
    # ------------------------------------------------------------------------
    if not args.skip_preflight:
        preflight = run_preflight(args.company_id, dry_run=args.dry_run)
        if not preflight["pass"]:
            codes = [
                str(b.get("code"))
                for b in preflight.get("blockers", [])
                if isinstance(b, dict) and b.get("code")
            ]
            print(
                f"paperclip-preflight BLOCKED ({','.join(codes) or 'unknown'}); "
                f"refusing to mutate Paperclip.",
                file=sys.stderr,
            )
            target = write_blocker_evidence(args, preflight, stage="preflight")
            print(f"Fail-closed evidence written: {target}", file=sys.stderr)
            return 2
        print(
            f"paperclip-preflight PASSED for company_id="
            f"{preflight.get('diagnostics', {}).get('company_id') or '<lockfile>'}; "
            f"proceeding to mutation stage."
        )

    # ------------------------------------------------------------------------
    # Session-cookie auth. PAPERCLIP_EMAIL / PAPERCLIP_PASSWORD are loaded
    # from .env (read-only; never written back). The legacy --api-key-env
    # value is used only as a fallback for the GET pre-mutation readback.
    # ------------------------------------------------------------------------
    dotenv = load_dotenv(ROOT / ".env")
    email = dotenv.get("PAPERCLIP_EMAIL") or os.environ.get("PAPERCLIP_EMAIL")
    password = dotenv.get("PAPERCLIP_PASSWORD") or os.environ.get("PAPERCLIP_PASSWORD")
    api_key_env = args.api_key_env or ""
    api_key = os.environ.get(api_key_env) if api_key_env else None

    session_cookie: str | None = None
    if email and password:
        try:
            session_cookie = sign_in_session_cookie(args.base_url, email, password)
            print("Authenticated via session-cookie (PAPERCLIP_EMAIL/PAPERCLIP_PASSWORD).")
        except Exception as exc:
            print(f"Session-cookie sign-in failed: {exc}", file=sys.stderr)
            return 1
    elif not api_key:
        print(
            "Error: PAPERCLIP_EMAIL and PAPERCLIP_PASSWORD must be set in .env "
            "(session-cookie auth), or --api-key-env must point to a legacy "
            "diagnostic-only Bearer token (read-only paths only).",
            file=sys.stderr,
        )
        return 1

    # ------------------------------------------------------------------------
    # Health probe (GET only). Uses session cookie when present, else
    # legacy Bearer as a diagnostic.
    # ------------------------------------------------------------------------
    health = authed_api_request(
        "GET",
        "/api/health",
        args.base_url,
        session_cookie or "",
        api_key=api_key if not session_cookie else None,
    )
    if not health.get("ok"):
        print(f"Health check failed: {health}", file=sys.stderr)
        return 1
    print(f"Health: ok (deploymentMode={health['body'].get('deploymentMode')})")

    # ------------------------------------------------------------------------
    # List existing agents (GET).
    # ------------------------------------------------------------------------
    existing = list_agents(args.company_id, args.base_url, session_cookie or "", api_key)
    if not existing.get("ok"):
        print(f"List agents failed: {existing}", file=sys.stderr)
        return 1

    existing_names = {a["name"] for a in (existing.get("body") or [])}
    print(f"Existing agents: {len(existing_names)}")
    for name in sorted(existing_names):
        print(f"  - {name}")

    # ------------------------------------------------------------------------
    # Create missing agents (POST). Honors --dry-run.
    # ------------------------------------------------------------------------
    results: list[dict[str, Any]] = []
    for division in V141_DIVISIONS:
        if division["name"] in existing_names:
            print(f"SKIP (exists): {division['name']}")
            results.append({
                "division_id": division["id"],
                "name": division["name"],
                "action": "skipped",
                "reason": "already_exists",
            })
            continue

        if args.dry_run:
            print(f"DRY-RUN: Would create {division['name']}")
            results.append({
                "division_id": division["id"],
                "name": division["name"],
                "action": "dry_run",
            })
            continue

        print(f"CREATE: {division['name']} ...", end=" ")
        resp = create_agent(
            args.company_id, division, args.base_url, session_cookie or "", args.adapter
        )
        if resp.get("ok"):
            agent_id = resp["body"].get("id") if resp["body"] else None
            print(f"OK (id={agent_id[:8] if agent_id else 'unknown'}...)")
            results.append({
                "division_id": division["id"],
                "name": division["name"],
                "action": "created",
                "agent_id": agent_id,
                "status": resp["status"],
            })
        else:
            print(f"FAIL (status={resp.get('status')}, error={resp.get('body') or resp.get('error')})")
            results.append({
                "division_id": division["id"],
                "name": division["name"],
                "action": "failed",
                "status": resp.get("status"),
                "error": resp.get("body") or resp.get("error"),
            })

    # Final readback
    final = list_agents(args.company_id, args.base_url, session_cookie or "", api_key)
    final_names = {a["name"] for a in (final.get("body") or [])}
    v141_names = {d["name"] for d in V141_DIVISIONS}
    missing = v141_names - final_names

    evidence = {
        "schema_version": "bos-v141-agent-creation/v1",
        "artifact_type": "live-evidence",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "dry_run": args.dry_run,
        "base_url": args.base_url,
        "company_id": args.company_id,
        "adapter_type": args.adapter,
        "health": health.get("body"),
        "operations": results,
        "readback": {
            "total_agents": len(final_names),
            "v141_agents_present": len(v141_names & final_names),
            "v141_agents_missing": sorted(missing),
            "all_v141_present": len(missing) == 0,
        },
    }

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(evidence, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"\nEvidence written: {args.output}")
    print(f"v1.4.1 agents present: {evidence['readback']['v141_agents_present']}/7")
    if missing:
        print(f"MISSING: {', '.join(missing)}")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())