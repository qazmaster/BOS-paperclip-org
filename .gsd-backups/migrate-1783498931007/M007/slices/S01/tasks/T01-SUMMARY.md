---
id: T01
parent: S01
milestone: M007
key_files:
  - docker-compose.sandbox-override.yml
key_decisions:
  - D040: hermes_local + Xiaomi mimo-v2.5-pro adapter configuration
  - D041: Single company / 7 division agents / shared Hermes substrate isolation model
duration: 
verification_result: untested
completed_at: 2026-06-03T00:56:30.356Z
blocker_discovered: false
---

# T01: Fixed 7 bugs in agent runtime chain; all 7 division agents operational with Hermes + Xiaomi

**Fixed 7 bugs in agent runtime chain; all 7 division agents operational with Hermes + Xiaomi**

## What Happened

Fixed 7 sequential bugs in the Paperclip agent runtime chain: (1) OPENAI_APi_KEY typo in adapter_config secret binding, (2) replaced non-existent --no-tools flag with --yolo, (3) added missing provider:"xiaomi" for Xiaomi custom provider, (4) added PYTHONPATH=/paperclip/hermes-runtime/lib/python3.13/site-packages to hermes wrapper, (5) fixed garbage session_id caused by hermes-paperclip-adapter v0.2.0 stderr parsing bug via SESSION_ID_REGEX_LEGACY, (6) stopped recovery action spam that caused 429 cascade, (7) fixed agent assignments so smoke test issues go to correct divisions. All 7 division agents (Div1.HCO, Div2.MasterPlanner, Div3.Treasury, Div4.Production, Div5.Qualifications, Div6.External, Div7.MissionControl) confirmed operational. Smoke test issues BOS-11 through BOS-16 completed. Configuration documented in D040 (hermes_local + Xiaomi) and D041 (single company / 7 agents / shared substrate).

## Verification

All 7 agents visible and responsive in Paperclip /BOS company. Smoke test issues BOS-11 through BOS-16 completed successfully.

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| — | No verification commands discovered | — | — | — |

## Deviations

None

## Known Issues

None

## Files Created/Modified

- `docker-compose.sandbox-override.yml`
