---
estimated_steps: 8
estimated_files: 1
skills_used: []
---

# T04: Inventory adapter registry and host prerequisites

Inventory the Paperclip runtime adapter mechanism for this sandbox and determine concrete launch requirements for hermes_local and gsdpi_local.

Steps:
1. Locate Paperclip adapter registry/config mechanism through supported extension or configuration boundaries only.
2. Check whether hermes_local is already installed/available and record version or absence.
3. Check how external/custom adapters are registered for gsdpi_local.
4. Verify host prerequisites for GSD-Pi: Node >= 22, @opengsd/gsd-pi command, `gsd --version`, `gsd headless --help`, repo cwd, .gsd writability, and git state policy.
5. Produce a go/no-go checklist for S02 Hermes smoke and S03 gsdpi_local smoke.
6. Record any need for Paperclip core modification as a blocker, not an implementation path.

## Inputs

- `docs/BOS_Light_v1_3_FINAL.pdf`
- `PAPERCLIP_SANDBOX_TESTING_HANDOFF.md`

## Expected Output

- `Adapter readiness checklist for hermes_local and gsdpi_local`
- `Recorded blockers for missing adapter package or unsupported headless mode`
- `No-core-modification blocker list if adapter boundary is absent`

## Verification

Checklist names exact adapter registry/config path, hermes_local status, gsdpi_local registration path, GSD-Pi command support or blocker evidence, and confirms no Paperclip core patch is used.

## Observability Impact

Makes adapter assumptions explicit before launching agents; captures version, config path, failure modes, and upgrade-safety blockers.
