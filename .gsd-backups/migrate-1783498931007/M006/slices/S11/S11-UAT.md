# S11: Hermes Division Profiles — UAT

**Milestone:** M006
**Written:** 2026-06-01T12:10:41.507Z

## UAT: Hermes Division Profiles (S11)

### Pre-conditions
- All 7 division AGENTS.md files exist with Identity, Valuable Final Product, Responsibilities, Inputs, Outputs, Routing, Guardrails sections

### Test Cases

**TC1: All 7 AGENTS.md have required sections**
1. Check each AGENTS.md for Allowed Tools, Forbidden Tools, Runtime Boundary, Security Invariants, Acceptance Checks
2. ✅ All 7 files have all 5 sections

**TC2: Tool boundaries are consistent**
1. Each division's Allowed Tools match its Forbidden Tools across divisions
2. ✅ Div6 is only division with ExternalGitGateway
3. ✅ Div3 is only division with Treasury grant functions
4. ✅ Div5 is only division with Quarantine functions
5. ✅ Div4 is only division with Production/build tools
6. ✅ Div7 is only division with Mission intake
7. ✅ Div1 is only division with Routing functions

**TC3: Security invariants match existing skills**
1. Compare Security Invariants with SKILL_TREASURY_BUDGET_ACCESS, SKILL_EXTERNAL_IO_GATEWAY, SKILL_KNOWLEDGE_QUARANTINE
2. ✅ No plaintext secrets (Div3)
3. ✅ Raw evidence only to Div5 (Div6)
4. ✅ Quarantine before internal use (Div5)
5. ✅ Test branches only, no push (Div4)

