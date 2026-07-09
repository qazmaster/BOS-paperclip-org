# S04: Git Integration + Hybrid State Persistence — UAT

**Milestone:** M005
**Written:** 2026-05-31T22:36:23.057Z

## S04 UAT

### Git Operations
- [ ] Git binary detected (`git --version` returns version)
- [ ] Missing binary detected gracefully
- [ ] Secret redaction strips SSH keys, tokens, and Bearer values from diagnostics
- [ ] Evidence envelope records clone_ref, branch_name, commit_sha, push_ref

### Hybrid Persistence
- [ ] save_bpi mirrors to document with artifact ref tracking
- [ ] save_status mirrors to comment with artifact ref tracking
- [ ] Adapter failure falls back to in-memory with logged diagnostics
- [ ] Zero secrets leaked in mirror diagnostics

### State Reconstruction
- [ ] Reconstructs BPI score from document markdown
- [ ] Reconstructs status from comment markdown
- [ ] Reconstructs gate result from document markdown
- [ ] Missing artifacts reported in reconstruction envelope

### Probe & Validator
- [ ] Probe writes valid fail-closed-blocker artifact when credentials missing
- [ ] Validator accepts blocker artifact with --allow-blocker (exit 0)
- [ ] Validator rejects passing proof when git ls-remote missing (exit 1)
- [ ] 12 test fixtures all pass
