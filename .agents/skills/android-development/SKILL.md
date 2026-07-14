---
name: android-development
description: Builds, modifies, debugs, and verifies native Android apps using Kotlin or Java, Gradle, Android SDK tools, emulators, and Android project conventions. Use when working on Android app code, Gradle configuration, SDK setup, manifests, permissions, Jetpack libraries, Compose, XML views, Room, Hilt, coroutines, APK/AAB builds, or Android device integration.
---

<objective>
Work on native Android applications with a bias toward reproducible command-line verification, local project conventions, and compatibility with the declared `minSdk`, `targetSdk`, Android Gradle Plugin, Kotlin, and JDK versions. Prefer the repository's Gradle wrapper and existing architecture over global tools or speculative rewrites.
</objective>

<quick_start>
For an Android task:

1. Identify the project shape: `settings.gradle*`, `build.gradle*`, `gradlew`, `AndroidManifest.xml`, `app/`, `src/main/java`, `src/main/kotlin`.
2. Inspect declared versions before changing APIs: AGP, Gradle, Kotlin, `compileSdk`, `minSdk`, `targetSdk`, Java toolchain.
3. Prefer repo commands:
   - List tasks: `./gradlew tasks --all --console=plain`
   - Build debug: `./gradlew assembleDebug --console=plain`
   - Unit tests: `./gradlew testDebugUnitTest --console=plain`
   - Android lint: `./gradlew lintDebug --console=plain`
4. If the Gemini Android CLI exists, use it for Android-specific discovery and docs: `android info`, `android describe`, `android docs <keywords>`, `android sdk list --all`.
5. Verify every code change with the narrowest relevant Gradle task, then a broader build/lint/test when risk warrants it.
</quick_start>

<workflow>
1. **Scope the change**: Determine whether the work touches UI, data, networking, permissions, background work, build config, or release packaging.
2. **Read the local pattern**: Find the closest existing Activity, Fragment, composable, ViewModel, repository, Room DAO/entity, Hilt module, or Gradle convention and follow it unless it is clearly broken.
3. **Check compatibility first**: Do not use APIs, libraries, Compose features, or manifest attributes that exceed the declared SDK or toolchain without raising the target explicitly and explaining the tradeoff.
4. **Implement narrowly**: Keep UI state in the UI layer, business rules out of Activities/Fragments/composables, suspend work off the main thread, and handle lifecycle cancellation explicitly.
5. **Make failures diagnosable**: Preserve error causes, log contextual non-secret state, expose visible failure states in UI, and avoid swallowing exceptions.
6. **Verify with evidence**: Run the affected Gradle task. For UI/device behavior, pair this skill with `android-qa`. For performance symptoms, pair with `android-performance`.
</workflow>

<android_principles>
- Use `./gradlew` over a globally installed Gradle.
- Keep network, database, and hardware operations off the main thread.
- Prefer `ViewModel` + coroutine scopes or existing project architecture for async state.
- Prefer stable IDs and explicit UI state models for lists and offline data.
- For Compose, keep composables side-effect-light; use `remember`, `derivedStateOf`, `LaunchedEffect`, and `DisposableEffect` only for the ownership model they actually express.
- For XML/ViewBinding projects, do not introduce Compose unless the project already supports it or the user explicitly chooses that migration.
- Treat permissions, deep links, WebView, file access, exported components, and hardware APIs as security-sensitive.
</android_principles>

<validation>
Choose the smallest passing proof that matches the change:

- Gradle/build config: `./gradlew help`, `./gradlew assembleDebug`, or the affected module task.
- Kotlin/Java logic: affected unit tests, then `testDebugUnitTest` where available.
- Manifest/resources: `./gradlew processDebugMainManifest` or `assembleDebug`.
- UI behavior: install/run on emulator or device and verify with `android-qa`.
- Release packaging: `assembleRelease` or `bundleRelease`, only when signing inputs are available and secrets are not exposed.
</validation>

<anti_patterns>
- Do not edit generated Gradle or Android Studio files blindly.
- Do not add broad `try/catch` blocks that hide root causes.
- Do not assume emulator networking uses `localhost`; Android emulator host is usually `10.0.2.2`.
- Do not upgrade AGP, Gradle, Kotlin, Compose, or Firebase casually; verify each toolchain jump.
- Do not introduce APIs above `minSdk` without `Build.VERSION.SDK_INT` guards or `@RequiresApi` boundaries.
- Do not log tokens, auth headers, device identifiers, or payment/customer data.
</anti_patterns>

<reference_guides>
Local source material used to synthesize this skill:

- Android CLI skill: `/home/qazanik/.gemini/config/plugins/android-cli-plugin/skills/SKILL.md`
- Android CLI interaction reference: `/home/qazanik/.gemini/config/plugins/android-cli-plugin/skills/references/interact.md`
</reference_guides>

<success_criteria>
Android work is successful when:

- The implementation follows the app's existing architecture and Android project constraints.
- The selected API/library choices are compatible with declared SDK/toolchain versions.
- Failure states are explicit and diagnosable without leaking secrets.
- Relevant Gradle/device verification has been run and its result is reported.
</success_criteria>
