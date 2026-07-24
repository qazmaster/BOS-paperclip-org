---
name: microservices-patterns
description: RESTORED-MARKER stub. Canonical source lives outside the allowed working directory; this stub restores path presence for S10 closeout per T05 closeout instructions, without reading the external checkout. Use only as a provenance marker for the S10 slice — do not treat as the authoritative contract.
---

<!--
Restored marker for S10 closeout (T05). See:
  .gsd/phases/16-txa3vu-evidence-bearing-bounded-mission-proof/16-10-PLAN.md (T05)
  .gsd/phases/16-txa3vu-evidence-bearing-bounded-mission-proof/S10-T01-SUMMARY.md
  .gsd/phases/16-txa3vu-evidence-bearing-bounded-mission-proof/S10-T02-SUMMARY.md
  .gsd/phases/16-txa3vu-evidence-bearing-bounded-mission-proof/S10-T03-SUMMARY.md
  .gsd/phases/16-txa3vu-evidence-bearing-bounded-mission-proof/S10-T04-SUMMARY.md

This file is NOT the canonical skill contract. It exists only so that the
`.agents/skills/microservices-patterns/SKILL.md` path required by the slice
plan resolves inside the allowed working directory.

S10 is a single-process offline acceptance contract (contract + builder +
verifier + integration + tamper suites). It has no service boundaries, no
network calls, no live Paperclip traffic, and no orchestrator/runtime split.
The canonical microservices-patterns skill therefore does not govern any
runtime decision in this slice; it is listed only because the slice plan
references it under `skills_used:` for the contract-modeling step (T01).

If/when a future slice introduces a multi-process surface, replace this stub
with the canonical user-scope skill (do not paste it here from a sibling
checkout — restore it through the project's normal skill-routing flow).
-->