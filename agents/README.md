# 7 BOS Division Agents

This directory defines the initial 7 BOS Light division agents as AGENTS.md profiles for the v1.4.1 ownership map.

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

- High-level mission -> Div7 then Div1.
- Backlog shaping -> Div2.
- Budget/access -> Div3.
- Implementation -> Div4.
- QA/security/library review -> Div5.
- External world -> Div6, only via Div1 and Div5 quarantine.
- Ambiguous/complex/chaotic decisions -> Div7.
