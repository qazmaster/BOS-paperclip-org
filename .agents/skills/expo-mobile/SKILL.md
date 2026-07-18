---
name: expo-mobile
description: Builds, debugs, and ships Expo and React Native mobile apps using Expo Router, Expo Go, development clients, EAS builds, native modules, config plugins, app store deployment, and native data fetching patterns. Use when working on Expo apps, React Native mobile UI, Expo modules, iOS/Android builds, EAS, Play Store/App Store release, or mobile API/offline behavior.
---

<objective>
Work on Expo and React Native apps with the simplest viable runtime first, clear native-boundary decisions, and reproducible verification across Expo Go, development clients, simulators/emulators, and EAS builds. Avoid jumping to custom native builds until the app actually needs native code unavailable in Expo Go.
</objective>

<quick_start>
For Expo mobile work:

1. Detect app shape: `app.json` or `app.config.*`, `expo`, `expo-router`, `eas.json`, `app/`, `modules/`, `ios/`, `android/`.
2. Try Expo Go first with `npx expo start` unless the feature requires custom native code, local modules, app extensions, or native config not supported by Expo Go.
3. Use development clients only when needed: `npx expo run:ios`, `npx expo run:android`, or EAS dev builds.
4. Keep routes in `app/`; keep reusable components, hooks, utilities, and types outside `app/`.
5. Verify on the target platform, not only web, when touching navigation, native APIs, storage, permissions, notifications, media, or layout.
</quick_start>

<workflow>
1. **Classify the task**: UI/navigation, native API, local module, data fetching/offline, dev client, deployment, upgrade, or CI.
2. **Choose runtime**: Expo Go for JS/Expo-supported features; dev client for custom native code; EAS build for distribution or store artifacts.
3. **Inspect config**: Check `app.json`, config plugins, permissions, bundle identifiers/package names, schemes, and platform-specific overrides before edits.
4. **Follow routing conventions**: Use Expo Router file-based routes, groups, dynamic segments, and layouts consistently. Remove stale route files when moving screens.
5. **Handle data explicitly**: Use the project's chosen data layer, represent loading/error/offline states, and avoid unbounded retries or silent cache failure.
6. **Cross the native boundary carefully**: For local Expo modules, scaffold first with `create-expo-module`, strip boilerplate, and keep Swift/Kotlin/TypeScript contracts aligned.
7. **Verify per platform**: Run the app in Expo Go/dev client/simulator/emulator as appropriate; for store work, verify EAS config and build profile.
</workflow>

<runtime_decision_rules>
- Use **Expo Go** for Expo Router, most `expo-*` packages, ordinary UI, navigation, storage, camera/location/media APIs supported by Expo Go, and fast iteration.
- Use **development client** for local Expo modules, third-party native modules outside Expo Go, config plugins that alter native projects, Apple targets, or native SDK integrations.
- Use **EAS build** for TestFlight, Play Store, App Store, production signing, internal distribution, and cloud-built artifacts.
- Use **prebuild/native projects** only when required; avoid committing generated native project churn unless the repo's workflow expects it.
</runtime_decision_rules>

<expo_router_rules>
- Routes belong in `app/`; reusable code belongs outside `app/`.
- Ensure there is always a route matching `/`.
- Prefer route groups for structure without URL segments.
- Remove old route files after moves to prevent duplicate screens.
- Keep navigation state and params serializable where possible.
</expo_router_rules>

<expo_module_rules>
- Scaffold local modules first: `CI=1 npx create-expo-module@latest --local --name MyModule --description "..." --package expo.modules.mymodule`.
- Rename generated module directories to clear kebab-case names when needed, then run platform dependency steps such as CocoaPods install for iOS.
- Remove generated example functions/views/web files that are not part of the real module.
- Keep Kotlin, Swift, and TypeScript names/types/events aligned.
- Use config plugins for native manifest/plist/build setting changes instead of manual undocumented edits.
</expo_module_rules>

<data_and_offline_rules>
- Prefer a single data-fetching pattern already used by the app: fetch, React Query, SWR, or router loaders.
- Model loading, empty, error, retry, stale, and offline states explicitly.
- Never hide failed writes or sync conflicts; make the recovery path visible.
- Store secrets only in secure storage or server-side; do not put private keys in mobile bundles.
</data_and_offline_rules>

<anti_patterns>
- Do not create custom builds before proving Expo Go is insufficient.
- Do not co-locate components and utilities in `app/` just because routes are there.
- Do not edit generated native files when a config plugin or Expo config owns the setting.
- Do not verify mobile-only behavior only in a browser.
- Do not assume iOS and Android permission strings, deep links, safe areas, keyboard behavior, or file paths behave the same.
</anti_patterns>

<reference_guides>
Local source material used to synthesize this skill:

- Expo UI: `/home/qazanik/.codex/.tmp/plugins/plugins/expo/skills/building-native-ui/SKILL.md`
- Expo Module: `/home/qazanik/.codex/.tmp/plugins/plugins/expo/skills/expo-module/SKILL.md`
- Expo Deployment: `/home/qazanik/.codex/.tmp/plugins/plugins/expo/skills/expo-deployment/SKILL.md`
- Expo Dev Client: `/home/qazanik/.codex/.tmp/plugins/plugins/expo/skills/expo-dev-client/SKILL.md`
- Native Data Fetching: `/home/qazanik/.codex/.tmp/plugins/plugins/expo/skills/native-data-fetching/SKILL.md`
</reference_guides>

<success_criteria>
Expo mobile work is successful when:

- The selected runtime is justified: Expo Go, dev client, EAS, or native project.
- Routing, config, and native-boundary changes follow Expo conventions.
- Platform-specific behavior is verified on the relevant target.
- Builds, deployment profiles, or store artifacts are validated when release work is involved.
</success_criteria>
