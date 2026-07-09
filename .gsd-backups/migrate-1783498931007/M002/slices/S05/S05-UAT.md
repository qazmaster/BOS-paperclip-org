# S05: Plugin and UI surface probes — UAT

**Milestone:** M002
**Written:** 2026-05-29T11:57:07.618Z

## UAT Type

Evidence-gated runtime validation artifact review for Paperclip plugin/UI boundary support.

## Preconditions

- Repository is checked out in the M002 worktree.
- No human-supplied live Paperclip secrets are required for the fail-closed path.
- If live Paperclip auth is later supplied, it must be provided through the approved secure environment mechanism and must not be serialized into artifacts.
- S04 native artifact evidence exists but must not be treated as proof for S05 plugin/UI surfaces.

## Steps

1. Run `npm --prefix plugin-bos-light test -- registrationProbe`.
2. Run `python3 -m unittest scripts/test_run_s05_plugin_ui_surface_probe.py scripts/test_validate_s05_plugin_ui_surface_probe.py`.
3. Generate and validate S05 evidence with `python3 scripts/run_s05_plugin_ui_surface_probe.py --output runtime-evidence/M002-S05-plugin-ui-surface-probe.json && python3 scripts/validate_s05_plugin_ui_surface_probe.py --evidence runtime-evidence/M002-S05-plugin-ui-surface-probe.json --phase final`.
4. Run `python3 -m unittest scripts/test_validate_runtime_capabilities.py && python3 scripts/validate_runtime_capabilities.py && npm --prefix plugin-bos-light run typecheck`.
5. Inspect `runtime-evidence/M002-S05-plugin-ui-surface-probe.json` and confirm every `confirmed` surface, if any, has S05-specific live readback/render/invocation proof and runtime version/build evidence.
6. Review `plugin-bos-light/capabilities.paperclip-runtime.json`, `docs/14_PLUGIN_UI_SURFACE_PROBES.md`, `docs/08_RUNTIME_CAPABILITY_HEALTH.md`, and `PAPERCLIP_LIVE_VALIDATION_REPORT.md` for consistency with the evidence artifact.

## Expected Outcomes

- All commands exit 0.
- With no live Paperclip base URL/API key, the canonical artifact is `fail-closed-unsupported` and no surface is confirmed.
- Plugin registration, piko tools, data providers, actions, dashboard widgets, and issue-detail tabs are fallback-only or unvalidated unless S05 live proof exists.
- Secret-like values are absent from evidence/docs/logs; redaction metadata reports success.
- Native approval and action side-effect counters remain zero.
- Runtime capability matrix and docs do not reuse S04 native artifact proof to promote S05 plugin/UI surfaces.

## Edge Cases

- Missing auth or missing base URL should produce bounded fallback-only diagnostics, not success claims.
- 401/403/404/5xx/timeout/malformed JSON responses should remain validation-safe diagnostics.
- Missing registered keys or missing UI render IDs must prevent `confirmed` status.
- Stale S04 evidence, local manifest intent, or partial host responses must not promote a surface.
- Any secret serialization or nonzero native approval creation fails UAT and requires rollback to fail-closed evidence before rerun.
