# Continue — M012 Planning

## Last action

Verified Paperclip auth works with agent API key. Confirmed correct company ID is `9feb4c22-05b9-401e-ba67-0e866e3056da` (BOS Light), not `43c74adb-b194-44d1-8f8e-ba142544bb9d` (BOS Light Sandbox) which M011 used. Tested issue creation (BOS-2 created, needs cleanup). Discovered working API endpoints and current Paperclip state.

## Next action

Plan M012: "First Real Mission Through Native Paperclip Flow". Before planning, run `gsd_milestone_generate_id` to get the milestone ID. Key inputs for planning:
- Use company ID `9feb4c22-05b9-401e-ba67-0e866e3056da` and agent key from `.env` (`PAPERCLIP_API_KEY`)
- Working endpoints: GET company/agents/issues/projects/goals, POST issues
- Plugin routes (403) need board-level auth — out of scope for M012
- Issue BOS-1 is blocked with `claude_auth_required` error on CEO agent execution
- Test issue BOS-2 exists and should be cleaned up

## Why

M011 completed capability reconciliation and confirmed auth is the only blocker for live Paperclip mutations. Auth now works. M012 should run a real mission through the 7-division flow using native Paperclip issue artifacts.

## Open threads

- Issue BOS-1 is blocked — CEO agent failed with `claude_auth_required` (hermes adapter config issue)
- Plugin routes (403) — board-level auth needed, separate from M012 scope
- Comments/Documents API not found on current Paperclip version — may need alternative artifact strategy
- 10 active requirements (R017-R025, R003, R008) await validation in M012

## Paperclip DB state (verified 2026-06-03)

- Company: BOS Light (`9feb4c22-05b9-401e-ba67-0e866e3056da`) — only company in DB
- Agents: 8 (CEO + 7 divisions)
- Issues: 1 (BOS-1 blocked)
- Sandbox company (`43c74adb...`) does NOT exist in current instance
- DB access: SSH to 87.99.146.178, `docker exec docker-paperclip-1 node script.js`, pg connection: host=/tmp port=54329 user=paperclip password=paperclip

## Do not

- Do NOT reference sandbox company `43c74adb` — it doesn't exist in current Paperclip
- Do NOT attempt plugin routes without board-level auth (403)
- Do NOT claim comment/document creation works without fresh API evidence
- Do NOT reuse M011 reprobe artifacts for M012 — they used wrong company ID
