# Secrets Manifest

**Milestone:** M003
**Generated:** 2026-05-30

### PAPERCLIP_AUTH_TOKEN

**Service:** Paperclip native issue document/comment API
**Dashboard:** Paperclip workspace or deployment admin console for the target environment
**Format hint:** Bearer token or equivalent Paperclip API session token accepted by the live adapter headers
**Status:** skipped
**Destination:** dotenv

1. Use a Paperclip workspace or deployment with permission to create and read issue documents or comments.
2. Generate or obtain an API/session token scoped to the target company and issue.
3. Provide it through the secure environment collection flow when S04 is executed.
4. Verify logs and artifacts redact the token before running live readback.

### PAPERCLIP_COMPANY_ID

**Service:** Paperclip native issue document/comment API
**Dashboard:** Paperclip workspace or deployment admin console for the target environment
**Format hint:** Company or workspace identifier accepted in `/api/companies/{companyId}/...` paths
**Status:** skipped
**Destination:** dotenv

1. Select the Paperclip company or workspace used for bounded live proof.
2. Copy the company identifier from the workspace URL, admin console, or API fixture.
3. Provide it through the secure environment collection flow when S04 is executed.
4. Confirm the selected issue belongs to this company before attempting readback.

### PAPERCLIP_ISSUE_ID

**Service:** Paperclip native issue document/comment API
**Dashboard:** Paperclip workspace issue URL for the target environment
**Format hint:** Issue identifier accepted in `/api/companies/{companyId}/issues/{issueId}/...` paths
**Status:** skipped
**Destination:** dotenv

1. Create or select a safe test issue in the target Paperclip company.
2. Confirm the issue can accept documents or comments without affecting production approvals.
3. Provide the issue identifier through the secure environment collection flow when S04 is executed.
4. Use readback to verify only documents/comments were created, not native approvals.
