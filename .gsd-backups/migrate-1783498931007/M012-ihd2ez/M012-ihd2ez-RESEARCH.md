# M012 Live Paperclip Runtime Investigation

## Date: 2026-06-03

## Summary

Post-completion live investigation of Paperclip server via SSH. Discovered that several M005 probe findings were outdated — the plugin IS registered and hermes CAN run with a PATH fix.

## Key Findings

### 1. SSH Access Established
- VPS: `87.99.146.178` (hostname: `dwg-conversion-worker`)
- SSH key: `~/.ssh/id_ed25519_github_qazmaster`
- User: `root`
- Docker project: `/opt/paperclip-sandbox`

### 2. Plugin Registration Confirmed
- Plugin `bos-light.organizational-intelligence` IS registered (contradicts M005 probe)
- Plugin ID: `cff0e22a-62c4-499e-9a2b-5e3ef89d4732`
- 6 tools: bos-bpi-score, bos-blueprint-gen, bos-eval-gate, bos-circuit-breaker, bos-decide, bos-route-packet
- 3 UI slots: bos-dashboard (page /bos), bos-sidebar, bos-settings

### 3. Hermes PATH Fix
- Problem: hermes binary at `/paperclip/hermes-runtime/bin/hermes` references non-existent `/paperclip/hermes-runtime/bin/python3`
- Python is at `/usr/bin/python3.13` in the container
- Fix: Created wrapper at `/usr/local/bin/hermes` with correct PYTHONPATH
- Hermes version: v0.15.2 (Python 3.13.5)
- **Warning**: Wrapper is ephemeral — lost on container restart

### 4. Agent Execution Works
- `POST /api/issues/{id}/checkout` triggers hermes agent run
- Div7.MissionControl entered `running` status after checkout
- Agent API key created: `pcp_033518caece1346687cfe768e96b725513ab5cccb6582b49`
- Secret attached to agent config via `{ type: "secret_ref", secretId: "..." }` format

### 5. Agent Auth Issue
- Agent runs but gets 401 when trying to read issues via API
- `PAPERCLIP_API_KEY` secret is attached but may not be resolved correctly at runtime
- Needs further investigation

## Infrastructure

| Item | Value |
|------|-------|
| VPS | 87.99.146.178 |
| Container | docker-paperclip-1 (127.0.0.1:3131→3100) |
| Company | BOS Light (9feb4c22-05b9-401e-ba67-0e866e3056da) |
| Admin | kabidenov.a@gmail.com |
| Div7 Agent | 96bc43bc-8533-4e6f-b135-a571abfd9d29 |
| Agent API Key | pcp_033518caece1346687cfe768e96b725513ab5cccb6582b49 |
| Secret ID | 6977cacd-1e7e-4fbd-bd58-e1b42590f5ea |

## Decisions Made

1. **Plugin is live, not fallback-only** — M005 probe was checking wrong endpoints
2. **Hermes works with wrapper** — PATH issue is fixable, not a fundamental blocker
3. **Agent auth needs secret references** — Paperclip strict mode requires `{ type: "secret_ref", secretId }` format

## Next Steps

1. Verify agent API auth works (resolve 401 issue)
2. Persist hermes wrapper in docker-compose override or Dockerfile
3. Fix docker-compose.sandbox-override.yml (use service name `server`, not `paperclip`)
4. Test full agent workflow: checkout → run → comment → complete
