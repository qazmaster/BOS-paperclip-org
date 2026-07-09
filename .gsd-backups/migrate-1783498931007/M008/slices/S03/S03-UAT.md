# S03: PaperclipAction Mapper and BosTaskMetadata — UAT

**Milestone:** M008
**Written:** 2026-06-02T08:06:24.380Z

# UAT: S03 PaperclipAction Mapper and BosTaskMetadata

## What changed
PaperclipTaskPort interface defines contract for Paperclip task operations. DryRunPaperclipTaskPort returns action objects without HTTP calls. BosTaskMetadata captures routing governance state. Mirror formatter produces structured comments for audit trail.

## How to verify
1. Run `npx vitest run plugin-bos-light/tests/paperclip-mapper.test.ts` - all 11 tests should pass
2. Run `npx vitest run plugin-bos-light/tests/` - all 590 tests should pass
3. Review paperclipTaskPort.ts - interface with idempotencyKey on all methods
4. Review bosTaskMetadata.ts - governance metadata type
5. Review metadataMirror.ts - structured comment format

## Architecture invariant
BOS Light constrains, labels, routes, verifies, and escalates work inside Paperclip. Paperclip is the runtime, BOS Light is the doctrine overlay.
