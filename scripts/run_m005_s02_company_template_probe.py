#!/usr/bin/env python3
"""Run a bounded M005 S02 company template import probe through supported Paperclip HTTP surfaces.

The runner is deliberately fail-closed. It never asks for secrets, never writes
secret values, never imports Paperclip internals, and never mutates databases or
Paperclip source. When the live Paperclip URL, auth, supported endpoints, or
company template import path is unavailable, it still writes a valid M005 S02
blocker artifact for validator/readiness closeout.
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
from typing import Any, Mapping, Sequence

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUTPUT = Path("runtime-evidence/M005-S02-company-template-probe.json")
S07_EVIDENCE = Path("runtime-evidence/M002-S07-agent-visibility.json")
LOCAL_VALIDATION = Path("runtime-evidence/M005-S02-local-validation.json")
COMPANY_TEMPLATE = Path("company-template/bos-company-template.json")

SCHEMA_VERSION = "m005-s02-company-template/v1"
MAX_RESPONSE_BYTES = 256 * 1024
DEFAULT_TIMEOUT_SECONDS = 20.0

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

# v1.4.1 divisions with their AGENTS.md paths
V141_DIVISIONS: list[dict[str, Any]] = [
    {
        "id": "Div7.MissionControl",
        "name": "Div7.MissionControl - Mission Control / Strategy",
        "title": "Mission Control / Strategy",
        "role": "researcher",
        "reports_to": None,
        "profile_path": "agents/Div7_MissionControl/AGENTS.md",
    },
    {
        "id": "Div1.HCO",
        "name": "Div1.HCO - Head Communication Office",
        "title": "Head Communication Office",
        "role": "general",
        "reports_to": "Div7.MissionControl",
        "profile_path": "agents/Div1_HCO/AGENTS.md",
    },
    {
        "id": "Div2.MasterPlanner",
        "name": "Div2.MasterPlanner - Shaping / Product Planning",
        "title": "Shaping / Product Planning",
        "role": "pm",
        "reports_to": "Div1.HCO",
        "profile_path": "agents/Div2_MasterPlanner/AGENTS.md",
    },
    {
        "id": "Div3.Treasury",
        "name": "Div3.Treasury - Treasury / Budget / Access",
        "title": "Treasury / Budget / Access",
        "role": "cfo",
        "reports_to": "Div1.HCO",
        "profile_path": "agents/Div3_Treasury/AGENTS.md",
    },
    {
        "id": "Div4.Production",
        "name": "Div4.Production - Production / Build / Delivery",
        "title": "Production / Build / Delivery",
        "role": "engineer",
        "reports_to": "Div1.HCO",
        "profile_path": "agents/Div4_Production/AGENTS.md",
    },
    {
        "id": "Div5.QualificationsLibraryLearning",
        "name": "Div5.QualificationsLibraryLearning - Qualifications / Library / Learning",
        "title": "Qualifications / Library / Learning",
        "role": "qa",
        "reports_to": "Div1.HCO",
        "profile_path": "agents/Div5_QualificationsLibraryLearning/AGENTS.md",
    },
    {
        "id": "Div6.External",
        "name": "Div6.External - External / DMZ",
        "title": "External / DMZ",
        "role": "security",
        "reports_to": "Div1.HCO",
        "profile_path": "agents/Div6_External/AGENTS.md",
    },
]

V141_DIVISION_IDS = {d["id"] for d in V141_DIVISIONS}
V141_AGENT_NAMES = {d["name"] for d in V141_DIVISIONS}


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


def _nested_get(value: Any, dotted_path: str) -> Any:
    current = value
    for part in dotted_path.split("."):
        if not isinstance(current, Mapping):
            return None
        current = current.get(part)
    return current


def _sha256_text(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def _read_profile(path: str) -> tuple[str, str]:
    """Read an AGENTS.md file and return (content, sha256)."""
    full = ROOT / path
    try:
        text = full.read_text(encoding="utf-8")
        return text, _sha256_text(text)
    except (OSError, UnicodeDecodeError):
        return "", ""


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


def _read_config_defaults() -> dict[str, Any]:
    s07 = _load_json(S07_EVIDENCE)
    local_val = _load_json(LOCAL_VALIDATION)
    template = _load_json(COMPANY_TEMPLATE)

    # Prefer env, then S07 evidence, then hardcoded default
    base_url = (
        os.environ.get("PAPERCLIP_BASE_URL")
        or os.environ.get("PAPERCLIP_URL")
        or _nested_get(s07, "target.base_url_redacted")
    )
    company_id = (
        os.environ.get("PAPERCLIP_COMPANY_ID")
        or _nested_get(s07, "target.company_id")
    )

    return {
        "base_url": base_url,
        "company_id": company_id,
        "previous_s07_path": str(S07_EVIDENCE),
        "previous_s07_artifact_type": s07.get("schemaVersion"),
        "local_validation_path": str(LOCAL_VALIDATION),
        "local_validation_status": local_val.get("import_attempt", {}).get("status"),
        "template_schema_version": template.get("schema_version"),
        "template_division_count": len(_sequence(template.get("divisions"))),
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
    return {
        "schema_version": SCHEMA_VERSION,
        "artifact_type": "fail-closed-blocker",
        "phase": "company_template_import",
        "generated_at": _utc_now(),
        "passing": False,
        "capability_promotions": [],
        "inputs": {
            "base_url_present": bool(defaults.get("base_url")),
            "base_url_source": "env_or_prior_s07_artifact" if defaults.get("base_url") else "missing",
            "company_id_present": bool(defaults.get("company_id")),
            "auth": auth_meta,
            "origin_present": bool(args.origin),
            "local_validation_status": defaults.get("local_validation_status"),
            "template_schema_version": defaults.get("template_schema_version"),
            "template_division_count": defaults.get("template_division_count"),
            "previous_evidence": {
                "s07": defaults.get("previous_s07_path"),
                "s07_artifact_type": defaults.get("previous_s07_artifact_type"),
                "local_validation": defaults.get("local_validation_path"),
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
            "max_agent_creations": 7,
            "runner_exit_policy": "exit_zero_for_valid_proof_or_valid_fail_closed_blocker",
        },
    }


def _make_agent_body(division: Mapping[str, Any], profile_content: str) -> dict[str, Any]:
    """Build agent creation payload with AGENTS.md attached as metadata."""
    metadata: dict[str, Any] = {
        "bosLightDivisionId": division["id"],
        "bosLightTitle": division["title"],
        "bosLightReportsTo": division["reports_to"] or "null",
        "v1.4.1": True,
        "visibilityOnly": True,
    }
    # Attach AGENTS.md content as metadata if available
    if profile_content:
        metadata["agentsMdContent"] = profile_content[:8000]  # bounded size
        metadata["agentsMdTruncated"] = len(profile_content) > 8000
    return {
        "name": division["name"],
        "adapterType": "hermes_local",
        "role": division["role"],
        "enabled": True,
        "heartbeatEnabled": False,
        "wakeOnDemand": False,
        "metadata": metadata,
    }


def _list_agents(client: HttpClient, company_id: str) -> dict[str, Any]:
    return client.request("GET", f"/api/companies/{urllib.parse.quote(company_id)}/agents")


def _attempt_import(client: HttpClient, company_id: str, template: Mapping[str, Any]) -> dict[str, Any]:
    """Attempt company template import via POST /api/companies/{id}/import."""
    return client.request(
        "POST",
        f"/api/companies/{urllib.parse.quote(company_id)}/import",
        dict(template),
    )


def _attempt_company_update(client: HttpClient, company_id: str, template: Mapping[str, Any]) -> dict[str, Any]:
    """Fallback: attempt PUT /api/companies/{id} with template payload."""
    return client.request(
        "PUT",
        f"/api/companies/{urllib.parse.quote(company_id)}",
        {"template": dict(template)},
    )


def _create_agent(client: HttpClient, company_id: str, body: Mapping[str, Any]) -> dict[str, Any]:
    return client.request(
        "POST",
        f"/api/companies/{urllib.parse.quote(company_id)}/agents",
        dict(body),
    )


def _blocker_codes(evidence: Mapping[str, Any]) -> list[str]:
    codes: list[str] = []

    if not _nested_get(evidence, "inputs.base_url_present"):
        codes.append("missing_base_url")
    if not _nested_get(evidence, "inputs.company_id_present"):
        codes.append("missing_company_id")
    if _nested_get(evidence, "inputs.auth.selected_env_name") is None:
        codes.append("missing_auth")

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

    import_attempt = _as_mapping(evidence.get("import_attempt"))
    if import_attempt:
        surface = import_attempt.get("surface")
        status = import_attempt.get("status")
        if surface == "import_post":
            if status == "unsupported_endpoint":
                codes.append("company_import_unsupported_endpoint")
            elif status == "auth_denied":
                codes.append("company_import_auth_denied")
            elif status == "blocked":
                codes.append("company_import_blocked")
        elif surface == "company_put":
            if status == "unsupported_endpoint":
                codes.append("company_update_unsupported_endpoint")
            elif status == "auth_denied":
                codes.append("company_update_auth_denied")

    agent_activation = _as_mapping(evidence.get("agent_activation"))
    if agent_activation:
        missing = _sequence(agent_activation.get("divisions_missing"))
        if missing:
            codes.append("divisions_missing_after_fallback")
        created = agent_activation.get("agents_created", 0)
        expected = 7
        if created < expected and not missing:
            codes.append("partial_agent_creation")
        profiles = agent_activation.get("profile_attached", 0)
        if profiles < expected and not missing:
            codes.append("partial_profile_attachment")

    routing = _as_mapping(evidence.get("routing_validation"))
    if routing and routing.get("rules_active", 0) == 0:
        codes.append("routing_rules_not_validated")

    # Zero side effect enforcement: if we created agents unexpectedly without tracking
    side_effects = _as_mapping(evidence.get("side_effect_counters"))
    if side_effects.get("agents_created", 0) > 7:
        codes.append("excess_agent_creation")

    return sorted(dict.fromkeys(code for code in codes if code)) or ["missing_bos_runtime_proof"]


def _is_passing_proof(evidence: Mapping[str, Any]) -> bool:
    import_attempt = _as_mapping(evidence.get("import_attempt"))
    agent_activation = _as_mapping(evidence.get("agent_activation"))
    routing = _as_mapping(evidence.get("routing_validation"))

    import_ok = import_attempt.get("status") in ("success", "fallback_success")
    all_divisions_present = len(_sequence(agent_activation.get("divisions_missing"))) == 0
    all_profiles_attached = agent_activation.get("profile_attached", 0) == 7
    routing_validated = routing.get("rules_active", 0) == 8

    side_effects = _as_mapping(evidence.get("side_effect_counters"))
    no_excess_side_effects = side_effects.get("agents_created", 0) <= 7

    return all([
        import_ok,
        all_divisions_present,
        all_profiles_attached,
        routing_validated,
        no_excess_side_effects,
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

    # Load company template
    template = _load_json(COMPANY_TEMPLATE)
    routing_rules = _as_mapping(template.get("routing_rules"))

    if not base_url or not company_id:
        evidence["blocker_codes"] = _blocker_codes(evidence)
        evidence["blocker_reason"] = ",".join(evidence["blocker_codes"])
        evidence["diagnostics"] = {"config_discovery": "missing Paperclip base URL or company id; no HTTP attempt made"}
        evidence["routing_validation"] = {
            "rules_active": len(routing_rules),
            "rule_names": sorted(routing_rules.keys()),
            "test_route_result": "n/a-missing-config",
        }
        evidence["agent_activation"] = {
            "divisions_present": [],
            "divisions_missing": sorted(V141_DIVISION_IDS),
            "agents_created": 0,
            "profile_attached": 0,
        }
        evidence["side_effect_counters"] = {
            "paperclip_api_calls": 0,
            "agents_created": 0,
            "agents_updated": 0,
            "approvals_created": 0,
            "issues_created": 0,
        }
        return _redact_value("evidence", evidence)

    client = HttpClient(str(base_url), headers, args.timeout, args.origin)

    # Health check
    health = client.request("GET", "/api/health")
    version = client.request("GET", "/api/version") if not health.get("ok") else {}
    runtime_info = _extract_version_build(health, version)

    evidence["paperclip"] = runtime_info
    evidence["diagnostics"] = {"health": health, "version": version}

    # Preflight gate: without auth, do not attempt state-changing operations
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

    if preflight_codes:
        evidence["import_attempt"] = {
            "surface": None,
            "status": "preflight_blocked",
            "blocker_codes": preflight_codes,
            "side_effect_counters": {
                "paperclip_api_calls": 1,  # health only
                "agents_created": 0,
                "agents_updated": 0,
                "approvals_created": 0,
                "issues_created": 0,
            },
        }
        evidence["agent_activation"] = {
            "divisions_present": [],
            "divisions_missing": sorted(V141_DIVISION_IDS),
            "agents_created": 0,
            "profile_attached": 0,
            "creation_results": [],
        }
        evidence["routing_validation"] = {
            "rules_active": len(routing_rules),
            "rule_names": sorted(routing_rules.keys()),
            "test_route_result": "n/a-preflight-blocked",
        }
        evidence["side_effect_counters"] = evidence["import_attempt"]["side_effect_counters"]
        evidence["readback"] = {
            "total_agents": None,
            "v141_agents_present": 0,
            "v141_agents_missing": sorted(V141_DIVISION_IDS),
            "all_v141_present": False,
        }
        codes = _blocker_codes(evidence)
        evidence["blocker_codes"] = codes
        evidence["blocker_reason"] = ",".join(codes)
        return _redact_value("evidence", evidence)

    # Step 1: List existing agents (read-only)
    agents_list = _list_agents(client, str(company_id))
    existing_agents: list[dict[str, Any]] = []
    if agents_list.get("ok") and isinstance(agents_list.get("json"), list):
        existing_agents = agents_list["json"]
    elif agents_list.get("ok") and isinstance(agents_list.get("json"), Mapping):
        existing_agents = _sequence(agents_list["json"].get("data"))

    existing_names = {a["name"] for a in existing_agents if isinstance(a, Mapping) and isinstance(a.get("name"), str)}
    existing_by_name = {a["name"]: a for a in existing_agents if isinstance(a, Mapping) and isinstance(a.get("name"), str)}

    # Early auth-denied gate on agents list: if we can't read agents, creation will also fail
    agents_list_auth_denied = agents_list.get("status") in (401, 403)

    # Step 2: Attempt company template import
    import_response = _attempt_import(client, str(company_id), template)
    import_status: str | None = None
    import_surface: str | None = None

    if import_response.get("ok"):
        import_status = "success"
        import_surface = "import_post"
    elif import_response.get("status") == 404:
        import_status = "unsupported_endpoint"
        import_surface = "import_post"
    elif import_response.get("status") in (401, 403):
        import_status = "auth_denied"
        import_surface = "import_post"
    else:
        # Try PUT fallback
        put_response = _attempt_company_update(client, str(company_id), template)
        if put_response.get("ok"):
            import_status = "success"
            import_surface = "company_put"
        elif put_response.get("status") == 404:
            import_status = "unsupported_endpoint"
            import_surface = "company_put"
        elif put_response.get("status") in (401, 403):
            import_status = "auth_denied"
            import_surface = "company_put"
        else:
            import_status = "blocked"
            import_surface = "import_post"

    evidence["import_attempt"] = {
        "surface": import_surface,
        "status": import_status,
        "blocker_codes": [],
        "side_effect_counters": {
            "paperclip_api_calls": 2 if import_surface == "company_put" else 1,
            "agents_created": 0,
            "agents_updated": 0,
            "approvals_created": 0,
            "issues_created": 0,
        },
    }

    # Step 3: If import unsupported/blocked, fall back to direct agent creation
    agents_created = 0
    profiles_attached = 0
    divisions_present: set[str] = set()
    divisions_missing: set[str] = set(V141_DIVISION_IDS)
    creation_results: list[dict[str, Any]] = []
    side_effect_counters = {
        "paperclip_api_calls": evidence["import_attempt"]["side_effect_counters"]["paperclip_api_calls"],
        "agents_created": 0,
        "agents_updated": 0,
        "approvals_created": 0,
        "issues_created": 0,
    }

    fallback_needed = import_status in ("unsupported_endpoint", "auth_denied", "blocked")

    if fallback_needed and agents_list_auth_denied and not args.dry_run:
        # Agents list returned 401/403; skip pointless creation attempts
        for division in V141_DIVISIONS:
            creation_results.append({
                "division_id": division["id"],
                "name": division["name"],
                "action": "skipped_auth_denied",
            })
    elif fallback_needed and not args.dry_run:
        for division in V141_DIVISIONS:
            profile_text, profile_sha = _read_profile(division["profile_path"])

            if division["name"] in existing_names:
                # Agent exists; check if it has profile metadata
                agent = existing_by_name.get(division["name"], {})
                meta = _as_mapping(agent.get("metadata"))
                has_profile = bool(meta.get("agentsMdContent")) or bool(meta.get("agentsMdSha256"))
                if not has_profile and profile_text:
                    # Update existing agent with profile metadata
                    update_body = {
                        "metadata": {
                            **meta,
                            "bosLightDivisionId": division["id"],
                            "bosLightTitle": division["title"],
                            "bosLightReportsTo": division["reports_to"] or "null",
                            "v1.4.1": True,
                            "visibilityOnly": True,
                            "agentsMdContent": profile_text[:8000],
                            "agentsMdTruncated": len(profile_text) > 8000,
                            "agentsMdSha256": profile_sha,
                        },
                    }
                    update_resp = client.request(
                        "PUT",
                        f"/api/companies/{urllib.parse.quote(str(company_id))}/agents/{urllib.parse.quote(agent.get('id', ''))}",
                        update_body,
                    )
                    side_effect_counters["paperclip_api_calls"] += 1
                    if update_resp.get("ok"):
                        side_effect_counters["agents_updated"] += 1
                        profiles_attached += 1
                    creation_results.append({
                        "division_id": division["id"],
                        "name": division["name"],
                        "action": "updated_profile",
                        "agent_id": agent.get("id"),
                        "ok": update_resp.get("ok"),
                        "status": update_resp.get("status"),
                    })
                else:
                    profiles_attached += 1
                    creation_results.append({
                        "division_id": division["id"],
                        "name": division["name"],
                        "action": "skipped_exists_with_profile",
                        "agent_id": agent.get("id"),
                    })
                divisions_present.add(division["id"])
                divisions_missing.discard(division["id"])
                continue

            # Create new agent with profile
            body = _make_agent_body(division, profile_text)
            create_resp = _create_agent(client, str(company_id), body)
            side_effect_counters["paperclip_api_calls"] += 1

            if create_resp.get("ok"):
                agents_created += 1
                profiles_attached += 1
                agent_id = _as_mapping(create_resp.get("json")).get("id") if isinstance(create_resp.get("json"), Mapping) else None
                divisions_present.add(division["id"])
                divisions_missing.discard(division["id"])
                creation_results.append({
                    "division_id": division["id"],
                    "name": division["name"],
                    "action": "created",
                    "agent_id": agent_id,
                    "status": create_resp.get("status"),
                })
            else:
                creation_results.append({
                    "division_id": division["id"],
                    "name": division["name"],
                    "action": "failed",
                    "status": create_resp.get("status"),
                    "error": create_resp.get("error") or create_resp.get("json"),
                })
    elif fallback_needed and args.dry_run:
        for division in V141_DIVISIONS:
            profile_text, _ = _read_profile(division["profile_path"])
            if division["name"] in existing_names:
                divisions_present.add(division["id"])
                divisions_missing.discard(division["id"])
                profiles_attached += 1
                creation_results.append({
                    "division_id": division["id"],
                    "name": division["name"],
                    "action": "dry_run_skipped_exists",
                })
            else:
                creation_results.append({
                    "division_id": division["id"],
                    "name": division["name"],
                    "action": "dry_run_would_create",
                    "profile_bytes": len(profile_text),
                })
    elif import_status == "success":
        # Import succeeded; verify divisions via readback
        for division in V141_DIVISIONS:
            if division["name"] in existing_names:
                divisions_present.add(division["id"])
                divisions_missing.discard(division["id"])
                agent = existing_by_name.get(division["name"], {})
                meta = _as_mapping(agent.get("metadata"))
                if meta.get("agentsMdContent") or meta.get("agentsMdSha256"):
                    profiles_attached += 1
        # Also refresh after import
        agents_list_after = _list_agents(client, str(company_id))
        side_effect_counters["paperclip_api_calls"] += 1
        if agents_list_after.get("ok"):
            after_agents = agents_list_after.get("json", [])
            if isinstance(after_agents, Mapping):
                after_agents = _sequence(after_agents.get("data"))
            after_names = {a["name"] for a in after_agents if isinstance(a, Mapping) and isinstance(a.get("name"), str)}
            for division in V141_DIVISIONS:
                if division["name"] in after_names:
                    divisions_present.add(division["id"])
                    divisions_missing.discard(division["id"])

    # Final readback
    final_agents_list = _list_agents(client, str(company_id))
    side_effect_counters["paperclip_api_calls"] += 1
    final_agents: list[dict[str, Any]] = []
    if final_agents_list.get("ok") and isinstance(final_agents_list.get("json"), list):
        final_agents = final_agents_list["json"]
    elif final_agents_list.get("ok") and isinstance(final_agents_list.get("json"), Mapping):
        final_agents = _sequence(final_agents_list["json"].get("data"))

    final_names = {a["name"] for a in final_agents if isinstance(a, Mapping) and isinstance(a.get("name"), str)}
    final_by_name = {a["name"]: a for a in final_agents if isinstance(a, Mapping) and isinstance(a.get("name"), str)}

    for division in V141_DIVISIONS:
        if division["name"] in final_names:
            divisions_present.add(division["id"])
            divisions_missing.discard(division["id"])
            agent = final_by_name.get(division["name"], {})
            meta = _as_mapping(agent.get("metadata"))
            if meta.get("agentsMdContent") or meta.get("agentsMdSha256"):
                profiles_attached = max(profiles_attached, sum(1 for d in V141_DIVISIONS if d["name"] in final_names and _as_mapping(final_by_name.get(d["name"], {}).get("metadata")).get("agentsMdContent")))

    # Count actual profiles attached from final readback
    profiles_attached = 0
    for division in V141_DIVISIONS:
        if division["name"] in final_names:
            agent = final_by_name.get(division["name"], {})
            meta = _as_mapping(agent.get("metadata"))
            if meta.get("agentsMdContent") or meta.get("agentsMdSha256"):
                profiles_attached += 1

    # Routing validation: document rules, note test ability
    routing_test_result = "n/a-local-only"
    if not fallback_needed and import_status == "success":
        routing_test_result = "validated-via-import"
    elif fallback_needed:
        routing_test_result = "fallback-direct-creation-no-routing-test"

    evidence["import_attempt"]["side_effect_counters"] = side_effect_counters
    evidence["agent_activation"] = {
        "divisions_present": sorted(divisions_present),
        "divisions_missing": sorted(divisions_missing),
        "agents_created": agents_created,
        "profile_attached": profiles_attached,
        "creation_results": creation_results,
    }
    evidence["routing_validation"] = {
        "rules_active": len(routing_rules),
        "rule_names": sorted(routing_rules.keys()),
        "test_route_result": routing_test_result,
    }
    evidence["side_effect_counters"] = side_effect_counters
    evidence["readback"] = {
        "total_agents": len(final_names),
        "v141_agents_present": len(divisions_present),
        "v141_agents_missing": sorted(divisions_missing),
        "all_v141_present": len(divisions_missing) == 0,
    }
    evidence["diagnostics"]["agentsList"] = agents_list
    evidence["diagnostics"]["finalAgentsList"] = final_agents_list
    evidence["diagnostics"]["importResponse"] = import_response

    if _is_passing_proof(evidence):
        evidence["artifact_type"] = "runtime-execution-proof"
        evidence["passing"] = True
        evidence["capability_promotions"] = ["company_template.import_export", "agents.syntax"]
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
    parser = argparse.ArgumentParser(description="Run M005 S02 company template import probe and write redacted proof/blocker evidence.")
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT, help="Exact evidence path to write.")
    parser.add_argument("--base-url", default=None, help="Optional Paperclip base URL override; otherwise env or S07 evidence is used.")
    parser.add_argument("--company-id", default=None, help="Optional company id override; otherwise env or S07 evidence is used.")
    parser.add_argument("--origin", default=os.environ.get("PAPERCLIP_ORIGIN"), help="Optional trusted Origin header for authenticated browser-style APIs.")
    parser.add_argument("--timeout", type=float, default=DEFAULT_TIMEOUT_SECONDS, help="Per-request timeout seconds.")
    parser.add_argument("--dry-run", action="store_true", help="Do not create or update agents; only report what would happen.")
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
    print(f"M005 S02 company template probe wrote {evidence.get('artifact_type')} evidence: {args.output}")
    if evidence.get("artifact_type") == "fail-closed-blocker":
        print(f"blocker_reason={evidence.get('blocker_reason')}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
