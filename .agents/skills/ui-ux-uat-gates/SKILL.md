---
name: ui-ux-uat-gates
description: Turns subjective UI/UX quality into explicit, evidence-backed GSD UAT gates. Use when planning, building, polishing, reviewing, or completing UI work; when a task touches pages, components, styling, responsive behavior, motion, accessibility, browser UX, or frontend UAT; or before closing UI tasks, slices, and milestones.
---

<objective>
Make UI/UX work repeatable and verifiable across all GSD projects without modifying auto-mode internals. This skill converts taste-oriented frontend work into four explicit artifacts: STYLE_PICK, DESIGN_DNA, COMPONENT_PLAN, and UI_VERIFY.

The skill is global and GSD-native: use normal skill routing, task/slice artifacts, browser tools, and completion evidence. Do not patch GSD auto-mode dispatch, DB state, runtime files, or the state machine. Proof belongs in GSD artifacts and summaries, not in production source-code citation comments.
</objective>

<quick_start>
For any UI-impacting task:

1. Read `workflows/apply-ui-gates.md`.
2. Create or update the four artifacts from `templates/` in the active task/slice artifact directory:
   - `STYLE_PICK.md`
   - `DESIGN_DNA.md`
   - `COMPONENT_PLAN.md`
   - `UI_VERIFY.md`
3. Use existing GSD skill routing:
   - build/create UI → `frontend-design`
   - polish → `make-interfaces-feel-better`
   - premium critique → `premium-ux-review`
   - WCAG/a11y → `accessibility`
   - Core Web Vitals → `core-web-vitals`
   - React/Next UI → `react-best-practices`
   - completion claim → `verify-before-complete`
4. Verify in a running local app with browser tools and save evidence paths in `UI_VERIFY.md`.
5. Run the read-only validator:

```bash
python3 ~/.agents/skills/ui-ux-uat-gates/scripts/validate-ui-gate-pack.py <artifact-dir>
```

Only claim completion when the validator passes and UI_VERIFY contains fresh evidence.
</quick_start>

<essential_principles>
- **Native over invasive:** Use global skills, GSD artifacts, browser tools, and normal task/slice completion. Do not patch auto-mode internals.
- **Evidence before taste claims:** A UI result is not “polished”, “responsive”, “premium”, or “done” unless browser-backed evidence and gate verdicts are recorded.
- **One style direction:** Commit exactly one STYLE_PICK. Do not blend distant style worlds unless the artifact explicitly records anchor, accent, and not-rules.
- **Design intent persists:** DESIGN_DNA carries the slice’s visual language across tasks so auto-mode does not restart the design from scratch.
- **Components are planned before code:** COMPONENT_PLAN records primitives, motion runtime, external library tracks, state coverage, and dropped options.
- **Motion is earned:** GSAP, Lenis, Magic UI ambience, WebGL, and heavy animation are blocked on utilitarian surfaces unless explicitly justified.
- **Completion fails closed:** Missing evidence, stale screenshots, unverified routes, console errors, horizontal overflow, or unresolved blocker findings prevent PASS.
</essential_principles>

<routing>
Route directly to `workflows/apply-ui-gates.md` when the user asks to set up UI gates, verify a UI task, close UI work, adapt Detent UI concepts, audit frontend quality, or produce UAT evidence.

If the user is asking to implement UI rather than just verify it, combine this skill with the existing primary UI skill selected by GSD’s normal policy. This skill is the guard/gate layer, not a replacement for `frontend-design`, `make-interfaces-feel-better`, `accessibility`, or `core-web-vitals`.
</routing>

<reference_index>
- `references/gsd-native-routing.md` — Maps GSD skills and lifecycle moments to UI gates.
- `references/gate-policy.md` — Defines blockers, warnings, evidence, and auto-mode safety.
- `references/detent-mapping.md` — Compact Detent-to-GSD mapping, including style rows and component/motion rules.
</reference_index>

<workflows_index>
| Workflow | Purpose |
|---|---|
| `workflows/apply-ui-gates.md` | Create, apply, and validate GSD-native UI/UX UAT gates. |
</workflows_index>

<validation>
Run the validator against the artifact directory containing STYLE_PICK, DESIGN_DNA, COMPONENT_PLAN, and UI_VERIFY:

```bash
python3 ~/.agents/skills/ui-ux-uat-gates/scripts/validate-ui-gate-pack.py <artifact-dir> --json
```

The validator checks structure, unresolved placeholders, PASS/FAIL consistency, evidence paths, gate verdicts, and common anti-slop blockers. It does not write files, call external services, mutate `.gsd`, or change source code.
</validation>

<success_criteria>
This skill is successful when UI task/slice completion has:

- A committed STYLE_PICK with one style direction and not-rules
- A DESIGN_DNA that records visual signature, motion stance, density, accessibility posture, and component hints
- A COMPONENT_PLAN with surface, components, state coverage, motion runtime decision, and dropped patterns
- A UI_VERIFY artifact with current browser evidence for required routes/viewports
- No blocker findings from the validator
- GSD completion summaries reference evidence paths instead of relying on subjective prose
</success_criteria>