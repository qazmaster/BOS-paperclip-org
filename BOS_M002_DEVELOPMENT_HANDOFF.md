# Handoff: Continue BOS Light Development from M002 Onward

Audience: the next AI agent continuing repository development after the completed M001 baseline.

## Current state

M001 is complete and pushed.

- Milestone: `M001-bo1jcm: BOS Light Baseline`
- Authoritative status: complete in GSD DB.
- Last pushed main commit: `1697db7 Merge milestone M001-bo1jcm BOS Light Baseline`.
- Local integrated verification after merge passed:
  - `python3 scripts/run_a1_a10_demo.py`
  - `python3 scripts/test_validate_company_template.py`
  - `npm --prefix plugin-bos-light test`
  - `npm --prefix plugin-bos-light run typecheck`
  - `python3 scripts/test_validate_runtime_capabilities.py`
  - `python3 scripts/validate_runtime_capabilities.py`
  - `python3 scripts/validate_a1_a10_demo_docs.py`

Current uncommitted handoff/doc changes existed at the end of the prior session:

- `HANDOFF_PROMPT_FOR_NEW_AI_AGENT.md` modified.
- `HANDOFF_REAL_PAPERCLIP_IMPORT_TEST.md` untracked.
- This handoff file and `PAPERCLIP_SANDBOX_TESTING_HANDOFF.md` may also be untracked until committed.

Do not assume these have been pushed unless `git status --short --branch` and `git log --oneline --decorate -5` prove it.

## M001 proof boundary to preserve

M001 is a repository-local contract and fixture-integration baseline. It does not prove live Paperclip import/plugin compatibility.

Safe claims:

- BOS Light baseline is locally validated.
- BOS Light is ready for live Paperclip runtime validation.

Unsafe claims unless live evidence exists:

- Paperclip imports the company template natively.
- AGENTS.md syntax is accepted by live Paperclip.
- BOS Light plugin loads/registers in Paperclip.
- `piko:*` tools are host-registered.
- Betting Table widget renders inside Paperclip.
- Native approval/document/comment/event/state support is confirmed.

Keep `native_support_confirmed: false` and runtime posture `unvalidated` unless exact live version/build/proof evidence supports changing a specific surface.

## Current M002 status

There is a skeleton roadmap at:

```text
.gsd/milestones/M002/M002-ROADMAP.md
```

Last observed content was only a placeholder:

```markdown
# M002: M002: Runtime Hardening

**Vision:** ## Slices

## Slices
```

Treat M002 as not properly planned yet. Before implementing, create or repair a real M002 plan through GSD planning tools rather than hand-editing roadmap checkboxes.

## Recommended M002 direction

M002 should harden the live-runtime boundary now that M001 exists.

Recommended milestone theme:

```text
M002: Runtime Compatibility and Live Paperclip Validation
```

Recommended slices:

1. **S01: Paperclip sandbox evidence capture**
   - Turn the VPS sandbox findings into durable repo docs/tests without secrets.
   - Produce a live-validation report that records runtime version, commit, setup, admin proof, budget proof, browser proof, and limitations.

2. **S02: Paperclip-native artifact read/write probes**
   - Use the live sandbox to prove issue/comment/document/project read/write surfaces.
   - Store readback evidence and object IDs safely.
   - Keep all capability promotions proof-gated.

3. **S03: BOS division profile mirroring**
   - Represent the seven BOS divisions in Paperclip-native artifacts if native agents/import are unsupported.
   - Avoid claiming runtime-agent import unless Paperclip proves it.

4. **S04: Plugin registration spike**
   - Try to install/register `plugin-bos-light` against the live runtime.
   - Record success/failure by surface: tools, data providers, actions, UI widgets, issue tabs.

5. **S05: BOS A2-A10 live artifact flow**
   - Run BPI, Blueprint, Betting Table, Eval Gate, Circuit Breaker flows against Paperclip-visible artifacts.
   - Prefer explicit invocation; do not rely on events until observed.

6. **S06: Capability matrix update and regression verification**
   - Update `plugin-bos-light/capabilities.paperclip-runtime.json` only for surfaces proven by live evidence.
   - Re-run full local verification.

## Next concrete action for the next dev agent

1. Run:

```bash
git status --short --branch
```

2. Read:

```text
.gsd/milestones/M001-bo1jcm/M001-bo1jcm-SUMMARY.md
.gsd/milestones/M001-bo1jcm/M001-bo1jcm-VALIDATION.md
HANDOFF_REAL_PAPERCLIP_IMPORT_TEST.md
PAPERCLIP_SANDBOX_TESTING_HANDOFF.md
plugin-bos-light/capabilities.paperclip-runtime.json
docs/08_RUNTIME_CAPABILITY_HEALTH.md
docs/10_A1_A10_DEMO.md
```

3. Repair/plan M002 using GSD tools, not manual checkbox edits. If creating a new replacement milestone instead of repairing `M002`, use `gsd_milestone_generate_id` first.

4. Keep implementation fixture-first and proof-gated. Promote runtime capability claims only after live runtime readback evidence exists.

## Verification commands to keep using

Run these before claiming any M002 slice is complete:

```bash
python3 scripts/run_a1_a10_demo.py
python3 scripts/test_validate_company_template.py
npm --prefix plugin-bos-light test
npm --prefix plugin-bos-light run typecheck
python3 scripts/test_validate_runtime_capabilities.py
python3 scripts/validate_runtime_capabilities.py
python3 scripts/validate_a1_a10_demo_docs.py
```

If docs/handoff files change, also run:

```bash
python3 scripts/validate_handoff.py
```

## Do not

- Do not build BOS Kernel or a separate ledger/policy/workorder system.
- Do not make Paperclip capability claims from caller-provided parameters.
- Do not treat `cache_overlay` as durable Paperclip truth.
- Do not interpret `blueprint_id` as an approval id or native support proof.
- Do not rely on Paperclip events until a live event spike observes them.
- Do not run destructive operations on the Hetzner VPS.
- Do not commit `.gsd/browser-state`, cookies, session state, passwords, or root-only VPS files.
