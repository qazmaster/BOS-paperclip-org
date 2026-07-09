# S01: Sandbox and adapter preflight — UAT

**Milestone:** M002
**Written:** 2026-05-28T12:58:35.366Z

# UAT: S01 Sandbox and adapter preflight

## Preconditions
- SSH tunnel to the Paperclip sandbox is running on local `127.0.0.1:3131`.
- Browser session is authenticated as the sandbox admin.

## Checks
1. Open `http://127.0.0.1:3131/BOS/costs`.
2. Confirm the page shows `BOS Light Sandbox` and `Kabidenov Admin`.
3. Confirm the budget section shows `Budget Open` and `No monthly cap configured` / unlimited budget usage.
4. Inspect `PAPERCLIP_LIVE_VALIDATION_REPORT.md` and confirm it includes:
   - runtime `canary/v2026.525.0-canary.1` and commit `60efa38f868e838e9af2e2168daf0c70afefb9e6`;
   - extension boundary inventory;
   - adapter launch checklist;
   - `BOS-2` issue/comment/document readback evidence;
   - S02/S03 no-go blockers and S04 partial-go verdict;
   - Paperclip core read-only and no direct DB mutation rule.

## Expected result
S01 passes when the sandbox is reachable, local baseline is reproduced, native issue/comment/document readback evidence exists, and the report clearly blocks Hermes/GSD-Pi smoke until their runtime prerequisites are installed without Paperclip core modification.
