# Import Notes

`bos-company-template.json` is a draft semantic template, not guaranteed to match the latest Paperclip import/export schema.

Before use:

1. Run `python3 scripts/validate_company_template.py` from the repository root to confirm the local BOS Light package still has seven divisions, valid routing rules, listed rituals, and existing referenced AGENTS.md profiles.
2. Export a sample company from the target Paperclip instance.
3. Compare schema with this template.
4. Map agent profiles to current AGENTS.md conventions.
5. Run C4 and C5 from the spike checklist.
6. Update this directory with the actual importable artifact.
