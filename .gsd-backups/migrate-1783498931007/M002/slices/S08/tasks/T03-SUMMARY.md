---
id: T03
parent: S08
milestone: M002
key_files:
  - runtime-evidence/M002-S08-adapter-registration-evidence.json
key_decisions:
  - D011 remains selected in principle, but T03 blocks execution until Hermes CLI is installed/exposed in the current Paperclip runtime through supported environment administration.
duration: 
verification_result: passed
completed_at: 2026-05-29T14:56:39.481Z
blocker_discovered: true
---

# T03: Proved T03 registration readiness is blocked: hermes_local supports the Codex provider config in docs, but current Paperclip testEnvironment cannot find the Hermes CLI.

**Proved T03 registration readiness is blocked: hermes_local supports the Codex provider config in docs, but current Paperclip testEnvironment cannot find the Hermes CLI.**

## What Happened

Consumed the T02 decision packet and the user's fresh approval for T03. Probed Paperclip's documented hermes_local configuration surface and confirmed the docs list provider=openai-codex, plus hermesCommand and other adapter fields. Queried the current Paperclip health and adapter registry; hermes_local and codex_local are both registered/loaded, and codex_local models are readable. Then tested hermes_local testEnvironment with empty config, provider=openai-codex, and provider=openai-codex plus model=gpt-5.3-codex for both the canonical /BOS company and historical /BOSA runtime-gate company. Every hermes_local testEnvironment probe failed before backend execution with hermes_cli_not_found. Checked the old local tunnel endpoints and found 127.0.0.1:3131/localhost:3131 unreachable. Wrote a fail-closed T03 artifact preserving these diagnostics and explicitly recording no agent creation/update, no adapter mutation, no provider execution, no runtime smoke, no core patch, no DB mutation, no private internals, and no plaintext secrets.

## Verification

Verified runtime-evidence/M002-S08-adapter-registration-evidence.json with python3 -m json.tool and inline assertions for selected_path, approval receipt, no-execution/no-mutation flags, registered hermes_local/codex_local readback, documented openai-codex config surface, failed testEnvironment, no T04 progression, and absence of obvious secret-like literals. The verification exited 0.

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `python3 -m json.tool runtime-evidence/M002-S08-adapter-registration-evidence.json >/dev/null && python3 inline assertions/redaction check` | 0 | ✅ pass | 66ms |

## Deviations

T03 was executed after the user provided fresh explicit approval. No adapter configuration mutation was performed because supported readiness probes failed before any safe mutation or smoke could proceed. The artifact covers both canonical /BOS and historical /BOSA companies because earlier evidence differed by runtime endpoint/company context.

## Known Issues

T04 must not run yet. The currently reachable Paperclip runtime documents provider=openai-codex for hermes_local and shows both hermes_local and codex_local registered, but hermes_local testEnvironment fails for /BOS and /BOSA with hermes_cli_not_found. The historical local tunnel at 127.0.0.1:3131 is not reachable, so prior S02 local-tunnel Hermes readiness cannot be reused as current proof.

## Files Created/Modified

- `runtime-evidence/M002-S08-adapter-registration-evidence.json`
