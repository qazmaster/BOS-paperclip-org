#!/usr/bin/env python3
"""Create BOS Light v1.4.1 division agents in Paperclip via supported API.

This is a live runtime probe. It creates agents and records readback evidence.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import urllib.request
import urllib.error

DEFAULT_BASE_URL = "https://paperclip.oysana.com"
DEFAULT_COMPANY_ID = "43c74adb-b194-44d1-8f8e-ba142544bb9d"
DEFAULT_ADAPTER = "hermes_local"

V141_DIVISIONS = [
    {
        "id": "Div7.MissionControl",
        "name": "Div7.MissionControl - Mission Control / Strategy",
        "title": "Mission Control / Strategy",
        "role": "researcher",  # closest to strategic oversight
        "reports_to": None,
    },
    {
        "id": "Div1.HCO",
        "name": "Div1.HCO - Head Communication Office",
        "title": "Head Communication Office",
        "role": "general",  # routing/coordination role
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
        "role": "security",  # DMZ/external boundary role
        "reports_to": "Div1.HCO",
    },
]


def api_request(
    method: str,
    path: str,
    base_url: str,
    api_key: str,
    payload: dict[str, Any] | None = None,
) -> dict[str, Any]:
    url = f"{base_url}{path}"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "Origin": base_url,
    }
    data = json.dumps(payload).encode("utf-8") if payload else None
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
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


def create_agent(
    company_id: str,
    division: dict[str, Any],
    base_url: str,
    api_key: str,
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
    return api_request(
        "POST",
        f"/api/companies/{company_id}/agents",
        base_url,
        api_key,
        payload,
    )


def list_agents(company_id: str, base_url: str, api_key: str) -> dict[str, Any]:
    return api_request(
        "GET",
        f"/api/companies/{company_id}/agents",
        base_url,
        api_key,
    )


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Create BOS Light v1.4.1 agents in Paperclip")
    parser.add_argument("--base-url", default=DEFAULT_BASE_URL)
    parser.add_argument("--company-id", default=DEFAULT_COMPANY_ID)
    parser.add_argument("--adapter", default=DEFAULT_ADAPTER)
    parser.add_argument("--api-key-env", default="PAPERCLIP_API_KEY")
    parser.add_argument("--output", type=Path, default=Path("runtime-evidence/bos-v141-agent-creation.json"))
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args(argv)

    api_key = os.environ.get(args.api_key_env)
    if not api_key:
        print(f"Error: {args.api_key_env} not set", file=sys.stderr)
        return 1

    # Health check
    health = api_request("GET", "/api/health", args.base_url, api_key)
    if not health.get("ok"):
        print(f"Health check failed: {health}", file=sys.stderr)
        return 1
    print(f"Health: ok (deploymentMode={health['body'].get('deploymentMode')})")

    # List existing agents
    existing = list_agents(args.company_id, args.base_url, api_key)
    if not existing.get("ok"):
        print(f"List agents failed: {existing}", file=sys.stderr)
        return 1

    existing_names = {a["name"] for a in (existing.get("body") or [])}
    print(f"Existing agents: {len(existing_names)}")
    for name in sorted(existing_names):
        print(f"  - {name}")

    # Create missing agents
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
        resp = create_agent(args.company_id, division, args.base_url, api_key, args.adapter)
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
    final = list_agents(args.company_id, args.base_url, api_key)
    final_names = {a["name"] for a in (final.get("body") or [])}
    v141_names = {d["name"] for d in V141_DIVISIONS}
    missing = v141_names - final_names

    evidence = {
        "schema_version": "bos-v141-agent-creation/v1",
        "created_at": datetime.now(timezone.utc).isoformat(),
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
