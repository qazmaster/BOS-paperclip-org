---
name: e2e-testing-patterns
description: Master end-to-end testing with Playwright and Cypress to build reliable test suites that catch bugs, improve confidence, and enable fast deployment. Use when implementing E2E tests, debugging flaky tests, building test infrastructure, or establishing testing standards for web applications.
---

# E2E Testing Patterns

Build reliable end-to-end test suites that exercise real user flows against real systems, while remaining fast enough to run on every change and resilient enough to avoid flakiness.

## When to Use This Skill

- Implementing Playwright or Cypress test suites
- Debugging flaky or non-deterministic tests
- Building test infrastructure (selectors, fixtures, env)
- Establishing testing standards for a web project
- Verifying multi-step user journeys (signup, checkout, etc.)
- Cross-browser validation
- Setting up CI/CD test pipelines

## Core Concepts

### 1. Test Pyramid vs. Trophy

- **End-to-end (E2E)**: User-facing flows; few, slow, high signal.
- **Integration**: Components/services together; the bulk of automated coverage.
- **Unit**: Pure functions/utilities; fast feedback.

E2E is the most expensive signal, so use it sparingly — only for the
flows that would silently regress critical paths.

### 2. Selector Discipline

Prefer order of stability:

1. **role + name** (`page.getByRole('button', { name: 'Submit' })`) — best
2. **label** (`page.getByLabel('Email')`)
3. **text** (`page.getByText('Dashboard')`)
4. **test-id** (`page.getByTestId('user-menu')`)
5. **CSS** — last resort, brittle to redesigns

Never select by index, xpath position, or generated CSS.

### 3. Isolation and Determinism

- One test, one user, one fixture — no cross-test shared state.
- Generate users / API keys per test, never reuse.
- Mock only at the narrowest seam (e.g., third-party HTTP), never the
  system-under-test itself.
- Network and animation idle waits are preferred to hard sleeps.

## Authoritative References

Detailed Playwright/Cypress patterns, page-object models, fixtures, and
multi-context patterns live upstream in the original skill sources. Use
this file as a path anchor only — restore-from-checkout is required for
full pattern coverage.

## Best Practices

1. **Stable Selectors**: Use `getByRole` first, fall back to `data-testid`.
2. **Auto-Wait**: Trust the framework's auto-wait; avoid `waitForTimeout`.
3. **Auth State Reuse**: Persist and reuse login state across tests.
4. **Bounded Probes**: For diagnostic E2E, hard-cap attempts and never
   mutate business state.
5. **Independent Failures**: Each test must set up its own data.
6. **Trace + Video on Failure**: Configure artifacts before running CI.
7. **No Hardcoded UUIDs**: Resolve entities from canonical names/keys.
8. **Clean Before/After Readback**: Verify side-effect-free E2E by
   comparing observed entity counts before and after the run.

## Common Pitfalls

- Over-relying on CSS selectors that change with redesigns
- Sharing cookies/storage between tests (cross-contamination)
- Hardcoded sleeps to mask timing races
- Treating the existence of a 200 status as proof of correctness
- Capturing real credentials / PII in evidence artifacts
