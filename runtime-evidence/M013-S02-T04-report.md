# BOS Light Technical Debt Audit Report

**Milestone:** M013-aixgv5 | **Slice:** S02 | **Task:** T04
**Generated:** 2026-06-04
**Auditor:** GSD Auto-Mode (Div4 Analysis + Div5 Verification)

---

## Executive Summary

The BOS Light codebase (plugin-bos-light) is a TypeScript plugin with 54 source files, 15K lines, and 1424 passing tests across 63 test files. The code is generally well-structured with strict TypeScript enabled, but the project scaffolding has significant gaps that will impede scaling.

### Top 3 Risks

| # | Risk | Severity | Impact |
|---|------|----------|--------|
| 1 | **No linting or code style enforcement** | HIGH | Code drift across contributors; no pre-commit quality gate. 117 source/test files with zero style consistency. |
| 2 | **Module system mismatch** | HIGH | package.json lacks `"type": "module"` despite ESNext module target. Scripts fail when run directly with Node. |
| 3 | **7 source files have no test coverage** | MEDIUM | Includes worker.ts (plugin entry point) and issueBlueprintFlow.ts (core business flow). Breakage here kills the entire plugin. |

**Total remediation effort:** 41 hours across 12 debt items, prioritized into 4 sprints.

---

## Codebase Overview

| Metric | Value |
|--------|-------|
| Source files | 54 |
| Source lines | 15,405 |
| Test files | 63 |
| Test lines | 26,754 |
| Test-to-source ratio | 1.74:1 |
| Total test cases | 1,424 |
| Test pass rate | 63/64 suites (1 empty suite failure) |
| Primary language | TypeScript (ES2022, strict mode) |
| UI framework | React 19.2.7 |
| Test runner | Vitest 2.1.9 |
| Bundler | esbuild 0.28.0 |

---

## Debt Register (Priority Order)

### Critical Path Items (Fix Now)

#### DEBT-003: Missing `type: module` in package.json
- **Severity:** HIGH | **Effort:** 0.5h | **ROI:** 18 (highest)
- **Files:** `package.json:1-13`, `tsconfig.json:3-4`
- **Verified:** ✅ package.json has no `"type"` field. tsconfig targets ES2022/ESNext modules.
- **Impact:** Module resolution mismatch between TypeScript and Node.js. Scripts using import/export fail when run directly.
- **Fix:** Add `"type": "module"` to package.json. Verify all scripts work.

#### DEBT-004: Adapter tests use wrong test runner
- **Severity:** MEDIUM | **Effort:** 0.5h | **ROI:** 14
- **Files:** `adapters/gsdpi-local/tests/execute.test.ts`, `plugin-bos-light/vitest.config.ts:1-6`
- **Verified:** ✅ vitest.config.ts has only `pool: "forks"`, no exclude pattern. 63/64 suites pass.
- **Impact:** False CI failure. Developers habituate to ignoring test red.
- **Fix:** Add `exclude: ['adapters/**']` to vitest.config.ts.

#### DEBT-009: All deps declared as devDependencies
- **Severity:** LOW | **Effort:** 0.5h | **ROI:** 10
- **Files:** `package.json:2-7`
- **Verified:** ✅ All 4 dependencies under devDependencies, zero production deps.
- **Impact:** `npm audit --production` finds nothing. Deployment using `--omit=dev` misses React.
- **Fix:** Move react to dependencies.

### Quality Gate Items (Fix This Sprint)

#### DEBT-002: No linting or formatting tool
- **Severity:** HIGH | **Effort:** 3h | **ROI:** 2.67
- **Files:** `package.json:1-13`
- **Verified:** ✅ No ESLint, Prettier, or Biome in package.json or config files.
- **Impact:** 117 files with zero style enforcement. Review burden grows linearly.
- **Fix:** Add ESLint + Prettier (or Biome). Add pre-commit hook via husky/lint-staged.

#### DEBT-005: Adapters excluded from type checking
- **Severity:** MEDIUM | **Effort:** 1.5h | **ROI:** 4.67
- **Files:** `tsconfig.json:8`
- **Verified:** ✅ tsconfig includes only `plugin-bos-light/src/**/*.ts` and `plugin-bos-light/tests/**/*.ts`.
- **Impact:** Type errors in GSD-Pi adapter compile silently. Runtime failures in automation.
- **Fix:** Add adapters/ to tsconfig include or create separate tsconfig with project references.

#### DEBT-006: Minimal vitest configuration
- **Severity:** MEDIUM | **Effort:** 1.5h | **ROI:** 4
- **Files:** `plugin-bos-light/vitest.config.ts:1-6`
- **Verified:** ✅ Only `pool: "forks"` configured. No coverage, timeouts, retries, or include/exclude.
- **Impact:** No coverage enforcement. Regression risk invisible. Flaky tests block CI.
- **Fix:** Add coverage provider, thresholds, timeout, and include/exclude patterns.

### Runtime Safety Items (Fix Next Sprint)

#### DEBT-001: Unsafe `as any` casts in worker IPC
- **Severity:** MEDIUM | **Effort:** 3h | **ROI:** 2.33
- **Files:** `plugin-bos-light/src/worker.ts:180,195,207`
- **Verified:** ✅ Three `as any` casts confirmed at lines 180, 195, 207.
- **Impact:** Runtime type errors in worker message handling. API shape changes fail at runtime, not compile time.
- **Fix:** Define proper return type interfaces. Remove casts.

#### DEBT-012: GITHUB_TOKEN accessed without validation
- **Severity:** MEDIUM | **Effort:** 1.5h | **ROI:** 4
- **Files:** `plugin-bos-light/src/externalIO.ts:89,234`, `plugin-bos-light/src/secretResolver.ts`
- **Verified:** ✅ Direct `process.env.GITHUB_TOKEN` at lines 89 and 234. Bypasses secretResolver.
- **Impact:** Two secret access patterns. Future vault integration requires touching externalIO.ts.
- **Fix:** Route GITHUB_TOKEN through secretResolver.ts.

#### DEBT-010: Hardcoded circuit breaker polling config
- **Severity:** MEDIUM | **Effort:** 1.5h | **ROI:** 3.33
- **Files:** `plugin-bos-light/src/circuitBreaker.ts:6-9`
- **Verified:** ✅ `POLLING_CONFIG` hardcoded: 30s interval, 5s jitter, 10 attempts, 60 max retries.
- **Impact:** Cannot tune for different environments. Dev wastes resources; prod can't tune recovery.
- **Fix:** Accept config as constructor parameter with env var overrides.

### Architecture Items (Backlog)

#### DEBT-007: Flat barrel index.ts re-exports 38 modules
- **Severity:** LOW | **Effort:** 6h | **ROI:** 0.5
- **Files:** `plugin-bos-light/src/index.ts:1-39`
- **Verified:** ✅ Barrel file confirmed with `export * from` pattern.
- **Impact:** No namespacing. All internal APIs public. Tree shaking less effective.
- **Fix:** Group exports into namespaces or tiered export files.

#### DEBT-008: Scripts directory cluttered with artifacts
- **Severity:** LOW | **Effort:** 1.5h | **ROI:** 2
- **Files:** `scripts/`
- **Verified:** ✅ 120 scripts in directory. Mix of milestone-specific artifacts and reusable tooling.
- **Impact:** New contributors cannot find reusable scripts. No cleanup policy.
- **Fix:** Archive milestone-specific scripts to docs/archive/.

#### DEBT-011: 7 source files have no test coverage
- **Severity:** MEDIUM | **Effort:** 20h | **ROI:** 0.4
- **Files:** `contracts.ts`, `index.ts`, `issueBlueprintFlow.ts`, `paperclipAdapter.ts`, `paperclipTaskPort.ts`, `runtimeCapabilities.ts`, `worker.ts`
- **Verified:** ✅ All 7 files confirmed missing test counterparts.
- **Impact:** worker.ts breakage kills entire plugin. issueBlueprintFlow.ts bugs affect core logic.
- **Fix:** Integration tests for worker.ts (8h). Unit tests for issueBlueprintFlow.ts (6h). Others: 6h.

---

## Cost-Benefit Matrix

| Rank | ID | Title | Effort (h) | Impact | Risk | ROI |
|------|-----|-------|-----------|--------|------|-----|
| 1 | DEBT-003 | Missing type:module | 0.5 | 9 | 8 | 18.0 |
| 2 | DEBT-004 | Wrong test runner | 0.5 | 7 | 6 | 14.0 |
| 3 | DEBT-009 | All deps as devDeps | 0.5 | 5 | 4 | 10.0 |
| 4 | DEBT-005 | Adapters not type-checked | 1.5 | 7 | 7 | 4.67 |
| 5 | DEBT-006 | Minimal vitest config | 1.5 | 6 | 5 | 4.0 |
| 6 | DEBT-012 | GITHUB_TOKEN no validation | 1.5 | 6 | 7 | 4.0 |
| 7 | DEBT-010 | Hardcoded polling config | 1.5 | 5 | 5 | 3.33 |
| 8 | DEBT-002 | No linting configured | 3 | 8 | 7 | 2.67 |
| 9 | DEBT-001 | Unsafe as any casts | 3 | 7 | 6 | 2.33 |
| 10 | DEBT-008 | Cluttered scripts dir | 1.5 | 3 | 2 | 2.0 |
| 11 | DEBT-007 | Flat barrel exports | 6 | 3 | 2 | 0.5 |
| 12 | DEBT-011 | 7 files no tests | 20 | 8 | 7 | 0.4 |

---

## Remediation Roadmap

### Sprint 1: Foundation Fixes (1.5 hours)
**Focus:** Module resolution, CI accuracy, dependency hygiene
**Items:** DEBT-003, DEBT-004, DEBT-009
**All independent — can be done in parallel.**

| Item | Fix | Time |
|------|-----|------|
| DEBT-003 | Add `"type": "module"` to package.json | 30m |
| DEBT-004 | Add `exclude: ['adapters/**']` to vitest.config.ts | 30m |
| DEBT-009 | Move react to dependencies | 30m |

**Expected outcome:** 64/64 test suites pass. Scripts run correctly with Node. Production dep audit works.

### Sprint 2: Quality Gates (6 hours)
**Focus:** Linting, coverage, type checking
**Items:** DEBT-002, DEBT-005, DEBT-006
**Dependency chain:** DEBT-002 must complete before DEBT-005 and DEBT-006.

| Item | Fix | Time |
|------|-----|------|
| DEBT-002 | Add ESLint + Prettier, pre-commit hook | 3h |
| DEBT-005 | Add adapters/ to tsconfig, fix type errors | 1.5h |
| DEBT-006 | Add coverage provider, thresholds, timeouts | 1.5h |

**Expected outcome:** Automated style enforcement. Coverage visible. All code type-checked.

### Sprint 3: Runtime Safety (6 hours)
**Focus:** Type casts, config flexibility, secret hygiene
**Items:** DEBT-001, DEBT-010, DEBT-012
**Dependency:** DEBT-012 depends on DEBT-001.

| Item | Fix | Time |
|------|-----|------|
| DEBT-001 | Define return type interfaces, remove `as any` | 3h |
| DEBT-010 | Constructor param with env var overrides | 1.5h |
| DEBT-012 | Route GITHUB_TOKEN through secretResolver | 1.5h |

**Expected outcome:** Worker IPC is type-safe. Polling configurable per environment. Unified secret access.

### Sprint 4: Architecture (27.5 hours)
**Focus:** Modular exports, scripts cleanup, test coverage
**Items:** DEBT-007, DEBT-008, DEBT-011
**All independent.** DEBT-011 needs DEBT-006 from Sprint 2.

| Item | Fix | Time |
|------|-----|------|
| DEBT-007 | Group exports into namespaces | 6h |
| DEBT-008 | Archive milestone-specific scripts | 1.5h |
| DEBT-011 | Add tests for 7 untested files | 20h |

**Expected outcome:** Clear module boundaries. scripts/ is curated. Core modules tested.

---

## Dependency Graph

```
DEBT-003 (module) ──→ DEBT-002 (lint) ──→ DEBT-005 (tsconfig) ──→ DEBT-006 (vitest) ──→ DEBT-011 (tests)
                                                         ↑
DEBT-004 (test runner) ─────────────────────────────────┘

DEBT-001 (as any) ──→ DEBT-012 (secrets)

Independent: DEBT-009, DEBT-010, DEBT-008, DEBT-007
```

**Critical path:** DEBT-003 → DEBT-002 → DEBT-005 → DEBT-006 → DEBT-001 → DEBT-012

---

## Div5 Verification Summary

All 12 debt items verified against live source code on 2026-06-04:

| Item | Verification Method | Status |
|------|-------------------|--------|
| DEBT-001 | `grep -n "as any" worker.ts` → lines 180, 195, 207 | ✅ Confirmed |
| DEBT-002 | `cat package.json` → no ESLint/Prettier/Biome | ✅ Confirmed |
| DEBT-003 | `cat package.json` → no `"type"` field | ✅ Confirmed |
| DEBT-004 | `cat vitest.config.ts` → no exclude pattern | ✅ Confirmed |
| DEBT-005 | `cat tsconfig.json` → only plugin-bos-light in include | ✅ Confirmed |
| DEBT-006 | `cat vitest.config.ts` → only `pool: "forks"` | ✅ Confirmed |
| DEBT-007 | `head plugin-bos-light/src/index.ts` → `export *` pattern | ✅ Confirmed |
| DEBT-008 | `ls scripts/ \| wc -l` → 120 files | ✅ Confirmed |
| DEBT-009 | `cat package.json` → all deps under devDependencies | ✅ Confirmed |
| DEBT-010 | `grep POLLING_CONFIG circuitBreaker.ts` → hardcoded 30000ms | ✅ Confirmed |
| DEBT-011 | Test file existence check → 7 files missing | ✅ Confirmed |
| DEBT-012 | `grep GITHUB_TOKEN externalIO.ts` → direct process.env at lines 89, 234 | ✅ Confirmed |

**Verification verdict:** All debt items are real, accurately described, and cite correct file:line references.

---

## Recommendation

**Start with Sprint 1 immediately.** The three items take 1.5 hours total and fix foundation-level problems that affect every developer. Then proceed through Sprints 2-4 in order, respecting the dependency chain.

The codebase has good test coverage (1.74:1 test-to-source ratio) and strict TypeScript enabled. The debt is primarily in project scaffolding and configuration, not in code quality. This is a healthy codebase with tooling gaps — fixable with focused effort.

---

*Report generated by GSD Auto-Mode (Div4 Analysis + Div5 Verification)*
*Milestone M013-aixgv5 | Slice S02 | Task T04*
