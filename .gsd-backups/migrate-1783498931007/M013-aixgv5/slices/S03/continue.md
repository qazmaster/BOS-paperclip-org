# Continue — M013-aixgv5 / S03

## Last action
S02 (Tech Debt Audit) completed. All 5 tasks done. Paperclip issue created with Div5 verification and routing trail. S03 (Developer Onboarding Plan) not yet started.

## Next action
**T01: Define Developer Role and Responsibilities** — Create a concrete developer role definition specific to aipay.kz tech stack.

Plan: `.gsd/milestones/M013-aixgv5/slices/S03/S03-PLAN.md`
Task plan: `.gsd/milestones/M013-aixgv5/slices/S03/tasks/T01-PLAN.md` (not yet created — generate from S03-PLAN.md)

Output: `runtime-evidence/M013-S03-T01-role-definition.md`

## Context

### Paperclip API (discovered in S02)
- Auth: POST /api/auth/sign-in/email → returns `__Secure-paperclip-default.session_token` cookie
- Issues: GET/POST /api/issues/:id (NOT /api/companies/:companyId/issues/:id — that returns 404)
- Comments: POST /api/issues/:id/comments
- Company ID: `9feb4c22-05b9-401e-ba67-0e866e3056da`
- Base URL: `https://paperclip.oysana.com`

### Credentials
- `.env` has valid PAPERCLIP_EMAIL/PAPERCLIP_PASSWORD (session auth)
- No PAPERCLIP_API_KEY (removed — was stale)
- No GITHUB_TOKEN

### Tech stack (from S02 audit)
- TypeScript (ES2022, strict mode), React 19.2.7, Vitest 2.1.9, esbuild 0.28.0
- 54 source files, 15K lines, 1424 tests, 63 test files
- Plugin architecture: worker.ts entry point, barrel index.ts (38 modules)

### S02 tech debt summary
- 12 items, 41h total, highest ROI: DEBT-003 (type:module, 0.5h), DEBT-004 (test runner, 0.5h), DEBT-009 (deps, 0.5h)
- Full report: `runtime-evidence/M013-S02-T04-report.md`

## Do not
- Don't use company-scoped routes for Paperclip API — they return 404
- Don't use Bearer token from sign-in response — it doesn't work for protected endpoints
- Don't create PAPERCLIP_API_KEY in .env — session cookie auth is the working method
- Don't claim S02 tech debt items are fixed — they're documented, not remediated

## Milestone status
- S01: ✅ complete (Competitive Analysis)
- S02: ✅ complete (Tech Debt Audit)
- S03: 🔄 pending (Developer Onboarding Plan) — START HERE
- 1424 tests passing, no blockers
