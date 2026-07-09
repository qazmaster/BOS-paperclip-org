# S03: Remap Plugin Contracts — UAT

**Milestone:** M004-osbua3
**Written:** 2026-05-31T09:54:53.717Z

# UAT: S03 Remap Plugin Contracts

**UAT Type:** Integration / contract-fixture consistency

## Preconditions

- Worktree is on milestone `M004-osbua3` with S01 and S02 complete.
- `plugin-bos-light` dependencies are installed.
- No live Paperclip runtime is required; this UAT validates repository-local contracts, seeds, and tests only.

## Steps

1. Run `npm --prefix plugin-bos-light run typecheck`.
2. Run `npm --prefix plugin-bos-light test`.
3. Scan `plugin-bos-light/src` and `plugin-bos-light/tests` for stale canonical owner literals: `Div1.Executive`, `Div7.Executive`, and `Div3.Production`.
4. Inspect representative demo/fixture assertions for the v1.4.1 ownership model:
   - approval/request ownership uses `Div1.HCO`;
   - BPI scoring remains with `Div2.MasterPlanner`;
   - product blueprint producer ownership uses `Div4.Production`;
   - eval evidence ownership uses `Div5.QualificationsLibraryLearning`;
   - mission-control oversight uses `Div7.MissionControl` where applicable.

## Expected Outcomes

- TypeScript compilation succeeds without stale Division type errors.
- The plugin test suite passes completely.
- No active plugin source or test file treats `Div1.Executive`, `Div7.Executive`, or `Div3.Production` as canonical.
- Seed/demo flows and acceptance tests exercise the same v1.4.1 ownership values as the contract layer.
- The evidence remains scoped to local plugin contracts and fixtures; no live Paperclip runtime capability is claimed.

## Edge Cases

- Historical/deprecated ownership names may remain outside active plugin source/test paths only when explicitly framed as history or migration context.
- If a future fixture introduces an untyped owner alias such as `Master.Human` or `Fixture.MasterPlanner`, the typecheck/test gates or stale-owner scans should catch the drift before closure.
- If live Paperclip surfaces later expose different owner constraints, they must be handled in a future runtime-proof slice without weakening this repository-local contract model.
