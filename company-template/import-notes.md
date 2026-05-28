# Import Notes

`bos-company-template.json` is a draft semantic template, not guaranteed to match the latest Paperclip import/export schema.

Before use:

1. Run `python3 scripts/validate_company_template.py` from the repository root to confirm the local BOS Light package still has seven divisions, valid routing rules, listed rituals, and existing referenced AGENTS.md profiles.
2. Read `docs/08_RUNTIME_CAPABILITY_HEALTH.md` and confirm `company_template.import_export` and `agents.syntax` have live Paperclip evidence. As of S02 they remain `unvalidated` because there is no live Paperclip runtime evidence.
3. Export a sample company from the target Paperclip instance.
4. Compare schema with this template.
5. Map agent profiles to current AGENTS.md conventions.
6. Run C4 and C5 from the spike checklist.
7. Update this directory with the actual importable artifact.

The S01 local proof is still useful for repository readiness, but it does not certify Paperclip import/export compatibility or weaken D002's Paperclip-as-system-of-record boundary.
