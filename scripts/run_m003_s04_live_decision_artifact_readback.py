#!/usr/bin/env python3
"""Run M003 S04 live decision artifact readback and write sanitized evidence.

Standard-library-only. The runner is safe without credentials: missing base URL,
company id, or token produces fail-closed blocker evidence before mutation.
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
SCHEMA_VERSION = "m003-s04-live-decision-artifact-readback/v1"
PASSING_ARTIFACT_TYPE = "live-evidence"
BLOCKER_ARTIFACT_TYPE = "fail-closed-blocker"
DEFAULT_OUTPUT = Path("runtime-evidence/M003-S04-live-decision-artifact-readback.json")
DEFAULT_TIMEOUT_SECONDS = 20.0
MAX_RESPONSE_BYTES = 256 * 1024
MAX_DIAGNOSTIC_TEXT = 1200

SECRET_KEY_RE = re.compile(r"(?:secret|token|password|passwd|api[_-]?key|credential|private[_-]?key|authorization|bearer|cookie)", re.I)
SECRET_VALUE_RE = re.compile(
    r"(sk-[A-Za-z0-9_\-]{8,}|gh[pousr]_[A-Za-z0-9_]{8,}|xox[baprs]-[A-Za-z0-9\-]{8,}|AKIA[0-9A-Z]{8,}|(?:Bearer\s+)[A-Za-z0-9._~+/\-=]{8,}|(?:Cookie:\s*)?[^\s=;]*(?:session|token|secret|password|api[_-]?key)[^\s=;]*=[^\s\"']+|[A-Za-z_][A-Za-z0-9_]*(?:TOKEN|SECRET|PASSWORD|API_KEY)=[^\s\"']+)",
    re.I,
)
SAFE_REF_PART_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$")
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
            parsed = urllib.parse.urlparse(self.base_url)
            if parsed.scheme not in {"http", "https"} or not parsed.netloc:
                raise ValueError(f"invalid base URL: {self.base_url!r}")
            url = urllib.parse.urljoin(f"{self.base_url}/", path.lstrip("/"))
        except ValueError as exc:
            return _response(False, None, started, message=str(exc), error="ValueError", url=self.base_url)

        payload: bytes | None = None
        headers = {"Accept": "application/json", **self.headers}
        if self.origin and method.upper() not in {"GET", "HEAD", "OPTIONS"}:
            headers["Origin"] = self.origin
        if body is not None:
            payload = json.dumps(body).encode("utf-8")
            headers["Content-Type"] = "application/json"
        request = urllib.request.Request(url, data=payload, headers=headers, method=method.upper())
        try:
            with urllib.request.urlopen(request, timeout=self.timeout) as res:  # noqa: S310 - operator supplied sandbox URL
                raw = res.read(MAX_RESPONSE_BYTES + 1)
                truncated = len(raw) > MAX_RESPONSE_BYTES
                text = raw[:MAX_RESPONSE_BYTES].decode("utf-8", errors="replace")
                parsed_json, malformed = _parse_json_response(text)
                return _response(200 <= res.status < 300, res.status, started, url=url, text=text, json_value=parsed_json, malformed=malformed, truncated=truncated)
        except urllib.error.HTTPError as exc:
            raw = exc.read(MAX_RESPONSE_BYTES + 1)
            text = raw[:MAX_RESPONSE_BYTES].decode("utf-8", errors="replace")
            parsed_json, malformed = _parse_json_response(text)
            return _response(False, exc.code, started, error="http_error", url=url, text=text, json_value=parsed_json, malformed=malformed, truncated=len(raw) > MAX_RESPONSE_BYTES)
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            return _response(False, None, started, error=type(exc).__name__, message=str(exc), url=url, timeout_ms=round(self.timeout * 1000) if isinstance(exc, TimeoutError) else None)


def _response(ok: bool, status: int | None, started: float, **kwargs: Any) -> dict[str, Any]:
    text = kwargs.get("text")
    return {
        "ok": ok,
        "status": status,
        "url": _redact_string(str(kwargs.get("url", ""))),
        "duration_ms": round((time.monotonic() - started) * 1000),
        "error": kwargs.get("error"),
        "message": _redact_string(str(kwargs.get("message"))) if kwargs.get("message") else None,
        "timeout_ms": kwargs.get("timeout_ms"),
        "json": kwargs.get("json_value"),
        "text": None if kwargs.get("json_value") is not None else _redact_string(str(text)[:MAX_DIAGNOSTIC_TEXT]) if text else None,
        "malformed_json_reason": kwargs.get("malformed"),
        "truncated": bool(kwargs.get("truncated", False)),
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


def _safe_ref_part(value: str | None) -> str | None:
    if not value:
        return None
    candidate = value.strip()
    if not SAFE_REF_PART_RE.match(candidate):
        return None
    if ".." in candidate or "/" in candidate or "\\" in candidate:
        return None
    return candidate


def _display_issue_id(value: str | None) -> str:
    return _safe_ref_part(value) or "invalid-or-not-provided"


def _redact_value(key: str, value: Any) -> Any:
    if key.endswith("_env") or key.endswith("Env"):
        return _redact_string(value) if isinstance(value, str) else value
    if SECRET_KEY_RE.search(key):
        if value is None or isinstance(value, bool):
            return value
        return "<redacted>"
    if isinstance(value, str):
        return _redact_string(value)
    if isinstance(value, Mapping):
        return {str(k): _redact_value(str(k), v) for k, v in value.items()}
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
        if isinstance(candidate, Mapping):
            found = _first_string(candidate, keys)
            if found:
                return found
    return None


def _extract_text(response: Mapping[str, Any]) -> str:
    payload = response.get("json")
    candidates: list[Any] = [payload]
    if isinstance(payload, Mapping):
        candidates.extend([payload.get("data"), payload.get("document"), payload.get("comment"), payload.get("result")])
    parts: list[str] = []
    for candidate in candidates:
        if not isinstance(candidate, Mapping):
            continue
        for key in ("markdown", "body", "content", "text"):
            value = candidate.get(key)
            if isinstance(value, str) and value.strip():
                parts.append(value)
    if not parts and isinstance(response.get("text"), str):
        parts.append(str(response["text"]))
    return "\n".join(dict.fromkeys(parts))


def _sha256(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def _diagnostic(phase: str, response: Mapping[str, Any] | None, fallback_used: bool, message: str) -> dict[str, Any]:
    response = response or {}
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
            if isinstance(candidate, Mapping):
                version = candidate.get("version") or candidate.get("paperclipVersion") or candidate.get("runtime_version")
                build = candidate.get("build") or candidate.get("buildId") or candidate.get("commit") or candidate.get("commit_sha")
                if version or build:
                    return {"version": str(version) if version else None, "build": str(build) if build else f"health.version:{version}" if version else None}
    return {"version": None, "build": None}


def _decision_markdown(issue_id: str, generated_at: str) -> str:
    return "\n\n".join([
        "# BOS Decision Record: M003-S04 Live Readback",
        "- Schema version: 1.0",
        "- Accepted: true",
        f"- Issue: {issue_id}",
        "- Decision ID: decision_m003_s04_live_readback",
        "- Decided by: Div7.MissionControl",
        f"- Decided at: {generated_at}",
        "- Decision type: EXPERIMENT",
        "- Recommended action: Treat only successful native document/comment readback as live proof.",
        "- Diagnostics sanitized: true",
        "- Native approval mutated: false",
        "## OODA",
        "- Observe: S02/S03 can emit decision artifact envelopes.",
        "- Orient: Markdown-only refs are deterministic handoff evidence, not Paperclip live proof.",
        "- Decide: Attempt one bounded native document or comment write and readback.",
        "- Act: Persist sanitized evidence with hashes and side-effect counters.",
    ])


def _readback_summary(kind: str, ref: str, response: Mapping[str, Any], expected_sha256: str) -> dict[str, Any]:
    text = _extract_text(response)
    actual = _sha256(text) if text else None
    return {
        "kind": kind,
        "ref": ref,
        "status_code": response.get("status"),
        "ok": response.get("ok") is True,
        "sha256": actual,
        "expected_sha256": expected_sha256,
        "hash_match": bool(actual and actual == expected_sha256),
        "snippet": _redact_string(text[:500]),
        "malformed_json_reason": response.get("malformed_json_reason"),
    }


def _fallback(issue_id: str | None, decision_id: str = "decision_m003_s04_live_readback", reason: str | None = None) -> dict[str, Any]:
    safe_issue_id = _safe_ref_part(issue_id) or "missing"
    ref = f"markdown-only://issues/{safe_issue_id}/decisions/{decision_id}"
    return {"reason": reason, "deterministic_ref": ref, "artifact_id": f"markdown-only:{safe_issue_id}:decisions:{decision_id}", "live_proof": False}


def _base_evidence(args: argparse.Namespace) -> dict[str, Any]:
    generated_at = _utc_now()
    fallback = _fallback(args.issue_id)
    fallback_markdown = _decision_markdown(_display_issue_id(args.issue_id), generated_at)
    return {
        "schema_version": SCHEMA_VERSION,
        "artifact_type": BLOCKER_ARTIFACT_TYPE,
        "phase": "live",
        "generated_at": generated_at,
        "inputs": {
            "base_url": args.base_url or "not-provided",
            "companyId": args.company_id or "not-provided",
            "issueId": _display_issue_id(args.issue_id),
            "auth_token_env": args.auth_token_env or "not-provided",
            "auth_header_name": args.auth_header_name,
            "trusted_origin": args.origin or "not-provided",
        },
        "runtime": {"version": None, "build": None},
        "diagnostics": [],
        "side_effect_counts": {
            "issues_created": 0,
            "documents_created": 0,
            "comments_created": 0,
            "approval_requests_created": 0,
            "activity_logs_written": 0,
            "hermes_runs_started": 0,
            "gsd_pi_runs_started": 0,
            "plugin_actions_invoked": 0,
        },
        "capability_claims": {
            "native_approval": False,
            "activity_log": False,
            "hermes": False,
            "gsd_pi": False,
            "plugin_actions": False,
            "unsupported_capability_promoted": False,
        },
        "invariants": {
            "decided_by": "Div7.MissionControl",
            "diagnostics_sanitized": True,
            "native_approval_mutated": False,
            "no_secret_diagnostics": True,
            "hermes_execution_attempted": False,
            "gsd_pi_execution_attempted": False,
        },
        "selected_surface": "markdown-only",
        "artifact_ref": fallback["deterministic_ref"],
        "readback_status": "not_attempted",
        "content_hash": _sha256(fallback_markdown),
        "bounded_snippet": fallback_markdown[:500],
        "fallback": _fallback(args.issue_id, reason="not_attempted"),
        "artifact_refs": {"document": None, "comments": [], "markdown_fallback": fallback["deterministic_ref"], "native_approval": None},
        "readbacks": {"documents": [], "comments": []},
    }


def _preflight_blocker(args: argparse.Namespace, evidence: MutableMapping[str, Any]) -> str | None:
    blockers: list[str] = []
    if not args.base_url:
        blockers.append("missing_base_url")
    if not args.company_id:
        blockers.append("missing_company_id")
    if not args.auth_token_env:
        blockers.append("missing_auth_token_env")
    elif not os.environ.get(args.auth_token_env):
        blockers.append("missing_auth_token_env")
    if args.issue_id and not _safe_ref_part(args.issue_id):
        blockers.append("unsafe_issue_id")
    if blockers:
        reason = "_".join(blockers)
        evidence["blocker_reason"] = reason
        evidence["fallback"] = _fallback(args.issue_id, reason=reason)
        evidence["artifact_ref"] = evidence["fallback"]["deterministic_ref"]
        evidence["artifact_refs"]["markdown_fallback"] = evidence["fallback"]["deterministic_ref"]
        evidence["readback_status"] = "blocked_preflight"
        evidence["diagnostics"].append(_diagnostic("auth.preflight", None, True, f"stopped before mutation due to {', '.join(blockers)}"))
        return reason
    return None


def _create_or_select_issue(client: Any, args: argparse.Namespace, evidence: MutableMapping[str, Any]) -> tuple[str | None, Mapping[str, Any]]:
    if args.issue_id:
        readback = client.request("GET", f"/api/issues/{_quote(args.issue_id)}")
        if not readback.get("ok"):
            evidence["diagnostics"].append(_diagnostic("issues.read", readback, True, "sandbox issue readback failed"))
        return args.issue_id, readback
    body = {"company_id": args.company_id, "title": f"BOS M003 S04 decision artifact readback {args.run_label}", "body": "Bounded sandbox issue for decision artifact live readback only.", "labels": ["bos-light", "m003", "s04", "sandbox"]}
    create = client.request("POST", f"/api/companies/{_quote(args.company_id)}/issues", body)
    if not create.get("ok"):
        evidence["diagnostics"].append(_diagnostic("issues.native", create, True, "sandbox issue creation failed"))
        return None, create
    evidence["side_effect_counts"]["issues_created"] += 1
    issue_id = _extract_id(create, ("issue_id", "issueId", "id", "key"))
    if not issue_id:
        evidence["diagnostics"].append(_diagnostic("issues.native", create, True, "sandbox issue creation returned missing id"))
        return None, create
    readback = client.request("GET", f"/api/issues/{_quote(issue_id)}")
    return issue_id, readback


def run_live_readback(client: Any, args: argparse.Namespace) -> dict[str, Any]:
    evidence = _base_evidence(args)
    if _preflight_blocker(args, evidence):
        return _redact_value("evidence", evidence)

    health = client.request("GET", "/api/health")
    version = client.request("GET", "/api/version")
    evidence["runtime"] = _extract_runtime_version_build(version, health)
    evidence["diagnostics"].extend([_diagnostic("runtime.health", health, False, "Paperclip health readback"), _diagnostic("runtime.version", version, False, "Paperclip version/build readback")])

    issue_id, issue_readback = _create_or_select_issue(client, args, evidence)
    if not issue_id:
        evidence["blocker_reason"] = "sandbox_issue_unavailable"
        evidence["readback_status"] = "blocked_issue_unavailable"
        evidence["fallback"] = _fallback(None, reason="sandbox_issue_unavailable")
        evidence["artifact_ref"] = evidence["fallback"]["deterministic_ref"]
        evidence["artifact_refs"]["markdown_fallback"] = evidence["fallback"]["deterministic_ref"]
        return _redact_value("evidence", evidence)
    if not _safe_ref_part(issue_id):
        evidence["blocker_reason"] = "unsafe_issue_id"
        evidence["readback_status"] = "blocked_preflight"
        evidence["fallback"] = _fallback(None, reason="unsafe_issue_id")
        evidence["artifact_ref"] = evidence["fallback"]["deterministic_ref"]
        evidence["artifact_refs"]["markdown_fallback"] = evidence["fallback"]["deterministic_ref"]
        evidence["diagnostics"].append(_diagnostic("issues.read", issue_readback, True, "issue id was unsafe for artifact refs"))
        return _redact_value("evidence", evidence)

    generated_at = str(evidence["generated_at"])
    markdown = _decision_markdown(issue_id, generated_at)
    expected_sha = _sha256(markdown)
    document_key = "bos-m003-s04-decision-artifact"
    selected_surface: str | None = None

    doc_create = client.request("PUT", f"/api/issues/{_quote(issue_id)}/documents/{document_key}", {"title": "BOS Decision Record: M003-S04 Live Readback", "format": "markdown", "body": markdown, "markdown": markdown})
    if doc_create.get("ok"):
        evidence["side_effect_counts"]["documents_created"] += 1
        document_id = _extract_id(doc_create, ("document_id", "documentId", "id")) or document_key
        doc_read_ref = _first_string(_payload_mapping(doc_create), ("key",)) or document_key
        doc_readback = client.request("GET", f"/api/issues/{_quote(issue_id)}/documents/{_quote(doc_read_ref)}")
        summary = _readback_summary("document", document_id, doc_readback, expected_sha)
        evidence["readbacks"]["documents"].append(summary)
        evidence["artifact_refs"]["document"] = document_id
        evidence["diagnostics"].append(_diagnostic("documents.read", doc_readback, not summary["hash_match"], "document readback attempted"))
        if summary["ok"] and summary["hash_match"]:
            selected_surface = "documents.native"
            evidence["artifact_ref"] = f"paperclip://issues/{issue_id}/documents/{document_id}"
            evidence["readback_status"] = "ok"
            evidence["content_hash"] = summary["sha256"]
            evidence["bounded_snippet"] = summary["snippet"]
    else:
        evidence["diagnostics"].append(_diagnostic("documents.native", doc_create, True, "document write unavailable; trying comment fallback"))

    if not selected_surface:
        comment_create = client.request("POST", f"/api/issues/{_quote(issue_id)}/comments", {"body": markdown, "markdown": markdown})
        if comment_create.get("ok"):
            evidence["side_effect_counts"]["comments_created"] += 1
            comment_id = _extract_id(comment_create, ("comment_id", "commentId", "id"))
            if comment_id:
                comment_readback = client.request("GET", f"/api/issues/{_quote(issue_id)}/comments/{_quote(comment_id)}")
                summary = _readback_summary("comment", comment_id, comment_readback, expected_sha)
                evidence["readbacks"]["comments"].append(summary)
                evidence["artifact_refs"]["comments"].append(comment_id)
                evidence["diagnostics"].append(_diagnostic("comments.read", comment_readback, not summary["hash_match"], "comment readback attempted"))
                if summary["ok"] and summary["hash_match"]:
                    selected_surface = "comments.native"
                    evidence["artifact_ref"] = f"paperclip://issues/{issue_id}/comments/{comment_id}"
                    evidence["readback_status"] = "ok"
                    evidence["content_hash"] = summary["sha256"]
                    evidence["bounded_snippet"] = summary["snippet"]
            else:
                evidence["diagnostics"].append(_diagnostic("comments.native", comment_create, True, "comment creation returned missing id"))
        else:
            evidence["diagnostics"].append(_diagnostic("comments.native", comment_create, True, "comment write unavailable"))

    evidence.update({
        "company_issue_context": {"companyId": args.company_id, "issueId": issue_id, "title": _first_string(_payload_mapping(issue_readback), ("title", "name")) or f"BOS M003 S04 decision artifact readback {args.run_label}"},
        "decision_artifact": {"decision_id": "decision_m003_s04_live_readback", "decided_by": "Div7.MissionControl", "diagnostics_sanitized": True, "native_approval_mutated": False, "selected_surface": selected_surface or "markdown-only", "markdown_sha256": expected_sha},
        "fallback": _fallback(issue_id, reason=None if selected_surface else "native_document_comment_readback_unavailable"),
    })
    evidence["artifact_refs"]["markdown_fallback"] = evidence["fallback"]["deterministic_ref"]

    if selected_surface:
        evidence["artifact_type"] = PASSING_ARTIFACT_TYPE
        evidence["selected_surface"] = selected_surface
    else:
        evidence["selected_surface"] = "markdown-only"
        evidence["artifact_ref"] = evidence["fallback"]["deterministic_ref"]
        evidence["readback_status"] = "fail_closed"
        evidence["content_hash"] = expected_sha
        evidence["bounded_snippet"] = markdown[:500]
        blockers: list[str] = []
        for readback in [*evidence["readbacks"].get("documents", []), *evidence["readbacks"].get("comments", [])]:
            if readback.get("malformed_json_reason"):
                blockers.append("malformed_json")
            elif readback.get("ok") and not readback.get("hash_match"):
                blockers.append("readback_hash_mismatch")
        if not blockers:
            blockers.append("native_document_comment_readback_unavailable")
        evidence["blocker_reason"] = ",".join(dict.fromkeys(blockers))
        evidence["fallback"]["reason"] = evidence["blocker_reason"]
    return _redact_value("evidence", evidence)


def write_evidence(root: Path, output: Path, evidence: Mapping[str, Any]) -> Path:
    target = output if output.is_absolute() else root / output
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(evidence, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return target


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Run M003 S04 live decision artifact readback and write sanitized evidence.")
    parser.add_argument("--base-url", default=os.environ.get("PAPERCLIP_BASE_URL"), help="Paperclip base URL; optional, fail-closed when absent.")
    parser.add_argument("--company-id", default=os.environ.get("PAPERCLIP_COMPANY_ID"), help="Paperclip company id; optional, fail-closed when absent.")
    parser.add_argument("--issue-id", default=os.environ.get("PAPERCLIP_ISSUE_ID"), help="Existing sandbox issue id/key. If omitted and credentials exist, one bounded issue is created.")
    parser.add_argument("--auth-token-env", default=os.environ.get("PAPERCLIP_AUTH_TOKEN_ENV", "PAPERCLIP_API_KEY"), help="Environment variable containing API token; value is never written.")
    parser.add_argument("--auth-header-name", default=os.environ.get("PAPERCLIP_AUTH_HEADER_NAME", "Authorization"), help="HTTP header for token env value.")
    parser.add_argument("--origin", default=os.environ.get("PAPERCLIP_TRUSTED_ORIGIN"), help="Trusted Origin header for mutating API calls.")
    parser.add_argument("--timeout", type=float, default=DEFAULT_TIMEOUT_SECONDS)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--run-label", default=None)
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    if not args.run_label:
        args.run_label = f"m003-s04-{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}"
    headers = _headers_from_env(args.auth_token_env, args.auth_header_name)
    client = HttpClient(args.base_url or "", headers, args.timeout, args.origin)
    try:
        evidence = run_live_readback(client, args)
        target = write_evidence(ROOT, args.output, evidence)
    except Exception as exc:  # defensive: still produce bounded blocker evidence when possible
        fallback = _fallback(args.issue_id, reason="runner_exception")
        evidence = _redact_value("evidence", {"schema_version": SCHEMA_VERSION, "artifact_type": BLOCKER_ARTIFACT_TYPE, "phase": "live", "generated_at": _utc_now(), "blocker_reason": f"runner_exception:{type(exc).__name__}", "inputs": {"base_url": args.base_url or "not-provided", "companyId": args.company_id or "not-provided", "issueId": _display_issue_id(args.issue_id), "auth_token_env": args.auth_token_env, "auth_header_name": args.auth_header_name, "trusted_origin": args.origin or "not-provided"}, "runtime": {"version": None, "build": None}, "selected_surface": "markdown-only", "artifact_ref": fallback["deterministic_ref"], "readback_status": "runner_exception", "content_hash": None, "bounded_snippet": None, "diagnostics": [_diagnostic("runner.exception", None, True, str(exc))], "side_effect_counts": {"issues_created": 0, "documents_created": 0, "comments_created": 0, "approval_requests_created": 0, "activity_logs_written": 0, "hermes_runs_started": 0, "gsd_pi_runs_started": 0, "plugin_actions_invoked": 0}, "capability_claims": {"native_approval": False, "activity_log": False, "hermes": False, "gsd_pi": False, "plugin_actions": False, "unsupported_capability_promoted": False}, "invariants": {"decided_by": "Div7.MissionControl", "diagnostics_sanitized": True, "native_approval_mutated": False, "no_secret_diagnostics": True, "hermes_execution_attempted": False, "gsd_pi_execution_attempted": False}, "fallback": fallback, "artifact_refs": {"document": None, "comments": [], "markdown_fallback": fallback["deterministic_ref"], "native_approval": None}, "readbacks": {"documents": [], "comments": []}})
        target = write_evidence(ROOT, args.output, evidence)
        print(f"M003 S04 live decision artifact readback wrote blocker evidence: {target}", file=sys.stderr)
        return 1
    print(f"M003 S04 live decision artifact readback wrote {evidence.get('artifact_type')} evidence: {target}")
    return 0 if evidence.get("artifact_type") in {PASSING_ARTIFACT_TYPE, BLOCKER_ARTIFACT_TYPE} else 2


if __name__ == "__main__":
    raise SystemExit(main())
