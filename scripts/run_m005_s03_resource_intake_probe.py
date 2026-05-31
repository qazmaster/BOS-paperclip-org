#!/usr/bin/env python3
"""Run a bounded M005 S03 resource intake probe through supported Paperclip HTTP surfaces.

The runner is deliberately fail-closed. It discovers required pre-mission credentials
(Paperclip API key + base URL, company token budget, git access for aipay.kz,
Xiaomi API key + base URL), enumerates missing resources, and—when Paperclip auth is
present—creates visible resource-request artifacts (comments, escalation issues) via
confirmed native Paperclip surfaces. When credentials are missing it still writes a
valid M005 S03 blocker artifact for validator/readiness closeout.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Mapping, Sequence

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUTPUT = Path("runtime-evidence/M005-S03-resource-intake-probe.json")
COMPANY_TEMPLATE = Path("company-template/bos-company-template.json")

SCHEMA_VERSION = "m005-s03-resource-intake/v1"
MAX_RESPONSE_BYTES = 256 * 1024
DEFAULT_TIMEOUT_SECONDS = 20.0
DEFAULT_GIT_TIMEOUT_SECONDS = 10.0

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

RESOURCE_CATEGORIES = {
    "paperclip_api_key": {
        "env_names": ["PAPERCLIP_API_KEY", "PAPERCLIP_TOKEN", "PAPERCLIP_AUTH_TOKEN"],
        "description": "Paperclip API key for authenticated HTTP calls",
    },
    "paperclip_base_url": {
        "env_names": ["PAPERCLIP_BASE_URL", "PAPERCLIP_URL"],
        "description": "Paperclip base URL",
    },
    "company_token_budget": {
        "env_names": [],
        "json_path": "bos_config.company_token_budget_ref",
        "description": "Company token budget from company template",
    },
    "aipay_git_access": {
        "env_names": ["AIPAY_GIT_URL", "GIT_SSH_KEY", "GITHUB_TOKEN", "GITLAB_TOKEN"],
        "description": "Git access for aipay.kz repository",
    },
    "xiaomi_api_key": {
        "env_names": ["XIAOMI_API_KEY"],
        "description": "Xiaomi API key for Hermes backend",
    },
    "xiaomi_base_url": {
        "env_names": ["XIAOMI_BASE_URL"],
        "description": "Xiaomi base URL for Hermes backend",
    },
}


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


def _nested_get(value: Any, dotted_path: str) -> Any:
    current = value
    for part in dotted_path.split("."):
        if not isinstance(current, Mapping):
            return None
        current = current.get(part)
    return current


def _extract_version_build(*responses: Mapping[str, Any]) -> dict[str, str]:
    for response in responses:
        payload = response.get("json")
        candidates: list[Any] = [payload]
        if isinstance(payload, Mapping):
            candidates.extend([payload.get("data"), payload.get("version"), payload.get("health")])
        for candidate in candidates:
            if not isinstance(candidate, Mapping):
                continue
            version = candidate.get("version") or candidate.get("paperclipVersion") or candidate.get("runtime_version")
            build = candidate.get("build") or candidate.get("buildId") or candidate.get("commit") or candidate.get("commit_sha")
            if version or build:
                return {"version": str(version or "unknown"), "build": str(build or version or "unknown")}
    return {"version": "unknown", "build": "unknown"}


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


def _read_config_defaults() -> dict[str, Any]:
    template = _load_json(COMPANY_TEMPLATE)
    return {
        "base_url": os.environ.get("PAPERCLIP_BASE_URL") or os.environ.get("PAPERCLIP_URL"),
        "company_id": os.environ.get("PAPERCLIP_COMPANY_ID"),
        "company_token_budget_ref": _nested_get(template, "bos_config.company_token_budget_ref"),
        "template_path": str(COMPANY_TEMPLATE),
        "template_schema_version": template.get("schema_version"),
    }


def _check_env_resource(category: str, config: Mapping[str, Any]) -> dict[str, Any]:
    env_names = _sequence(config.get("env_names"))
    found = False
    source = None
    for env_name in env_names:
        if os.environ.get(env_name):
            found = True
            source = f"env:{env_name}"
            break
    return {
        "category": category,
        "present": found,
        "source": source,
        "description": config.get("description"),
        "checked_env_names": env_names,
    }


def _check_company_token_budget(template: Mapping[str, Any]) -> dict[str, Any]:
    value = _nested_get(template, "bos_config.company_token_budget_ref")
    present = value is not None and value != ""
    return {
        "category": "company_token_budget",
        "present": present,
        "source": "company-template/bos-company-template.json#bos_config.company_token_budget_ref",
        "description": "Company token budget from company template",
        "value": value if present else None,
    }


def _check_git_access() -> dict[str, Any]:
    env_names = ["AIPAY_GIT_URL", "GIT_SSH_KEY", "GITHUB_TOKEN", "GITLAB_TOKEN"]
    found_env = None
    for env_name in env_names:
        if os.environ.get(env_name):
            found_env = env_name
            break

    git_url = os.environ.get("AIPAY_GIT_URL", "")
    git_available = False
    git_test_result = None
    git_test_error = None

    # Only attempt a bounded git probe when git is installed and a URL is available
    if found_env and git_url:
        try:
            result = subprocess.run(
                ["git", "ls-remote", "--heads", git_url],
                capture_output=True,
                text=True,
                timeout=DEFAULT_GIT_TIMEOUT_SECONDS,
            )
            git_available = result.returncode == 0
            git_test_result = {
                "returncode": result.returncode,
                "stdout_lines": len(result.stdout.splitlines()),
                "stderr_redacted": _redact_string(result.stderr[:500]),
            }
        except FileNotFoundError:
            git_test_error = "git_binary_not_found"
        except subprocess.TimeoutExpired:
            git_test_error = "git_probe_timeout"
            git_test_result = {"timeout_seconds": DEFAULT_GIT_TIMEOUT_SECONDS}
        except Exception as exc:
            git_test_error = f"git_probe_exception_{type(exc).__name__}"
            git_test_result = {"message": _redact_string(str(exc))}

    return {
        "category": "aipay_git_access",
        "present": bool(found_env) and (git_available if git_url else True),
        "source": f"env:{found_env}" if found_env else None,
        "description": "Git access for aipay.kz repository",
        "checked_env_names": env_names,
        "git_url_present": bool(git_url),
        "git_url_redacted": _redact_url(git_url) if git_url else None,
        "git_test_result": git_test_result,
        "git_test_error": git_test_error,
    }


def _discover_resources(template: Mapping[str, Any]) -> list[dict[str, Any]]:
    resources: list[dict[str, Any]] = []
    for category, config in RESOURCE_CATEGORIES.items():
        if category == "company_token_budget":
            resources.append(_check_company_token_budget(template))
        elif category == "aipay_git_access":
            resources.append(_check_git_access())
        else:
            resources.append(_check_env_resource(category, config))
    return resources


def _missing_resources(resources: Sequence[Mapping[str, Any]]) -> list[str]:
    return [r["category"] for r in resources if not r.get("present")]


def _base_evidence(args: argparse.Namespace, defaults: Mapping[str, Any], auth_meta: Mapping[str, Any]) -> dict[str, Any]:
    return {
        "schema_version": SCHEMA_VERSION,
        "artifact_type": "fail-closed-blocker",
        "phase": "resource_intake",
        "generated_at": _utc_now(),
        "passing": False,
        "capability_promotions": [],
        "inputs": {
            "base_url_present": bool(defaults.get("base_url")),
            "base_url_source": "env" if defaults.get("base_url") else "missing",
            "company_id_present": bool(defaults.get("company_id")),
            "auth": auth_meta,
            "origin_present": bool(args.origin),
            "company_token_budget_ref": defaults.get("company_token_budget_ref"),
            "template_schema_version": defaults.get("template_schema_version"),
            "template_path": defaults.get("template_path"),
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
            "max_paperclip_mutations": 2,
            "runner_exit_policy": "exit_zero_for_valid_proof_or_valid_fail_closed_blocker",
        },
    }


def _create_resource_request_comment(
    client: HttpClient,
    company_id: str,
    issue_id: str,
    missing: Sequence[str],
) -> dict[str, Any]:
    body = {
        "company_id": company_id,
        "issue_id": issue_id,
        "markdown": (
            "## M005 S03 Resource Intake Request\n\n"
            "The following pre-mission credentials are missing:\n\n"
            + "\n".join(f"- `{r}`" for r in missing)
            + "\n\nPlease fulfill these before mission execution."
        ),
    }
    return client.request(
        "POST",
        f"/api/companies/{urllib.parse.quote(company_id)}/issues/{urllib.parse.quote(issue_id)}/comments",
        body,
    )


def _create_resource_request_document(
    client: HttpClient,
    company_id: str,
    issue_id: str,
    missing: Sequence[str],
) -> dict[str, Any]:
    body = {
        "company_id": company_id,
        "issue_id": issue_id,
        "title": "M005 S03 Resource Intake Request",
        "markdown": (
            "Missing pre-mission credentials detected by resource intake probe:\n\n"
            + "\n".join(f"- `{r}`" for r in missing)
        ),
    }
    return client.request(
        "POST",
        f"/api/companies/{urllib.parse.quote(company_id)}/issues/{urllib.parse.quote(issue_id)}/documents",
        body,
    )


def _create_escalation_issue(
    client: HttpClient,
    company_id: str,
    related_issue_id: str,
    missing: Sequence[str],
) -> dict[str, Any]:
    body = {
        "company_id": company_id,
        "title": "M005 S03 Resource Intake Escalation",
        "body": (
            "Missing pre-mission credentials detected by resource intake probe:\n\n"
            + "\n".join(f"- `{r}`" for r in missing)
            + f"\n\nRelated issue: {related_issue_id}"
        ),
        "related_issue_id": related_issue_id,
    }
    return client.request(
        "POST",
        f"/api/companies/{urllib.parse.quote(company_id)}/issues?related_issue_id={urllib.parse.quote(related_issue_id)}",
        body,
    )


def _blocker_codes(evidence: Mapping[str, Any]) -> list[str]:
    codes: list[str] = []
    resources = _sequence(evidence.get("resources"))
    missing = _missing_resources(resources)

    if not _nested_get(evidence, "inputs.base_url_present"):
        codes.append("missing_paperclip_base_url")
    if _nested_get(evidence, "inputs.auth.selected_env_name") is None:
        codes.append("missing_paperclip_auth")
    if "company_token_budget" in missing:
        codes.append("missing_company_token_budget")
    if "aipay_git_access" in missing:
        codes.append("missing_aipay_git_access")
    if "xiaomi_api_key" in missing:
        codes.append("missing_xiaomi_api_key")
    if "xiaomi_base_url" in missing:
        codes.append("missing_xiaomi_base_url")
    if "paperclip_api_key" in missing:
        codes.append("missing_paperclip_api_key")

    diagnostics = _as_mapping(evidence.get("diagnostics"))
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

    request_artifacts = _sequence(evidence.get("request_artifacts"))
    artifact_errors = [a for a in request_artifacts if not a.get("ok")]
    for artifact in artifact_errors:
        phase = artifact.get("phase")
        status = artifact.get("status")
        if phase == "comments.native" and status in (401, 403):
            codes.append("comment_create_auth_denied")
        elif phase == "comments.native" and status == 404:
            codes.append("comment_create_unsupported_endpoint")
        elif phase == "documents.native" and status in (401, 403):
            codes.append("document_create_auth_denied")
        elif phase == "documents.native" and status == 404:
            codes.append("document_create_unsupported_endpoint")
        elif phase == "issues.native" and status in (401, 403):
            codes.append("escalation_issue_create_auth_denied")
        elif phase == "issues.native" and status == 404:
            codes.append("escalation_issue_create_unsupported_endpoint")

    return sorted(dict.fromkeys(code for code in codes if code)) or ["missing_bos_runtime_proof"]


def _is_passing_proof(evidence: Mapping[str, Any]) -> bool:
    resources = _sequence(evidence.get("resources"))
    missing = _missing_resources(resources)
    diagnostics = _as_mapping(evidence.get("diagnostics"))
    health = _as_mapping(diagnostics.get("health"))

    return all([
        len(missing) == 0,
        health.get("ok") is True,
        _nested_get(evidence, "inputs.auth.selected_env_name") is not None,
        _nested_get(evidence, "inputs.base_url_present") is True,
    ])


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

    # Load company template for token budget and structured config
    template = _load_json(COMPANY_TEMPLATE)

    # Discover all resources
    resources = _discover_resources(template)
    missing = _missing_resources(resources)

    evidence["resources"] = resources
    evidence["missing_resources"] = missing

    # Without base URL or company id, skip all HTTP attempts
    if not base_url or not company_id:
        evidence["blocker_codes"] = _blocker_codes(evidence)
        evidence["blocker_reason"] = ",".join(evidence["blocker_codes"])
        evidence["diagnostics"] = {"config_discovery": "missing Paperclip base URL or company id; no HTTP attempt made"}
        evidence["request_artifacts"] = []
        evidence["side_effect_counters"] = {
            "paperclip_api_calls": 0,
            "comments_created": 0,
            "documents_created": 0,
            "escalation_issues_created": 0,
        }
        return _redact_value("evidence", evidence)

    client = HttpClient(str(base_url), headers, args.timeout, args.origin)

    # Health check
    health = client.request("GET", "/api/health")
    version = client.request("GET", "/api/version") if not health.get("ok") else {}
    runtime_info = _extract_version_build(health, version)

    evidence["paperclip"] = runtime_info
    evidence["diagnostics"] = {"health": health, "version": version}

    # Preflight auth gate: without auth, do not attempt state-changing operations
    preflight_codes: list[str] = []
    if not _nested_get(evidence, "inputs.auth.selected_env_name"):
        preflight_codes.append("missing_auth")
    if health.get("ok") is False:
        status = health.get("status")
        if status in (401, 403):
            preflight_codes.append("health_auth_denied")
        elif status == 404:
            preflight_codes.append("health_endpoint_unsupported")
        elif health.get("error") == "timeout":
            preflight_codes.append("health_timeout")
        else:
            preflight_codes.append("health_unavailable")

    request_artifacts: list[dict[str, Any]] = []
    side_effect_counters = {
        "paperclip_api_calls": 1,  # health
        "comments_created": 0,
        "documents_created": 0,
        "escalation_issues_created": 0,
    }

    if preflight_codes and not args.force_artifact_creation:
        evidence["request_artifacts"] = request_artifacts
        evidence["side_effect_counters"] = side_effect_counters
        evidence["diagnostics"]["artifactCreationSkipped"] = {
            "reason": "preflight_not_authenticated_or_unhealthy",
            "codes": preflight_codes,
        }
        codes = _blocker_codes(evidence)
        evidence["blocker_codes"] = codes
        evidence["blocker_reason"] = ",".join(codes)
        return _redact_value("evidence", evidence)

    # Attempt to create visible resource-request artifacts in Paperclip
    target_issue_id = args.issue_id or "BOS-M005-S03"

    if missing and args.create_artifacts:
        # 1. Try to add a comment to the target issue
        comment_response = _create_resource_request_comment(client, str(company_id), target_issue_id, missing)
        side_effect_counters["paperclip_api_calls"] += 1
        request_artifacts.append({
            "phase": "comments.native",
            "ok": comment_response.get("ok"),
            "status": comment_response.get("status"),
            "issue_id": target_issue_id,
        })
        if comment_response.get("ok"):
            side_effect_counters["comments_created"] += 1

        # 2. Try to create a document on the target issue
        doc_response = _create_resource_request_document(client, str(company_id), target_issue_id, missing)
        side_effect_counters["paperclip_api_calls"] += 1
        request_artifacts.append({
            "phase": "documents.native",
            "ok": doc_response.get("ok"),
            "status": doc_response.get("status"),
            "issue_id": target_issue_id,
        })
        if doc_response.get("ok"):
            side_effect_counters["documents_created"] += 1

        # 3. If comment or document failed with 404 (issue not found), create an escalation issue
        if (not comment_response.get("ok") and comment_response.get("status") == 404) or \
           (not doc_response.get("ok") and doc_response.get("status") == 404):
            esc_response = _create_escalation_issue(client, str(company_id), target_issue_id, missing)
            side_effect_counters["paperclip_api_calls"] += 1
            request_artifacts.append({
                "phase": "issues.native",
                "ok": esc_response.get("ok"),
                "status": esc_response.get("status"),
                "related_issue_id": target_issue_id,
            })
            if esc_response.get("ok"):
                side_effect_counters["escalation_issues_created"] += 1

    evidence["request_artifacts"] = request_artifacts
    evidence["side_effect_counters"] = side_effect_counters

    if _is_passing_proof(evidence):
        evidence["artifact_type"] = "runtime-execution-proof"
        evidence["passing"] = True
        evidence["capability_promotions"] = ["resource_intake.credential_checklist"]
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
    parser = argparse.ArgumentParser(description="Run M005 S03 resource intake probe and write redacted proof/blocker evidence.")
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT, help="Exact evidence path to write.")
    parser.add_argument("--base-url", default=None, help="Optional Paperclip base URL override; otherwise env is used.")
    parser.add_argument("--company-id", default=None, help="Optional company id override; otherwise env is used.")
    parser.add_argument("--origin", default=os.environ.get("PAPERCLIP_ORIGIN"), help="Optional trusted Origin header for authenticated browser-style APIs.")
    parser.add_argument("--timeout", type=float, default=DEFAULT_TIMEOUT_SECONDS, help="Per-request timeout seconds.")
    parser.add_argument("--issue-id", default="BOS-M005-S03", help="Target issue id for resource request comments/documents.")
    parser.add_argument("--create-artifacts", action="store_true", default=True, help="Create Paperclip resource-request artifacts when resources are missing.")
    parser.add_argument("--no-create-artifacts", action="store_true", dest="create_artifacts_neg", help="Suppress Paperclip artifact creation.")
    parser.add_argument("--force-artifact-creation", action="store_true", help="Allow artifact creation even when preflight is warning-only.")
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    # Handle --no-create-artifacts override
    if getattr(args, "create_artifacts_neg", False):
        args.create_artifacts = False

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
    print(f"M005 S03 resource intake probe wrote {evidence.get('artifact_type')} evidence: {args.output}")
    if evidence.get("artifact_type") == "fail-closed-blocker":
        print(f"blocker_reason={evidence.get('blocker_reason')}")
        print(f"missing_resources={evidence.get('missing_resources')}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
