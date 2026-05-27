#!/usr/bin/env bash
set -euo pipefail

# Draft helper. Adjust to current Paperclip import/export CLI.
# Expected use after C4 validation:
#   ./scripts/import-company-template.sh /path/to/paperclip

PAPERCLIP_DIR="${1:-}" 
if [[ -z "$PAPERCLIP_DIR" ]]; then
  echo "Usage: $0 /path/to/paperclip" >&2
  exit 1
fi

echo "TODO: map company-template/bos-company-template.json to current Paperclip companies.sh/import schema."
echo "Paperclip dir: $PAPERCLIP_DIR"
