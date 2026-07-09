---
sliceId: S01
uatType: browser-executable
verdict: FAIL
date: 2026-05-28T18:19:03+05:00
---

# UAT Result — S01

## Checks

| Check | Mode | Result | Notes |
|-------|------|--------|-------|
| Open `http://127.0.0.1:3131/BOS/costs`. | runtime | FAIL | Browser navigation failed with `net::ERR_CONNECTION_REFUSED`; Chrome error page screenshot was captured during navigation. Network log recorded repeated failed `GET http://127.0.0.1:3131/BOS/costs` document requests with `net::ERR_CONNECTION_REFUSED`. TCP probe also failed: `ConnectionRefusedError: [Errno 111] Connection refused`; `curl -I --max-time 5` failed with `curl: (7) Failed to connect to 127.0.0.1 port 3131`. Evidence: `.gsd/exec/9999d5f4-a379-49b0-b8fb-4bb1c60a7662.stdout`. |
| Confirm the page shows `BOS Light Sandbox` and `Kabidenov Admin`. | runtime | FAIL | Could not verify page identity because the sandbox URL was unreachable and the browser remained on `chrome-error://chromewebdata/`; only `ERR_CONNECTION_REFUSED` was visible. |
| Confirm the budget section shows `Budget Open` and `No monthly cap configured` / unlimited budget usage. | runtime | FAIL | Could not verify the budget section because the sandbox URL was unreachable and no BOS costs page content loaded. |
| Inspect `PAPERCLIP_LIVE_VALIDATION_REPORT.md` and confirm required runtime, boundary, checklist, readback, blocker, verdict, and core-safety content. | artifact | PASS | Report exists (`18699` bytes). Marker checks passed for runtime `canary/v2026.525.0-canary.1`, commit `60efa38f868e838e9af2e2168daf0c70afefb9e6`, extension boundary inventory, adapter launch checklist, `BOS-2`, comment/document readback evidence, S02/S03 no-go blockers, S04 partial-go verdict, Paperclip core read-only rule, and direct DB mutation prohibition. Evidence: `.gsd/exec/9999d5f4-a379-49b0-b8fb-4bb1c60a7662.stdout`. |

## Overall Verdict

FAIL — The required validation report is complete, but the browser-executable live sandbox checks failed because `127.0.0.1:3131` refused connections during UAT.

## Notes

- Browser evidence: attempted navigation to `http://127.0.0.1:3131/BOS/costs` produced a Chrome `This site can’t be reached` / `ERR_CONNECTION_REFUSED` page, with a screenshot attached in the session output.
- Browser assertion evidence: `ERR_CONNECTION_REFUSED` was visible; the expected target URL was not retained because Chromium changed the page URL to `chrome-error://chromewebdata/` after navigation failure.
- Network evidence: four failed document requests to `http://127.0.0.1:3131/BOS/costs` were recorded with `net::ERR_CONNECTION_REFUSED`.
- The most likely unmet precondition is that the SSH tunnel or Paperclip sandbox listener was not running on local `127.0.0.1:3131` at UAT time.
