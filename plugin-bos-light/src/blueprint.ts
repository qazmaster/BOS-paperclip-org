import type { BPIScore, Division } from "./contracts";

export interface BlueprintInput {
  issue_id: string;
  title: string;
  problem_statement: string;
  producer_division: Division;
  bpi: BPIScore;
  acceptance_criteria: string[];
  resources: string[];
  qa_policy?: string[];
}

export function generateBlueprintMarkdown(input: BlueprintInput): string {
  const acceptance = input.acceptance_criteria.length
    ? input.acceptance_criteria.map((item) => `- ${item}`).join("\n")
    : "- TODO: define acceptance criteria before production";
  const resources = input.resources.length
    ? input.resources.map((item) => `- ${item}`).join("\n")
    : "- No special resources declared";
  const qa = (input.qa_policy?.length ? input.qa_policy : [
    "LARS.Deterministic must pass",
    "LARS.SecurityPolicy must pass",
    "LARS.ArtifactIntegrity must pass",
    "LARS.Budget warning must be reviewed if failed"
  ]).map((item) => `- ${item}`).join("\n");

  return `# Product Blueprint: ${input.title}

## 1. Identity

- Issue ID: ${input.issue_id}
- Producer division: ${input.producer_division}
- Problem: ${input.problem_statement}

## 2. BPI

- Score: ${input.bpi.score.toFixed(3)}
- Formula: ${input.bpi.formula}
- Expected value: ${input.bpi.components.expected_value}
- Urgency: ${input.bpi.components.urgency}
- Estimated token cost: ${input.bpi.components.estimated_token_cost}
- Risk factor: ${input.bpi.components.risk_factor}

## 3. Acceptance Contract

${acceptance}

## 4. Resources

${resources}

## 5. QA Policy

${qa}
`;
}
