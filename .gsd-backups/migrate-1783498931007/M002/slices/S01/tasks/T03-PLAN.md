---
estimated_steps: 8
estimated_files: 1
skills_used: []
---

# T03: Inventory Paperclip extension boundaries

Inventory Paperclip supported extension boundaries in the sandbox before selecting any implementation path.

Steps:
1. Identify documented or runtime-visible company-template/import/export surfaces.
2. Identify plugin load and plugin capability APIs, if available.
3. Identify Paperclip agent configuration surfaces for adapterType, role instructions, budgets, toolsets, context, and permissions.
4. Identify external/custom adapter registration mechanism for hermes_local and gsdpi_local.
5. Mark direct DB access, core source patches, monkey patches, private module imports, and host-internal undocumented APIs as prohibited.
6. Record what can be used safely and what remains unvalidated.

## Inputs

- `docs/BOS_Light_v1_3_FINAL.pdf`
- `PAPERCLIP_SANDBOX_TESTING_HANDOFF.md`

## Expected Output

- `Supported extension-boundary inventory`
- `Prohibited core-coupling list`

## Verification

Report names company-template, plugin, agent config, and adapter boundaries that are supported or unvalidated, and explicitly rejects core patches/private DB/internal module dependencies.

## Observability Impact

Creates an upgrade-safety map so downstream tasks do not accidentally couple to Paperclip internals.
