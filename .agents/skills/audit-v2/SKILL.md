---
name: audit-v2
description: Execution-based code audit that forces verification through evidence, not assumptions. Replaces superficial structural reviews with functional verification. Every claim must be backed by executed proof.
---

# Audit v2

This is execution-first auditing: the audit is "passed" only when the
discipline produces empirical evidence, not when the audit produces a
checklist.

## When to Use This Skill

- Reviewing a feature slice before promotion
- Validating fail-closed behavior under attacker-shaped inputs
- Investigating regressions reported by external callers
- Producing filing-ready audit reports with file:line references

## Core Discipline

Every audit finding must pair:

1. **A precise symptom** (file:line, function, config key, request shape).
2. **An reproducible execution** that proves the claim (a command that
   the next operator can rerun).
3. **A minimal fix** that is verifiable by the same execution.

If any of the three is missing, treat the finding as a hypothesis, not a
fact. Drop or annotate.

## Threat Model

Audit claims must hold under at least these shape classes:

- **Identity drift**: name ↔ id mismatch between subsystems.
- **Configuration drift**: agent config ↔ adapter config ↔ runtime.
- **Polling / time-budget exhaustion**: terminal status never reached.
- **Redaction gaps**: evidence stringifies credential / PII / vendor
  reuse strings.
- **Side-effect leaks**: a "diagnostic" call unexpectedly mutates
  business state (issues/documents/comments/approvals/agents/heartbeats).

## Best Practices

1. **Read, then probe**: never trust static reading alone.
2. **Use redacted fixtures**: never replay raw PII / secrets.
3. **State PASS/FAIL with a single canonical verdict line** so downstream
   admission consumers can scan it.
4. **Bound blast radius**: rejects must stop flow, not downgrade silently.
5. **Capture blockers in evidence** with stable, unique codes so the
   next unit can grep for them.

## Authoritative References

Full threat-model and STRIDE-class taxonomies live in the upstream skill
sources. This file is a path anchor; restore-from-checkout is required
for full coverage.
