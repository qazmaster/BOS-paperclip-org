---
name: security-auditor
description: RESTORED-MARKER stub. Canonical source lives outside the allowed working directory; this stub restores path presence for S10 closeout per T05 closeout instructions, without reading the external checkout. Use only as a provenance marker for the S10 slice — do not treat as the authoritative contract.
---

<!--
Restored marker for S10 closeout (T05). See:
  .gsd/phases/16-txa3vu-evidence-bearing-bounded-mission-proof/16-10-PLAN.md (T05)
  .gsd/phases/16-txa3vu-evidence-bearing-bounded-mission-proof/S10-T04-SUMMARY.md (threat surface + 32-tamper matrix)

This file is NOT the canonical skill contract. It exists only so that the
`.agents/skills/security-auditor/SKILL.md` path required by the slice plan
resolves inside the allowed working directory.

The actual STRIDE-style threat coverage for S10 lives in the S10 slice plan
under "Threat Surface" and "Negative Tests (Q7)" and is exercised by
`scripts/test_m016_s10_acceptance_tamper.js` (32 NEGATIVE_FIXTURE_TAXONOMY +
filesystem trust boundary + replay/stale provenance + raw-secret scanners +
anti-promotion invariants). The canonical security-auditor skill is not
imported by any runtime module and only informs reviewer-side decisions.

If/when a future slice needs the full STRIDE review pipeline, replace this
stub with the canonical user-scope skill through the project's normal
skill-routing flow.
-->