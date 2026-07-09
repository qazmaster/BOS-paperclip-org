---
estimated_steps: 1
estimated_files: 2
skills_used: []
---

# T01: Wire MissionRouter to issue creation hook

Connect MissionRouter to issue lifecycle hook. On issue create, derive MissionSignals, make routing decision.

## Inputs

- `MissionRouter code`
- `Issue lifecycle hooks`

## Expected Output

- `MissionRouter wired to issue creation`
- `Routing decisions logged`

## Verification

Issue creation triggers MissionSignals derivation
