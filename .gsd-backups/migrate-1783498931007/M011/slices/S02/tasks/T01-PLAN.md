---
estimated_steps: 1
estimated_files: 2
skills_used: []
---

# T01: Implement read-only Paperclip reprobe script

Create a Node.js script that reads non-secret config from environment or defaults, loads .env without printing values, and probes only GET routes for health, company visibility, agents/divisions, issue listing, plugin status, plugin tools, and tool registry discovery. It must write runtime-evidence/M011-S02-paperclip-readonly-reprobe.json and record missing or invalid auth as blocker codes with redacted diagnostics.

## Inputs

- `runtime-evidence/M011-S01-capability-matrix.json`
- `.env`

## Expected Output

- `scripts/m011_s02_paperclip_readonly_reprobe.js`
- `runtime-evidence/M011-S02-paperclip-readonly-reprobe.json`

## Verification

node scripts/m011_s02_paperclip_readonly_reprobe.js

## Observability Impact

Probe artifact records generated_at, base_url host, company id, route status table, blocker codes, redaction flags, and zero mutation flag.
