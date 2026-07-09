# S01: Plugin Live Registration — UAT

**Milestone:** M006
**Written:** 2026-06-01T06:59:22.776Z

## UAT: Plugin Live Registration (S01)

- **UAT required:** no
- **UAT Type:** operational / diagnostic verification (no user-facing GUI changes)

### Preconditions
- Paperclip sandbox API key and base URL are available as environment variables.
- Python 3 is available.
- plugin-bos-light npm dependencies are installed.

### Steps
1. Run the S01 probe: `python3 scripts/run_m006_s01_plugin_live_registration.py --output /tmp/s01-evidence.json --company-id <company-id>`
2. Validate the artifact: `python3 scripts/validate_m006_s01_plugin_live_registration.py --evidence /tmp/s01-evidence.json --allow-blocker`
3. Verify zero promotions: inspect artifact `capability_promotions` array is empty.
4. Run regression gates: `python3 scripts/validate_handoff.py && npm --prefix plugin-bos-light test`

### Expected Outcomes
- Probe produces schema-valid artifact regardless of API response.
- Validator exits 0 with --allow-blocker for fail-closed-blocker artifacts.
- capability_promotions is empty.
- Handoff validation passes with all required files present.
- All 280 plugin unit tests pass.

### Edge Cases
- If sandbox env vars are missing, probe produces fail-closed-blocker artifact with preflight_blocked status.
- If any route returns non-404, artifact records actual status code and response summary.
- If secrets appear in any text field, redaction audit fails validation.

### Operational Notes
- Plugin registration is currently unsupported in Paperclip 0.3.1 sandbox.
- All downstream M006 slices must plan fallback-only execution paths.
- Native issue/document/comment surfaces remain the only confirmed live Paperclip capabilities.
