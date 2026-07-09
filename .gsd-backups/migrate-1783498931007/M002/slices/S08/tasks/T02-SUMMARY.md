---
id: T02
parent: S08
milestone: M002
key_files:
  - runtime-evidence/M002-S08-execution-path-decision-packet.json
  - .gsd/DECISIONS.md
key_decisions:
  - D011: Use Paperclip-owned hermes_local execution with Hermes configured to use Codex CLI as its internal LLM backend, and prove it with bounded Paperclip readback before promoting capability.
duration: 
verification_result: passed
completed_at: 2026-05-29T14:46:58.326Z
blocker_discovered: false
---

# T02: Captured the approved S08 remediation decision packet selecting Paperclip-owned hermes_local execution with a Codex CLI-backed Hermes provider while leaving mutation and execution gated.

**Captured the approved S08 remediation decision packet selecting Paperclip-owned hermes_local execution with a Codex CLI-backed Hermes provider while leaving mutation and execution gated.**

## What Happened

Recorded the collaboratively selected S08 runtime execution remediation path. The packet compares the original planned options—fixing hermes_local secret materialization, registering gsdpi_local, and using codex_local directly—plus the refined selected path: Paperclip-owned hermes_local execution with Hermes using Codex CLI internally as its LLM/backend provider. It captures why the path is acceptable under BYOA only when Paperclip owns the agent/run lifecycle, what a passing smoke would and would not prove, security/portability risks around host-local Codex auth/session, proof requirements, T03/T04 stop conditions, and fresh approval text required before any mutation or provider execution. No external Paperclip action was taken.

## Verification

Ran the T02 JSON verification command, asserted approval_required=true, mutation_attempted=false, provider_execution_attempted=false, and selected_path='hermes_local_with_codex_cli_backend'. Also scanned the packet for obvious secret-like literals. The command exited 0 and printed decision_packet_valid=true.

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `python3 -m json.tool runtime-evidence/M002-S08-execution-path-decision-packet.json >/dev/null && python3 inline assertions/redaction check` | 0 | ✅ pass | 81ms |

## Deviations

The original T02 prompt compared three paths and expected selected_path to remain null until human decision. During this user-directed continuation, the human explicitly selected the Hermes-local plus Codex CLI backend refinement, so the packet records selected_path='hermes_local_with_codex_cli_backend' while preserving approval_required=true for any later mutation/provider execution.

## Known Issues

No Paperclip mutation, adapter configuration, or provider execution has been attempted yet. The selected path remains proof-pending; T03 still needs fresh explicit approval immediately before any external Paperclip state change or provider execution.

## Files Created/Modified

- `runtime-evidence/M002-S08-execution-path-decision-packet.json`
- `.gsd/DECISIONS.md`
