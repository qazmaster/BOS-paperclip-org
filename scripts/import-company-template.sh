#!/usr/bin/env bash
set -euo pipefail

# Draft safety helper. This intentionally does NOT import into Paperclip.
# C4/C5 are still unproven, so use this to validate the local template and
# record runtime capability posture before attempting any real import elsewhere.
#
# Usage:
#   ./scripts/import-company-template.sh [optional /path/to/paperclip]

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
PAPERCLIP_DIR="${1:-}"

echo "DRAFT WARNING: no Paperclip import is performed by this helper."
echo "C4/C5 remain unproven until a real Paperclip import/export path and AGENTS.md parser accept this package."
echo "Validating local BOS Light company template contract..."
python3 "$REPO_ROOT/scripts/validate_company_template.py" --root "$REPO_ROOT"

echo "Recording Paperclip runtime capability posture..."
if [[ -n "$PAPERCLIP_DIR" ]]; then
  python3 "$REPO_ROOT/scripts/probe_paperclip_runtime.py" --root "$REPO_ROOT" --paperclip-dir "$PAPERCLIP_DIR"
else
  python3 "$REPO_ROOT/scripts/probe_paperclip_runtime.py" --root "$REPO_ROOT"
fi

echo "No Paperclip import was attempted. Use the probe output and current Paperclip import/export docs before creating an import artifact."
