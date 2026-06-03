# M012-S01: Canonical Paperclip Readback

**Generated:** 2026-06-03T03:48:38.461Z
**Company ID:** `9feb4c22-05b9-401e-ba67-0e866e3056da` (canonical)
**Base URL:** https://paperclip.oysana.com
**Auth present:** true
**Stale sandbox rejected:** false

## Safety

- Read-only: true
- HTTP methods: GET
- External mutations: 0
- Plaintext secrets logged: false
- Direct DB mutation: false

## Observations

- **health_ok:** true
- **company_visible:** false
- **agents_visible:** false
- **issues_visible:** false
- **projects_visible:** false
- **goals_visible:** false
- **plugin_route_ok:** false
- **piko_tools_observed:** false

## Normalized Entities

- **company:** null
- **agents:** available=false, count=null
- **issues:** available=false, count=null
- **projects:** available=false, count=null, name=projects
- **goals:** available=false, count=null, name=goals

## Blocker Codes

- `paperclip_auth_unauthorized`
- `paperclip_auth_forbidden`
- `plugin_routes_not_found`
- `tool_routes_not_found`

## Route Inventory

| Route | Status | Class | OK |
|-------|--------|-------|----|
| /api/health | 200 | ok | true |
| /api/version | 404 | route_not_found | false |
| /api/companies/9feb4c22-05b9-401e-ba67-0e866e3056da | 401 | auth_unauthorized | false |
| /api/companies/9feb4c22-05b9-401e-ba67-0e866e3056da/agents | 401 | auth_unauthorized | false |
| /api/companies/9feb4c22-05b9-401e-ba67-0e866e3056da/issues?limit=50 | 401 | auth_unauthorized | false |
| /api/companies/9feb4c22-05b9-401e-ba67-0e866e3056da/projects | 401 | auth_unauthorized | false |
| /api/companies/9feb4c22-05b9-401e-ba67-0e866e3056da/goals | 401 | auth_unauthorized | false |
| /api/companies/9feb4c22-05b9-401e-ba67-0e866e3056da/plugins | 404 | plugin_route_not_found | false |
| /api/companies/9feb4c22-05b9-401e-ba67-0e866e3056da/plugins/bos-light | 404 | plugin_route_not_found | false |
| /api/companies/9feb4c22-05b9-401e-ba67-0e866e3056da/plugins/bos-light/status | 404 | plugin_route_not_found | false |
| /api/companies/9feb4c22-05b9-401e-ba67-0e866e3056da/plugins/bos-light/tools | 404 | plugin_route_not_found | false |
| /api/plugins | 403 | auth_forbidden | false |
| /api/plugins/bos-light | 403 | auth_forbidden | false |
| /api/plugins/bos-light/status | 404 | plugin_route_not_found | false |
| /api/plugins/bos-light/tools | 404 | plugin_route_not_found | false |
| /api/tools | 404 | tool_route_not_found | false |
| /api/tools/registry | 404 | tool_route_not_found | false |
