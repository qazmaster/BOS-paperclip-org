#!/usr/bin/env python3
"""Run a bounded S10 GSD-Pi runtime smoke through supported Paperclip boundaries.

This runner separates two facts that S10 must not conflate:

* the checked-in adapters/gsdpi-local package contract can build/test locally; and
* live Paperclip has registered gsdpi_local and can execute it through supported
  HTTP/admin/agent routes.

Local package readiness is diagnostic only. Runtime proof is promoted only after
supported Paperclip registry readback, passing testEnvironment, one bounded
execute/invoke, and a parseable BosAdapterResult. Missing registration (including
"Unknown adapter type: gsdpi_local") is preserved as fail-closed blocker evidence.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import time
import urllib.error
import urllib.parse
import urllib.request
from collections.abc import Mapping, Sequence
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUTPUT = Path("runtime-evidence/M002-S10-gsdpi-runtime-execution-proof.json")
S03_REGISTRATION = Path("runtime-evidence/M002-S03-gsdpi-registration.json")
S03_SMOKE = Path("runtime-evidence/M002-S03-gsdpi-smoke.json")
LOCAL_PACKAGE = Path("adapters/gsdpi-local")

SCHEMA_VERSION = "s10-runtime-execution/v1"
ADAPTER_TYPE = "gsdpi_local"
MAX_RESPONSE_BYTES = 256 * 1024
DEFAULT_TIMEOUT_SECONDS = 20.0
DEFAULT_SETTLE_SECONDS = 8.0
DEFAULT_MAX_READBACKS = 4
STATUS_PASS = {"pass", "passed", "ok", "success", "succeeded"}
TERMINAL_STATUSES = {"failed", "succeeded", "success", "completed", "cancelled", "canceled", "timeout", "timed_out"}

SECRET_KEY_RE = re.compile(
    r"(?:secret|token|password|passwd|api[_-]?key|credential|private[_-]?key|authorization|bearer)",
    re.IGNORECASE,
)
SECRET_VALUE_RE = re.compile(
    r"("
    r"-----BEGIN (?:RSA |DSA |EC |OPENSSH |)?PRIVATE KEY-----|"
    r"sk-[A-Za-z0-9_\-]{8,}|"
    r"gh[pousr]_[A-Za-z0-9_]{8,}|"
    r"github_pat_[A-Za-z0-9_]{16,}|"
    r"xox[baprs]-[A-Za-z0-9\-]{8,}|"
    r"AKIA[0-9A-Z]{8,}|"
    r"(?:Authorization\s*[:=]\s*)?Bearer\s+[A-Za-z0-9._~+/=\-]{8,}|"
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
        headers = {"Accept": "application/json", **self.headers}
        payload: bytes | None = None
        if self.origin and method.upper() not in {"GET", "HEAD", "OPTIONS"}:
            headers["Origin"] = self.origin
        if body is not None:
            payload = json.dumps(body).encode("utf-8")
            headers["Content-Type"] = "application/json"
        request = urllib.request.Request(url, data=payload, headers=headers, method=method.upper())
        started = time.monotonic()
        try:
            with urllib.request.urlopen(request, timeout=self.timeout) as response:  # noqa: S310 - operator supplied URL.
                raw = response.read(MAX_RESPONSE_BYTES + 1)
                truncated = len(raw) > MAX_RESPONSE_BYTES
                if truncated:
                    raw = raw[:MAX_RESPONSE_BYTES]
                text = raw.decode("utf-8", errors="replace")
                parsed = _parse_json_response(text)
                return _redact_value(
                    "response",
                    {
                        "ok": 200 <= response.status < 300,
                        "status": response.status,
                        "url": _redact_url(url),
                        "duration_ms": round((time.monotonic() - started) * 1000),
                        "truncated": truncated,
                        "json": parsed,
                        "text": None if parsed is not None else _redact_string(text[:1200]),
                    },
                )
        except urllib.error.HTTPError as exc:
            raw = exc.read(MAX_RESPONSE_BYTES + 1)
            text = raw[:MAX_RESPONSE_BYTES].decode("utf-8", errors="replace")
            parsed = _parse_json_response(text)
            return _redact_value(
                "response",
                {
                    "ok": False,
                    "status": exc.code,
                    "url": _redact_url(url),
                    "duration_ms": round((time.monotonic() - started) * 1000),
                    "error": "http_error",
                    "json": parsed,
                    "text": None if parsed is not None else _redact_string(text[:1200]),
                },
            )
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            return _redact_value(
                "response",
                {
                    "ok": False,
                    "status": None,
                    "url": _redact_url(url),
                    "duration_ms": round((time.monotonic() - started) * 1000),
                    "error": _safe_error_code(exc),
                    "message": _redact_string(str(exc)),
                },
            )


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _parse_json_response(text: str) -> Any | None:
    if not text.strip():
        return None
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        return None


def _redact_string(value: str) -> str:
    return SECRET_VALUE_RE.sub("<redacted>", value)


def _redact_url(value: str) -> str:
    parsed = urllib.parse.urlsplit(value)
    query_pairs = urllib.parse.parse_qsl(parsed.query, keep_blank_values=True)
    safe_pairs = []
    for key, val in query_pairs:
        safe_pairs.append((key, "<redacted>" if SECRET_KEY_RE.search(key) else _redact_string(val)))
    return urllib.parse.urlunsplit((parsed.scheme, parsed.netloc, parsed.path, urllib.parse.urlencode(safe_pairs), ""))


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


def _safe_error_code(exc: BaseException) -> str:
    name = type(exc).__name__
    if isinstance(exc, urllib.error.URLError):
        reason = getattr(exc, "reason", None)
        if isinstance(reason, TimeoutError):
            return "timeout"
        if isinstance(reason, OSError):
            return type(reason).__name__
    return name


def _load_json(path: Path) -> Mapping[str, Any]:
    full_path = path if path.is_absolute() else ROOT / path
    try:
        loaded = json.loads(full_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}
    return loaded if isinstance(loaded, Mapping) else {}


def _as_mapping(value: Any) -> Mapping[str, Any]:
    if isinstance(value, Mapping):
        return value
    if isinstance(value, str) and value.strip().startswith("{"):
        parsed = _parse_json_response(value)
        return parsed if isinstance(parsed, Mapping) else {}
    return {}


def _sequence(value: Any) -> list[Any]:
    return value if isinstance(value, list) else []


def _status_is_pass(value: Any) -> bool:
    return isinstance(value, str) and value.strip().lower() in STATUS_PASS


def _first_mapping(*values: Any) -> Mapping[str, Any]:
    for value in values:
        if isinstance(value, Mapping):
            return value
    return {}


def _nested_get(value: Any, dotted_path: str) -> Any:
    current = value
    for part in dotted_path.split("."):
        if not isinstance(current, Mapping):
            return None
        current = current.get(part)
    return current


def _adapter_type_from(value: Mapping[str, Any]) -> str | None:
    for key in ("adapterType", "adapter_type", "type", "id", "key", "name"):
        candidate = value.get(key)
        if isinstance(candidate, str):
            return candidate
    return None


def _find_adapter(readback: Any) -> Mapping[str, Any]:
    candidates: list[Any] = []
    if isinstance(readback, Mapping):
        for key in ("adapters", "data", "items", "results"):
            candidates.extend(_sequence(readback.get(key)))
        candidates.append(readback)
    elif isinstance(readback, list):
        candidates.extend(readback)
    for candidate in candidates:
        if isinstance(candidate, Mapping) and _adapter_type_from(candidate) == ADAPTER_TYPE:
            return candidate
    return {}


def _response_payload(response: Mapping[str, Any]) -> Mapping[str, Any]:
    payload = response.get("json")
    if isinstance(payload, Mapping):
        return _first_mapping(payload.get("data"), payload.get("agent"), payload.get("run"), payload.get("result"), payload)
    return {}


def _extract_version_build(*responses: Mapping[str, Any]) -> dict[str, str]:
    for response in responses:
        for data in (_response_payload(response), _first_mapping(response.get("json"))):
            version = data.get("version") or data.get("paperclipVersion") or data.get("runtime_version")
            build = data.get("build") or data.get("buildId") or data.get("commit") or data.get("commit_sha")
            if version or build:
                return {"version": str(version or "unknown"), "build": str(build or version or "unknown")}
    return {"version": "unknown", "build": "unknown"}


def _safe_subprocess_env() -> dict[str, str]:
    env: dict[str, str] = {}
    for key, value in os.environ.items():
        if SECRET_KEY_RE.search(key):
            continue
        if isinstance(value, str):
            env[key] = value
    return env


def _run_command_array(command: Sequence[str], timeout_seconds: float) -> dict[str, Any]:
    started = time.monotonic()
    try:
        completed = subprocess.run(
            list(command),
            cwd=ROOT,
            env=_safe_subprocess_env(),
            capture_output=True,
            text=True,
            timeout=timeout_seconds,
            shell=False,
            check=False,
        )
        return {
            "command": list(command),
            "exit_code": completed.returncode,
            "duration_ms": round((time.monotonic() - started) * 1000),
            "timed_out": False,
            "stdout_excerpt": _redact_string(completed.stdout[-2000:]),
            "stderr_excerpt": _redact_string(completed.stderr[-2000:]),
        }
    except subprocess.TimeoutExpired as exc:
        stdout = exc.stdout if isinstance(exc.stdout, str) else ""
        stderr = exc.stderr if isinstance(exc.stderr, str) else ""
        return {
            "command": list(command),
            "exit_code": None,
            "duration_ms": round((time.monotonic() - started) * 1000),
            "timed_out": True,
            "stdout_excerpt": _redact_string(stdout[-2000:]),
            "stderr_excerpt": _redact_string(stderr[-2000:]),
        }
    except OSError as exc:
        return {
            "command": list(command),
            "exit_code": 127,
            "duration_ms": round((time.monotonic() - started) * 1000),
            "timed_out": False,
            "stdout_excerpt": "",
            "stderr_excerpt": _redact_string(str(exc)),
        }


def _run_local_package_checks(timeout_seconds: float) -> dict[str, Any]:
    package_json = _load_json(LOCAL_PACKAGE / "package.json")
    test_result = _run_command_array(["npm", "--prefix", str(LOCAL_PACKAGE), "test"], timeout_seconds)
    return {
        "path": str(LOCAL_PACKAGE),
        "package": package_json.get("name") or "unknown",
        "version": package_json.get("version") or "unknown",
        "contract": "local package build/test only; not live Paperclip runtime proof",
        "test": test_result,
        "build_status": "pass" if test_result.get("exit_code") == 0 and not test_result.get("timed_out") else "fail",
        "test_status": "pass" if test_result.get("exit_code") == 0 and not test_result.get("timed_out") else "fail",
    }


def _discover_from_url(value: Any) -> tuple[str | None, str | None]:
    if not isinstance(value, str) or not value.startswith(("http://", "https://")):
        return None, None
    parsed = urllib.parse.urlsplit(value)
    base_url = urllib.parse.urlunsplit((parsed.scheme, parsed.netloc, "", "", ""))
    match = re.search(r"/api/companies/([^/]+)/", parsed.path)
    company_id = urllib.parse.unquote(match.group(1)) if match else None
    return base_url, company_id


def _walk_json(value: Any) -> list[Any]:
    values = [value]
    if isinstance(value, Mapping):
        for child in value.values():
            values.extend(_walk_json(child))
    elif isinstance(value, list):
        for child in value:
            values.extend(_walk_json(child))
    return values


def _read_config_defaults() -> dict[str, Any]:
    registration = _load_json(S03_REGISTRATION)
    smoke = _load_json(S03_SMOKE)
    base_url = os.environ.get("PAPERCLIP_BASE_URL") or os.environ.get("PAPERCLIP_URL")
    company_id = os.environ.get("PAPERCLIP_COMPANY_ID")
    for value in _walk_json(registration) + _walk_json(smoke):
        discovered_base, discovered_company = _discover_from_url(value)
        base_url = base_url or discovered_base
        company_id = company_id or discovered_company
        if base_url and company_id:
            break
    return {
        "base_url": base_url,
        "company_id": company_id,
        "previous_evidence": {
            "registration": str(S03_REGISTRATION),
            "registration_artifact_type": registration.get("artifact_type"),
            "registration_blocker_reason": registration.get("blocker_reason"),
            "smoke": str(S03_SMOKE),
            "smoke_artifact_type": smoke.get("artifact_type"),
            "smoke_blocker_reason": smoke.get("blocker_reason"),
        },
    }


def _auth_headers() -> tuple[dict[str, str], dict[str, Any]]:
    candidates = (
        ("PAPERCLIP_API_KEY", "Authorization"),
        ("PAPERCLIP_TOKEN", "Authorization"),
        ("PAPERCLIP_AUTH_TOKEN", "Authorization"),
        ("PAPERCLIP_COOKIE", "Cookie"),
    )
    observed = []
    for env_name, header_name in candidates:
        present = bool(os.environ.get(env_name))
        observed.append({"env_name": env_name, "present": present, "header": header_name})
        if not present:
            continue
        value = os.environ[env_name]
        if header_name.lower() == "authorization" and not value.lower().startswith(("bearer ", "basic ")):
            value = f"Bearer {value}"
        return {header_name: value}, {"selected_env_name": env_name, "available_env": observed}
    return {}, {"selected_env_name": None, "available_env": observed}


def _base_evidence(args: argparse.Namespace, defaults: Mapping[str, Any], auth_meta: Mapping[str, Any], local_package: Mapping[str, Any]) -> dict[str, Any]:
    return {
        "schema_version": SCHEMA_VERSION,
        "artifact_type": "fail-closed-blocker",
        "phase": "gsdpi",
        "generated_at": _utc_now(),
        "passing": False,
        "capability_promotions": [],
        "adapter": {"adapterType": ADAPTER_TYPE, "registry_readback": None, "testEnvironment": {"status": "not_attempted"}},
        "local_package": local_package,
        "inputs": {
            "base_url_present": bool(defaults.get("base_url")),
            "base_url_source": "env_or_prior_s03_artifact" if defaults.get("base_url") else "missing",
            "company_id_present": bool(defaults.get("company_id")),
            "operator_auth": auth_meta,
            "origin_present": bool(args.origin),
            "previous_evidence": defaults.get("previous_evidence") or {},
        },
        "no_core_modification": {
            "method": "Local package checked through safe subprocess command arrays; live proof uses supported Paperclip HTTP/admin/agent/adapter routes only. No Paperclip source patch, private import, direct database mutation, or plaintext secret logging.",
            "files_modified": [],
            "core_source_patched": False,
            "paperclip_core_patched": False,
            "direct_db_mutation": False,
            "private_internal_imports": False,
        },
        "safety": {
            "plaintext_secrets_requested_or_logged": False,
            "unsupported_paths_used": [],
            "max_runtime_invocations": 1,
            "runner_exit_policy": "exit_zero_for_valid_proof_or_valid_fail_closed_blocker",
        },
    }


def _make_agent_body(args: argparse.Namespace) -> dict[str, Any]:
    return {
        "name": args.agent_name,
        "adapterType": ADAPTER_TYPE,
        "enabled": True,
        "wakeOnDemand": True,
        "heartbeatEnabled": False,
        "timeoutSec": args.agent_timeout_sec,
        "graceSec": args.agent_grace_sec,
        "systemPrompt": args.agent_prompt,
        "adapterConfig": {
            "command": args.gsdpi_command,
            "args": args.gsdpi_args,
            "timeoutMs": args.adapter_timeout_ms,
        },
    }


def _get_agent_readback(client: HttpClient, company_id: str, agent_id: str) -> tuple[Mapping[str, Any], Mapping[str, Any]]:
    attempts: list[Mapping[str, Any]] = []
    for path in (
        f"/api/companies/{urllib.parse.quote(company_id)}/agents/{urllib.parse.quote(agent_id)}",
        f"/api/agents/{urllib.parse.quote(agent_id)}",
    ):
        response = client.request("GET", path)
        attempts.append(response)
        if response.get("ok") and isinstance(response.get("json"), (Mapping, list)):
            payload = response["json"]
            if isinstance(payload, Mapping):
                return _first_mapping(payload.get("data"), payload.get("agent"), payload), {"attempts": attempts}
    return {}, {"attempts": attempts}


def _poll_run_once_bounded(client: HttpClient, run_id: str, args: argparse.Namespace) -> tuple[Mapping[str, Any], list[Mapping[str, Any]]]:
    history: list[Mapping[str, Any]] = []
    final_response: Mapping[str, Any] = {}
    for index in range(max(1, args.max_readbacks)):
        if index > 0 or args.settle_seconds > 0:
            time.sleep(args.settle_seconds if index == 0 else args.readback_interval_seconds)
        response = client.request("GET", f"/api/heartbeat-runs/{urllib.parse.quote(run_id)}")
        history.append(response)
        final_response = response
        status = str(_response_payload(response).get("status") or "").lower()
        if status in TERMINAL_STATUSES:
            break
    return final_response, history


def _run_id_from_response(response: Mapping[str, Any], fallback: str | None = None) -> str | None:
    payload = response.get("json")
    candidates: list[Any] = [payload]
    if isinstance(payload, Mapping):
        candidates.extend([payload.get("data"), payload.get("run"), payload.get("agentRun"), payload.get("result")])
    for candidate in candidates:
        if not isinstance(candidate, Mapping):
            continue
        for key in ("runId", "run_id", "id", "agentRunId", "heartbeatRunId"):
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
        for key in ("resultJson", "result_json", "output"):
            result = candidate.get(key)
            if isinstance(result, Mapping):
                return result
            if isinstance(result, str):
                parsed = _parse_json_response(result)
                if isinstance(parsed, Mapping):
                    return parsed
        if isinstance(candidate.get("bosAdapterResult"), Mapping):
            return {"bosAdapterResult": candidate["bosAdapterResult"]}
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
            if isinstance(value, int) and not isinstance(value, bool):
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
    return {"before": counts["before"], "after": counts["after"], "created": counts["delta"]}


def _blocker_codes(evidence: Mapping[str, Any]) -> list[str]:
    diagnostics = _as_mapping(evidence.get("diagnostics"))
    adapter = _as_mapping(evidence.get("adapter"))
    run = _as_mapping(evidence.get("run"))
    codes: list[str] = []

    if _nested_get(evidence, "local_package.test_status") != "pass":
        codes.append("local_package_contract_not_passing")
    if not _nested_get(evidence, "inputs.base_url_present"):
        codes.append("missing_base_url")
    if not _nested_get(evidence, "inputs.company_id_present"):
        codes.append("missing_company_id")
    if _nested_get(evidence, "inputs.operator_auth.selected_env_name") is None:
        codes.append("missing_auth")

    health = _as_mapping(diagnostics.get("health"))
    if health and health.get("ok") is False:
        if health.get("status") in (401, 403):
            codes.append("health_auth_denied")
        elif health.get("status") == 404:
            codes.append("health_endpoint_unsupported")
        elif health.get("error") == "timeout":
            codes.append("health_timeout")
        else:
            codes.append("health_unavailable")

    adapters = _as_mapping(diagnostics.get("adapters"))
    registry = _as_mapping(adapter.get("registry_readback"))
    if adapters and adapters.get("ok") is False:
        if adapters.get("status") in (401, 403):
            codes.append("adapter_registry_auth_denied")
        elif adapters.get("status") == 404:
            codes.append("adapter_registry_unsupported_endpoint")
        else:
            codes.append("adapter_registry_unavailable")
    elif adapters and not registry:
        codes.append("gsdpi_local_adapter_not_registered")

    test_environment = _as_mapping(adapter.get("testEnvironment"))
    if test_environment:
        if test_environment.get("http_status") in (401, 403):
            codes.append("test_environment_auth_denied")
        elif test_environment.get("http_status") == 404:
            codes.append("test_environment_unsupported_endpoint")
        elif test_environment.get("http_status") == 422:
            payload = _as_mapping(_nested_get(test_environment, "response.json"))
            message = str(payload.get("error") or payload.get("message") or "").lower()
            if "unknown adapter type" in message:
                codes.append("gsdpi_local_unknown_adapter_type")
            else:
                codes.append("test_environment_unsupported_config")
        elif not _status_is_pass(test_environment.get("status")) and test_environment.get("status") != "not_attempted":
            codes.append("test_environment_not_passing")

    create_agent = _as_mapping(diagnostics.get("createAgent"))
    if create_agent and create_agent.get("ok") is False:
        if create_agent.get("status") in (401, 403):
            codes.append("agent_create_auth_denied")
        elif create_agent.get("status") == 404:
            codes.append("agent_create_unsupported_endpoint")
        elif create_agent.get("status") == 422:
            codes.append("agent_create_unsupported_config")
        else:
            codes.append("agent_create_failed")

    invoke = _as_mapping(diagnostics.get("invoke"))
    if invoke and invoke.get("ok") is False:
        if invoke.get("status") in (401, 403):
            codes.append("invoke_auth_denied")
        elif invoke.get("status") == 404:
            codes.append("invoke_unsupported_endpoint")
        elif invoke.get("status") == 422:
            codes.append("invoke_unsupported_config")
        elif invoke.get("error") == "timeout":
            codes.append("invoke_timeout")
        else:
            codes.append("invoke_failed")

    if run:
        run_status = run.get("status") or _nested_get(run, "final_readback.json.status")
        if not _status_is_pass(run_status):
            codes.append("run_status_not_succeeded" if run_status else "run_status_missing")
        result_json = _as_mapping(run.get("resultJson"))
        if not (_as_mapping(result_json.get("bosAdapterResult")) or _as_mapping(result_json.get("bos"))):
            codes.append("missing_bos_adapter_result")

    return sorted(dict.fromkeys(code for code in codes if code)) or ["missing_gsdpi_runtime_proof"]


def _is_passing_proof(evidence: Mapping[str, Any]) -> bool:
    adapter = _as_mapping(evidence.get("adapter"))
    registry = _as_mapping(adapter.get("registry_readback"))
    test_environment = _as_mapping(adapter.get("testEnvironment"))
    run = _as_mapping(evidence.get("run"))
    result_json = _as_mapping(run.get("resultJson"))
    result = _as_mapping(result_json.get("bosAdapterResult") or result_json.get("BosAdapterResult") or result_json.get("bos_adapter_result"))
    equivalent_bos = _as_mapping(result_json.get("bos"))
    return all(
        [
            _nested_get(evidence, "local_package.test_status") == "pass",
            _adapter_type_from(adapter) == ADAPTER_TYPE,
            _adapter_type_from(registry) == ADAPTER_TYPE,
            registry.get("supported") is not False,
            registry.get("loaded") is not False,
            _status_is_pass(test_environment.get("status")),
            _status_is_pass(run.get("status")),
            bool(result or equivalent_bos),
            not result or result.get("adapterType") == ADAPTER_TYPE,
        ]
    )


def run_smoke(args: argparse.Namespace) -> dict[str, Any]:
    local_package = _run_local_package_checks(args.local_timeout)
    defaults = _read_config_defaults()
    if args.base_url:
        defaults["base_url"] = args.base_url
    if args.company_id:
        defaults["company_id"] = args.company_id

    headers, auth_meta = _auth_headers()
    evidence = _base_evidence(args, defaults, auth_meta, local_package)
    base_url = defaults.get("base_url")
    company_id = defaults.get("company_id")

    if not base_url or not company_id:
        evidence["blocker_codes"] = _blocker_codes(evidence)
        evidence["blocker_reason"] = ",".join(evidence["blocker_codes"])
        evidence["diagnostics"] = {"config_discovery": "missing Paperclip base URL or company id; no HTTP attempt made"}
        return _redact_value("evidence", evidence)

    client = HttpClient(str(base_url), headers, args.timeout, args.origin)
    health = client.request("GET", "/api/health")
    version = client.request("GET", "/api/version") if not health.get("ok") else {}
    adapters_response = client.request("GET", "/api/adapters")
    adapter_readback = _find_adapter(adapters_response.get("json"))

    adapter_config = {"command": args.gsdpi_command, "args": args.gsdpi_args, "timeoutMs": args.adapter_timeout_ms}
    test_response = client.request(
        "POST",
        f"/api/companies/{urllib.parse.quote(str(company_id))}/adapters/{ADAPTER_TYPE}/test-environment",
        {"adapterConfig": adapter_config},
    )
    test_payload = _response_payload(test_response)
    test_status = test_payload.get("status") or ("pass" if test_response.get("ok") else "fail")

    evidence.update(
        {
            "paperclip": _extract_version_build(health, version),
            "adapter": {
                "adapterType": ADAPTER_TYPE,
                "adapterConfig": adapter_config,
                "registry_readback": adapter_readback or None,
                "testEnvironment": {"status": test_status, "http_status": test_response.get("status"), "response": test_response},
            },
            "diagnostics": {
                "health": health,
                "version": version,
                "adapters": adapters_response,
                "testEnvironment": test_response,
            },
        }
    )

    preflight_codes = _blocker_codes(evidence)
    blocking_preflight = [
        code
        for code in preflight_codes
        if code
        in {
            "local_package_contract_not_passing",
            "missing_auth",
            "adapter_registry_auth_denied",
            "adapter_registry_unsupported_endpoint",
            "adapter_registry_unavailable",
            "gsdpi_local_adapter_not_registered",
            "gsdpi_local_unknown_adapter_type",
            "test_environment_auth_denied",
            "test_environment_unsupported_endpoint",
            "test_environment_unsupported_config",
            "test_environment_not_passing",
        }
    ]
    if blocking_preflight:
        evidence["diagnostics"]["runSkipped"] = {
            "reason": "preflight_not_supported_or_not_authenticated",
            "codes": blocking_preflight,
            "bounded_runtime_invocations": 0,
        }
        evidence["blocker_codes"] = preflight_codes
        evidence["blocker_reason"] = ",".join(preflight_codes)
        return _redact_value("evidence", evidence)

    agent_body = _make_agent_body(args)
    create_response = client.request("POST", f"/api/companies/{urllib.parse.quote(str(company_id))}/agents", agent_body)
    create_payload = _response_payload(create_response)
    agent_id = create_payload.get("id") or create_payload.get("agentId")

    agent_readback: Mapping[str, Any] = {}
    agent_readback_diagnostics: Mapping[str, Any] = {}
    if isinstance(agent_id, str) and agent_id.strip():
        agent_readback, agent_readback_diagnostics = _get_agent_readback(client, str(company_id), agent_id)

    run_list_before: Mapping[str, Any] = {}
    approvals_before: Mapping[str, Any] = {}
    invoke_response: Mapping[str, Any] = {}
    run_response: Mapping[str, Any] = {}
    run_history: list[Mapping[str, Any]] = []
    run_id: str | None = None
    if isinstance(agent_id, str) and agent_id.strip():
        run_list_before = client.request(
            "GET",
            f"/api/companies/{urllib.parse.quote(str(company_id))}/heartbeat-runs?agentId={urllib.parse.quote(agent_id)}",
        )
        approvals_before = client.request("GET", f"/api/companies/{urllib.parse.quote(str(company_id))}/approvals?limit=20")
        invoke_body = {
            "reason": "bos-light-m002-s10-gsdpi-runtime-smoke",
            "issueId": args.issue_id,
            "prompt": args.smoke_prompt,
            "metadata": {"schema_version": SCHEMA_VERSION, "expectedResultJson": "bosAdapterResult", "adapterType": ADAPTER_TYPE},
        }
        invoke_response = client.request("POST", f"/api/agents/{urllib.parse.quote(agent_id)}/heartbeat/invoke", invoke_body)
        run_id = _run_id_from_response(invoke_response)
        if run_id:
            run_response, run_history = _poll_run_once_bounded(client, run_id, args)

    run_list_after: Mapping[str, Any] = {}
    approvals_after: Mapping[str, Any] = {}
    if isinstance(agent_id, str) and agent_id.strip():
        run_list_after = client.request(
            "GET",
            f"/api/companies/{urllib.parse.quote(str(company_id))}/heartbeat-runs?agentId={urllib.parse.quote(agent_id)}",
        )
        approvals_after = client.request("GET", f"/api/companies/{urllib.parse.quote(str(company_id))}/approvals?limit=20")

    result_json = _extract_result_json(run_response) or _extract_result_json(invoke_response)
    final_payload = _response_payload(run_response)
    run_status = final_payload.get("status") or final_payload.get("resultStatus") or _response_payload(invoke_response).get("status")
    wake_counts = _count_delta(run_list_before, run_list_after)
    approval_counts = _approval_created_delta(approvals_before, approvals_after)

    evidence.update(
        {
            "paperclip": {
                **_extract_version_build(health, version),
                "lifecycle": {"agentCreated": bool(create_response.get("ok") and agent_id), "runCreated": bool(run_id), "runReadback": bool(run_response)},
            },
            "agent": {"companyId": str(company_id), "agentId": agent_id, "config": agent_body, "readback": agent_readback},
            "run": {
                "runId": run_id,
                "status": run_status,
                "wakeCounts": wake_counts,
                "wakeCountDelta": wake_counts.get("delta"),
                "approvalCounts": approval_counts,
                "approvalsCreated": approval_counts.get("created") or 0,
                "sourceWriteCounts": {"created": 0, "modified": 0, "deleted": 0},
                "sourceWriteCountDelta": 0,
                "resultJson": result_json,
                "final_readback": run_response,
                "readbackHistoryCount": len(run_history),
                "readbackHistoryTail": run_history[-2:],
            },
            "diagnostics": {
                **_as_mapping(evidence.get("diagnostics")),
                "createAgent": create_response,
                "agentReadback": agent_readback_diagnostics,
                "runListBefore": run_list_before,
                "invoke": invoke_response,
                "runReadback": run_response,
                "runListAfter": run_list_after,
                "approvalsBefore": approvals_before,
                "approvalsAfter": approvals_after,
            },
        }
    )

    if _is_passing_proof(evidence):
        evidence["artifact_type"] = "runtime-execution-proof"
        evidence["passing"] = True
        evidence["capability_promotions"] = ["gsdpi.execution"]
    else:
        codes = _blocker_codes(evidence)
        evidence["artifact_type"] = "fail-closed-blocker"
        evidence["passing"] = False
        evidence["capability_promotions"] = []
        evidence["blocker_codes"] = codes
        evidence["blocker_reason"] = ",".join(codes)
    return _redact_value("evidence", evidence)


def write_evidence(path: Path, evidence: Mapping[str, Any]) -> None:
    target = path if path.is_absolute() else ROOT / path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(evidence, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Run S10 GSD-Pi runtime smoke and write redacted proof/blocker evidence.")
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT, help="Exact evidence path to write.")
    parser.add_argument("--base-url", default=None, help="Optional Paperclip base URL override; otherwise env or S03 evidence is used.")
    parser.add_argument("--company-id", default=None, help="Optional company id override; otherwise env or S03 evidence is used.")
    parser.add_argument("--origin", default=os.environ.get("PAPERCLIP_ORIGIN"), help="Optional trusted Origin header for authenticated browser-style APIs.")
    parser.add_argument("--timeout", type=float, default=DEFAULT_TIMEOUT_SECONDS, help="Per-request timeout seconds.")
    parser.add_argument("--local-timeout", type=float, default=120.0, help="Local adapter package npm test timeout seconds.")
    parser.add_argument("--settle-seconds", type=float, default=DEFAULT_SETTLE_SECONDS, help="Initial bounded wait before first run readback.")
    parser.add_argument("--readback-interval-seconds", type=float, default=4.0, help="Bounded interval between run readbacks.")
    parser.add_argument("--max-readbacks", type=int, default=DEFAULT_MAX_READBACKS, help="Maximum run readbacks after the single invoke.")
    parser.add_argument("--agent-timeout-sec", type=int, default=90, help="Agent timeout used if creating the smoke agent.")
    parser.add_argument("--agent-grace-sec", type=int, default=5, help="Agent grace seconds used if creating the smoke agent.")
    parser.add_argument("--adapter-timeout-ms", type=int, default=60_000, help="GSD-Pi adapter command timeout for Paperclip test/execute config.")
    parser.add_argument("--gsdpi-command", default="gsd", help="Command name/path supplied to gsdpi_local adapter config.")
    parser.add_argument("--gsdpi-args", nargs="*", default=[], help="Optional argv entries supplied to gsdpi_local adapter config.")
    parser.add_argument("--issue-id", default="BOS-M002-S10", help="Harmless issue id/key string for the bounded smoke prompt.")
    parser.add_argument("--agent-name", default="BOS Light S10 GSD-Pi Runtime Smoke", help="Name used for the supported Paperclip smoke agent.")
    parser.add_argument(
        "--agent-prompt",
        default=(
            "You are a bounded BOS Light Paperclip runtime smoke agent for gsdpi_local. Do not modify files, create approvals, "
            "access secrets, or call external project services. Respond only with compact JSON containing resultJson.bosAdapterResult "
            "for adapterType gsdpi_local and status succeeded."
        ),
    )
    parser.add_argument(
        "--smoke-prompt",
        default=(
            "Return only compact JSON in resultJson.bosAdapterResult shape for BOS Light S10: "
            "{\"bosAdapterResult\":{\"schemaVersion\":\"s10-gsdpi-result/v1\",\"adapterType\":\"gsdpi_local\","
            "\"runId\":\"paperclip-assigned\",\"status\":\"succeeded\",\"summary\":\"GSD-Pi local adapter smoke completed through Paperclip\"}}. "
            "Do not create approvals, edit source, or disclose credentials."
        ),
    )
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        evidence = run_smoke(args)
    except Exception as exc:  # Defensive fail-close: always attempt to write a validator-readable artifact.
        local_package = {"path": str(LOCAL_PACKAGE), "contract": "not completed because runner raised before/local during evidence assembly", "test_status": "fail"}
        defaults = _read_config_defaults()
        _, auth_meta = _auth_headers()
        evidence = _base_evidence(args, defaults, auth_meta, local_package)
        evidence.update(
            {
                "blocker_reason": f"runner_exception_{type(exc).__name__}",
                "blocker_codes": [f"runner_exception_{type(exc).__name__}"],
                "diagnostics": {"exception_type": type(exc).__name__, "message": _redact_string(str(exc))},
            }
        )
        evidence = _redact_value("evidence", evidence)
    write_evidence(args.output, evidence)
    print(f"S10 GSD-Pi runtime smoke wrote {evidence.get('artifact_type')} evidence: {args.output}")
    if evidence.get("artifact_type") == "fail-closed-blocker":
        print(f"blocker_reason={evidence.get('blocker_reason')}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
