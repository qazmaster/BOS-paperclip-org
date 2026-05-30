#!/usr/bin/env python3
"""Run bounded S05 BOS Light plugin/UI surface probes and write evidence.

The runner is intentionally standard-library-only. It reads the BOS Light plugin
manifest and runtime capability matrix, optionally uses Paperclip sandbox
environment variables, probes a fixed small route set, and writes one canonical
S05 artifact. It never treats local registration intent, optional chaining, or
S04 issue/document/comment proof as plugin/UI support.
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
from typing import Any, Iterable, Mapping, MutableMapping, Sequence

ROOT = Path(__file__).resolve().parents[1]
SCHEMA_VERSION = "s05-plugin-ui-surface-probe/v1"
PASSING_ARTIFACT_TYPE = "live-evidence"
BLOCKER_ARTIFACT_TYPE = "fail-closed-unsupported"
DEFAULT_MANIFEST = Path("plugin-bos-light/manifest.paperclip-plugin.json")
DEFAULT_RUNTIME_MATRIX = Path("plugin-bos-light/capabilities.paperclip-runtime.json")
DEFAULT_OUTPUT = Path("runtime-evidence/M002-S05-plugin-ui-surface-probe.json")
DEFAULT_TIMEOUT_SECONDS = 10.0
MAX_RESPONSE_BYTES = 96 * 1024
MAX_TEXT_SNIPPET = 800
MAX_ROUTE_ATTEMPTS = 24
FIRST_PIKO_TOOL = "piko:bpi-score"

SECRET_KEY_RE = re.compile(
    r"(?:secret|token|password|passwd|api[_-]?key|credential|private[_-]?key|authorization|bearer|cookie)",
    re.IGNORECASE,
)
SECRET_VALUE_RE = re.compile(
    r"("
    r"sk-[A-Za-z0-9_\-]{8,}|"
    r"gh[pousr]_[A-Za-z0-9_]{8,}|"
    r"xox[baprs]-[A-Za-z0-9\-]{8,}|"
    r"AKIA[0-9A-Z]{8,}|"
    r"(?:Bearer\s+)[A-Za-z0-9._~+/\-=]{8,}|"
    r"(?:Cookie:\s*)?[^\s=;]*(?:session|token|secret|password|api[_-]?key)[^\s=;]*=[^\s\"']+|"
    r"[A-Za-z_][A-Za-z0-9_]*(?:TOKEN|SECRET|PASSWORD|API_KEY)=[^\s\"']+"
    r")",
    re.IGNORECASE,
)
REDACTED_VALUES = {"<redacted>", "[redacted]", "redacted", "***", ""}

SURFACE_NAMES = (
    "plugin_registration",
    "tools",
    "data_providers",
    "actions",
    "dashboard_widgets",
    "issue_detail_tabs",
)


class HttpClient:
    def __init__(self, base_url: str, headers: Mapping[str, str], timeout: float) -> None:
        self.base_url = base_url.rstrip("/")
        self.headers = dict(headers)
        self.timeout = timeout

    def request(self, method: str, path: str, body: Mapping[str, Any] | None = None) -> dict[str, Any]:
        started = time.monotonic()
        url = urllib.parse.urljoin(f"{self.base_url}/", path.lstrip("/"))
        payload: bytes | None = None
        headers = {"Accept": "application/json", **self.headers}
        if body is not None:
            payload = json.dumps(body).encode("utf-8")
            headers["Content-Type"] = "application/json"
        request = urllib.request.Request(url, data=payload, headers=headers, method=method.upper())
        try:
            with urllib.request.urlopen(request, timeout=self.timeout) as response:  # noqa: S310 - operator supplied sandbox URL
                parsed, text, truncated, malformed = _read_response(response)
                return {
                    "ok": 200 <= response.status < 300,
                    "status_code": response.status,
                    "duration_ms": round((time.monotonic() - started) * 1000),
                    "json": parsed,
                    "text": text,
                    "truncated": truncated,
                    "malformed_json_reason": malformed,
                    "error": None,
                }
        except urllib.error.HTTPError as exc:
            parsed, text, truncated, malformed = _read_response(exc)
            return {
                "ok": False,
                "status_code": exc.code,
                "duration_ms": round((time.monotonic() - started) * 1000),
                "json": parsed,
                "text": text,
                "truncated": truncated,
                "malformed_json_reason": malformed,
                "error": "http_error",
            }
        except (TimeoutError, urllib.error.URLError, OSError) as exc:
            return {
                "ok": False,
                "status_code": None,
                "duration_ms": round((time.monotonic() - started) * 1000),
                "json": None,
                "text": None,
                "truncated": False,
                "malformed_json_reason": None,
                "error": type(exc).__name__,
                "message": _redact_string(str(exc))[:MAX_TEXT_SNIPPET],
            }


def _read_response(response: Any) -> tuple[Any | None, str | None, bool, str | None]:
    raw = response.read(MAX_RESPONSE_BYTES + 1)
    truncated = len(raw) > MAX_RESPONSE_BYTES
    if truncated:
        raw = raw[:MAX_RESPONSE_BYTES]
    text = raw.decode("utf-8", errors="replace")
    if not text.strip():
        return None, None, truncated, None
    try:
        return json.loads(text), None, truncated, None
    except json.JSONDecodeError as exc:
        return None, _redact_string(text[:MAX_TEXT_SNIPPET]), truncated, f"line {exc.lineno}, column {exc.colno}: {exc.msg}"


def _utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def _redact_string(value: str) -> str:
    return SECRET_VALUE_RE.sub("<redacted>", value)


def _redact_value(key: str, value: Any) -> Any:
    if SECRET_KEY_RE.search(key) and key != "secret_env_vars" and not key.endswith("_env") and not key.endswith("Env"):
        if isinstance(value, (bool, int, float)) or value is None:
            return value
        return "<redacted>"
    if isinstance(value, str):
        return _redact_string(value)
    if isinstance(value, Mapping):
        return {str(child_key): _redact_value(str(child_key), child_value) for child_key, child_value in value.items()}
    if isinstance(value, list):
        return [_redact_value(key, item) for item in value]
    return value


def _deep_redact(value: Any) -> Any:
    return _redact_value("$", value)


def _load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def _as_mapping(value: Any) -> Mapping[str, Any]:
    return value if isinstance(value, Mapping) else {}


def _as_sequence(value: Any) -> list[Any]:
    return value if isinstance(value, list) else []


def _string_list(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    return [item.strip() for item in value if isinstance(item, str) and item.strip()]


def _quote(value: str) -> str:
    return urllib.parse.quote(value, safe="")


def _first_string(value: Mapping[str, Any], keys: Iterable[str]) -> str | None:
    for key in keys:
        candidate = value.get(key)
        if isinstance(candidate, str) and candidate.strip():
            return candidate.strip()
    return None


def _walk_mappings(value: Any) -> Iterable[Mapping[str, Any]]:
    if isinstance(value, Mapping):
        yield value
        for child in value.values():
            yield from _walk_mappings(child)
    elif isinstance(value, list):
        for child in value:
            yield from _walk_mappings(child)


def _extract_runtime(json_value: Any) -> dict[str, str | None]:
    keys = {
        "version": ("version", "runtimeVersion", "paperclip_version", "paperclipVersion"),
        "build": ("build", "buildId", "build_id", "gitSha", "sha", "commit"),
    }
    found: dict[str, str | None] = {"version": None, "build": None}
    for mapping in _walk_mappings(json_value):
        for target, candidates in keys.items():
            if found[target]:
                continue
            value = _first_string(mapping, candidates)
            if value:
                found[target] = value
    return found


def _extract_keys(json_value: Any, container_fields: Sequence[str]) -> list[str]:
    keys: list[str] = []

    def add(candidate: Any) -> None:
        if isinstance(candidate, str) and candidate.strip():
            keys.append(candidate.strip())
        elif isinstance(candidate, Mapping):
            value = _first_string(candidate, ("key", "id", "name", "plugin_key", "pluginKey"))
            if value:
                keys.append(value)
        elif isinstance(candidate, list):
            for item in candidate:
                add(item)

    if isinstance(json_value, list):
        add(json_value)
    for mapping in _walk_mappings(json_value):
        for field in container_fields:
            if field in mapping:
                add(mapping.get(field))
        add(mapping)
    return list(dict.fromkeys(keys))


def _order_observed_keys(requested: Sequence[str], observed: Sequence[str]) -> list[str]:
    observed_unique = list(dict.fromkeys(observed))
    requested_ordered = [key for key in requested if key in observed_unique]
    extras = [key for key in observed_unique if key not in requested_ordered]
    return requested_ordered + extras


def _extract_render_id(json_value: Any) -> str | None:
    for mapping in _walk_mappings(json_value):
        value = _first_string(mapping, ("render_id", "renderId", "component_id", "componentId", "mount_id", "mountId"))
        if value:
            return value
    return None


def _response_summary(result: Mapping[str, Any]) -> dict[str, Any]:
    parsed = result.get("json")
    summary: dict[str, Any] = {
        "json_type": type(parsed).__name__ if parsed is not None else None,
        "text_snippet": result.get("text"),
    }
    if isinstance(parsed, Mapping):
        summary["top_level_keys"] = sorted(str(key) for key in parsed.keys())[:24]
    elif isinstance(parsed, list):
        summary["array_length"] = len(parsed)
    return _deep_redact(summary)


def _make_route_attempt(
    *,
    route_id: str,
    surface: str,
    method: str,
    path: str,
    result: Mapping[str, Any],
    used_for_proof: bool,
) -> dict[str, Any]:
    return {
        "id": route_id,
        "surface": surface,
        "method": method.upper(),
        "path": path,
        "ok": result.get("ok") is True,
        "status_code": result.get("status_code"),
        "duration_ms": result.get("duration_ms"),
        "error": result.get("error"),
        "message": result.get("message"),
        "truncated": result.get("truncated") is True,
        "malformed_json_reason": result.get("malformed_json_reason"),
        "used_for_proof": used_for_proof,
        "response_summary": _response_summary(result),
    }


def _fallback_surface(name: str, requested: Sequence[str], reason: str) -> dict[str, Any]:
    return {
        "status": "fallback-only",
        "requested_keys": list(requested),
        "observed_registered_keys": [],
        "readback_proof": None,
        "fallback_reason": reason,
        "validation_errors": [],
    }


def _status_from_attempts(attempts: Sequence[Mapping[str, Any]], requested: Sequence[str], observed: Sequence[str], runtime: Mapping[str, Any]) -> str:
    requested_set = set(requested)
    observed_set = set(observed)
    has_runtime = _known(runtime.get("version")) and _known(runtime.get("build"))
    if requested_set and requested_set <= observed_set and has_runtime:
        return "confirmed"
    if any(attempt.get("status_code") == 404 for attempt in attempts):
        return "unsupported"
    if attempts:
        return "fallback-only"
    return "unvalidated"


def _known(value: Any) -> bool:
    return isinstance(value, str) and value.strip().lower() not in {"", "unknown", "none", "n/a", "null"}


def _surface_errors_for_attempts(attempts: Sequence[Mapping[str, Any]]) -> list[str]:
    errors: list[str] = []
    for attempt in attempts:
        if attempt.get("malformed_json_reason"):
            errors.append(f"malformed_json:{attempt.get('id')}")
        if attempt.get("truncated") is True:
            errors.append(f"truncated_response:{attempt.get('id')}")
    return errors


def _manifest_contract(manifest: Mapping[str, Any]) -> dict[str, Any]:
    ui = _as_mapping(manifest.get("ui"))
    return {
        "plugin_key": str(manifest.get("plugin_key") or "bos-light"),
        "capabilities": _string_list(manifest.get("capabilities_requested")),
        "tools": _string_list(manifest.get("tools")),
        "data_providers": ["betting-table"] if "data.register" in _string_list(manifest.get("capabilities_requested")) else [],
        "actions": ["approve-batch"] if "actions.register" in _string_list(manifest.get("capabilities_requested")) else [],
        "ui": {
            "dashboard_widgets": _string_list(ui.get("dashboard_widgets")),
            "issue_detail_tabs": _string_list(ui.get("issue_detail_tabs")),
        },
    }


def _capability_statuses(runtime_matrix: Mapping[str, Any]) -> dict[str, dict[str, Any]]:
    wanted = {
        "plugin.runtime.registration",
        "registration.tools",
        "registration.data",
        "registration.actions",
        "ui.dashboard_widgets",
        "ui.issue_detail_tabs",
    }
    statuses: dict[str, dict[str, Any]] = {}
    for row in _as_sequence(runtime_matrix.get("capabilities")):
        mapping = _as_mapping(row)
        key = mapping.get("key")
        if key in wanted:
            statuses[str(key)] = {
                "status": mapping.get("status"),
                "surface": mapping.get("paperclip_surface_name"),
                "fallback_path": mapping.get("fallback_path"),
                "runtime_evidence_field": mapping.get("runtime_evidence_field"),
            }
    return statuses


def _headers_from_env(env: Mapping[str, str], token_env: str, header_name: str) -> dict[str, str]:
    token = env.get(token_env, "")
    if not token:
        return {}
    value = token
    if header_name.lower() == "authorization" and not value.lower().startswith(("bearer ", "basic ")):
        value = f"Bearer {value}"
    return {header_name: value}


def build_evidence(
    *,
    manifest_path: Path = DEFAULT_MANIFEST,
    runtime_matrix_path: Path = DEFAULT_RUNTIME_MATRIX,
    output_path: Path | None = DEFAULT_OUTPUT,
    env: Mapping[str, str] | None = None,
    timeout_seconds: float | None = None,
) -> dict[str, Any]:
    env = env if env is not None else os.environ
    started_at = _utc_now()
    phase_timestamps: MutableMapping[str, str] = {"start": started_at}
    manifest = _as_mapping(_load_json(ROOT / manifest_path if not manifest_path.is_absolute() else manifest_path))
    runtime_matrix = _as_mapping(_load_json(ROOT / runtime_matrix_path if not runtime_matrix_path.is_absolute() else runtime_matrix_path))
    phase_timestamps["inputs_loaded"] = _utc_now()

    requested = _manifest_contract(manifest)
    plugin_key = str(env.get("PAPERCLIP_PLUGIN_KEY") or requested["plugin_key"])
    requested["plugin_key"] = plugin_key
    token_env = str(env.get("PAPERCLIP_API_KEY_ENV") or "PAPERCLIP_API_KEY")
    header_name = str(env.get("PAPERCLIP_AUTH_HEADER") or "Authorization")
    base_url = str(env.get("PAPERCLIP_BASE_URL") or "").rstrip("/")
    company_id = str(env.get("PAPERCLIP_COMPANY_ID") or env.get("PAPERCLIP_SANDBOX_COMPANY_ID") or "")
    issue_id = str(env.get("PAPERCLIP_ISSUE_ID") or env.get("PAPERCLIP_SANDBOX_ISSUE_ID") or "")
    timeout = float(timeout_seconds if timeout_seconds is not None else env.get("PAPERCLIP_TIMEOUT_SECONDS", DEFAULT_TIMEOUT_SECONDS))
    headers = _headers_from_env(env, token_env, header_name)
    live_probe_enabled = bool(base_url and headers)

    route_attempts: list[dict[str, Any]] = []
    fallback_diagnostics: list[dict[str, Any]] = []
    validation_errors: list[str] = []
    runtime: dict[str, Any] = {"version": "unknown", "build": "unknown", "observed_from_route_ids": []}
    piko_invocations_attempted = 0

    surfaces = {
        "plugin_registration": _fallback_surface("plugin_registration", [plugin_key], "live Paperclip base URL/API key not supplied"),
        "tools": _fallback_surface("tools", requested["tools"], "live Paperclip base URL/API key not supplied"),
        "data_providers": _fallback_surface("data_providers", requested["data_providers"], "live Paperclip base URL/API key not supplied"),
        "actions": _fallback_surface("actions", requested["actions"], "live Paperclip base URL/API key not supplied"),
        "dashboard_widgets": {
            **_fallback_surface("dashboard_widgets", requested["ui"]["dashboard_widgets"], "live Paperclip base URL/API key not supplied"),
            "render_ids": {},
        },
        "issue_detail_tabs": {
            **_fallback_surface("issue_detail_tabs", requested["ui"]["issue_detail_tabs"], "live Paperclip base URL/API key not supplied"),
            "render_ids": {},
        },
    }

    def record_route(surface: str, method: str, path: str, body: Mapping[str, Any] | None = None, used_for_proof: bool = False) -> dict[str, Any]:
        if len(route_attempts) >= MAX_ROUTE_ATTEMPTS:
            validation_errors.append("route_attempt_limit_exceeded")
            return {"ok": False, "status_code": None, "json": None, "error": "route_attempt_limit_exceeded"}
        route_id = f"r{len(route_attempts) + 1:02d}"
        result = client.request(method, path, body)  # type: ignore[name-defined]
        attempt = _make_route_attempt(
            route_id=route_id,
            surface=surface,
            method=method,
            path=path,
            result=result,
            used_for_proof=used_for_proof,
        )
        route_attempts.append(attempt)
        if result.get("malformed_json_reason"):
            validation_errors.append(f"malformed_json:{route_id}")
        return {**result, "route_id": route_id, "attempt": attempt}

    if not live_probe_enabled:
        missing = []
        if not base_url:
            missing.append("PAPERCLIP_BASE_URL")
        if not headers:
            missing.append(token_env)
        fallback_diagnostics.append({
            "code": "missing_live_probe_env",
            "message": "S05 did not run live HTTP probes because required sandbox env was absent.",
            "missing_env": missing,
        })
    else:
        phase_timestamps["live_probe_start"] = _utc_now()
        client = HttpClient(base_url, headers, timeout)

        for runtime_path in ("/api/health", "/api/version"):
            result = record_route("runtime", "GET", runtime_path)
            observed = _extract_runtime(result.get("json"))
            updated = False
            for key in ("version", "build"):
                if not _known(runtime.get(key)) and _known(observed.get(key)):
                    runtime[key] = observed[key]
                    updated = True
            if updated:
                runtime["observed_from_route_ids"].append(result.get("route_id"))

        plugin_path = f"/api/plugins/{_quote(plugin_key)}"
        plugin_result = record_route("plugin_registration", "GET", plugin_path)
        plugin_keys = _extract_keys(plugin_result.get("json"), ("plugins", "registered_plugins", "registeredPluginKeys"))
        if plugin_key in plugin_keys or plugin_result.get("ok") is True:
            plugin_keys = _order_observed_keys([plugin_key], plugin_keys + [plugin_key])
        plugin_attempts = [attempt for attempt in route_attempts if attempt["surface"] == "plugin_registration"]
        surfaces["plugin_registration"] = {
            "status": _status_from_attempts(plugin_attempts, [plugin_key], plugin_keys, runtime),
            "requested_keys": [plugin_key],
            "observed_registered_keys": plugin_keys,
            "readback_proof": {"route_attempt_id": plugin_result.get("route_id"), "source": "S05 live route"} if plugin_result.get("ok") else None,
            "fallback_reason": None if plugin_result.get("ok") else "plugin registration readback route did not confirm BOS Light plugin support",
            "validation_errors": _surface_errors_for_attempts(plugin_attempts),
        }

        tools_path = f"/api/plugins/{_quote(plugin_key)}/tools"
        tools_result = record_route("tools", "GET", tools_path)
        tool_keys = _order_observed_keys(requested["tools"], _extract_keys(tools_result.get("json"), ("tools", "registered_tools", "registered_tool_keys", "registeredToolKeys")))
        tool_attempts = [attempt for attempt in route_attempts if attempt["surface"] == "tools"]
        tool_status = _status_from_attempts(tool_attempts, requested["tools"], tool_keys, runtime)
        invocation_results: list[dict[str, Any]] = []
        if FIRST_PIKO_TOOL in tool_keys:
            piko_invocations_attempted += 1
            invoke_path = f"/api/plugins/{_quote(plugin_key)}/tools/{_quote(FIRST_PIKO_TOOL)}/invoke"
            invoke_body = {"input": {"probe": "s05", "side_effect_free": True}}
            invoke_result = record_route("tools", "POST", invoke_path, invoke_body, used_for_proof=tool_status == "confirmed")
            invocation_results.append({
                "tool_key": FIRST_PIKO_TOOL,
                "route_attempt_id": invoke_result.get("route_id"),
                "ok": invoke_result.get("ok") is True,
                "status_code": invoke_result.get("status_code"),
                "error": invoke_result.get("error"),
            })
        surfaces["tools"] = {
            "status": tool_status,
            "requested_keys": requested["tools"],
            "observed_registered_keys": tool_keys,
            "readback_proof": {"route_attempt_id": tools_result.get("route_id"), "source": "S05 live route"} if tools_result.get("ok") else None,
            "piko_invocation_results": invocation_results,
            "fallback_reason": None if tool_status == "confirmed" else "tools route did not confirm every requested piko tool with runtime version/build",
            "validation_errors": _surface_errors_for_attempts(tool_attempts),
        }

        data_list_path = f"/api/plugins/{_quote(plugin_key)}/data"
        data_result = record_route("data_providers", "GET", data_list_path)
        data_keys = _order_observed_keys(requested["data_providers"], _extract_keys(data_result.get("json"), ("data", "providers", "dataProviders", "registered_provider_keys", "registeredProviderKeys")))
        if requested["data_providers"]:
            provider_path = f"/api/plugins/{_quote(plugin_key)}/data/{_quote(requested['data_providers'][0])}"
            if company_id:
                provider_path += f"?companyId={_quote(company_id)}"
            provider_result = record_route("data_providers", "GET", provider_path)
            data_keys = _order_observed_keys(requested["data_providers"], data_keys + _extract_keys(provider_result.get("json"), ("data", "providers", "dataProviders")))
        data_attempts = [attempt for attempt in route_attempts if attempt["surface"] == "data_providers"]
        data_status = _status_from_attempts(data_attempts, requested["data_providers"], data_keys, runtime)
        surfaces["data_providers"] = {
            "status": data_status,
            "requested_keys": requested["data_providers"],
            "observed_registered_keys": data_keys,
            "readback_proof": {"route_attempt_id": data_result.get("route_id"), "source": "S05 live route"} if data_result.get("ok") else None,
            "fallback_reason": None if data_status == "confirmed" else "data-provider routes did not confirm betting-table provider with runtime version/build",
            "validation_errors": _surface_errors_for_attempts(data_attempts),
        }

        actions_path = f"/api/plugins/{_quote(plugin_key)}/actions"
        actions_result = record_route("actions", "GET", actions_path)
        action_keys = _order_observed_keys(requested["actions"], _extract_keys(actions_result.get("json"), ("actions", "registered_actions", "registered_action_keys", "registeredActionKeys")))
        action_attempts = [attempt for attempt in route_attempts if attempt["surface"] == "actions"]
        action_status = _status_from_attempts(action_attempts, requested["actions"], action_keys, runtime)
        surfaces["actions"] = {
            "status": action_status,
            "requested_keys": requested["actions"],
            "observed_registered_keys": action_keys,
            "readback_proof": {"route_attempt_id": actions_result.get("route_id"), "source": "S05 live route"} if actions_result.get("ok") else None,
            "fallback_reason": None if action_status == "confirmed" else "action route did not confirm approve-batch registration with runtime version/build; invoke was intentionally not attempted",
            "validation_errors": _surface_errors_for_attempts(action_attempts),
        }

        widget_render_ids: dict[str, str] = {}
        widget_keys: list[str] = []
        for widget_key in requested["ui"]["dashboard_widgets"]:
            widget_path = f"/api/plugins/{_quote(plugin_key)}/ui/dashboard-widgets/{_quote(widget_key)}"
            if company_id:
                widget_path += f"?companyId={_quote(company_id)}"
            widget_result = record_route("dashboard_widgets", "GET", widget_path)
            observed_keys = _extract_keys(widget_result.get("json"), ("dashboard_widgets", "dashboardWidgets", "widgets"))
            if widget_result.get("ok") and widget_key not in observed_keys:
                observed_keys.append(widget_key)
            widget_keys.extend(observed_keys)
            render_id = _extract_render_id(widget_result.get("json"))
            if render_id:
                widget_render_ids[widget_key] = render_id
            elif widget_result.get("ok"):
                validation_errors.append(f"missing_render_id:dashboard_widgets:{widget_key}")
        widget_attempts = [attempt for attempt in route_attempts if attempt["surface"] == "dashboard_widgets"]
        widget_observed = _order_observed_keys(requested["ui"]["dashboard_widgets"], widget_keys)
        widget_status = _status_from_attempts(widget_attempts, requested["ui"]["dashboard_widgets"], widget_observed, runtime)
        if widget_status == "confirmed" and set(widget_render_ids) != set(requested["ui"]["dashboard_widgets"]):
            widget_status = "fallback-only"
        surfaces["dashboard_widgets"] = {
            "status": widget_status,
            "requested_keys": requested["ui"]["dashboard_widgets"],
            "observed_registered_keys": widget_observed,
            "render_ids": widget_render_ids,
            "readback_proof": {"route_attempt_ids": [a["id"] for a in widget_attempts if a.get("ok")], "source": "S05 live route"} if any(a.get("ok") for a in widget_attempts) else None,
            "fallback_reason": None if widget_status == "confirmed" else "dashboard widget route did not provide confirmed render IDs with runtime version/build",
            "validation_errors": _surface_errors_for_attempts(widget_attempts),
        }

        tab_render_ids: dict[str, str] = {}
        tab_keys: list[str] = []
        for tab_key in requested["ui"]["issue_detail_tabs"]:
            tab_path = f"/api/plugins/{_quote(plugin_key)}/ui/issue-detail-tabs/{_quote(tab_key)}"
            query = []
            if issue_id:
                query.append(f"issueId={_quote(issue_id)}")
            if company_id:
                query.append(f"companyId={_quote(company_id)}")
            if query:
                tab_path += "?" + "&".join(query)
            tab_result = record_route("issue_detail_tabs", "GET", tab_path)
            observed_keys = _extract_keys(tab_result.get("json"), ("issue_detail_tabs", "issueDetailTabs", "tabs"))
            if tab_result.get("ok") and tab_key not in observed_keys:
                observed_keys.append(tab_key)
            tab_keys.extend(observed_keys)
            render_id = _extract_render_id(tab_result.get("json"))
            if render_id:
                tab_render_ids[tab_key] = render_id
            elif tab_result.get("ok"):
                validation_errors.append(f"missing_render_id:issue_detail_tabs:{tab_key}")
        tab_attempts = [attempt for attempt in route_attempts if attempt["surface"] == "issue_detail_tabs"]
        tab_observed = _order_observed_keys(requested["ui"]["issue_detail_tabs"], tab_keys)
        tab_status = _status_from_attempts(tab_attempts, requested["ui"]["issue_detail_tabs"], tab_observed, runtime)
        if tab_status == "confirmed" and set(tab_render_ids) != set(requested["ui"]["issue_detail_tabs"]):
            tab_status = "fallback-only"
        surfaces["issue_detail_tabs"] = {
            "status": tab_status,
            "requested_keys": requested["ui"]["issue_detail_tabs"],
            "observed_registered_keys": tab_observed,
            "render_ids": tab_render_ids,
            "readback_proof": {"route_attempt_ids": [a["id"] for a in tab_attempts if a.get("ok")], "source": "S05 live route"} if any(a.get("ok") for a in tab_attempts) else None,
            "fallback_reason": None if tab_status == "confirmed" else "issue detail tab routes did not provide confirmed render IDs with runtime version/build",
            "validation_errors": _surface_errors_for_attempts(tab_attempts),
        }
        phase_timestamps["live_probe_end"] = _utc_now()

    confirmed_surfaces = [name for name, row in surfaces.items() if row.get("status") == "confirmed"]
    if not confirmed_surfaces:
        fallback_diagnostics.append({
            "code": "no_confirmed_s05_surfaces",
            "message": "No plugin/UI surface was promoted; evidence remains fallback-only or unsupported until S05 runtime readbacks pass.",
        })

    side_effect_counters = {
        "route_requests_attempted": len(route_attempts),
        "piko_invocations_attempted": piko_invocations_attempted,
        "native_approvals_created": 0,
        "approval_requests_created": 0,
        "documents_created": 0,
        "comments_created": 0,
        "issue_mutations_attempted": 0,
        "action_invocations_attempted": 0,
    }

    artifact_type = PASSING_ARTIFACT_TYPE if len(confirmed_surfaces) == len(SURFACE_NAMES) else BLOCKER_ARTIFACT_TYPE
    evidence: dict[str, Any] = {
        "schema_version": SCHEMA_VERSION,
        "artifact_type": artifact_type,
        "phase": "live",
        "generated_at": started_at,
        "runner": {
            "script": "scripts/run_s05_plugin_ui_surface_probe.py",
            "standard_library_only": True,
            "max_route_attempts": MAX_ROUTE_ATTEMPTS,
            "max_response_bytes": MAX_RESPONSE_BYTES,
        },
        "inputs": {
            "manifest_path": str(manifest_path),
            "runtime_matrix_path": str(runtime_matrix_path),
            "base_url": base_url or "",
            "auth_token_env": token_env,
            "auth_header_name": header_name,
            "companyId": company_id,
            "issueId": issue_id,
            "timeout_seconds": timeout,
            "live_probe_enabled": live_probe_enabled,
        },
        "requested_manifest": requested,
        "capability_matrix_excerpt": _capability_statuses(runtime_matrix),
        "runtime": runtime,
        "surfaces": surfaces,
        "route_attempts": route_attempts,
        "phase_timestamps": dict(phase_timestamps),
        "side_effect_counters": side_effect_counters,
        "redaction": {
            "secrets_redacted": True,
            "secret_env_vars": [token_env],
            "redaction_errors": [],
        },
        "fallback_diagnostics": fallback_diagnostics,
        "validation_errors": sorted(dict.fromkeys(validation_errors)),
    }
    evidence = _deep_redact(evidence)
    evidence["phase_timestamps"]["evidence_written"] = _utc_now()

    if output_path is not None:
        destination = ROOT / output_path if not output_path.is_absolute() else output_path
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_text(json.dumps(evidence, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return evidence


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Run bounded S05 BOS Light plugin/UI surface probes.")
    parser.add_argument("--manifest", type=Path, default=DEFAULT_MANIFEST)
    parser.add_argument("--runtime-matrix", type=Path, default=DEFAULT_RUNTIME_MATRIX)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--timeout-seconds", type=float, default=None)
    args = parser.parse_args(argv)
    evidence = build_evidence(
        manifest_path=args.manifest,
        runtime_matrix_path=args.runtime_matrix,
        output_path=args.output,
        timeout_seconds=args.timeout_seconds,
    )
    print(json.dumps({
        "output": str(args.output),
        "artifact_type": evidence.get("artifact_type"),
        "confirmed_surfaces": [name for name, row in _as_mapping(evidence.get("surfaces")).items() if _as_mapping(row).get("status") == "confirmed"],
        "validation_errors": evidence.get("validation_errors", []),
    }, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
