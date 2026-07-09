# S07: Live company template import and agent visibility — UAT

**Milestone:** M002
**Written:** 2026-05-29T13:45:13.785Z

# S07 UAT — Live company template import and agent visibility

## Scope
Verify that seven BOS Light division agent records are visible in the Paperclip sandbox after approved S07 mutation. This UAT does not validate runtime execution.

## Evidence
- `runtime-evidence/M002-S07-agent-visibility.json`
- Paperclip target company: `43c74adb-b194-44d1-8f8e-ba142544bb9d` (`BOS Light Sandbox`)

## Expected visible agents
1. `Div1.Executive - CEO / Mission Owner`
2. `Div2.MasterPlanner - Product Planning / Shaping`
3. `Div3.Production - Delivery / Build`
4. `Div4.Operations - Process / Reliability`
5. `Div5.Qualifications - QA / Security / Knowledge`
6. `Div6.Resources - Budget / Capacity`
7. `Div7.Strategy - Decision Protocol / Adaptation`

## Acceptance
- API readback contains all seven names exactly.
- `heartbeat_invoked=false`.
- `provider_execution_attempted=false`.
- `execution_proof=false`.
- `gsdpi_local` remains listed as blocked/unregistered; Div4 visibility uses `hermes_local` after explicit user fallback selection.

## Non-claims
This UAT does not prove Hermes `resultJson.bos`, GSD-Pi `BosAdapterResult`, native approvals, plugin UI, or company-template import/export.
