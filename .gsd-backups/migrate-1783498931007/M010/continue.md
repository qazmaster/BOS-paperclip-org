# Continue — M010 / S01 (partially done)

## Last action

Fixed three issues:
1. **Sidebar UI "failed to render"** — rewrote `dist/ui/index.js` as proper React component using `@paperclipai/plugin-sdk/ui` hooks. Sidebar now shows "BOS Light Org Intelligence" correctly.
2. **Missing 7 division agents** — created all 7 division agents (Div1–Div7) with hermes_local adapter + xiaomi provider in the correct company.
3. **CEO adapter** — updated from `claude_local` (broken: "Not logged in") to `hermes_local` with `provider: xiaomi`.

Database was reset during investigation (Paperclip uses virtual temp path for embedded PG, not the volume). Fresh instance created with new company ID `9feb4c22-05b9-401e-ba67-0e866e3056da`.

## Next action

1. Verify plugin tools work via agent execution flow (open issue BOS-1, send message to CEO agent requesting BPI score)
2. Test all 6 tools through the agent execution flow
3. Verify hermes_local adapter works with xiaomi provider

## Why

The plugin sidebar UI was using plain JS objects instead of React components. The 7 division agents were in a different company. CEO agent used claude_local which requires CLI authentication. Database restart wiped all data because Paperclip's embedded PG uses `/tmp` virtual path.

## Open threads

- **Hermes + xiaomi**: Adapter configured but not yet tested with actual agent run
- **API key**: New key `pcp_7c334e03159c48e4561cc9b0cf76533d7b545f182e353380` for CEO agent
- **M010 slices**: S01 Tool Testing (partially done), S02 Division Routing, S03 Agent Integration, S04 E2E Validation

## Do not

- Do NOT restart the Paperclip container without re-installing plugin and agents
- Do NOT use `sqlite3` or `better-sqlite3` to query `.gsd/gsd.db` — use `gsd_*` tools only
- Do NOT edit `.env` files or set secrets manually — use `secure_env_collect`

## Key IDs

| Entity | ID |
|---|---|
| BOS Light Company | `9feb4c22-05b9-401e-ba67-0e866e3056da` |
| CEO Agent | `e01c675f-0215-4294-b368-e3cbdce6d6c7` |
| BOS Light Plugin | `cff0e22a-62c4-499e-9a2b-5e3ef89d4732` |
| BOS Light Plugin Key | `bos-light.organizational-intelligence` |
| Agent API Key | `pcp_7c334e03159c48e4561cc9b0cf76533d7b545f182e353380` |

## SSH Access

```bash
ssh -i ~/.ssh/id_ed25519_github_qazmaster root@87.99.146.178
docker exec docker-paperclip-1 sh -c '...'
```
