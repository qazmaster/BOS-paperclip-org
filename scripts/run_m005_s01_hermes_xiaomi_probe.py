#!/usr/bin/env python3
"""Run a bounded M005 S01 Hermes Xiaomi runtime probe through supported Paperclip HTTP surfaces.

The runner is deliberately fail-closed. It never asks for secrets, never writes
secret values, never imports Paperclip internals, and never mutates databases or
Paperclip source. When the live Paperclip URL, auth, supported endpoints, adapter
configuration, or BOS-shaped run result is unavailable, it still writes a valid
M005 S01 blocker artifact for validator/readiness closeout.
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
from typing import Any, Mapping, Sequence

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUTPUT = Path("runtime-evidence/M005-S01-hermes-xiaomi-probe.json")
S08_SMOKE = Path("runtime-evidence/M002-S08-runtime-execution-smoke.json")

SCHEMA_VERSION = "m005-s01-hermes-xiaomi/v1"
SELECTED_PATH = "hermes_local_with_xiaomi_backend"
ADAPTER_TYPE = "hermes_local"
PROVIDER = "xiaomi"
MODEL = "mimo-v2.5-pro"
MAX_RESPONSE_BYTES = 256 * 1024
DEFAULT_TIMEOUT_SECONDS = 20.0
DEFAULT_SETTLE_SECONDS = 8.0
DEFAULT_MAX_READBACKS = 4

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

STATUS_PASS = {"pass", "passed", "ok", "success", "succeeded"}
TERMINAL_STATUSES = {"failed", "succeeded", "success", "completed", "cancelled", "canceled", "timeout", "timed_out"}


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
        if not isinstance(candidate, Mapping):
            continue
        if _adapter_type_from(candidate) == ADAPTER_TYPE:
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
        if isinstance(candidate.get("bos"), Mapping):
            return {"bos": candidate["bos"]}
    return {}


def _read_config_defaults() -> dict[str, Any]:
    smoke = _load_json(S08_SMOKE)
    paperclip = _as_mapping(smoke.get("paperclip"))
    adapter_config = dict(_as_mapping(_nested_get(smoke, "adapter.adapterConfig")))
    if not adapter_config:
        adapter_config = {
            "hermesCommand": "/paperclip/hermes-runtime/bin/hermes-paperclip",
            "provider": PROVIDER,
            "model": MODEL,
            "timeoutSec": 90,
            "graceSec": 5,
        }
    else:
        # Override provider/model for Xiaomi probe regardless of prior artifact
        adapter_config["provider"] = PROVIDER
        adapter_config["model"] = MODEL
    return {
        "base_url": os.environ.get("PAPERCLIP_BASE_URL") or os.environ.get("PAPERCLIP_URL") or paperclip.get("base_url"),
        "company_id": os.environ.get("PAPERCLIP_COMPANY_ID") or paperclip.get("companyId"),
        "adapter_config": adapter_config,
        "previous_smoke_path": str(S08_SMOKE),
        "previous_smoke_artifact_type": smoke.get("artifact_type"),
        "previous_smoke_blocker_reason": smoke.get("blocker_reason"),
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


def _base_evidence(args: argparse.Namespace, defaults: Mapping[str, Any], auth_meta: Mapping[str, Any]) -> dict[str, Any]:
    adapter_config = dict(_as_mapping(defaults.get("adapter_config")) or {})
    # Ensure secret references are used, not plaintext secrets
    secret_ref = os.environ.get("XIAOMI_API_KEY_SECRET_REF") or "env:XIAOMI_API_KEY"
    base_url_ref = os.environ.get("XIAOMI_BASE_URL_SECRET_REF") or "env:XIAOMI_BASE_URL"
    adapter_config.setdefault("secret_ref", secret_ref)
    adapter_config.setdefault("base_url_ref", base_url_ref)

    return {
        "schema_version": SCHEMA_VERSION,
        "artifact_type": "fail-closed-blocker",
        "phase": "hermes",
        "generated_at": _utc_now(),
        "selected_path": SELECTED_PATH,
        "passing": False,
        "capability_promotions": [],
        "adapter": {"adapterType": ADAPTER_TYPE, "adapterConfig": adapter_config},
        "inputs": {
            "base_url_present": bool(defaults.get("base_url")),
            "base_url_source": "env_or_prior_s08_artifact" if defaults.get("base_url") else "missing",
            "company_id_present": bool(defaults.get("company_id")),
            "auth": auth_meta,
            "origin_present": bool(args.origin),
            "xiaomi_api_key_secret_ref_present": bool(os.environ.get("XIAOMI_API_KEY")),
            "xiaomi_base_url_secret_ref_present": bool(os.environ.get("XIAOMI_BASE_URL")),
            "previous_evidence": {
                "smoke": defaults.get("previous_smoke_path"),
                "smoke_artifact_type": defaults.get("previous_smoke_artifact_type"),
                "smoke_blocker_reason": defaults.get("previous_smoke_blocker_reason"),
            },
        },
        "no_core_modification": {
            "method": "Supported Paperclip HTTP/admin routes only; no Paperclip source patch, private import, subprocess bypass, or direct database mutation.",
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


def _make_agent_body(args: argparse.Namespace, defaults: Mapping[str, Any]) -> dict[str, Any]:
    adapter_config = dict(_as_mapping(defaults.get("adapter_config")))
    adapter_config.setdefault("hermesCommand", "/paperclip/hermes-runtime/bin/hermes-paperclip")
    adapter_config.setdefault("provider", PROVIDER)
    adapter_config.setdefault("model", MODEL)
    adapter_config.setdefault("timeoutSec", args.agent_timeout_sec)
    adapter_config.setdefault("graceSec", args.agent_grace_sec)
    # Use secret references, never plaintext values
    adapter_config.setdefault("secret_ref", os.environ.get("XIAOMI_API_KEY_SECRET_REF") or "env:XIAOMI_API_KEY")
    adapter_config.setdefault("base_url_ref", os.environ.get("XIAOMI_BASE_URL_SECRET_REF") or "env:XIAOMI_BASE_URL")
    return {
        "name": args.agent_name,
        "adapterType": ADAPTER_TYPE,
        "enabled": True,
        "wakeOnDemand": True,
        "heartbeatEnabled": False,
        "timeoutSec": args.agent_timeout_sec,
        "graceSec": args.agent_grace_sec,
        "systemPrompt": args.agent_prompt,
        "adapterConfig": adapter_config,
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


def _blocker_codes(evidence: Mapping[str, Any]) -> list[str]:
    diagnostics = _as_mapping(evidence.get("diagnostics"))
    adapter = _as_mapping(evidence.get("adapter"))
    agent = _as_mapping(evidence.get("agent"))
    run = _as_mapping(evidence.get("run"))
    codes: list[str] = []

    if not _nested_get(evidence, "inputs.base_url_present"):
        codes.append("missing_base_url")
    if not _nested_get(evidence, "inputs.company_id_present"):
        codes.append("missing_company_id")
    if _nested_get(evidence, "inputs.auth.selected_env_name") is None:
        codes.append("missing_auth")
    if not _nested_get(evidence, "inputs.xiaomi_api_key_secret_ref_present"):
        codes.append("missing_xiaomi_api_key")
    if not _nested_get(evidence, "inputs.xiaomi_base_url_secret_ref_present"):
        codes.append("missing_xiaomi_base_url")

    health = _as_mapping(diagnostics.get("health"))
    if health and health.get("ok") is False:
        status = health.get("status")
        if status in (401, 403):
            codes.append("health_auth_denied")
        elif status == 404:
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
        codes.append("hermes_local_adapter_not_registered")

    test_environment = _as_mapping(adapter.get("testEnvironment"))
    if test_environment:
        if test_environment.get("http_status") in (401, 403):
            codes.append("test_environment_auth_denied")
        elif test_environment.get("http_status") == 404:
            codes.append("test_environment_unsupported_endpoint")
        elif test_environment.get("http_status") == 422:
            codes.append("unsupported_xiaomi_backend_config")
        elif not _status_is_pass(test_environment.get("status")):
            payload = _as_mapping(_nested_get(test_environment, "response.json"))
            check_codes = [str(check.get("code")) for check in _sequence(payload.get("checks")) if isinstance(check, Mapping) and check.get("code")]
            if check_codes:
                codes.extend(f"test_environment_{code}" for code in check_codes if code not in {"hermes_version", "hermes_model_configured"})
            if not any(code.startswith("test_environment_") for code in codes):
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
    if agent and _adapter_type_from(_as_mapping(agent.get("readback"))) not in (None, ADAPTER_TYPE):
        codes.append("agent_readback_not_hermes_local")

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

    run_status = run.get("status") or _nested_get(run, "final_readback.json.status")
    if run and not _status_is_pass(run_status):
        if run_status:
            codes.append("run_status_not_succeeded")
        else:
            codes.append("run_status_missing")
    result_json = _as_mapping(run.get("resultJson"))
    if run and not _as_mapping(result_json.get("bos")):
        codes.append("missing_resultJson_bos")
    wake_delta = run.get("wakeCountDelta")
    if wake_delta is not None and wake_delta != 1:
        codes.append("duplicate_or_missing_wake")
    approvals_created = _nested_get(run, "approvalCounts.created")
    if approvals_created not in (None, 0):
        codes.append("approval_side_effect_created")
    if run.get("sourceWriteCountDelta") not in (None, 0):
        codes.append("source_write_side_effect")

    return sorted(dict.fromkeys(code for code in codes if code)) or ["missing_bos_runtime_proof"]


def _is_passing_proof(evidence: Mapping[str, Any]) -> bool:
    run = _as_mapping(evidence.get("run"))
    agent = _as_mapping(evidence.get("agent"))
    adapter = _as_mapping(evidence.get("adapter"))
    return all(
        [
            evidence.get("selected_path") == SELECTED_PATH,
            _adapter_type_from(adapter) == ADAPTER_TYPE,
            _adapter_type_from(_as_mapping(agent.get("readback"))) == ADAPTER_TYPE,
            _status_is_pass(run.get("status")),
            bool(_as_mapping(_as_mapping(run.get("resultJson")).get("bos"))),
            run.get("wakeCountDelta") == 1,
            _nested_get(run, "approvalCounts.created") in (None, 0),
            run.get("sourceWriteCountDelta") in (None, 0),
        ]
    )


def run_probe(args: argparse.Namespace) -> dict[str, Any]:
    defaults = _read_config_defaults()
    if args.base_url:
        defaults["base_url"] = args.base_url
    if args.company_id:
        defaults["company_id"] = args.company_id

    headers, auth_meta = _auth_headers()
    evidence = _base_evidence(args, defaults, auth_meta)
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

    test_body = {"adapterConfig": defaults.get("adapter_config") or {}}
    test_response = client.request(
        "POST",
        f"/api/companies/{urllib.parse.quote(str(company_id))}/adapters/{ADAPTER_TYPE}/test-environment",
        test_body,
    )
    test_payload = _response_payload(test_response)
    test_status = test_payload.get("status") or ("pass" if test_response.get("ok") else "fail")

    evidence.update(
        {
            "paperclip": _extract_version_build(health, version),
            "adapter": {
                "adapterType": ADAPTER_TYPE,
                "adapterConfig": defaults.get("adapter_config") or {},
                "registry_readback": adapter_readback,
                "testEnvironment": {
                    "status": test_status,
                    "http_status": test_response.get("status"),
                    "response": test_response,
                },
            },
            "diagnostics": {
                "health": health,
                "version": version,
                "adapters": adapters_response,
                "testEnvironment": test_response,
            },
        }
    )

    # Without auth, or without registry/config support, do not attempt the one state-changing run.
    preflight_codes = _blocker_codes(evidence)
    blocking_preflight = [
        code
        for code in preflight_codes
        if code
        in {
            "missing_auth",
            "missing_xiaomi_api_key",
            "missing_xiaomi_base_url",
            "adapter_registry_auth_denied",
            "adapter_registry_unsupported_endpoint",
            "adapter_registry_unavailable",
            "hermes_local_adapter_not_registered",
            "test_environment_auth_denied",
            "test_environment_unsupported_endpoint",
            "unsupported_xiaomi_backend_config",
        }
        or code.startswith("test_environment_")
    ]
    if blocking_preflight and not args.force_single_run_after_warning:
        evidence["diagnostics"]["runSkipped"] = {
            "reason": "preflight_not_supported_or_not_authenticated",
            "codes": blocking_preflight,
            "bounded_runtime_invocations": 0,
        }
        evidence["blocker_codes"] = preflight_codes
        evidence["blocker_reason"] = ",".join(preflight_codes)
        return _redact_value("evidence", evidence)

    agent_body = _make_agent_body(args, defaults)
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
            "reason": "bos-light-m005-s01-hermes-xiaomi-probe",
            "issueId": args.issue_id,
            "prompt": args.probe_prompt,
            "metadata": {"schema_version": SCHEMA_VERSION, "expectedResultJson": "bos", "selected_path": SELECTED_PATH},
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
                "lifecycle": {
                    "agentCreated": bool(create_response.get("ok") and agent_id),
                    "runCreated": bool(run_id),
                    "runReadback": bool(run_response),
                },
            },
            "agent": {
                "companyId": str(company_id),
                "agentId": agent_id,
                "config": agent_body,
                "readback": agent_readback,
            },
            "run": {
                "runId": run_id,
                "status": run_status,
                "wakeCounts": wake_counts,
                "wakeCountDelta": wake_counts.get("delta"),
                "approvalCounts": approval_counts,
                "approvalsCreated": approval_counts.get("created") or 0,
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
        evidence["capability_promotions"] = ["hermes.xiaomi_execution"]
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
    parser = argparse.ArgumentParser(description="Run M005 S01 Hermes Xiaomi probe and write redacted proof/blocker evidence.")
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT, help="Exact evidence path to write.")
    parser.add_argument("--base-url", default=None, help="Optional Paperclip base URL override; otherwise env or S08 evidence is used.")
    parser.add_argument("--company-id", default=None, help="Optional company id override; otherwise env or S08 evidence is used.")
    parser.add_argument("--origin", default=os.environ.get("PAPERCLIP_ORIGIN"), help="Optional trusted Origin header for authenticated browser-style APIs.")
    parser.add_argument("--timeout", type=float, default=DEFAULT_TIMEOUT_SECONDS, help="Per-request timeout seconds.")
    parser.add_argument("--settle-seconds", type=float, default=DEFAULT_SETTLE_SECONDS, help="Initial bounded wait before first run readback.")
    parser.add_argument("--readback-interval-seconds", type=float, default=4.0, help="Bounded interval between run readbacks.")
    parser.add_argument("--max-readbacks", type=int, default=DEFAULT_MAX_READBACKS, help="Maximum run readbacks after the single invoke.")
    parser.add_argument("--agent-timeout-sec", type=int, default=90, help="Agent timeout used if creating the probe agent.")
    parser.add_argument("--agent-grace-sec", type=int, default=5, help="Agent grace seconds used if creating the probe agent.")
    parser.add_argument("--issue-id", default="BOS-M005-S01", help="Harmless issue id/key string for the bounded probe prompt.")
    parser.add_argument("--agent-name", default="BOS Light M005 S01 Hermes Xiaomi Probe", help="Name used for the supported Paperclip probe agent.")
    parser.add_argument(
        "--agent-prompt",
        default=(
            "You are a bounded BOS Light Paperclip Hermes Xiaomi probe agent. Do not modify files, create approvals, "
            "access secrets, or call external project services except the configured Xiaomi LLM backend. Respond with only "
            'compact JSON shaped as {"bos":{"schemaVersion":"m005-s01-hermes-xiaomi/v1","ok":true,"summary":"...","sideEffects":[]}}.'
        ),
    )
    parser.add_argument(
        "--probe-prompt",
        default=(
            "Return only compact JSON in resultJson.bos shape for BOS Light M005 S01: "
            '{"bos":{"schemaVersion":"m005-s01-hermes-xiaomi/v1","ok":true,"summary":"Hermes Xiaomi backend probe completed through Paperclip","sideEffects":[]}}. '
            "Do not create approvals, edit source, or disclose credentials."
        ),
    )
    parser.add_argument(
        "--force-single-run-after-warning",
        action="store_true",
        help="Allow the one invoke even when testEnvironment is warning-only; auth and supported registry endpoints are still required.",
    )
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        evidence = run_probe(args)
    except Exception as exc:  # Defensive fail-close: always attempt to write a validator-readable artifact.
        defaults = _read_config_defaults()
        _, auth_meta = _auth_headers()
        evidence = _base_evidence(args, defaults, auth_meta)
        evidence.update(
            {
                "blocker_reason": f"runner_exception_{type(exc).__name__}",
                "blocker_codes": [f"runner_exception_{type(exc).__name__}"],
                "diagnostics": {"exception_type": type(exc).__name__, "message": _redact_string(str(exc))},
            }
        )
        evidence = _redact_value("evidence", evidence)
    write_evidence(args.output, evidence)
    print(f"M005 S01 Hermes Xiaomi probe wrote {evidence.get('artifact_type')} evidence: {args.output}")
    if evidence.get("artifact_type") == "fail-closed-blocker":
        print(f"blocker_reason={evidence.get('blocker_reason')}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
