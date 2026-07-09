---
estimated_steps: 1
estimated_files: 1
skills_used: []
---

# T03: Div5 quarantine module implementation

Create plugin-bos-light/src/div5Quarantine.ts with verifyAndQuarantine function enforcing strict caller identity (Div5.QualificationsLibraryLearning only). Retrieve completion_report from Div5 inbox by quarantine_ref. Validate evidence: trust_level must be 'untrusted', git_evidence must exist, grant_id must match. Reject immediately if git_evidence.success is false. Scan redacted_diagnostics and parsed_metadata text fields with SECRET_PATTERNS from gitOperations.ts; report SecurityFlag[]. Build verified_refs from parsed_metadata.refs or fallback to git_evidence.args. Build SanitizedRepoSnapshot with trust_level 'sanitized' on pass, 'rejected' on failure. Emit gate_decision to Div4.Production on approval; escalation to Div1.HCO on rejection; status_update to Div1.HCO in both cases.

## Inputs

- `plugin-bos-light/src/contracts.ts`
- `plugin-bos-light/src/divisionPacketRouter.ts`
- `plugin-bos-light/src/gitOperations.ts`
- `plugin-bos-light/src/qaReview.ts`
- `plugin-bos-light/src/div6ExternalGateway.ts`

## Expected Output

- `plugin-bos-light/src/div5Quarantine.ts`

## Verification

npx tsc --noEmit

## Observability Impact

QuarantineVerdict and SanitizedRepoSnapshot expose structured runtime signals. SecurityFlag arrays expose secret-scan findings. Packet emissions (gate_decision, escalation, status_update) provide durable audit trail of approval/rejection paths.
