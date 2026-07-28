---
name: apply-ui-gates
description: RESTORED-MARKER stub for the ui-ux-uat-gates workflow entrypoint. Canonical source lives outside the allowed working directory; this stub restores path presence for S10 closeout per T05 closeout instructions, without reading the external checkout. Use only as a provenance marker for the S10 slice.
---

<!--
Restored marker for S10 closeout (T05). See:
  .gsd/phases/16-txa3vu-evidence-bearing-bounded-mission-proof/16-10-PLAN.md (T05)
  .gsd/ui-gates/STYLE_PICK.md (S10 STYLE_PICK: runtime verification only, UI style selection not applicable)

This file is NOT the canonical workflow contract. It exists only so that the
`.agents/skills/ui-ux-uat-gates/workflows/apply-ui-gates.md` path required by
the slice plan resolves inside the allowed working directory.

S10's STYLE_PICK explicitly records "UI style selection: not applicable"
because the slice produces offline runtime evidence and bounded validator
output, not a user-facing interface. The full ui-ux-uat-gates workflow
(STYLE_PICK → DESIGN_DNA → COMPONENT_PLAN → UI_VERIFY) therefore does not
run in S10; the runtime validator (`scripts/verify_m016_s10_acceptance_contract.js`)
and its CLI health line `M16-S10-ACCEPTANCE` are the authoritative UAT gate.

If/when a future UI-impacting slice is planned, replace this stub with the
canonical user-scope workflow through the project's normal skill-routing
flow and update that slice's STYLE_PICK accordingly.
-->