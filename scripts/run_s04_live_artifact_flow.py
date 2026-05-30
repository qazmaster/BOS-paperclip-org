#!/usr/bin/env python3
"""Run the S04 live BOS artifact flow and write canonical redacted evidence.

The runner is intentionally standard-library-only and uses supported Paperclip HTTP
surfaces only. It creates or selects one bounded sandbox issue, writes BOS Light
artifact sections to document/comment surfaces, reads those surfaces back, embeds
S02/S03 no-go guard posture, and writes one canonical machine-readable artifact.
It never prints or persists auth token values.
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
from typing import Any, Iterable, Mapping, MutableMapping, Sequence

ROOT = Path(__file__).resolve().parents[1]
SCHEMA_VERSION = "s04-live-artifact-flow/v1"
PASSING_ARTIFACT_TYPE = "live-evidence"
BLOCKER_ARTIFACT_TYPE = "fail-closed-blocker"
DEFAULT_OUTPUT = Path("runtime-evidence/M002-S04-live-artifact-flow.json")
DEFAULT_HERMES_EVIDENCE = Path("runtime-evidence/M002-S02-hermes-smoke.json")
DEFAULT_GSDPI_EVIDENCE = Path("runtime-evidence/M002-S03-gsdpi-smoke.json")
DEFAULT_TIMEOUT_SECONDS = 20.0
MAX_RESPONSE_BYTES = 256 * 1024
MAX_DIAGNOSTIC_TEXT = 1200
ARTIFACT_FAMILIES = ("BPI", "Blueprint", "Betting Table", "Eval Gate", "Circuit Breaker")

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
                "status": None,
                "url": _redact_string(self.base_url),
                "duration_ms": round((time.monotonic() - started) * 1000),
                "error": "ValueError",
                "message": _redact_string(str(exc)),
                "timeout_ms": None,
                "json": None,
                "text": None,
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
        started = time.monotonic()
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
                    "status": response.status,
                    "url": _redact_string(url),
                    "duration_ms": round((time.monotonic() - started) * 1000),
                    "truncated": truncated,
                    "json": parsed,
                    "text": None if parsed is not None else _redact_string(text[:MAX_DIAGNOSTIC_TEXT]),
                    "malformed_json_reason": malformed,
                }
        except urllib.error.HTTPError as exc:
            raw = exc.read(MAX_RESPONSE_BYTES + 1)
            truncated = len(raw) > MAX_RESPONSE_BYTES
            text = raw[:MAX_RESPONSE_BYTES].decode("utf-8", errors="replace")
            parsed, malformed = _parse_json_response(text)
            return {
                "ok": False,
                "status": exc.code,
                "url": _redact_string(url),
                "duration_ms": round((time.monotonic() - started) * 1000),
                "error": "http_error",
                "truncated": truncated,
                "json": parsed,
                "text": None if parsed is not None else _redact_string(text[:MAX_DIAGNOSTIC_TEXT]),
                "malformed_json_reason": malformed,
            }
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            return {
                "ok": False,
                "status": None,
                "url": _redact_string(url),
                "duration_ms": round((time.monotonic() - started) * 1000),
                "error": type(exc).__name__,
                "message": _redact_string(str(exc)),
                "timeout_ms": round(self.timeout * 1000) if isinstance(exc, TimeoutError) else None,
                "json": None,
                "text": None,
                "malformed_json_reason": None,
            }


def _parse_json_response(text: str) -> tuple[Any | None, str | None]:
    if not text.strip():
        return None, None
    try:
        return json.loads(text), None
    except json.JSONDecodeError as exc:
        return None, f"line {exc.lineno}, column {exc.colno}: {exc.msg}"


def _utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def _redact_string(value: str) -> str:
    return SECRET_VALUE_RE.sub("<redacted>", value)


def _redact_value(key: str, value: Any) -> Any:
    if key.endswith("_env") or key.endswith("Env"):
        if isinstance(value, str):
            return _redact_string(value)
        return value
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


def _payload_mapping(response: Mapping[str, Any]) -> Mapping[str, Any]:
    payload = response.get("json")
    candidates: list[Any] = [payload]
    if isinstance(payload, Mapping):
        candidates.extend([payload.get("data"), payload.get("issue"), payload.get("document"), payload.get("comment"), payload.get("result")])
    for candidate in candidates:
        if isinstance(candidate, Mapping):
            return candidate
    return {}


def _extract_id(response: Mapping[str, Any], keys: Sequence[str]) -> str | None:
    payload = response.get("json")
    candidates: list[Any] = [payload]
    if isinstance(payload, Mapping):
        candidates.extend([payload.get("data"), payload.get("issue"), payload.get("document"), payload.get("comment"), payload.get("result")])
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
        candidates.extend([payload.get("data"), payload.get("issue"), payload.get("document"), payload.get("comment"), payload.get("result")])
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


def _readback_summary(kind: str, ref: str, response: Mapping[str, Any]) -> dict[str, Any]:
    text = _extract_text(response)
    return {
        "kind": kind,
        "ref": ref,
        "status_code": response.get("status"),
        "ok": response.get("ok") is True,
        "sha256": hashlib.sha256(text.encode("utf-8")).hexdigest() if text else None,
        "snippet": _redact_string(text[:500]),
    }


def _diagnostic(phase: str, response: Mapping[str, Any], fallback_used: bool, message: str) -> dict[str, Any]:
    text = response.get("text") or response.get("message") or ""
    if not text and response.get("json") is not None:
        try:
            text = json.dumps(response.get("json"), sort_keys=True)
        except TypeError:
            text = str(response.get("json"))
    return {
        "phase": phase,
        "status_code": response.get("status"),
        "bounded_response_text": _redact_string(str(text)[:MAX_DIAGNOSTIC_TEXT]) if text else None,
        "malformed_json_reason": _redact_string(str(response.get("malformed_json_reason"))) if response.get("malformed_json_reason") else None,
        "timeout_ms": response.get("timeout_ms"),
        "fallback_used": fallback_used,
        "message": _redact_string(message),
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
            version = candidate.get("version") or candidate.get("paperclipVersion") or candidate.get("runtime_version")
            build = candidate.get("build") or candidate.get("buildId") or candidate.get("commit") or candidate.get("commit_sha")
            if version or build:
                # Paperclip 0.3.x exposes serverVersion on /api/health but no separate build endpoint.
                # Preserve a truthful runtime fingerprint instead of inventing a git SHA.
                return {"version": str(version) if version else None, "build": str(build) if build else f"health.version:{version}" if version else None}
    return {"version": None, "build": None}


def _load_guard(path: Path, kind: str) -> dict[str, Any]:
    try:
        evidence = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return {
            "system": kind,
            "evidence_ref": str(path),
            "status": "blocked",
            "no_go": True,
            "execution_allowed": False,
            "propagated_blocker": True,
            "reason": "missing_no_go_evidence_file",
        }
    except json.JSONDecodeError as exc:
        return {
            "system": kind,
            "evidence_ref": str(path),
            "status": "blocked",
            "no_go": True,
            "execution_allowed": False,
            "propagated_blocker": True,
            "reason": f"malformed_no_go_evidence:{exc.msg}",
        }
    if not isinstance(evidence, Mapping):
        return {
            "system": kind,
            "evidence_ref": str(path),
            "status": "blocked",
            "no_go": True,
            "execution_allowed": False,
            "propagated_blocker": True,
            "reason": "no_go_evidence_not_object",
        }
    artifact_type = str(evidence.get("artifact_type") or "unknown")
    blocker_reason = str(evidence.get("blocker_reason") or evidence.get("blockerReason") or "")
    if kind == "S02.Hermes":
        result_json = _as_mapping(_as_mapping(evidence.get("run")).get("resultJson") or _as_mapping(evidence.get("run")).get("result_json"))
        proof_present = isinstance(result_json.get("bos"), Mapping)
        proof_field = "result_json_bos_present"
        missing_reason = "missing_resultJson.bos"
    else:
        result_json = _as_mapping(_as_mapping(evidence.get("run")).get("resultJson") or _as_mapping(evidence.get("run")).get("result_json"))
        proof_present = isinstance(result_json.get("bosAdapterResult") or result_json.get("bos_adapter_result") or result_json.get("bos"), Mapping)
        proof_field = "bos_adapter_result_present"
        missing_reason = "missing_BosAdapterResult"
    passing = artifact_type == "smoke-evidence" and proof_present
    reason = blocker_reason or ("passing_source_evidence" if passing else missing_reason)
    return {
        "system": kind,
        "evidence_ref": str(path),
        "source_schema_version": evidence.get("schema_version"),
        "source_artifact_type": artifact_type,
        "source_phase": evidence.get("phase"),
        proof_field: proof_present,
        "status": "available" if passing else "blocked",
        "no_go": not passing,
        "execution_allowed": passing,
        "propagated_blocker": not passing,
        "reason": _redact_string(reason),
    }


def _base_evidence(args: argparse.Namespace) -> dict[str, Any]:
    return {
        "schema_version": SCHEMA_VERSION,
        "artifact_type": BLOCKER_ARTIFACT_TYPE,
        "phase": "live",
        "generated_at": _utc_now(),
        "inputs": {
            "base_url": _redact_string(args.base_url.rstrip("/")),
            "companyId": args.company_id,
            "issueId": args.issue_id,
            "auth_token_env": args.auth_token_env or "not-provided",
            "auth_header_name": args.auth_header_name,
            "trusted_origin": _redact_string(args.origin.rstrip("/")) if args.origin else "not-provided",
            "run_label": args.run_label,
        },
        "runtime": {"version": None, "build": None},
        "diagnostics": [],
        "no_core_modification": {
            "method": "Supported Paperclip HTTP issue/document/comment endpoints only; no Paperclip core source patch, private module import, plugin registry mutation, subprocess execution, or direct database write.",
            "files_modified": [],
            "core_source_patched": False,
            "direct_db_mutation": False,
            "private_module_import": False,
        },
        "invariants": {
            "no_core_patch": True,
            "no_direct_db_access": True,
            "no_secret_diagnostics": True,
            "no_native_approval": True,
            "no_activity_events": True,
            "hermes_execution_attempted": False,
            "gsd_pi_execution_attempted": False,
        },
        "side_effect_counts": {
            "issues_created": 0,
            "documents_created": 0,
            "comments_created": 0,
            "approval_requests_created": 0,
            "activity_logs_written": 0,
            "hermes_runs_started": 0,
            "gsd_pi_runs_started": 0,
        },
    }


def _artifact_markdown(args: argparse.Namespace, issue_id: str, generated_at: str) -> str:
    return "\n\n".join(
        [
            f"# BOS Light S04 Live Artifact Flow ({args.run_label})",
            "Families: BPI; Blueprint; Betting Table; Eval Gate; Circuit Breaker",
            "## BOS BPI Evidence\n- Family: BPI\n- Score: 87\n- Basis: sandbox issue has bounded live readback evidence.",
            "## BOS Blueprint Evidence\n- Family: Blueprint\n- Proposed path: native issue document plus native issue comment readback.\n- No Hermes or GSD-Pi execution is assumed.",
            "## BOS Betting Table Evidence\n- Family: Betting Table\n- Candidate: {issue}\n- Native approval status: not-requested; S04 forbids approval promotion without validated native approval API.".format(issue=issue_id),
            "## BOS Eval Gate Evidence\n- Family: Eval Gate\n- Gate: artifact families visible on readback surfaces.\n- Status: diagnostic-live-proof-pending-validator.",
            "## BOS Circuit Breaker Evidence\n- Family: Circuit Breaker\n- Open condition: S02 Hermes resultJson.bos or S03 BosAdapterResult is missing.\n- Action: no execution attempts; document/comment evidence only.",
            f"_generated_at: {generated_at}_",
        ]
    )


def _artifact_family_entry(family: str, readbacks: Sequence[Mapping[str, Any]]) -> dict[str, Any]:
    matching = [readback for readback in readbacks if family.lower() in str(readback.get("snippet", "")).lower()]
    return {
        "present": bool(matching),
        "surfaces": sorted({str(item.get("kind")) for item in matching if item.get("kind")}),
        "readback_refs": [str(item.get("ref")) for item in matching if item.get("ref")],
        "readback_hashes": [str(item.get("sha256")) for item in matching if item.get("sha256")],
        "snippet": _redact_string(str(matching[0].get("snippet"))[:300]) if matching else None,
    }


def _create_or_select_issue(client: Any, args: argparse.Namespace, evidence: MutableMapping[str, Any]) -> tuple[str | None, Mapping[str, Any]]:
    if args.issue_id:
        issue_id = args.issue_id
        readback = client.request("GET", f"/api/issues/{_quote(issue_id)}")
        if not readback.get("ok"):
            evidence["diagnostics"].append(_diagnostic("issues.read", readback, False, "sandbox issue readback failed"))
        return issue_id, readback

    body = {
        "company_id": args.company_id,
        "title": f"BOS Light S04 sandbox {args.run_label}",
        "body": "Bounded BOS Light S04 artifact-flow sandbox issue. Do not promote approvals or execution surfaces.",
        "labels": ["bos-light", "s04", "sandbox"],
        "metadata": {"schema_version": SCHEMA_VERSION, "run_label": args.run_label},
    }
    create = client.request("POST", f"/api/companies/{_quote(args.company_id)}/issues", body)
    if not create.get("ok"):
        evidence["diagnostics"].append(_diagnostic("issues.native", create, False, "sandbox issue creation failed"))
        return None, create
    evidence["side_effect_counts"]["issues_created"] += 1
    issue_id = _extract_id(create, ("issue_id", "issueId", "id", "key"))
    if not issue_id:
        evidence["diagnostics"].append(_diagnostic("issues.native", create, False, "sandbox issue creation returned missing id"))
        return None, create
    readback = client.request("GET", f"/api/issues/{_quote(issue_id)}")
    if not readback.get("ok"):
        evidence["diagnostics"].append(_diagnostic("issues.read", readback, False, "sandbox issue readback failed"))
    return issue_id, readback


def run_live_flow(client: Any, args: argparse.Namespace) -> dict[str, Any]:
    evidence = _base_evidence(args)
    diagnostics: list[dict[str, Any]] = evidence["diagnostics"]

    hermes_guard = _load_guard(args.hermes_evidence, "S02.Hermes")
    gsdpi_guard = _load_guard(args.gsdpi_evidence, "S03.GSD-Pi")
    evidence["no_go_guards"] = {"hermes": hermes_guard, "gsd_pi": gsdpi_guard}

    if args.auth_token_env and not os.environ.get(args.auth_token_env):
        evidence["blocker_reason"] = "missing_auth_token_env"
        diagnostics.append(
            {
                "phase": "auth.preflight",
                "status_code": None,
                "bounded_response_text": None,
                "malformed_json_reason": None,
                "timeout_ms": None,
                "fallback_used": False,
                "message": f"auth token env {args.auth_token_env} was not set; stopped before mutation",
            }
        )
        return _redact_value("evidence", evidence)

    health = client.request("GET", "/api/health")
    version = client.request("GET", "/api/version")
    evidence["runtime"] = _extract_runtime_version_build(version, health)
    evidence["diagnostics"].extend(
        [
            _diagnostic("runtime.health", health, False, "Paperclip health readback"),
            _diagnostic("runtime.version", version, False, "Paperclip version/build readback"),
        ]
    )

    issue_id, issue_readback = _create_or_select_issue(client, args, evidence)
    if not issue_id:
        evidence["blocker_reason"] = "sandbox_issue_unavailable"
        return _redact_value("evidence", evidence)

    timestamp = evidence["generated_at"]
    markdown = _artifact_markdown(args, issue_id, str(timestamp))
    document_key = "bos-s04-evidence"
    doc_body = {"title": f"BOS Light S04 Evidence {args.run_label}", "format": "markdown", "body": markdown}
    doc_create = client.request("PUT", f"/api/issues/{_quote(issue_id)}/documents/{document_key}", doc_body)
    if not doc_create.get("ok"):
        diagnostics.append(_diagnostic("documents.native", doc_create, False, "document creation failed"))
        evidence["blocker_reason"] = "document_creation_failed"
        return _redact_value("evidence", evidence)
    evidence["side_effect_counts"]["documents_created"] += 1
    document_id = _extract_id(doc_create, ("document_id", "documentId", "id")) or document_key
    doc_readback_ref = _first_string(_payload_mapping(doc_create), ("key",)) or document_key

    doc_readback = client.request("GET", f"/api/issues/{_quote(issue_id)}/documents/{_quote(doc_readback_ref)}")
    if not doc_readback.get("ok"):
        diagnostics.append(_diagnostic("documents.read", doc_readback, False, "document readback failed"))

    comment_body = {"body": markdown}
    comment_create = client.request("POST", f"/api/issues/{_quote(issue_id)}/comments", comment_body)
    if not comment_create.get("ok"):
        diagnostics.append(_diagnostic("comments.native", comment_create, False, "comment creation failed"))
        evidence["blocker_reason"] = "comment_creation_failed"
        return _redact_value("evidence", evidence)
    evidence["side_effect_counts"]["comments_created"] += 1
    comment_id = _extract_id(comment_create, ("comment_id", "commentId", "id"))
    if not comment_id:
        diagnostics.append(_diagnostic("comments.native", comment_create, False, "comment creation returned missing id"))
        evidence["blocker_reason"] = "comment_id_missing"
        return _redact_value("evidence", evidence)
    comment_readback = client.request("GET", f"/api/issues/{_quote(issue_id)}/comments/{_quote(comment_id)}")
    if not comment_readback.get("ok"):
        diagnostics.append(_diagnostic("comments.read", comment_readback, False, "comment readback failed"))

    readbacks = {
        "issue": _readback_summary("issue", issue_id, issue_readback),
        "document": _readback_summary("document", document_id, doc_readback),
        "comments": [_readback_summary("comment", comment_id, comment_readback)],
    }
    surface_readbacks = [readbacks["document"], *readbacks["comments"]]
    artifact_families = {family: _artifact_family_entry(family, surface_readbacks) for family in ARTIFACT_FAMILIES}

    evidence.update(
        {
            "company_issue_context": {
                "companyId": args.company_id,
                "issueId": issue_id,
                "title": _first_string(_payload_mapping(issue_readback), ("title", "name")) or f"BOS Light S04 sandbox {args.run_label}",
            },
            "artifact_refs": {
                "issue": issue_id,
                "document": document_id,
                "comments": [comment_id],
                "native_approval": None,
            },
            "readbacks": readbacks,
            "artifact_families": artifact_families,
            "bounded_run": {
                "label": args.run_label,
                "expected_shape": "one issue, one document, one comment, zero native approvals, zero Hermes/GSD-Pi executions",
                "dedupe_metadata": {"run_label": args.run_label, "issue_id": issue_id},
            },
        }
    )

    blockers: list[str] = []
    if not evidence["runtime"].get("version") or not evidence["runtime"].get("build"):
        blockers.append("runtime_version_build_missing")
    if not readbacks["document"].get("ok") or not readbacks["document"].get("sha256"):
        blockers.append("document_readback_missing")
    if not readbacks["comments"] or not readbacks["comments"][0].get("ok") or not readbacks["comments"][0].get("sha256"):
        blockers.append("comment_readback_missing")
    for family, entry in artifact_families.items():
        if not entry.get("present"):
            blockers.append(f"artifact_family_missing:{family}")
    if evidence["side_effect_counts"].get("approval_requests_created") != 0:
        blockers.append("native_approval_overclaim")
    if not hermes_guard.get("no_go") or hermes_guard.get("execution_allowed") is True:
        blockers.append("hermes_no_go_not_propagated")
    if not gsdpi_guard.get("no_go") or gsdpi_guard.get("execution_allowed") is True:
        blockers.append("gsd_pi_no_go_not_propagated")

    if blockers:
        evidence["artifact_type"] = BLOCKER_ARTIFACT_TYPE
        evidence["blocker_reason"] = ",".join(blockers)
    else:
        evidence["artifact_type"] = PASSING_ARTIFACT_TYPE
    return _redact_value("evidence", evidence)


def write_evidence(root: Path, output: Path, evidence: Mapping[str, Any]) -> Path:
    target = output if output.is_absolute() else root / output
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(evidence, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return target


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Run S04 live BOS Light artifact flow and write canonical redacted evidence.")
    parser.add_argument("--base-url", required=True, help="Paperclip base URL, e.g. http://127.0.0.1:3000.")
    parser.add_argument("--company-id", required=True, help="Paperclip company id for issue/document/comment surfaces.")
    parser.add_argument("--auth-token-env", default="PAPERCLIP_API_KEY", help="Environment variable containing API token; value is never written.")
    parser.add_argument("--auth-header-name", default="Authorization", help="HTTP header for the auth token env value.")
    parser.add_argument("--origin", default=None, help="Trusted browser Origin header for cookie-authenticated mutating API calls; redacted in evidence like any URL.")
    parser.add_argument("--timeout", type=float, default=DEFAULT_TIMEOUT_SECONDS, help="HTTP request timeout in seconds.")
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT, help="Canonical evidence output path.")
    parser.add_argument("--issue-id", default=None, help="Existing sandbox issue id/key. If omitted, the runner creates one bounded sandbox issue.")
    parser.add_argument("--run-label", default=None, help="Dedupe label included in issue/document/comment content.")
    parser.add_argument("--hermes-evidence", type=Path, default=DEFAULT_HERMES_EVIDENCE, help="S02 Hermes smoke evidence to consume as no-go guard.")
    parser.add_argument("--gsdpi-evidence", type=Path, default=DEFAULT_GSDPI_EVIDENCE, help="S03 GSD-Pi smoke evidence to consume as no-go guard.")
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    if not args.run_label:
        args.run_label = f"s04-{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}"
    headers = _headers_from_env(args.auth_token_env, args.auth_header_name)
    client = HttpClient(args.base_url, headers, args.timeout, args.origin)
    try:
        evidence = run_live_flow(client, args)
        target = write_evidence(ROOT, args.output, evidence)
    except Exception as exc:  # defensive: still produce a bounded blocker artifact when possible
        evidence = _redact_value(
            "evidence",
            {
                "schema_version": SCHEMA_VERSION,
                "artifact_type": BLOCKER_ARTIFACT_TYPE,
                "phase": "live",
                "generated_at": _utc_now(),
                "blocker_reason": f"runner_exception:{type(exc).__name__}",
                "inputs": {
                    "base_url": args.base_url,
                    "companyId": args.company_id,
                    "auth_token_env": args.auth_token_env,
                    "auth_header_name": args.auth_header_name,
                },
                "diagnostics": [{"phase": "runner.exception", "message": str(exc), "status_code": None, "bounded_response_text": None, "malformed_json_reason": None, "timeout_ms": None, "fallback_used": False}],
                "no_core_modification": {
                    "method": "Runner exception occurred before unsupported operations; no core source patch or direct DB mutation is used by this script.",
                    "files_modified": [],
                    "core_source_patched": False,
                    "direct_db_mutation": False,
                    "private_module_import": False,
                },
            },
        )
        target = write_evidence(ROOT, args.output, evidence)
        print(f"S04 live artifact flow wrote blocker evidence: {target}", file=sys.stderr)
        return 1

    print(f"S04 live artifact flow wrote {evidence.get('artifact_type')} evidence: {target}")
    return 0 if evidence.get("artifact_type") == PASSING_ARTIFACT_TYPE else 2


if __name__ == "__main__":
    raise SystemExit(main())
