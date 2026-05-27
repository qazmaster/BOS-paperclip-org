from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
required = [
    "README.md",
    "00_START_HERE_FOR_NEW_AI_AGENT.md",
    "HANDOFF_PROMPT_FOR_NEW_AI_AGENT.md",
    "docs/03_IMPLEMENTATION_PLAN_V1_2.md",
    "docs/04_DATA_CONTRACTS.md",
    "docs/06_ACCEPTANCE_TESTS.md",
    "agents/Div1_Executive/AGENTS.md",
    "agents/Div7_Strategy/AGENTS.md",
    "company-template/bos-company-template.json",
    "plugin-bos-light/src/contracts.ts",
    "plugin-bos-light/src/bpi.ts",
    "plugin-bos-light/tests/acceptance.test.ts",
]
missing = [p for p in required if not (ROOT / p).exists()]
if missing:
    raise SystemExit("Missing required files:\n" + "\n".join(missing))
print(f"Handoff package OK: {ROOT}")
