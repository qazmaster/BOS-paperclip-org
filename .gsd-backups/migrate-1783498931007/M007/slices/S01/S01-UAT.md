# S01: Agent Runtime Chain Debug — UAT

**Milestone:** M007
**Written:** 2026-06-03T00:56:40.982Z

## UAT: Agent Runtime Chain

### Test: All 7 division agents operational
1. Navigate to Paperclip /BOS company
2. Verify all 8 agents visible (1 CEO + 7 divisions)
3. Create test issue assigned to each division agent
4. Verify each agent processes the issue via Hermes

**Expected:** All agents respond, no 429 cascade, correct division routing.

### Test: Adapter configuration stable
1. Check docker-compose.sandbox-override.yml has correct env vars
2. Verify XIAOMI_API_KEY present in container
3. Verify hermes_local adapter resolves correctly

**Expected:** Adapter resolves, secrets materialize, agent execution completes.
