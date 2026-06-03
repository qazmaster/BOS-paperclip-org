# M012-S06: Session-Auth Canonical Readback

**Generated:** 2026-06-03T08:02:32.572Z
**Auth method:** session-based
**Company ID:** `9feb4c22-05b9-401e-ba67-0e866e3056da`
**Base URL:** https://paperclip.oysana.com
**Session auth success:** true
**Session cookie acquired:** true
**Passing (health + company visible):** true

## Duplicate Key Handling

Parser mode: LAST-value-wins
Duplicate keys found: 1
- `PAPERCLIP_PASSWORD` appeared 2 times; last value used

## Session Auth

- **Success:** true
- **HTTP status:** 200
- **Duration:** 4117ms
- **Cookie present:** true
- **Cookie name:** __Secure-paperclip-default.session_token

## Company Visibility

- **health_ok:** true
- **company_visible:** true
- **agents_visible:** true
- **issues_visible:** true
- **projects_visible:** true
- **goals_visible:** true
- **plugin_route_ok:** true
- **tools_route_ok:** false

## Normalized Entities

- **company:** route=/api/companies/9feb4c22-05b9-401e-ba67-0e866e3056da, status=200, available=true
- **agents:** available=true, count=8
- **issues:** available=true, count=2
- **projects:** available=true, count=1, name=projects
- **goals:** available=true, count=1, name=goals

## Blocker Codes

- `plugin_routes_not_found`
- `tool_routes_not_found`

## Deviation: BOS-3 Explicit User Confirmation

The milestone success criteria require explicit user confirmation before creating the BOS-3 mission issue via POST /api/companies/{id}/issues. This script performs authenticated readback only (GET requests) and does NOT attempt issue creation or mutation. The mission issue creation path was blocked in S02 due to INVALID_EMAIL_OR_PASSWORD (first-value-wins .env parser chose the wrong password). With the corrected LAST-value-wins parser and session-based auth, authenticated readback is now proven. Issue creation remains pending explicit user confirmation per the milestone contract.

## Route Inventory

| Route | Status | Class | OK |
|-------|--------|-------|----|
| /api/health | 200 | ok | true |
| /api/version | 404 | route_not_found | false |
| /api/companies/9feb4c22-05b9-401e-ba67-0e866e3056da | 200 | ok | true |
| /api/companies/9feb4c22-05b9-401e-ba67-0e866e3056da/agents | 200 | ok | true |
| /api/companies/9feb4c22-05b9-401e-ba67-0e866e3056da/issues?limit=50 | 200 | ok | true |
| /api/companies/9feb4c22-05b9-401e-ba67-0e866e3056da/projects | 200 | ok | true |
| /api/companies/9feb4c22-05b9-401e-ba67-0e866e3056da/goals | 200 | ok | true |
| /api/companies/9feb4c22-05b9-401e-ba67-0e866e3056da/plugins | 404 | plugin_route_not_found | false |
| /api/companies/9feb4c22-05b9-401e-ba67-0e866e3056da/plugins/bos-light | 404 | plugin_route_not_found | false |
| /api/companies/9feb4c22-05b9-401e-ba67-0e866e3056da/plugins/bos-light/status | 404 | plugin_route_not_found | false |
| /api/companies/9feb4c22-05b9-401e-ba67-0e866e3056da/plugins/bos-light/tools | 404 | plugin_route_not_found | false |
| /api/plugins | 200 | ok | true |
| /api/plugins/bos-light | 404 | plugin_route_not_found | false |
| /api/plugins/bos-light/status | 404 | plugin_route_not_found | false |
| /api/plugins/bos-light/tools | 404 | plugin_route_not_found | false |
| /api/tools | 404 | tool_route_not_found | false |
| /api/tools/registry | 404 | tool_route_not_found | false |
