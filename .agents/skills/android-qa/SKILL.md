---
name: android-qa
description: Validates Android app behavior on emulators or devices using adb, Android CLI layout inspection, UIAutomator dumps, screenshots, and logcat. Use when reproducing Android UI bugs, checking feature flows, verifying APK installs, capturing device evidence, or producing QA proof for Android work.
---

<objective>
Validate Android behavior with repeatable device evidence instead of screenshots-only guesswork. Drive flows through adb or the Android CLI, choose targets from UI tree bounds where possible, capture logs around the focused flow, and report proof that another agent can reproduce.
</objective>

<quick_start>
Use this sequence for an emulator/device QA pass:

1. List devices: `adb devices`.
2. Build/install the target variant: `./gradlew :<module>:install<Variant> --console=plain`.
3. Resolve and launch: `adb -s <serial> shell cmd package resolve-activity --brief <package>` then `adb -s <serial> shell am start -n <package>/<activity>`.
4. Inspect UI before tapping:
   - Preferred Android CLI: `android layout`
   - Fallback UIAutomator: `adb -s <serial> exec-out uiautomator dump /dev/tty > /tmp/ui.xml`
5. Tap by element center from the UI tree, not by eyeballing screenshots.
6. Capture proof: screenshot, UI tree, focused logcat, command outputs, and final expected state.
</quick_start>

<workflow>
1. **Define the flow**: State the package, build variant, device serial, start screen, actions, and expected result.
2. **Prepare logs**: Clear logcat immediately before the repro with `adb -s <serial> logcat -c`.
3. **Install and launch**: Build/install with Gradle, resolve the launch Activity, and start the app explicitly.
4. **Inspect before acting**: Use `android layout`, `android layout --diff`, or UIAutomator XML. Prefer semantic fields: text, resource-id, content-desc, clickable, focused, scrollable, bounds.
5. **Interact deterministically**: Compute tap coordinates from bounds. For text entry, confirm the field is focused before `adb shell input text`.
6. **Handle scrolling**: If a target is absent and a scrollable element exists, scroll once or twice slowly, dump again, and only then call it missing.
7. **Capture evidence**: Save screenshot only after UI-tree inspection or when WebView/visual content makes tree inspection insufficient.
8. **Diagnose failures**: Pull logcat focused to the app process or crash buffer. Include stack traces and UI state around the failure.
</workflow>

<interaction_rules>
- Prefer `content-desc`, resource id, and visible text over pixel coordinates.
- Compute coordinates from `bounds="[x1,y1][x2,y2]"` as center `((x1+x2)/2, (y1+y2)/2)`.
- Avoid screen edges for swipes to reduce accidental system gestures.
- Use `adb shell input keyevent 4` for Back and explicit `am start` for relaunch.
- For WebView or animated screens, use screenshots or annotated screenshots because UI dumps may be incomplete.
- Record exact commands when QA output will be used as completion proof.
</interaction_rules>

<logcat_patterns>
- Clear: `adb -s <serial> logcat -c`
- App pid: `adb -s <serial> shell pidof -s <package>`
- App logs: `adb -s <serial> logcat --pid <pid>`
- Crash logs: `adb -s <serial> logcat -b crash -d`
- Full dump: `adb -s <serial> logcat -d > /tmp/logcat.txt`
</logcat_patterns>

<anti_patterns>
- Do not infer success from install success; launch and verify the target screen.
- Do not tap screenshot-estimated coordinates when UI tree bounds are available.
- Do not leave logs uncleared before a focused repro.
- Do not ignore accessibility labels; missing `contentDescription` may itself be a QA finding for interactive image-only controls.
- Do not claim device behavior works without a specific emulator/device, build variant, and command evidence.
</anti_patterns>

<reference_guides>
Local source material used to synthesize this skill:

- Codex Android Emulator QA: `/home/qazanik/.codex/.tmp/plugins/plugins/test-android-apps/skills/android-emulator-qa/SKILL.md`
- Android CLI interaction reference: `/home/qazanik/.gemini/config/plugins/android-cli-plugin/skills/references/interact.md`
</reference_guides>

<success_criteria>
Android QA is successful when:

- The app was installed and launched on a named emulator/device.
- Actions were driven from UI-tree or accessibility evidence where possible.
- Final state was verified by UI tree, screenshot, logs, or all three.
- Failures include enough artifacts to reproduce and diagnose: command, device, build variant, UI state, and log output.
</success_criteria>
