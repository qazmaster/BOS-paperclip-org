---
estimated_steps: 8
estimated_files: 2
skills_used: []
---

# T05: Probe native artifact readback in sandbox

If sandbox mutation was approved, perform the smallest native artifact read/write probes needed by downstream slices. Prefer existing BOS-1 sandbox issue or a clearly named test issue. Do not test approvals yet unless separately approved.

Steps:
1. Create or select approved sandbox test issue through Paperclip API/UI surfaces only.
2. Create and read back a comment if supported.
3. Create and read back a document or equivalent issue artifact if supported.
4. Record object IDs with redaction as needed.
5. Keep capability matrix unchanged unless proof evidence is complete and validators pass.
6. Do not use direct database writes or Paperclip core internals even for probes.

## Inputs

- `HANDOFF_REAL_PAPERCLIP_IMPORT_TEST.md`
- `plugin-bos-light/capabilities.paperclip-runtime.json`

## Expected Output

- `Readback evidence for issue/comment/document surfaces or explicit unsupported/fallback record`

## Verification

Each probed surface has create action, readback result, runtime version/build, environment type, and object ID or a documented failure. Capability updates, if any, pass runtime capability validator. No direct DB/core-internal path is used.

## Observability Impact

Captures the first real native artifact surface evidence consumed by BOS artifact flow tests, while preserving upgrade-safety boundaries.
