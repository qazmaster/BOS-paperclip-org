# S04 Research: Git Integration + Hybrid State Persistence

## Slice Scope
S04 must deliver:
1. **Git operations** for Div4.Production: clone, branch, commit, push to aipay.kz
2. **Hybrid state persistence**: in-memory cache with automatic mirroring to Paperclip native artifacts
3. **State reconstruction**: rebuild betting table, gate results, circuit breaker from issue documents/comments on restart
4. **Fail-closed probe evidence**: S04 probe runner + validator + tests, following S01-S03 pattern

## Active Requirements
- **R020** — Local git CLI integration for aipay.kz (clone/branch/commit/push). Unvalidated.
- **R024** — Hybrid state persistence (fast in-memory + Paperclip native artifact mirroring, reconstruct on restart). Unvalidated.

## What Exists

### Persistence layer
- `plugin-bos-light/src/persistence.ts` — `InMemoryBOSPersistence` implements `BOSPersistence` interface with Maps for bpi, status, betting, gates, circuits, decisions. No mirroring.
- `mirrorGateResultToNativeArtifact()` and `mirrorDecisionToNativeArtifact()` — standalone functions that push EvalGateResult and DecisionMetadata to `adapter.addIssueComment()`. These are the only existing mirroring functions.

### Adapter layer
- `PaperclipAdapter` interface (`paperclipAdapter.ts`) — createIssueDocument, addIssueComment, createEscalationIssue, createApprovalRequest, logActivity.
- `LivePaperclipIssueAdapter` (`livePaperclipAdapter.ts`) — HTTP-backed adapter with diagnostics, side-effect counters, redaction, timeout. Confirmed surfaces: issues.native, documents.native, comments.native (M002 S04).
- `InMemoryPaperclipAdapter` — test double.

### Confirmed surfaces S04 can use for mirroring
From `capabilities.paperclip-runtime.json`:
- `issues.native` — confirmed (M002 S04 live create/readback)
- `documents.native` — confirmed (M002 S04 live create/readback)
- `comments.native` — confirmed (M002 S04 live create/readback)
- `state.issue_scoped` — unvalidated (must not be sole durable truth)
- `state.company_scoped` — fallback-only

### Existing patterns to reuse
- S01-S03 probe runners use Python standard library, HttpClient, preflight auth gate, redaction, evidence schema versioning.
- S01-S03 validators use `--allow-blocker`, schema_version enforcement, zero capability-promotion checks, CLI write-audit.
- S01-S03 test fixtures use `importlib.util` to load validator module, then 10-12 fixture cases.
- Capability matrix updates are append-only; no promotions from blocker evidence (MEM058).

### Resource intake context
- S03 already enumerates `aipay_git_access` as a missing resource when `AIPAY_GIT_URL`, `GIT_SSH_KEY`, `GITHUB_TOKEN`, or `GITLAB_TOKEN` are absent.
- Current environment: all git credentials missing (fail-closed expected).

## What Is Missing

### 1. Git operation abstraction
No git-related TypeScript code exists in the plugin. The only git references are:
- Redaction patterns for GitHub tokens in `majorFlowDecision.ts`
- S03 probe detecting missing `aipay_git_access`

Need: a `GitOperations` class/module that:
- Discovers repo URL from `AIPAY_GIT_URL` env or company template
- Supports SSH (`GIT_SSH_KEY`) and HTTPS (`GITHUB_TOKEN`/`GITLAB_TOKEN`) auth
- Executes: `clone`, `checkout -b`, `add`, `commit`, `push`
- Handles conflict detection (non-fast-forward)
- Returns structured evidence (clone_ref, branch_name, commit_sha, push_ref)
- Redacts secrets in diagnostics
- Is callable from Div4.Production agent context

### 2. Hybrid persistence with automatic mirroring
`InMemoryBOSPersistence` saves to Maps but never calls the adapter. Need:
- `HybridBOSPersistence` that wraps `InMemoryBOSPersistence`
- After every `save*` call, mirrors to Paperclip via adapter
- Uses `documents.native` for structured data (BPI, betting table, circuit breaker)
- Uses `comments.native` for human-visible summaries
- Returns cache-overlay diagnostics plus native artifact refs
- Gracefully degrades when adapter is unavailable (falls back to in-memory only)

### 3. State reconstruction on restart
No code exists to read back BOS state from Paperclip artifacts. Need:
- `reconstructStateFromArtifacts(adapter, issueId)` or similar
- Parses issue documents/comments for BPI scores, betting tables, gate results, circuit breaker records
- Validates parsed data against contracts.ts types
- Returns reconstruction status (what was found, what was missing, fallback used)
- Must handle markdown-only fallbacks gracefully

### 4. Mirroring for all BOS object types
Currently only EvalGateResult and DecisionMetadata have mirror functions. Need mirror functions for:
- BPI Score → issue document or comment
- Betting Table → issue document
- Circuit Breaker → issue comment (already partially done via circuitBreakerFlow)
- BOS Status Overlay → issue comment

### 5. S04 probe infrastructure
Following S01-S03 exactly:
- `scripts/run_m005_s04_git_hybrid_probe.py` — bounded probe runner
- `scripts/validate_m005_s04_git_hybrid_probe.py` — validator CLI
- `scripts/test_validate_m005_s04_git_hybrid_probe.py` — 12-test fixture suite
- Evidence artifact: `runtime-evidence/M005-S04-git-hybrid-probe.json`
- Evidence summary: `runtime-evidence/M005-S04-evidence-summary.json`

## Natural Seams (Independent Work Units)

1. **Git operations TypeScript module** (`plugin-bos-light/src/gitOperations.ts`)
   - Interface + implementation using `child_process` spawn/exec
   - Auth discovery, redaction, evidence envelope
   - Unit tests in `plugin-bos-light/tests/gitOperations.test.ts`

2. **Hybrid persistence TypeScript module** (`plugin-bos-light/src/hybridPersistence.ts`)
   - `HybridBOSPersistence` class wrapping `InMemoryBOSPersistence`
   - Auto-mirror logic, artifact ref tracking, diagnostics
   - Unit tests

3. **State reconstruction TypeScript module** (`plugin-bos-light/src/stateReconstruction.ts`)
   - Artifact scraping, type validation, reconstruction envelope
   - Unit tests

4. **S04 Python probe runner** (`scripts/run_m005_s04_git_hybrid_probe.py`)
   - Git env discovery, preflight auth gate, git smoke test
   - Hybrid persistence smoke test (in-memory + simulated adapter)
   - Evidence artifact production

5. **S04 Python validator** (`scripts/validate_m005_s04_git_hybrid_probe.py`)
   - Schema enforcement, blocker acceptance, zero promotion checks

6. **S04 Python test fixtures** (`scripts/test_validate_m005_s04_git_hybrid_probe.py`)
   - 12 fixtures: passing git, passing hybrid, blocker missing auth, blocker unsupported endpoint, etc.

7. **Evidence generation + matrix update**
   - Run probe, validate with `--allow-blocker`, update capability matrix append-only
   - Generate cumulative S01-S04 evidence summary

## First Proof / Highest Risk

**Git operation abstraction is the highest-risk unit.**
- Credentials are confirmed missing (S03), so live git operations will be fail-closed.
- Must design the abstraction to work inside a Hermes agent container (git binary availability unknown, network access unknown).
- Must handle both SSH and HTTPS auth patterns cleanly.
- Conflict resolution strategy needs to be documented but deferred to S05 (human-in-the-loop gates).

However, because the environment lacks credentials, the probe will produce a valid fail-closed-blocker artifact — this is the expected and acceptable S04 outcome per the M005 roadmap.

## Constraints and Gotchas

- **MEM058**: No capability promotions from blocker evidence. Git and state surfaces must remain unvalidated/fallback-only until live proof exists.
- **MEM046**: GSD-Pi (`gsdpi_local`) remains blocked; Div4 must use local git CLI, not GSD-Pi adapter.
- **No plaintext secrets**: Git SSH keys and tokens must be passed via env/refs, never logged or stored in code.
- **Hermes container uncertainty**: Git binary may not exist in Paperclip Hermes runtime. The abstraction must detect this and produce a clean blocker code.
- **State reconstruction limitation**: Reconstructing from markdown-only fallbacks is best-effort parsing. Native document/comment readback is preferred.
- **Capability matrix**: Must add new rows append-only for `git.local_cli` and `state.hybrid_persistence`, keeping them unvalidated/fallback-only.

## Verification Plan

| Step | Command | Expected Result |
|------|---------|-----------------|
| Typecheck | `cd plugin-bos-light && npm run typecheck` | Exit 0 |
| Unit tests | `cd plugin-bos-light && npm test` | All pass |
| Probe run | `python3 scripts/run_m005_s04_git_hybrid_probe.py` | Creates evidence artifact |
| Validator | `python3 scripts/validate_m005_s04_git_hybrid_probe.py --evidence runtime-evidence/M005-S04-git-hybrid-probe.json --allow-blocker` | Exit 0 |
| Fixture tests | `python3 scripts/test_validate_m005_s04_git_hybrid_probe.py -v` | 12 tests pass |
| Matrix validation | `python3 scripts/validate_runtime_capabilities.py` | Exit 0 |

## Recommendation

Proceed with planning. The slice is **moderately complex** — the patterns are well-established from S01-S03, but the git abstraction and hybrid persistence layer are genuinely new code. The probe will be fail-closed due to missing credentials, which is the correct outcome. The real deliverable is the infrastructure (git ops, hybrid persistence, state reconstruction) that S05 will exercise in a live mission.
