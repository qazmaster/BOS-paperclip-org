#!/usr/bin/env python3
"""Run bounded M006 S00 runtime capability inventory probes and write evidence.

The runner is intentionally standard-library-only. It reads PAPERCLIP_API_KEY and
PAPERCLIP_BASE_URL from environment, performs five sequential probes, and writes
one canonical M006-S00 evidence artifact. It never asks for secrets, never writes
secret values, never imports Paperclip internals, and never mutates databases or
Paperclip source. When any probe surface is unavailable, it still writes a valid
fail-closed artifact with precise blocker codes.

Probes:
1. Paperclip health/version readback via GET /api/health
2. Plugin install path discovery via GET /api/companies/{companyId}/plugins
3. Tool registry readback attempting to observe piko:* tools
4. Secret materialization test for GITHUB_TOKEN_AIPAY via Hermes testEnvironment
5. Issue/document/comment regression smoke (lightweight create + readback)
"""

from __future__ import annotations

import argparse
import hashlib
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
SCHEMA_VERSION = "m006-s00-runtime-capability-inventory/v1"
PASSING_ARTIFACT_TYPE = "live-evidence"
BLOCKER_ARTIFACT_TYPE = "fail-closed-blocker"
DEFAULT_OUTPUT = Path("runtime-evidence/M006-S00-runtime-capability-inventory.json")
DEFAULT_TIMEOUT_SECONDS = 15.0
MAX_RESPONSE_BYTES = 128 * 1024
MAX_TEXT_SNIPPET = 800
MAX_ROUTE_ATTEMPTS = 32
PIKO_TOOL_PREFIX = "piko:"
ADAPTER_TYPE_HERMES = "hermes_local"
SECRET_NAME = "GITHUB_TOKEN_AIPAY"

SECRET_KEY_RE = re.compile(
    r"(?:secret|token|password|passwd|api[_-]?key|credential|private[_-]?key|authorization|bearer|cookie)",
    re.IGNORECASE,
)
SECRET_VALUE_RE = re.compile(
    r"("
    r"sk-[A-Za-z0-9_\-]{8,}|"
    r"gh[pousr]_[A-Za-z0-9_]{8,}|"
    r"github_pat_[A-Za-z0-9_]{16,}|"
    r"xox[baprs]-[A-Za-z0-9\-]{8,}|"
    r"AKIA[0-9A-Z]{8,}|"
    r"(?:Bearer\s+)[A-Za-z0-9._~+/\-=]{8,}|"
    r"(?:Cookie:\s*)?[^\s=;]*(?:session|token|secret|password|api[_-]?key)[^\s=;]*=[^\s\"']+|"
    r"[A-Za-z_][A-Za-z0-9_]*(?:TOKEN|SECRET|PASSWORD|API_KEY)=[^\s\"']+"
    r")",
    re.IGNORECASE,
)
STATUS_PASS = {"pass", "passed", "ok", "success", "succeeded", "completed", "finished"}


class HttpClient:
    def __init__(self, base_url: str, headers: Mapping[str, str], timeout: float, origin: str | None = None) -> None:
        self.base_url = base_url.rstrip("/")
        self.headers = dict(headers)
        self.timeout = timeout
        self.origin = origin.rstrip("/") if origin else None

    def request(self, method: str, path: str, body: Mapping[str, Any] | None = None) -> dict[str, Any]:
        started = time.monotonic()
        try:
            parsed_base = urllib.parse.urlparse(self.base_url)
            if parsed_base.scheme not in {"http", "https"} or not parsed_base.netloc:
                raise ValueError(f"invalid base URL: {self.base_url!r}")
            url = urllib.parse.urljoin(f"{self.base_url}/", path.lstrip("/"))
        except ValueError as exc:
            return {
                "ok": False,
                "status_code": None,
                "url": _redact_string(self.base_url),
                "duration_ms": round((time.monotonic() - started) * 1000),
                "error": "ValueError",
                "message": _redact_string(str(exc)),
                "json": None,
                "text": None,
                "truncated": False,
                "malformed_json_reason": None,
            }
        payload: bytes | None = None
        headers = {"Accept": "application/json", **self.headers}
        if self.origin and method.upper() not in {"GET", "HEAD", "OPTIONS"}:
            headers["Origin"] = self.origin
        if body is not None:
            payload = json.dumps(body).encode("utf-8")
            headers["Content-Type"] = "application/json"
        request = urllib.request.Request(url, data=payload, headers=headers, method=method.upper())
        try:
            with urllib.request.urlopen(request, timeout=self.timeout) as response:  # noqa: S310 - operator supplied sandbox URL
                raw = response.read(MAX_RESPONSE_BYTES + 1)
                truncated = len(raw) > MAX_RESPONSE_BYTES
                if truncated:
                    raw = raw[:MAX_RESPONSE_BYTES]
                text = raw.decode("utf-8", errors="replace")
                parsed, malformed = _parse_json_response(text)
                return {
                    "ok": 200 <= response.status < 300,
                    "status_code": response.status,
                    "url": _redact_url(url),
                    "duration_ms": round((time.monotonic() - started) * 1000),
                    "truncated": truncated,
                    "json": parsed,
                    "text": None if parsed is not None else _redact_string(text[:MAX_TEXT_SNIPPET]),
                    "malformed_json_reason": malformed,
                }
        except urllib.error.HTTPError as exc:
            raw = exc.read(MAX_RESPONSE_BYTES + 1)
            truncated = len(raw) > MAX_RESPONSE_BYTES
            text = raw[:MAX_RESPONSE_BYTES].decode("utf-8", errors="replace")
            parsed, malformed = _parse_json_response(text)
            return {
                "ok": False,
                "status_code": exc.code,
                "url": _redact_url(url),
                "duration_ms": round((time.monotonic() - started) * 1000),
                "error": "http_error",
                "truncated": truncated,
                "json": parsed,
                "text": None if parsed is not None else _redact_string(text[:MAX_TEXT_SNIPPET]),
                "malformed_json_reason": malformed,
            }
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            return {
                "ok": False,
                "status_code": None,
                "url": _redact_url(url),
                "duration_ms": round((time.monotonic() - started) * 1000),
                "error": _safe_error_code(exc),
                "message": _redact_string(str(exc)),
                "json": None,
                "text": None,
                "truncated": False,
                "malformed_json_reason": None,
            }


def _utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def _parse_json_response(text: str) -> tuple[Any | None, str | None]:
    if not text.strip():
        return None, None
    try:
        return json.loads(text), None
    except json.JSONDecodeError as exc:
        return None, f"line {exc.lineno}, column {exc.colno}: {exc.msg}"


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
    if SECRET_KEY_RE.search(key) and not key.endswith("_env") and not key.endswith("Env"):
        if isinstance(value, (bool, int, float)) or value is None:
            return value
        if isinstance(value, str):
            return "<redacted>"
        if isinstance(value, Mapping):
            return {str(child_key): _redact_value(str(child_key), child_value) for child_key, child_value in value.items()}
        if isinstance(value, list):
            return [_redact_value(key, item) for item in value]
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


def _safe_error_code(exc: BaseException) -> str:
    name = type(exc).__name__
    if isinstance(exc, urllib.error.URLError):
        reason = getattr(exc, "reason", None)
        if isinstance(reason, TimeoutError):
            return "timeout"
        if isinstance(reason, OSError):
            return type(reason).__name__
    return name


def _quote(value: str) -> str:
    return urllib.parse.quote(value, safe="")


def _as_mapping(value: Any) -> Mapping[str, Any]:
    return value if isinstance(value, Mapping) else {}


def _as_sequence(value: Any) -> list[Any]:
    return value if isinstance(value, list) else []


def _first_string(value: Mapping[str, Any], keys: Iterable[str]) -> str | None:
    for key in keys:
        candidate = value.get(key)
        if isinstance(candidate, str) and candidate.strip():
            return candidate.strip()
    return None


def _extract_id(response: Mapping[str, Any], keys: Sequence[str]) -> str | None:
    payload = response.get("json")
    candidates: list[Any] = [payload]
    if isinstance(payload, Mapping):
        candidates.extend([payload.get("data"), payload.get("result"), payload.get("issue"), payload.get("document"), payload.get("comment")])
    for candidate in candidates:
        if not isinstance(candidate, Mapping):
            continue
        found = _first_string(candidate, keys)
        if found:
            return found
    return None


def _extract_text(response: Mapping[str, Any]) -> str:
    payload = response.get("json")
    candidates: list[Any] = [payload]
    if isinstance(payload, Mapping):
        candidates.extend([payload.get("data"), payload.get("result"), payload.get("issue"), payload.get("document"), payload.get("comment")])
    text_parts: list[str] = []
    for candidate in candidates:
        if not isinstance(candidate, Mapping):
            continue
        for key in ("markdown", "body", "content", "text", "description", "title", "name"):
            value = candidate.get(key)
            if isinstance(value, str) and value.strip():
                text_parts.append(value)
    if not text_parts and isinstance(response.get("text"), str):
        text_parts.append(str(response["text"]))
    return "\n".join(dict.fromkeys(text_parts))


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


def _make_probe_result(
    *,
    probe_id: str,
    method: str,
    path: str,
    result: Mapping[str, Any],
    description: str,
) -> dict[str, Any]:
    return {
        "probe_id": probe_id,
        "description": description,
        "method": method.upper(),
        "path": path,
        "ok": result.get("ok") is True,
        "status_code": result.get("status_code"),
        "duration_ms": result.get("duration_ms"),
        "error": result.get("error"),
        "message": result.get("message"),
        "truncated": result.get("truncated") is True,
        "malformed_json_reason": result.get("malformed_json_reason"),
        "response_summary": _response_summary(result),
    }


def _extract_runtime_version_build(*responses: Mapping[str, Any]) -> dict[str, str | None]:
    for response in responses:
        payload = response.get("json")
        candidates: list[Any] = [payload]
        if isinstance(payload, Mapping):
            candidates.extend([payload.get("data"), payload.get("runtime"), payload.get("paperclip")])
        for candidate in candidates:
            if not isinstance(candidate, Mapping):
                continue
            version = candidate.get("version") or candidate.get("paperclipVersion") or candidate.get("runtime_version") or candidate.get("serverVersion")
            build = candidate.get("build") or candidate.get("buildId") or candidate.get("commit") or candidate.get("commit_sha")
            if version or build:
                return {
                    "version": str(version) if version else None,
                    "build": str(build) if build else f"health.version:{version}" if version else None,
                }
    return {"version": None, "build": None}


def _extract_keys(json_value: Any, container_fields: Sequence[str]) -> list[str]:
    keys: list[str] = []

    def add(candidate: Any) -> None:
        if isinstance(candidate, str) and candidate.strip():
            keys.append(candidate.strip())
        elif isinstance(candidate, Mapping):
            value = _first_string(candidate, ("key", "id", "name", "plugin_key", "pluginKey", "tool_key", "toolKey"))
            if value:
                keys.append(value)
        elif isinstance(candidate, list):
            for item in candidate:
                add(item)

    if isinstance(json_value, list):
        add(json_value)
    if isinstance(json_value, Mapping):
        for field in container_fields:
            if field in json_value:
                add(json_value.get(field))
        def walk(obj: Any) -> None:
            if isinstance(obj, Mapping):
                for k, v in obj.items():
                    if k in container_fields:
                        add(v)
                    else:
                        walk(v)
            elif isinstance(obj, list):
                for item in obj:
                    walk(item)
        walk(json_value)
    return list(dict.fromkeys(keys))


def _status_is_pass(value: Any) -> bool:
    return isinstance(value, str) and value.strip().lower() in STATUS_PASS


def _headers_from_env(env_name: str | None, header_name: str) -> dict[str, str]:
    if not env_name:
        return {}
    value = os.environ.get(env_name)
    if not value:
        return {}
    if header_name.lower() == "authorization" and not value.lower().startswith(("bearer ", "basic ")):
        value = f"Bearer {value}"
    return {header_name: value}


# ---------------------------------------------------------------------------
# Probes
# ---------------------------------------------------------------------------

def probe_health_version(client: HttpClient) -> dict[str, Any]:
    health = client.request("GET", "/api/health")
    version: dict[str, Any] = {}
    if not health.get("ok"):
        version = client.request("GET", "/api/version")
    runtime = _extract_runtime_version_build(health, version)
    results = [health]
    if version:
        results.append(version)
    return {
        "probe": "health_version",
        "runtime": runtime,
        "results": [_make_probe_result(
            probe_id="p01",
            method=r["url"].split()[0] if " " in str(r.get("url", "")) else "GET",
            path="/api/health" if i == 0 else "/api/version",
            result=r,
            description="Paperclip health/version readback",
        ) for i, r in enumerate(results)],
    }


def probe_plugin_install_path(
    client: HttpClient,
    company_id: str,
    plugin_key: str,
) -> dict[str, Any]:
    paths = [
        f"/api/companies/{_quote(company_id)}/plugins",
        f"/api/plugins",
        f"/api/plugins/{_quote(plugin_key)}",
    ]
    results: list[dict[str, Any]] = []
    observed_keys: list[str] = []
    for i, path in enumerate(paths):
        result = client.request("GET", path)
        results.append(_make_probe_result(
            probe_id=f"p02-r{i+1:02d}",
            method="GET",
            path=path,
            result=result,
            description="Plugin install path discovery",
        ))
        keys = _extract_keys(result.get("json"), ("plugins", "registered_plugins", "registeredPluginKeys", "pluginKeys"))
        observed_keys.extend(keys)
    observed_keys = list(dict.fromkeys(observed_keys))
    plugin_found = plugin_key in observed_keys or any(
        r.get("ok") and plugin_key in str(r.get("json"))
        for r in results
    )
    return {
        "probe": "plugin_install_path",
        "plugin_key": plugin_key,
        "plugin_found": plugin_found,
        "observed_keys": observed_keys,
        "results": results,
    }


def probe_tool_registry(
    client: HttpClient,
    company_id: str,
    plugin_key: str,
) -> dict[str, Any]:
    paths = [
        f"/api/companies/{_quote(company_id)}/plugins/{_quote(plugin_key)}/tools",
        f"/api/plugins/{_quote(plugin_key)}/tools",
    ]
    results: list[dict[str, Any]] = []
    observed_tools: list[str] = []
    for i, path in enumerate(paths):
        result = client.request("GET", path)
        results.append(_make_probe_result(
            probe_id=f"p03-r{i+1:02d}",
            method="GET",
            path=path,
            result=result,
            description="Tool registry readback for piko:* tools",
        ))
        keys = _extract_keys(result.get("json"), ("tools", "registered_tools", "registeredToolKeys", "toolKeys"))
        observed_tools.extend(keys)
    observed_tools = list(dict.fromkeys(observed_tools))
    piko_tools = [k for k in observed_tools if k.startswith(PIKO_TOOL_PREFIX)]
    return {
        "probe": "tool_registry",
        "plugin_key": plugin_key,
        "observed_tools": observed_tools,
        "piko_tools_observed": piko_tools,
        "results": results,
    }


def probe_secret_materialization(
    client: HttpClient,
    company_id: str,
) -> dict[str, Any]:
    secret_present = bool(os.environ.get(SECRET_NAME))
    secret_ref = f"env:{SECRET_NAME}"
    test_body = {
        "adapterConfig": {
            "hermesCommand": "/paperclip/hermes-runtime/bin/hermes-paperclip",
            "secret_ref": secret_ref,
            "base_url_ref": "env:XIAOMI_BASE_URL",
            "provider": "xiaomi",
            "model": "mimo-v2.5-pro",
            "timeoutSec": 300,
        }
    }
    paths = [
        f"/api/companies/{_quote(company_id)}/adapters/{ADAPTER_TYPE_HERMES}/test-environment",
        f"/api/adapters/{ADAPTER_TYPE_HERMES}/test-environment",
    ]
    results: list[dict[str, Any]] = []
    for i, path in enumerate(paths):
        result = client.request("POST", path, test_body)
        results.append(_make_probe_result(
            probe_id=f"p04-r{i+1:02d}",
            method="POST",
            path=path,
            result=result,
            description=f"Secret materialization test for {SECRET_NAME} via Hermes testEnvironment",
        ))

    primary = results[0] if results else {}
    payload = _as_mapping(primary.get("response_summary", {}).get("json") if isinstance(primary.get("response_summary"), Mapping) else None)
    if not payload and primary.get("json") is not None:
        payload = _as_mapping(primary.get("json"))
    # Walk for status
    test_status = None
    if isinstance(payload, Mapping):
        test_status = payload.get("status") or ("pass" if primary.get("ok") else "fail")
    elif primary.get("ok"):
        test_status = "pass"
    else:
        test_status = "fail"

    return {
        "probe": "secret_materialization",
        "secret_name": SECRET_NAME,
        "secret_present_in_env": secret_present,
        "secret_ref": secret_ref,
        "test_status": test_status,
        "results": results,
    }


def probe_artifact_regression_smoke(
    client: HttpClient,
    company_id: str,
    run_label: str,
) -> dict[str, Any]:
    issue_id: str | None = None
    document_id: str | None = None
    comment_id: str | None = None
    results: list[dict[str, Any]] = []
    side_effects = {"issues_created": 0, "documents_created": 0, "comments_created": 0}

    # Create issue
    body = {
        "company_id": company_id,
        "title": f"M006 S00 regression smoke {run_label}",
        "body": "Bounded M006 S00 runtime capability inventory regression smoke issue.",
        "labels": ["bos-light", "m006-s00", "regression-smoke"],
        "metadata": {"schema_version": SCHEMA_VERSION, "run_label": run_label},
    }
    create = client.request("POST", f"/api/companies/{_quote(company_id)}/issues", body)
    results.append(_make_probe_result(
        probe_id="p05-r01",
        method="POST",
        path=f"/api/companies/{_quote(company_id)}/issues",
        result=create,
        description="Create regression smoke issue",
    ))
    if not create.get("ok"):
        return {
            "probe": "artifact_regression_smoke",
            "issue_id": None,
            "document_id": None,
            "comment_id": None,
            "side_effects": side_effects,
            "readbacks": {},
            "results": results,
        }
    side_effects["issues_created"] += 1
    issue_id = _extract_id(create, ("issue_id", "issueId", "id", "key"))
    if not issue_id:
        return {
            "probe": "artifact_regression_smoke",
            "issue_id": None,
            "document_id": None,
            "comment_id": None,
            "side_effects": side_effects,
            "readbacks": {},
            "results": results,
        }

    # Readback issue
    issue_readback = client.request("GET", f"/api/issues/{_quote(issue_id)}")
    results.append(_make_probe_result(
        probe_id="p05-r02",
        method="GET",
        path=f"/api/issues/{_quote(issue_id)}",
        result=issue_readback,
        description="Readback regression smoke issue",
    ))

    # Create document
    doc_key = "m006-s00-evidence"
    doc_body = {
        "title": f"M006 S00 Evidence {run_label}",
        "format": "markdown",
        "body": f"# M006 S00 Runtime Capability Inventory\n\nRun label: {run_label}\n\nThis document verifies native document creation remains available.",
    }
    doc_create = client.request("PUT", f"/api/issues/{_quote(issue_id)}/documents/{_quote(doc_key)}", doc_body)
    results.append(_make_probe_result(
        probe_id="p05-r03",
        method="PUT",
        path=f"/api/issues/{_quote(issue_id)}/documents/{_quote(doc_key)}",
        result=doc_create,
        description="Create regression smoke document",
    ))
    if doc_create.get("ok"):
        side_effects["documents_created"] += 1
        document_id = _extract_id(doc_create, ("document_id", "documentId", "id")) or doc_key

    # Readback document
    doc_readback = client.request("GET", f"/api/issues/{_quote(issue_id)}/documents/{_quote(doc_key)}")
    results.append(_make_probe_result(
        probe_id="p05-r04",
        method="GET",
        path=f"/api/issues/{_quote(issue_id)}/documents/{_quote(doc_key)}",
        result=doc_readback,
        description="Readback regression smoke document",
    ))

    # Create comment
    comment_body = {"body": f"M006 S00 regression smoke comment. Run label: {run_label}."}
    comment_create = client.request("POST", f"/api/issues/{_quote(issue_id)}/comments", comment_body)
    results.append(_make_probe_result(
        probe_id="p05-r05",
        method="POST",
        path=f"/api/issues/{_quote(issue_id)}/comments",
        result=comment_create,
        description="Create regression smoke comment",
    ))
    if comment_create.get("ok"):
        side_effects["comments_created"] += 1
        comment_id = _extract_id(comment_create, ("comment_id", "commentId", "id"))

    # Readback comment
    comment_readback: dict[str, Any] = {}
    if comment_id:
        comment_readback = client.request("GET", f"/api/issues/{_quote(issue_id)}/comments/{_quote(comment_id)}")
        results.append(_make_probe_result(
            probe_id="p05-r06",
            method="GET",
            path=f"/api/issues/{_quote(issue_id)}/comments/{_quote(comment_id)}",
            result=comment_readback,
            description="Readback regression smoke comment",
        ))

    def _readback_summary(kind: str, ref: str | None, response: Mapping[str, Any]) -> dict[str, Any]:
        text = _extract_text(response)
        return {
            "kind": kind,
            "ref": ref,
            "status_code": response.get("status_code"),
            "ok": response.get("ok") is True,
            "sha256": hashlib.sha256(text.encode("utf-8")).hexdigest() if text else None,
            "snippet": _redact_string(text[:500]),
        }

    readbacks = {
        "issue": _readback_summary("issue", issue_id, issue_readback),
        "document": _readback_summary("document", document_id, doc_readback),
        "comment": _readback_summary("comment", comment_id, comment_readback),
    }

    return {
        "probe": "artifact_regression_smoke",
        "issue_id": issue_id,
        "document_id": document_id,
        "comment_id": comment_id,
        "side_effects": side_effects,
        "readbacks": readbacks,
        "results": results,
    }


# ---------------------------------------------------------------------------
# Blocker codes and evidence assembly
# ---------------------------------------------------------------------------

def _compute_blocker_codes(evidence: Mapping[str, Any]) -> list[str]:
    codes: list[str] = []
    inputs = _as_mapping(evidence.get("inputs"))
    probes = _as_mapping(evidence.get("probes"))
    runtime = _as_mapping(evidence.get("runtime"))

    if not inputs.get("base_url"):
        codes.append("missing_base_url")
    if not inputs.get("auth_token_present"):
        codes.append("missing_auth")
    if not inputs.get("company_id"):
        codes.append("missing_company_id")

    # P01: health/version
    p01 = _as_mapping(probes.get("health_version"))
    p01_results = _as_sequence(p01.get("results"))
    if p01_results:
        first = _as_mapping(p01_results[0])
        if not first.get("ok"):
            status = first.get("status_code")
            if status in (401, 403):
                codes.append("health_auth_denied")
            elif status == 404:
                codes.append("health_endpoint_unsupported")
            elif first.get("error") == "timeout":
                codes.append("health_timeout")
            else:
                codes.append("health_unavailable")
    if not runtime.get("version") or not runtime.get("build"):
        codes.append("runtime_version_build_missing")

    # P02: plugin install path
    p02 = _as_mapping(probes.get("plugin_install_path"))
    p02_results = _as_sequence(p02.get("results"))
    if p02_results:
        first = _as_mapping(p02_results[0])
        if not first.get("ok"):
            status = first.get("status_code")
            if status in (401, 403):
                codes.append("plugin_install_auth_denied")
            elif status == 404:
                codes.append("plugin_install_endpoint_unsupported")
            else:
                codes.append("plugin_install_unavailable")
    if not p02.get("plugin_found"):
        codes.append("plugin_not_found")

    # P03: tool registry
    p03 = _as_mapping(probes.get("tool_registry"))
    p03_results = _as_sequence(p03.get("results"))
    if p03_results:
        first = _as_mapping(p03_results[0])
        if not first.get("ok"):
            status = first.get("status_code")
            if status in (401, 403):
                codes.append("tool_registry_auth_denied")
            elif status == 404:
                codes.append("tool_registry_endpoint_unsupported")
            else:
                codes.append("tool_registry_unavailable")
    if not _as_sequence(p03.get("piko_tools_observed")):
        codes.append("piko_tools_not_observed")

    # P04: secret materialization
    p04 = _as_mapping(probes.get("secret_materialization"))
    p04_results = _as_sequence(p04.get("results"))
    if not p04.get("secret_present_in_env"):
        codes.append("missing_secret_env")
    if p04_results:
        first = _as_mapping(p04_results[0])
        if not first.get("ok"):
            status = first.get("status_code")
            if status in (401, 403):
                codes.append("secret_materialization_auth_denied")
            elif status == 404:
                codes.append("secret_materialization_endpoint_unsupported")
            elif status == 422:
                codes.append("secret_materialization_unsupported_config")
            else:
                codes.append("secret_materialization_failed")
    if p04.get("test_status") and not _status_is_pass(p04.get("test_status")):
        codes.append("secret_materialization_test_not_passing")

    # P05: artifact regression smoke
    p05 = _as_mapping(probes.get("artifact_regression_smoke"))
    p05_results = _as_sequence(p05.get("results"))
    readbacks = _as_mapping(p05.get("readbacks"))
    side_effects = _as_mapping(p05.get("side_effects"))

    if p05_results:
        first = _as_mapping(p05_results[0])
        if not first.get("ok"):
            status = first.get("status_code")
            if status in (401, 403):
                codes.append("artifact_smoke_auth_denied")
            elif status == 404:
                codes.append("artifact_smoke_endpoint_unsupported")
            else:
                codes.append("artifact_smoke_issue_create_failed")

    issue_rb = _as_mapping(readbacks.get("issue"))
    doc_rb = _as_mapping(readbacks.get("document"))
    comment_rb = _as_mapping(readbacks.get("comment"))

    if not issue_rb.get("ok"):
        codes.append("issue_readback_failed")
    if not doc_rb.get("ok"):
        codes.append("document_readback_failed")
    if not comment_rb.get("ok"):
        codes.append("comment_readback_failed")
    if not doc_rb.get("sha256"):
        codes.append("document_readback_hash_missing")
    if not comment_rb.get("sha256"):
        codes.append("comment_readback_hash_missing")

    if side_effects.get("issues_created") != 1:
        codes.append("unexpected_issue_side_effect_count")
    if side_effects.get("documents_created") != 1:
        codes.append("unexpected_document_side_effect_count")
    if side_effects.get("comments_created") != 1:
        codes.append("unexpected_comment_side_effect_count")

    return sorted(dict.fromkeys(code for code in codes if code)) or ["missing_bos_runtime_proof"]


def _is_passing(evidence: Mapping[str, Any]) -> bool:
    probes = _as_mapping(evidence.get("probes"))
    runtime = _as_mapping(evidence.get("runtime"))
    side_effects = _as_mapping(_as_mapping(probes.get("artifact_regression_smoke")).get("side_effects"))
    readbacks = _as_mapping(_as_mapping(probes.get("artifact_regression_smoke")).get("readbacks"))

    has_version_build = bool(runtime.get("version") and runtime.get("build"))
    plugin_found = _as_mapping(probes.get("plugin_install_path")).get("plugin_found") is True
    has_piko_tools = bool(_as_sequence(_as_mapping(probes.get("tool_registry")).get("piko_tools_observed")))
    secret_pass = _status_is_pass(_as_mapping(probes.get("secret_materialization")).get("test_status"))

    issue_rb = _as_mapping(readbacks.get("issue"))
    doc_rb = _as_mapping(readbacks.get("document"))
    comment_rb = _as_mapping(readbacks.get("comment"))

    return all([
        has_version_build,
        plugin_found,
        has_piko_tools,
        secret_pass,
        issue_rb.get("ok") is True,
        doc_rb.get("ok") is True,
        comment_rb.get("ok") is True,
        doc_rb.get("sha256") is not None,
        comment_rb.get("sha256") is not None,
        side_effects.get("issues_created") == 1,
        side_effects.get("documents_created") == 1,
        side_effects.get("comments_created") == 1,
    ])


def build_evidence(
    *,
    output_path: Path | None = DEFAULT_OUTPUT,
    env: Mapping[str, str] | None = None,
    timeout_seconds: float | None = None,
    company_id: str | None = None,
    plugin_key: str = "bos-light",
    run_label: str | None = None,
    origin: str | None = None,
) -> dict[str, Any]:
    env = env if env is not None else os.environ
    started_at = _utc_now()

    base_url = str(env.get("PAPERCLIP_BASE_URL") or "").rstrip("/")
    token_env = str(env.get("PAPERCLIP_API_KEY_ENV") or "PAPERCLIP_API_KEY")
    header_name = str(env.get("PAPERCLIP_AUTH_HEADER") or "Authorization")
    company_id = company_id or str(env.get("PAPERCLIP_COMPANY_ID") or env.get("PAPERCLIP_SANDBOX_COMPANY_ID") or "")
    timeout = float(timeout_seconds if timeout_seconds is not None else env.get("PAPERCLIP_TIMEOUT_SECONDS", DEFAULT_TIMEOUT_SECONDS))
    run_label = run_label or f"m006-s00-{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}"
    headers = _headers_from_env(token_env, header_name)
    live_probe_enabled = bool(base_url and headers and company_id)

    evidence: dict[str, Any] = {
        "schema_version": SCHEMA_VERSION,
        "artifact_type": BLOCKER_ARTIFACT_TYPE,
        "phase": "live",
        "generated_at": started_at,
        "runner": {
            "script": "scripts/run_m006_s00_runtime_capability_inventory.py",
            "standard_library_only": True,
            "max_response_bytes": MAX_RESPONSE_BYTES,
            "max_route_attempts": MAX_ROUTE_ATTEMPTS,
        },
        "inputs": {
            "base_url": base_url or "",
            "auth_token_env": token_env,
            "auth_header_name": header_name,
            "auth_token_present": bool(headers),
            "company_id": company_id,
            "plugin_key": plugin_key,
            "run_label": run_label,
            "origin": origin or "",
            "timeout_seconds": timeout,
            "live_probe_enabled": live_probe_enabled,
        },
        "runtime": {"version": None, "build": None},
        "probes": {},
        "side_effect_counters": {
            "issues_created": 0,
            "documents_created": 0,
            "comments_created": 0,
            "approval_requests_created": 0,
            "hermes_runs_started": 0,
            "gsd_pi_runs_started": 0,
        },
        "redaction": {
            "secrets_redacted": True,
            "secret_env_vars": [token_env, SECRET_NAME],
            "redaction_errors": [],
        },
        "fallback_diagnostics": [],
        "validation_errors": [],
    }

    if not live_probe_enabled:
        missing = []
        if not base_url:
            missing.append("PAPERCLIP_BASE_URL")
        if not headers:
            missing.append(token_env)
        if not company_id:
            missing.append("PAPERCLIP_COMPANY_ID")
        evidence["fallback_diagnostics"].append({
            "code": "missing_live_probe_env",
            "message": "M006 S00 did not run live HTTP probes because required sandbox env was absent.",
            "missing_env": missing,
        })
        evidence["blocker_codes"] = _compute_blocker_codes(evidence)
        evidence["blocker_reason"] = ",".join(evidence["blocker_codes"])
        evidence = _deep_redact(evidence)
        if output_path is not None:
            destination = ROOT / output_path if not output_path.is_absolute() else output_path
            destination.parent.mkdir(parents=True, exist_ok=True)
            destination.write_text(json.dumps(evidence, indent=2, sort_keys=True) + "\n", encoding="utf-8")
        return evidence

    client = HttpClient(base_url, headers, timeout, origin)

    # Probe 1: health/version
    p01 = probe_health_version(client)
    evidence["runtime"] = p01.get("runtime", evidence["runtime"])
    evidence["probes"]["health_version"] = p01

    # Probe 2: plugin install path
    p02 = probe_plugin_install_path(client, company_id, plugin_key)
    evidence["probes"]["plugin_install_path"] = p02

    # Probe 3: tool registry
    p03 = probe_tool_registry(client, company_id, plugin_key)
    evidence["probes"]["tool_registry"] = p03

    # Probe 4: secret materialization
    p04 = probe_secret_materialization(client, company_id)
    evidence["probes"]["secret_materialization"] = p04

    # Probe 5: artifact regression smoke
    p05 = probe_artifact_regression_smoke(client, company_id, run_label)
    evidence["probes"]["artifact_regression_smoke"] = p05
    p05_side_effects = _as_mapping(p05.get("side_effects"))
    evidence["side_effect_counters"]["issues_created"] = p05_side_effects.get("issues_created") or 0
    evidence["side_effect_counters"]["documents_created"] = p05_side_effects.get("documents_created") or 0
    evidence["side_effect_counters"]["comments_created"] = p05_side_effects.get("comments_created") or 0

    if _is_passing(evidence):
        evidence["artifact_type"] = PASSING_ARTIFACT_TYPE
        evidence["capability_promotions"] = [
            "runtime.health_version",
            "runtime.plugin_install_path",
            "runtime.tool_registry",
            "runtime.secret_materialization",
            "runtime.artifact_regression_smoke",
        ]
    else:
        evidence["artifact_type"] = BLOCKER_ARTIFACT_TYPE
        evidence["capability_promotions"] = []
        evidence["blocker_codes"] = _compute_blocker_codes(evidence)
        evidence["blocker_reason"] = ",".join(evidence["blocker_codes"])

    evidence = _deep_redact(evidence)
    evidence["generated_at"] = started_at  # preserve original

    if output_path is not None:
        destination = ROOT / output_path if not output_path.is_absolute() else output_path
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_text(json.dumps(evidence, indent=2, sort_keys=True) + "\n", encoding="utf-8")

    return evidence


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Run bounded M006 S00 runtime capability inventory probes.")
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--timeout-seconds", type=float, default=None)
    parser.add_argument("--company-id", default=None)
    parser.add_argument("--plugin-key", default="bos-light")
    parser.add_argument("--run-label", default=None)
    parser.add_argument("--origin", default=os.environ.get("PAPERCLIP_ORIGIN"))
    args = parser.parse_args(argv)

    try:
        evidence = build_evidence(
            output_path=args.output,
            timeout_seconds=args.timeout_seconds,
            company_id=args.company_id,
            plugin_key=args.plugin_key,
            run_label=args.run_label,
            origin=args.origin,
        )
    except Exception as exc:
        evidence = {
            "schema_version": SCHEMA_VERSION,
            "artifact_type": BLOCKER_ARTIFACT_TYPE,
            "phase": "live",
            "generated_at": _utc_now(),
            "blocker_reason": f"runner_exception:{type(exc).__name__}",
            "blocker_codes": [f"runner_exception:{type(exc).__name__}"],
            "inputs": {
                "base_url": os.environ.get("PAPERCLIP_BASE_URL", ""),
                "auth_token_present": bool(os.environ.get("PAPERCLIP_API_KEY")),
            },
            "runner": {
                "script": "scripts/run_m006_s00_runtime_capability_inventory.py",
                "standard_library_only": True,
            },
            "diagnostics": [{"phase": "runner.exception", "message": _redact_string(str(exc))}],
        }
        evidence = _deep_redact(evidence)
        target = ROOT / args.output if not args.output.is_absolute() else args.output
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(json.dumps(evidence, indent=2, sort_keys=True) + "\n", encoding="utf-8")
        print(f"M006 S00 probe wrote blocker evidence (runner exception): {target}", file=sys.stderr)
        return 1

    print(json.dumps({
        "output": str(args.output),
        "artifact_type": evidence.get("artifact_type"),
        "passing": _is_passing(evidence),
        "blocker_codes": evidence.get("blocker_codes", []),
    }, indent=2, sort_keys=True))
    return 0 if evidence.get("artifact_type") == PASSING_ARTIFACT_TYPE else 2


if __name__ == "__main__":
    raise SystemExit(main())
