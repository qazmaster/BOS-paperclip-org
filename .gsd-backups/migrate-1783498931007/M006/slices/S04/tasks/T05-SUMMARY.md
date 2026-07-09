---
id: T05
parent: S04
milestone: M006
key_files:
  - plugin-bos-light/tests/treasury.test.ts
key_decisions:
  - Imported resolveSecretRef directly in the test file (rather than via treasury re-export) because treasury.ts only calls redactSecretRef, not resolveSecretRef. Testing the resolver boundary separately preserves the architectural separation while still enforcing the fail-closed contract.
  - Added 'status_update payload does not contain raw secret_ref object' test to close a redaction coverage gap: existing tests checked for secret_ref_redacted presence but did not assert the raw secret_ref object was absent.
duration: 
verification_result: passed
completed_at: 2026-06-01T08:35:49.571Z
blocker_discovered: false
---

# T05: Extended treasury.test.ts to 26 tests, adding fail-closed PaperclipSecretRef resolution, raw secret_ref redaction in status_update, and multi-grant inbox accumulation coverage

**Extended treasury.test.ts to 26 tests, adding fail-closed PaperclipSecretRef resolution, raw secret_ref redaction in status_update, and multi-grant inbox accumulation coverage**

## What Happened

The existing treasury.test.ts had 23 passing tests. The task plan targeted 25+ tests with explicit coverage for fail-closed PaperclipSecretRef behavior. I added 3 new tests:

1. "fail-closed: resolveSecretRef returns unavailable for PaperclipSecretRef" — imports resolveSecretRef from secretResolver and asserts that a PaperclipSecretRef resolves to status 'unavailable' with code 'secret_unavailable' and a blocker mentioning 'not resolvable'. This validates the fail-closed contract at the resolver boundary even though treasury.ts only consumes redactSecretRef.

2. "status_update payload does not contain raw secret_ref object" — after emitting a grant, inspects the Div1.HCO status_update packet payload and asserts that the key 'secret_ref' is absent while 'secret_ref_redacted' is present. This closes a redation gap not explicitly checked in the existing tests.

3. "multiple grants accumulate in division inboxes" — issues two grants and verifies both Div6.External and Div1.HCO inboxes contain exactly 2 packets, confirming the packet router accumulates across calls as expected.

All 26 treasury tests pass, and the full suite (386 tests across 27 files) remains green.

## Verification

Ran npx vitest run tests/treasury.test.ts — 26/26 passed. Ran npx vitest run — 386/386 passed across 27 test files. No regressions.

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `cd plugin-bos-light && npx vitest run tests/treasury.test.ts --reporter=verbose` | 0 | ✅ pass | 1071ms |
| 2 | `cd plugin-bos-light && npx vitest run --reporter=verbose` | 0 | ✅ pass | 2903ms |

## Deviations

None.

## Known Issues

None.

## Files Created/Modified

- `plugin-bos-light/tests/treasury.test.ts`
