---
name: android-performance
description: Profiles and improves Android app performance using adb, Simpleperf, Perfetto, gfxinfo framestats, dumpsys meminfo, heap dumps, logcat, and code review. Use when diagnosing jank, slow startup, high CPU, memory growth, Compose recomposition, dropped frames, battery drain, or before/after performance regressions in Android apps.
---

<objective>
Gather focused Android performance evidence and turn it into prioritized fixes. Prefer one measured user-visible flow over broad exploratory profiling, distinguish code suspicion from trace-backed findings, and preserve artifacts for comparison.
</objective>

<quick_start>
Start with a focused question and one flow:

1. Define symptom: startup, janky scroll, slow tap response, CPU spike, memory growth, leak, image pressure, or battery drain.
2. Pick evidence:
   - CPU-heavy code: Simpleperf when the build is debuggable/profileable.
   - Timeline/jank/main-thread stalls: Perfetto or Compose trace.
   - Quick frame snapshot: `adb shell dumpsys gfxinfo <package> framestats`.
   - Memory: `adb shell dumpsys meminfo <package>`, heap dump, or native allocation trace.
3. Clear logs, record baseline, perform exactly one focused flow, pull artifacts, then interpret with caveats.
4. Apply a targeted fix and rerun the same capture for before/after comparison.
</quick_start>

<workflow>
1. **Classify the performance problem**: Record package, device/emulator, OS version, build type, reproduction steps, and whether the issue appears in Debug, Release, or both.
2. **Check profileability**: For Simpleperf, confirm debuggable/profileable state with `adb shell dumpsys package <package> | grep -Ei 'DEBUGGABLE|profileable|isProfileable'`.
3. **Create an artifact directory**: Keep traces, screenshots, logcat, commands, and notes in one run-specific directory outside source-controlled skill folders.
4. **Capture baseline**: Use one trace type matched to the question. Do not run unrelated flows during capture.
5. **Analyze top offenders**: Identify main-thread stalls, unstable list identity, excessive recomposition, layout thrash, image decode/resize cost, synchronous I/O, binder waits, allocation churn, or leaks.
6. **Fix the highest-impact cause**: Prefer narrowing state scope, moving work off the main thread, stabilizing identities, caching responsibly, downsampling images, batching I/O, or reducing unnecessary layout/animation work.
7. **Verify delta**: Re-run the same capture and report before/after metrics, even if the delta is inconclusive.
</workflow>

<trace_selection>
- **Simpleperf**: Use for sampled CPU hotspots in Kotlin, Java, native, and framework code. Requires debuggable/profileable access for best results.
- **Perfetto**: Use for startup timelines, frame timing, scheduler gaps, binder work, lock contention, main-thread stalls, and Compose runtime behavior.
- **gfxinfo framestats**: Use for quick frame timing and jank snapshots; pair with Perfetto for root cause.
- **meminfo and heap dumps**: Use for PSS/native heap growth, retained Java/Kotlin objects, object counts after navigation, or suspected leaks.
- **logcat**: Use for warnings, skipped frames, GC pressure, ANRs, crashes, and app-specific instrumentation.
</trace_selection>

<common_android_causes>
- Work in `onCreate`, `onResume`, composable bodies, adapters, or binders that should be async or precomputed.
- Broad Compose state reads that invalidate large subtrees.
- Unstable `LazyColumn`/RecyclerView item identity.
- Image decode, resize, or network work on the main thread.
- Room/database queries on the main thread or too many small queries per frame.
- Excessive allocation in scroll/bind paths.
- Animations applied to large containers instead of the smallest changing subtree.
- Logging or analytics work in hot UI paths.
</common_android_causes>

<report_format>
When reporting, include:

- Device/emulator, OS, package, build variant, and exact flow.
- Evidence type and artifact paths.
- Top findings ordered by user impact.
- Confidence: trace-backed, log-backed, code-smell, or hypothesis.
- Proposed fixes with validation command or trace to rerun.
- Before/after table when available.
</report_format>

<anti_patterns>
- Do not profile vague app usage; isolate one flow.
- Do not compare Debug baseline to Release after-fix.
- Do not treat missing Simpleperf samples as proof of no CPU issue.
- Do not optimize without preserving a baseline.
- Do not add noisy one-off instrumentation unless it is removed or made durably useful.
</anti_patterns>

<reference_guides>
Local source material used to synthesize this skill:

- Codex Android Performance: `/home/qazanik/.codex/.tmp/plugins/plugins/test-android-apps/skills/android-performance/SKILL.md`
- Codex Android Emulator QA: `/home/qazanik/.codex/.tmp/plugins/plugins/test-android-apps/skills/android-emulator-qa/SKILL.md`
</reference_guides>

<success_criteria>
Android performance work is successful when:

- The symptom and flow are precisely scoped.
- A baseline artifact exists before changes.
- Findings are tied to trace/log/code evidence with confidence stated.
- The fix is verified by rerunning the same flow or a clearly justified equivalent.
</success_criteria>
