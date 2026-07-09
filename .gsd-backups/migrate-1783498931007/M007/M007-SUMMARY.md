# M007 Pre-Planning Handoff Summary

## What Happened This Session

Debugged and fixed the Paperclip agent runtime chain for all 7 BOS Light division agents. After 7 separate bug fixes, all agents are now live and passing smoke tests.

## Bugs Fixed (in order)

1. **`OPENAI_APi_KEY` typo** — lowercase 'i' in adapter_config secret binding
2. **`--no-tools` doesn't exist** — hermes CLI has no such flag; replaced with `--yolo`
3. **Missing `provider: "xiaomi"`** — adapter couldn't find Xiaomi custom provider
4. **Missing PYTHONPATH** — `/usr/local/bin/hermes` wrapper needed `PYTHONPATH=/paperclip/hermes-runtime/lib/python3.13/site-packages`
5. **Garbage `session_id: "from"`** — hermes-paperclip-adapter v0.2.0 stderr parsing bug via `SESSION_ID_REGEX_LEGACY` pattern
6. **Recovery action spam** — failed runs spawned recovery runs which also failed, causing 429 cascade
7. **Wrong agent assignments** — smoke test issues assigned to Div7 instead of their respective divisions

## Current Live State

All 7 division agents operational on Paperclip `/BOS`:
- Div1.HCO, Div2.MasterPlanner, Div3.Treasury, Div4.Production, Div5.Qualifications, Div6.External, Div7.MissionControl
- All 6 smoke test issues (BOS-11 through BOS-16) done
- BOS-9 (connectivity check) done
- BOS-10 (productivity review) todo — auto-created by Div7

## Working Configuration

```json
{
  "adapter_type": "hermes_local",
  "adapter_config": {
    "model": "mimo-v2.5-pro",
    "provider": "xiaomi",
    "timeoutSec": 600,
    "graceSec": 10,
    "extraArgs": ["--yolo"]
  }
}
```

## Decisions Made

- D040: Paperclip agent runtime adapter configuration (hermes_local + Xiaomi + --yolo)
- D041: Agent isolation model (single company, 7 agents, shared Hermes substrate)

## Next Steps

1. Plan M007 slices from roadmap: git integration, autonomous routing, self-running loop, aipay.kz mission
2. Resolve BOS-1/BOS-4 git auth blockers (need SSH keys or deploy tokens in container)
3. Test autonomous task routing across all 7 divisions
4. Monitor for 429 rate limits; may need Xiaomi API quota increase

## Key Artifacts

- `.gsd/PROJECT.md` — updated with live state
- `.gsd/milestones/M007/M007-ROADMAP.md` — 4-slice plan
- `.gsd/milestones/M007/slices/S00/continue.md` — detailed handoff
- `.gsd/DECISIONS.md` — D040, D041 added
