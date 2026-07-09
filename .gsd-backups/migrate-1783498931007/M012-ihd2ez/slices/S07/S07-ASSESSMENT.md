---
sliceId: S07
uatType: artifact-driven
verdict: FAIL
date: 2026-06-03T09:31:54Z
---

# UAT Result — S07

## Checks

| Check | Mode | Result | Notes |
|-------|------|--------|-------|
| Run `node --test scripts/test_m012_s07_t01.js`. | runtime | PASS | `gsd_exec` 7d1432af-f77f-49cb-9194-e0c4f2fda47c exited 0. Output reported `tests 24`, `pass 24`, `fail 0`. |
| Confirm the rescope decision JSON, markdown decision, and requirement update evidence exist, are internally consistent, reference BOS-3, and do not contain plaintext secrets. | artifact | PASS | `gsd_exec` 42c1718f-4a37-43bd-8be6-8f9e2b2f8f68 exited 0. The three expected artifacts existed, referenced BOS-3, documented auto-mode explicit-confirmation constraints/prohibitions, preserved unproven R022/R023 boundaries, and had no forbidden secret patterns. An earlier overly strict wording check failed only because it required the literal word `unavailable`; the retry used the artifacts' actual documented semantics (`prohibited`, `NOT created with explicit user confirmation`, and formal re-scope). |
| Run `node --test scripts/test_m012_s07_t02.js`. | runtime | FAIL | `gsd_exec` f24e29bb-ece6-46b5-9ed6-02f4eb1a5ab9 exited 1. Output reported `tests 14`, `pass 13`, `fail 1`; failing assertion: `S07 demo text mentions auto-mode constraint` / `S07 demo context must mention auto-mode constraint`. |
| Confirm R022/R023 requirement language, S04 outcomes, and S07 roadmap language describe the auto-mode re-scope instead of claiming user confirmation. | artifact | FAIL | `gsd_exec` 914cae74-c9aa-4f3e-8483-7f0a1b1b6166 exited 1. R022/R023 requirement language and S04 outcomes included re-scope language, but `.gsd/milestones/M012-ihd2ez/M012-ihd2ez-ROADMAP.md` S07 excerpt did not include `auto-mode constraint`: `explicit user confirmation has either authorized... or the milestone success criterion has been formally re-scoped...`. No explicit user-confirmation overclaim was detected in this check. |
| Run `node scripts/validate_m012_s07_closeout.js`. | runtime | FAIL | `gsd_exec` 5509094a-5771-49a3-bb65-8bc8223b9e3c exited 1. Output reported `SUITE_RESULT FAIL — S07 closeout gate: 25/27 checks passed`. Failed checks included S06 closeout regression and S07 artifact secret scan. |
| Inspect `runtime-evidence/M012-S07-closeout-gate.json` and confirm the verdict is `pass`. | artifact | FAIL | `gsd_exec` d3bb95e9-a492-47f7-9798-4e137bae717d exited 1 after parsing the gate. Observed `verdict=fail`, `checks=27`, `failures=2`: `s06-closeout: runs without error (regression pass)` and `secret-scan: no forbidden secret patterns in S07 artifacts` due to `.gsd/milestones/M012-ihd2ez/slices/S07/tasks/T03-SUMMARY.md:40:password`. |

## Overall Verdict

FAIL — S07 UAT found automatable failures in the T02 propagation test, milestone roadmap S07 auto-mode constraint language, and the aggregate S07 closeout gate.

## Notes

- All checks were executed in artifact-driven mode using `gsd_exec` from the mandated worktree.
- The root `.gsd/ROADMAP.md` only listed milestones; the S07 roadmap artifact under test is `.gsd/milestones/M012-ihd2ez/M012-ihd2ez-ROADMAP.md`, matching `scripts/test_m012_s07_t02.js`.
- Remediation should address the missing `auto-mode constraint` wording near S07 roadmap demo text, the inherited S06 closeout regression, and the S07 secret-scan finding in `T03-SUMMARY.md` before rerunning UAT.
