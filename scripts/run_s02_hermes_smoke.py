#!/usr/bin/env python3
"""Run S02 Hermes BOS smoke probes and write redacted runtime evidence.

This runner only uses Paperclip HTTP surfaces (public/admin or browser-authenticated
API endpoints discovered in S01). It does not inspect Paperclip source, does not
shell out inside Paperclip, does not mutate direct databases, and never persists
secret values. If the environment or smoke flow cannot prove the S02 contract, it
writes a fail-closed blocker artifact instead of simulated success.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Mapping, MutableMapping, Sequence

ROOT = Path(__file__).resolve().parents[1]
OUTPUT_DIR = Path("runtime-evidence")
SCHEMA_VERSION = "s02-hermes-smoke/v1"
ADAPTER_TYPE = "hermes_local"
MAX_RESPONSE_BYTES = 256 * 1024
DEFAULT_TIMEOUT_SECONDS = 20.0

SECRET_KEY_RE = re.compile(
    r"(?:secret|token|password|passwd|api[_-]?key|credential|private[_-]?key|authorization|bearer)",
    re.IGNORECASE,
)
SECRET_VALUE_RE = re.compile(
    r"("
    r"sk-[A-Za-z0-9_\-]{8,}|"
    r"gh[pousr]_[A-Za-z0-9_]{8,}|"
    r"xox[baprs]-[A-Za-z0-9\-]{8,}|"
    r"AKIA[0-9A-Z]{8,}|"
    r"(?:Bearer\s+)[A-Za-z0-9._\-]{8,}|"
    r"[A-Za-z_][A-Za-z0-9_]*(?:TOKEN|SECRET|PASSWORD|API_KEY)=[^\s\"']+"
    r")",
    re.IGNORECASE,
)


class HttpClient:
    def __init__(self, base_url: str, headers: Mapping[str, str], timeout: float, origin: str | None = None) -> None:
        self.base_url = base_url.rstrip("/")
        self.headers = dict(headers)
        self.timeout = timeout
        self.origin = origin.rstrip("/") if origin else None

    def request(self, method: str, path: str, body: Mapping[str, Any] | None = None) -> dict[str, Any]:
        url = urllib.parse.urljoin(f"{self.base_url}/", path.lstrip("/"))
        payload: bytes | None = None
        headers = {"Accept": "application/json", **self.headers}
        if self.origin and method.upper() not in {"GET", "HEAD", "OPTIONS"}:
            headers["Origin"] = self.origin
        if body is not None:
            payload = json.dumps(body).encode("utf-8")
            headers["Content-Type"] = "application/json"
        request = urllib.request.Request(url, data=payload, headers=headers, method=method.upper())
        started = time.monotonic()
        try:
            with urllib.request.urlopen(request, timeout=self.timeout) as response:  # noqa: S310 - operator supplied base URL
                raw = response.read(MAX_RESPONSE_BYTES + 1)
                truncated = len(raw) > MAX_RESPONSE_BYTES
                if truncated:
                    raw = raw[:MAX_RESPONSE_BYTES]
                text = raw.decode("utf-8", errors="replace")
                parsed = _parse_json_response(text)
                return {
                    "ok": 200 <= response.status < 300,
                    "status": response.status,
                    "url": _redact_string(url),
                    "duration_ms": round((time.monotonic() - started) * 1000),
                    "truncated": truncated,
                    "json": parsed,
                    "text": None if parsed is not None else _redact_string(text[:1200]),
                }
        except urllib.error.HTTPError as exc:
            raw = exc.read(MAX_RESPONSE_BYTES + 1)
            text = raw[:MAX_RESPONSE_BYTES].decode("utf-8", errors="replace")
            parsed = _parse_json_response(text)
            return {
                "ok": False,
                "status": exc.code,
                "url": _redact_string(url),
                "duration_ms": round((time.monotonic() - started) * 1000),
                "error": "http_error",
                "json": parsed,
                "text": None if parsed is not None else _redact_string(text[:1200]),
            }
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            return {
                "ok": False,
                "status": None,
                "url": _redact_string(url),
                "duration_ms": round((time.monotonic() - started) * 1000),
                "error": type(exc).__name__,
                "message": _redact_string(str(exc)),
            }


def _parse_json_response(text: str) -> Any | None:
    if not text.strip():
        return None
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        return None


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _redact_string(value: str) -> str:
    return SECRET_VALUE_RE.sub("<redacted>", value)


def _redact_value(key: str, value: Any) -> Any:
    if SECRET_KEY_RE.search(key):
        if isinstance(value, bool) or value is None:
            return value
        return "<redacted>"
    if isinstance(value, str):
        return _redact_string(value)
    if isinstance(value, Mapping):
        return {str(child_key): _redact_value(str(child_key), child_value) for child_key, child_value in value.items()}
    if isinstance(value, list):
        return [_redact_value(key, item) for item in value]
    return value


def _headers_from_env(env_name: str | None, header_name: str) -> dict[str, str]:
    if not env_name:
        return {}
    value = os.environ.get(env_name)
    if not value:
        return {}
    if header_name.lower() == "authorization" and not value.lower().startswith(("bearer ", "basic ")):
        value = f"Bearer {value}"
    return {header_name: value}


def _first_mapping(*values: Any) -> Mapping[str, Any]:
    for value in values:
        if isinstance(value, Mapping):
            return value
    return {}


def _sequence(value: Any) -> list[Any]:
    return value if isinstance(value, list) else []


def _find_adapter(readback: Any) -> Mapping[str, Any]:
    candidates: list[Any] = []
    if isinstance(readback, Mapping):
        for key in ("adapters", "data", "items", "results"):
            candidates.extend(_sequence(readback.get(key)))
        candidates.append(readback)
    elif isinstance(readback, list):
        candidates.extend(readback)
    for candidate in candidates:
        if not isinstance(candidate, Mapping):
            continue
        text_values = {str(candidate.get(key, "")) for key in ("adapterType", "adapter_type", "type", "id", "key", "name")}
        if ADAPTER_TYPE in text_values:
            return candidate
    return {}


def _status_is_pass(value: Any) -> bool:
    return isinstance(value, str) and value.lower() in {"pass", "passed", "ok", "success", "succeeded"}


def _extract_version_build(*responses: Mapping[str, Any]) -> dict[str, str]:
    for response in responses:
        payload = response.get("json")
        for data in (payload, _first_mapping(payload).get("data") if isinstance(payload, Mapping) else None):
            if not isinstance(data, Mapping):
                continue
            version = data.get("version") or data.get("paperclipVersion") or data.get("runtime_version")
            build = data.get("build") or data.get("buildId") or data.get("commit") or data.get("commit_sha")
            if version or build:
                return {
                    "version": str(version or "unknown"),
                    "build": str(build or "unknown"),
                }
    return {"version": "unknown", "build": "unknown"}


def _run_id_from_response(response: Mapping[str, Any], fallback: str | None = None) -> str | None:
    payload = response.get("json")
    candidates: list[Any] = [payload]
    if isinstance(payload, Mapping):
        candidates.extend([payload.get("data"), payload.get("run"), payload.get("agentRun"), payload.get("result")])
    for candidate in candidates:
        if not isinstance(candidate, Mapping):
            continue
        for key in ("runId", "run_id", "id", "agentRunId"):
            value = candidate.get(key)
            if isinstance(value, str) and value.strip():
                return value
    return fallback


def _extract_result_json(response: Mapping[str, Any]) -> Mapping[str, Any]:
    payload = response.get("json")
    candidates: list[Any] = [payload]
    if isinstance(payload, Mapping):
        candidates.extend([payload.get("data"), payload.get("run"), payload.get("agentRun"), payload.get("result")])
    for candidate in candidates:
        if not isinstance(candidate, Mapping):
            continue
        result = candidate.get("resultJson") or candidate.get("result_json") or candidate.get("output")
        if isinstance(result, str):
            parsed = _parse_json_response(result)
            if isinstance(parsed, Mapping):
                return parsed
        if isinstance(result, Mapping):
            return result
        if isinstance(candidate.get("bos"), Mapping):
            return {"bos": candidate["bos"]}
    return {}


def _count_items(response: Mapping[str, Any]) -> int | None:
    payload = response.get("json")
    if isinstance(payload, list):
        return len(payload)
    if isinstance(payload, Mapping):
        for key in ("total", "count", "totalCount"):
            value = payload.get(key)
            if isinstance(value, int):
                return value
        for key in ("data", "items", "results", "runs", "approvals"):
            value = payload.get(key)
            if isinstance(value, list):
                return len(value)
    return None


def _count_delta(before_response: Mapping[str, Any], after_response: Mapping[str, Any]) -> dict[str, int | None]:
    before = _count_items(before_response)
    after = _count_items(after_response)
    delta = after - before if before is not None and after is not None else None
    return {"before": before, "after": after, "delta": delta}


def _approval_created_delta(before_response: Mapping[str, Any], after_response: Mapping[str, Any]) -> dict[str, int | None]:
    counts = _count_delta(before_response, after_response)
    counts["created"] = counts.pop("delta")
    return counts


def _base_evidence(args: argparse.Namespace) -> dict[str, Any]:
    return {
        "schema_version": SCHEMA_VERSION,
        "phase": args.phase,
        "generated_at": _utc_now(),
        "inputs": {
            "base_url": _redact_string(args.base_url.rstrip("/")),
            "companyId": args.company_id,
            "agentId": args.agent_id,
            "runId": args.run_id,
            "issueId": args.issue_id,
            "auth_token_env": args.auth_token_env or "not-provided",
            "auth_header_name": args.auth_header_name,
            "trusted_origin": _redact_string(args.origin.rstrip("/")) if args.origin else "not-provided",
            "adapter_env_keys": sorted(args.adapter_env_from_env or []),
            "adapter_secret_ref_keys": sorted(_secret_ref_key(item) for item in (args.adapter_secret_ref or [])),
        },
        "no_core_modification": {
            "method": "Supported Paperclip HTTP API/browser-authenticated endpoints only; no source patch, subprocess, or direct DB write.",
            "files_modified": [],
            "core_source_patched": False,
            "direct_db_mutation": False,
        },
    }


def _secret_ref_key(raw: str) -> str:
    return raw.split("=", 1)[0].strip()


def _adapter_secret_refs(raw_refs: Sequence[str]) -> dict[str, dict[str, str]]:
    refs: dict[str, dict[str, str]] = {}
    for raw in raw_refs:
        if "=" not in raw:
            raise ValueError(f"adapter secret ref must be ENV=SECRET_ID, got {raw!r}")
        key, secret_id = raw.split("=", 1)
        key = key.strip()
        secret_id = secret_id.strip()
        if not key or not secret_id:
            raise ValueError(f"adapter secret ref must be ENV=SECRET_ID, got {raw!r}")
        refs[key] = {"type": "secret_ref", "secretId": secret_id, "version": "latest"}
    return refs


def _adapter_env(args: argparse.Namespace) -> dict[str, Any]:
    adapter_env: dict[str, Any] = {
        env_name: os.environ[env_name]
        for env_name in args.adapter_env_from_env
        if env_name in os.environ and os.environ[env_name]
    }
    adapter_env.update(_adapter_secret_refs(args.adapter_secret_ref or []))
    return adapter_env


def run_environment_phase(client: HttpClient, args: argparse.Namespace) -> dict[str, Any]:
    evidence = _base_evidence(args)
    health = client.request("GET", "/api/health")
    version = client.request("GET", "/api/version") if not health.get("ok") else {}
    adapters_response = client.request("GET", "/api/adapters")
    adapter_readback = _find_adapter(adapters_response.get("json"))
    adapter_env = _adapter_env(args)
    test_body: dict[str, Any] = {}
    if adapter_env:
        test_body["adapterConfig"] = {"env": adapter_env}
    test_environment = client.request(
        "POST",
        f"/api/companies/{urllib.parse.quote(args.company_id)}/adapters/{ADAPTER_TYPE}/test-environment",
        test_body,
    )
    test_payload = _first_mapping(test_environment.get("json"), _first_mapping(test_environment.get("json")).get("data"))
    test_status = test_payload.get("status") or ("pass" if test_environment.get("ok") else "fail")

    evidence.update(
        {
            "paperclip": _extract_version_build(health, version),
            "adapter": {
                "adapterType": ADAPTER_TYPE,
                "registry_readback": adapter_readback,
                "testEnvironment": {"status": test_status, "response": test_environment},
            },
            "diagnostics": {
                "health": health,
                "version": version,
                "adapters": adapters_response,
            },
        }
    )

    if adapters_response.get("ok") and adapter_readback and _status_is_pass(test_status):
        evidence["artifact_type"] = "smoke-evidence"
    else:
        evidence["artifact_type"] = "fail-closed-blocker"
        evidence["blocker_reason"] = _environment_blocker_reason(adapters_response, adapter_readback, test_environment, test_status)
    return _redact_value("evidence", evidence)


def _environment_blocker_reason(
    adapters_response: Mapping[str, Any],
    adapter_readback: Mapping[str, Any],
    test_environment: Mapping[str, Any],
    test_status: Any,
) -> str:
    if not adapters_response.get("ok"):
        return "adapter_registry_unavailable"
    if not adapter_readback:
        return "hermes_local_adapter_not_registered"
    if not _status_is_pass(test_status):
        payload = _first_mapping(test_environment.get("json"), _first_mapping(test_environment.get("json")).get("data"))
        check_codes = {
            str(check.get("code"))
            for check in _sequence(payload.get("checks"))
            if isinstance(check, Mapping) and check.get("code")
        }
        if {"hermes_cli_not_found", "hermes_no_api_keys"} & check_codes:
            return "hermes_cli_or_auth_unavailable"
        code = payload.get("code") or payload.get("reason") or payload.get("error")
        return str(code or "hermes_test_environment_failed")
    return "unknown_environment_blocker"


def _get_agent_readback(client: HttpClient, company_id: str, agent_id: str) -> Mapping[str, Any]:
    for path in (
        f"/api/companies/{urllib.parse.quote(company_id)}/agents/{urllib.parse.quote(agent_id)}",
        f"/api/agents/{urllib.parse.quote(agent_id)}",
    ):
        response = client.request("GET", path)
        if response.get("ok") and isinstance(response.get("json"), (Mapping, list)):
            payload = response["json"]
            if isinstance(payload, Mapping):
                return _first_mapping(payload.get("data"), payload.get("agent"), payload)
    return {}


def _maybe_create_agent(client: HttpClient, args: argparse.Namespace) -> tuple[str | None, Mapping[str, Any], Mapping[str, Any]]:
    if not args.create_agent:
        return args.agent_id, {}, {}
    adapter_env = _adapter_env(args)
    body = {
        "name": args.agent_name,
        "adapterType": ADAPTER_TYPE,
        "enabled": True,
        "wakeOnDemand": True,
        "heartbeatEnabled": False,
        "timeoutSec": args.timeout_sec,
        "graceSec": args.grace_sec,
        "systemPrompt": args.agent_prompt,
    }
    if adapter_env:
        body["adapterConfig"] = {"env": adapter_env}
    response = client.request("POST", f"/api/companies/{urllib.parse.quote(args.company_id)}/agents", body)
    payload = _first_mapping(response.get("json"), _first_mapping(response.get("json")).get("data"), _first_mapping(response.get("json")).get("agent"))
    agent_id = payload.get("id") or payload.get("agentId") or args.agent_id
    return str(agent_id) if agent_id else None, body, response


def run_agent_smoke_phase(client: HttpClient, args: argparse.Namespace) -> dict[str, Any]:
    evidence = _base_evidence(args)
    env_args = argparse.Namespace(**{**vars(args), "phase": "environment"})
    environment = run_environment_phase(client, env_args)

    agent_id, created_config, create_response = _maybe_create_agent(client, args)
    if not agent_id:
        evidence.update(
            {
                "artifact_type": "fail-closed-blocker",
                "blocker_reason": "agent_id_missing",
                "adapter": environment.get("adapter", {"adapterType": ADAPTER_TYPE}),
                "diagnostics": {"environment": environment, "createAgent": create_response},
            }
        )
        return _redact_value("evidence", evidence)

    agent_readback = _get_agent_readback(client, args.company_id, agent_id)
    run_list_before = client.request(
        "GET",
        f"/api/companies/{urllib.parse.quote(args.company_id)}/heartbeat-runs?agentId={urllib.parse.quote(agent_id)}",
    )
    approvals_before = client.request("GET", f"/api/companies/{urllib.parse.quote(args.company_id)}/approvals?limit=20")
    invoke_body = {
        "reason": "bos-light-s02-hermes-smoke",
        "issueId": args.issue_id,
        "prompt": args.smoke_prompt,
        "metadata": {"schema_version": SCHEMA_VERSION, "expectedResultJson": "bos"},
    }
    invoke_response = client.request("POST", f"/api/agents/{urllib.parse.quote(agent_id)}/heartbeat/invoke", invoke_body)
    run_id = args.run_id or _run_id_from_response(invoke_response)

    run_response: Mapping[str, Any] = {}
    if run_id and args.readback_delay_sec > 0:
        time.sleep(args.readback_delay_sec)
    if run_id:
        run_response = client.request("GET", f"/api/heartbeat-runs/{urllib.parse.quote(run_id)}")
    run_list_after = client.request(
        "GET",
        f"/api/companies/{urllib.parse.quote(args.company_id)}/heartbeat-runs?agentId={urllib.parse.quote(agent_id)}",
    )
    approvals_after = client.request("GET", f"/api/companies/{urllib.parse.quote(args.company_id)}/approvals?limit=20")

    result_json = _extract_result_json(run_response) or _extract_result_json(invoke_response)
    if isinstance(result_json, Mapping) and not result_json.get("bos") and isinstance(result_json.get("result"), str):
        parsed_result = _parse_json_response(str(result_json["result"]))
        if isinstance(parsed_result, Mapping):
            result_json = parsed_result
    wake_counts = _count_delta(run_list_before, run_list_after)
    approval_counts = _approval_created_delta(approvals_before, approvals_after)
    adapter = _first_mapping(environment.get("adapter"))

    evidence.update(
        {
            "paperclip": environment.get("paperclip", {"version": "unknown", "build": "unknown"}),
            "adapter": adapter or {"adapterType": ADAPTER_TYPE},
            "agent": {
                "companyId": args.company_id,
                "agentId": agent_id,
                "config": created_config or {"adapterType": ADAPTER_TYPE, "agentId": agent_id},
                "readback": agent_readback,
            },
            "run": {
                "runId": run_id,
                "wakeCounts": wake_counts,
                "approvalCounts": approval_counts,
                "resultJson": result_json,
            },
            "diagnostics": {
                "environment": environment,
                "createAgent": create_response,
                "runListBefore": run_list_before,
                "invoke": invoke_response,
                "runReadback": run_response,
                "runListAfter": run_list_after,
                "approvalsBefore": approvals_before,
                "approvalsAfter": approvals_after,
            },
        }
    )

    blockers = []
    if environment.get("artifact_type") != "smoke-evidence":
        blockers.append(str(environment.get("blocker_reason") or "environment_not_passing"))
    if _first_adapter_type(agent_readback) != ADAPTER_TYPE:
        blockers.append("agent_readback_not_hermes_local")
    if not result_json.get("bos") if isinstance(result_json, Mapping) else True:
        blockers.append("missing_result_json_bos")
    if wake_counts.get("delta") != 1:
        blockers.append("wake_count_not_exactly_one")
    if approval_counts.get("created") != 0:
        blockers.append("approval_count_not_zero")

    if blockers:
        evidence["artifact_type"] = "fail-closed-blocker"
        evidence["blocker_reason"] = ",".join(blockers)
    else:
        evidence["artifact_type"] = "smoke-evidence"
    return _redact_value("evidence", evidence)


def _first_adapter_type(value: Mapping[str, Any]) -> str | None:
    for key in ("adapterType", "adapter_type", "type"):
        candidate = value.get(key)
        if isinstance(candidate, str):
            return candidate
    return None


def write_evidence(root: Path, output_dir: Path, evidence: Mapping[str, Any]) -> Path:
    phase = str(evidence.get("phase") or "unknown")
    artifact_type = str(evidence.get("artifact_type") or "artifact")
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    target_dir = output_dir if output_dir.is_absolute() else root / output_dir
    target_dir.mkdir(parents=True, exist_ok=True)
    target = target_dir / f"s02-hermes-{phase}-{artifact_type}-{timestamp}.json"
    target.write_text(json.dumps(evidence, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return target


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Run S02 Hermes BOS smoke probes and write redacted runtime evidence.")
    parser.add_argument("--phase", choices=("environment", "agent-smoke"), required=True)
    parser.add_argument("--base-url", required=True, help="Paperclip base URL, e.g. http://127.0.0.1:3000.")
    parser.add_argument("--company-id", required=True, help="Paperclip company id for adapter testEnvironment and smoke run.")
    parser.add_argument("--agent-id", default=None, help="Existing Paperclip agent id for agent-smoke phase.")
    parser.add_argument("--run-id", default=None, help="Optional known run id to read after invoking or instead of response-discovered id.")
    parser.add_argument("--issue-id", default="BOS-2", help="Harmless sandbox issue id/key for the smoke prompt.")
    parser.add_argument("--output-dir", type=Path, default=OUTPUT_DIR, help="Evidence output directory, default runtime-evidence/.")
    parser.add_argument("--auth-token-env", default="PAPERCLIP_API_KEY", help="Environment variable containing API token; value is never written.")
    parser.add_argument("--auth-header-name", default="Authorization", help="HTTP header for the auth token env value.")
    parser.add_argument("--origin", default=None, help="Trusted browser Origin header for cookie-authenticated mutating API calls; value is redacted in evidence like any URL.")
    parser.add_argument(
        "--adapter-env-from-env",
        action="append",
        default=[],
        help="Name of an environment variable to pass into adapterConfig.env for testEnvironment; may be repeated and values are redacted from evidence.",
    )
    parser.add_argument(
        "--adapter-secret-ref",
        action="append",
        default=[],
        help="Adapter env binding in ENV=SECRET_ID form; sends a Paperclip secret_ref instead of an inline value and may be repeated.",
    )
    parser.add_argument("--timeout", type=float, default=DEFAULT_TIMEOUT_SECONDS, help="HTTP request timeout in seconds.")
    parser.add_argument("--create-agent", action="store_true", help="Create a fresh hermes_local smoke agent before invoking.")
    parser.add_argument("--agent-name", default="BOS Light S02 Hermes Smoke", help="Name used with --create-agent.")
    parser.add_argument("--agent-prompt", default="You are a BOS Light smoke agent. Return only JSON with resultJson.bos.")
    parser.add_argument("--smoke-prompt", default="Summarize issue BOS-2 in one sentence and return resultJson.bos with schemaVersion 1.0. Do not create approvals or modify source.")
    parser.add_argument("--timeout-sec", type=int, default=60, help="Agent runtime timeout when creating a smoke agent.")
    parser.add_argument("--grace-sec", type=int, default=5, help="Agent runtime grace period when creating a smoke agent.")
    parser.add_argument(
        "--readback-delay-sec",
        type=float,
        default=0.0,
        help="Single bounded settle delay before one heartbeat-run readback; this is not a polling loop.",
    )
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    headers = _headers_from_env(args.auth_token_env, args.auth_header_name)
    client = HttpClient(args.base_url, headers, args.timeout, args.origin)
    try:
        if args.phase == "environment":
            evidence = run_environment_phase(client, args)
        else:
            evidence = run_agent_smoke_phase(client, args)
        target = write_evidence(ROOT, args.output_dir, evidence)
    except Exception as exc:  # defensive: still produce a bounded blocker artifact when possible
        evidence = _redact_value(
            "evidence",
            {
                "schema_version": SCHEMA_VERSION,
                "artifact_type": "fail-closed-blocker",
                "phase": args.phase,
                "generated_at": _utc_now(),
                "blocker_reason": f"runner_exception:{type(exc).__name__}",
                "diagnostics": {"message": str(exc)},
                "inputs": {"base_url": args.base_url, "companyId": args.company_id, "agentId": args.agent_id},
            },
        )
        target = write_evidence(ROOT, args.output_dir, evidence)
        print(f"S02 Hermes smoke wrote blocker evidence: {target}", file=sys.stderr)
        return 1

    print(f"S02 Hermes smoke wrote {evidence.get('artifact_type')} evidence: {target}")
    return 0 if evidence.get("artifact_type") == "smoke-evidence" else 2


if __name__ == "__main__":
    raise SystemExit(main())
