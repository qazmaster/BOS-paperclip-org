# 7 BOS Division Agents

This directory defines the initial 7 BOS Light division agents as AGENTS.md profiles for the v1.4.1 ownership map.

## Active profile paths

Only these division profile paths are canonical for the active company template:

| Division | Profile |
|---|---|
| Div7.MissionControl / Mission Control / Strategy | `agents/Div7_MissionControl/AGENTS.md` |
| Div1.HCO / Head Communication Office | `agents/Div1_HCO/AGENTS.md` |
| Div2.MasterPlanner / Shaping / Product Planning | `agents/Div2_MasterPlanner/AGENTS.md` |
| Div3.Treasury / Treasury / Budget / Access | `agents/Div3_Treasury/AGENTS.md` |
| Div4.Production / Production / Build / Delivery | `agents/Div4_Production/AGENTS.md` |
| Div5.QualificationsLibraryLearning / Qualifications / Library / Learning | `agents/Div5_QualificationsLibraryLearning/AGENTS.md` |
| Div6.External / External / DMZ | `agents/Div6_External/AGENTS.md` |

Each agent profile contains:

- identity;
- VFP: Valuable Final Product;
- authority;
- inputs;
- outputs;
- routing rules;
- guardrails;
- escalation rules;
- collaboration expectations.

## Org chart

```text
Div7.MissionControl / Mission Control / Strategy
  └── Div1.HCO / Head Communication Office
        ├── Div2.MasterPlanner / Shaping / Product Planning
        ├── Div3.Treasury / Treasury / Budget / Access
        ├── Div4.Production / Production / Build / Delivery
        ├── Div5.QualificationsLibraryLearning / Qualifications / Library / Learning
        └── Div6.External / External / DMZ
```

## Minimal routing

- High-level mission -> Div7.MissionControl then Div1.HCO.
- Backlog shaping -> Div2.MasterPlanner.
- Budget/access -> Div3.Treasury.
- Implementation -> Div4.Production.
- QA/security/library review -> Div5.QualificationsLibraryLearning.
- External world -> Div1.HCO -> Div5.QualificationsLibraryLearning -> Div6.External -> Div5.QualificationsLibraryLearning quarantine; insert Div3.Treasury before Div6 when paid services, credentials, secrets, or access grants are required.
- Ambiguous/complex/chaotic decisions -> Div7.MissionControl.
