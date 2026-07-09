# M003: Decision Protocol and Product Polish

**Vision:** Make major BOS Light choices visible, explainable, and recoverable through a compact Div7.MissionControl decision protocol and polished Paperclip-native or deterministic markdown artifacts, while preserving the conservative runtime capability boundary established by M002.

## Success Criteria

- CLEAR batch approval inputs produce compact Div7.MissionControl recommendations and visible decision records.
- Policy, budget, incident, gate failure, circuit breaker, and strategic choices expand into risk-tiered records with domain-dependent OODA detail.
- Decision artifacts prefer Paperclip native documents or comments when supported and otherwise return deterministic markdown fallback with sanitized diagnostics.
- Live issue, document, or comment readback is attempted only when supported access exists, and unavailable or denied access is recorded as fail-closed blocker evidence.
- Tests and documentation explicitly avoid promoting plugin UI, actions, tool registration, native approvals, Hermes, activity logs, events, or GSD-Pi runtime execution support.

## Slices

- [x] **S01: Decision contract and classifier** `risk:high` `depends:[]`
  > After this: Run decision fixture tests showing CLEAR, COMPLICATED, COMPLEX, CHAOTIC, and DISORDER inputs produce validated recommendations, confidence, risk tiers, and compact or expanded records.

- [x] **S02: Artifact envelope and fallback persistence** `risk:high` `depends:[S01]`
  > After this: Generate a decision artifact envelope that prefers native document or comment mirroring and falls back to deterministic markdown with explicit sanitized diagnostics.

- [x] **S03: Major flow decision integration** `risk:medium` `depends:[S01,S02]`
  > After this: Run integration fixtures where batch approval, eval gate failure, circuit breaker OPEN, policy or budget exception, and strategic choice inputs produce consistent decision artifacts.

- [x] **S04: Live proof and capability polish** `risk:medium` `depends:[S02,S03]`
  > After this: Attempt supported live Paperclip issue, document, or comment readback for a decision artifact, or record fail-closed blocker evidence, then verify docs and tests keep unsupported surfaces out of claims.

- [x] **S05: Validation artifact reconciliation** `risk:low` `depends:[S04]`
  > After this: After this: M003 has canonical validation-support artifacts: Boundary Map populated from proven slice contracts, S01-S04 assessments restored or explicitly reconciled from existing evidence, rendered roadmap state aligned with DB status, and milestone validation reruns to pass or reports only real remaining blockers.

## Boundary Map

## Horizontal Checklist

- **Requirements:** R003, R008, R009, R010, R012, R013, R014, and R016 are mapped to primary slices with support noted in the coverage summary.
- **Decisions:** Reuse the M002 artifact-first posture and the M003 risk-tiered Div7.MissionControl record decisions; do not introduce a separate governance runtime.
- **Shutdown:** Invalid inputs, denied runtime access, unavailable APIs, malformed adapter responses, and readback mismatches fail closed with structured diagnostics.
- **Revenue:** Budget and resource exceptions are represented as decision triggers, but no billing or revenue system integration is introduced.
- **Auth:** Live Paperclip credentials are optional for operational proof; secrets and raw auth material must never appear in artifacts, diagnostics, logs, or evidence.
- **Shared resources:** Keep Paperclip issues, documents, comments, adapter seams, and deterministic markdown fallback as shared integration boundaries.
- **Reconnection:** Markdown fallback, artifact refs, sanitized reasons, and readback validation let future agents recover state without hidden plugin state.
