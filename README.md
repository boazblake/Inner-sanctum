# Sanctum

Private iOS voice journal for quiet contemplation, built with Expo, React Native, TypeScript, and offline native AI modules.

## Features

- Today/home screen with private journaling prompts
- Recording flow with timer and permission handling
- On-device Whisper transcription through `whisper.rn` when model file exists
- On-device local LLM reflection through `llama.rn` when model file exists
- Optional iOS Apple Foundation Models provider hook when app includes compatible native bridge; otherwise falls back to `llama.rn`
- Configurable reflection guidance, safety toggles, temperature, and max token settings stored locally in AsyncStorage, with fixed JSON schema enforced
- Entries list and entry detail screens
- Weekly recap generated locally from saved entries
- Settings/privacy screen with local data clear action
- iOS-focused helper copy and native model bundling

No backend, billing, analytics, model download, fake transcript, or network code is included. Missing model files produce actionable errors and do not save fake entries.

## Native dev build required

Expo Go will not work because `whisper.rn`, `llama.rn`, and native iOS bridge code require native modules. Use an iOS development build:

```sh
npm install
npx expo prebuild
npx expo run:ios
```

If you use EAS instead, create a dev client build with the same native config.

## Nix dev shell

This project expects CocoaPods from Nix, not Homebrew. Enter the shell before iOS commands:

```sh
nix develop
which pod
which xcrun
pod --version
echo $CC
npm install
npx expo prebuild
npx expo run:ios
```

If Expo asks to install CocoaPods with Homebrew, stop. That means `pod` is not visible in the current shell. Re-enter `nix develop` and retry.

If iOS Pods fail with `clang: error: unknown argument: '-index-store-path'` or `unable to find sdk: 'iphoneos'`, Xcode/RN picked Nix tool wrappers. Re-enter the Nix shell and confirm:

```sh
which xcrun   # /usr/bin/xcrun
echo $DEVELOPER_DIR  # /Applications/Xcode.app/Contents/Developer
echo $CC             # /Applications/Xcode.app/.../clang, not /nix/store/...
echo $LD             # same Xcode clang driver, not raw ld
```

Then clean generated native build state:

```sh
rm -rf ios/Pods ios/Podfile.lock
npx expo prebuild --clean
npx expo run:ios
```

If `fmt` fails with `FMT_STRING` / `consteval function ... is not a constant expression`, keep the generated Podfile patch from `plugins/withFmtPodPatch.js`. It rewrites `Pods/fmt/include/fmt/base.h` to disable fmt consteval, then refresh pods:

```sh
rm -rf ios/Pods ios/Podfile.lock
npx expo prebuild
npx expo run:ios
```

If final app link fails with `ld: -objc_abi_version '-Xlinker' not supported`, the build used raw `ld` instead of the clang driver. Re-enter `nix develop`, confirm `echo $LD` points to Xcode clang, then clear DerivedData:

```sh
rm -rf ~/Library/Developer/Xcode/DerivedData/Sanctum-* ~/Library/Developer/Xcode/DerivedData/Slated-*
npx expo run:ios
```

`plugins/withWhisperOldArchPatch.js` also patches `whisper.rn` on iOS to avoid a missing `RNWhisperSpec` generated header with this RN/Expo version.

Xcode itself still comes from Apple. Nix provides CLI dependencies here: Node, CocoaPods, Ruby, Watchman.

## Required local model files

Place balanced model files here before building:

```text
assets/models/ggml-base.en.bin
assets/models/reflection-1b-q4.gguf
```

These files are intentionally absent from git. Code also checks device documents fallback paths:

```text
Documents/sanctum-models/ggml-base.en.bin
Documents/sanctum-models/reflection-1b-q4.gguf
```

Do not download models from the app. Add or copy files yourself, then rebuild/relaunch.

Default models are bundled by `plugins/withSanctumModels.js`, not `expo-asset`. During prebuild it adds an iOS build phase that copies defaults into `assets/models/` inside the app bundle.

Privacy settings also support importing a user-provided `.gguf` reflection model. Sanctum copies it to `Documents/sanctum-models/`, stores path/name/size in AsyncStorage, and never uploads or downloads it. Suggested LLM families: Qwen or SmolLM GGUF variants sized for device memory. You are responsible for model license compliance.

Privacy settings expose reflection guidance, safety toggles (no advice/chat/diagnosis/coaching, one-sentence observation), local LLM generation controls (temperature/max tokens), and a copyable active prompt template. Custom settings are stored locally in AsyncStorage and sent only to the selected on-device provider. Sanctum only enforces the JSON API contract: `title`, `topic`, `mood`, `observation`; mood must be `settled`, `tender`, `busy`, `heavy`, or `clear`; no markdown/fenced code.

Visible app identity is Sanctum. The iOS bundle identifier is `com.anonymous.sanctum`.

See `docs/models.md` for model source notes, including `ggerganov/whisper.cpp` Whisper files on Hugging Face and Qwen/SmolLM GGUF options.

## Apple Foundation Models status

Current status: real optional iOS native bridge added as `SanctumFoundationModels`. Swift uses `#if canImport(FoundationModels)` plus `@available(iOS 26.0, *)`; if the framework, OS, or system model is unavailable, JS falls back to `llama.rn`. The config plugin `plugins/withSanctumFoundationModels.js` rewrites and links the Swift/Objective-C bridge during prebuild.

## iOS-only status and privacy

Android support is intentionally removed for now: no `android/` directory, no Android app config, and no Android npm script. No backend, analytics, billing, model downloads, or network behavior are implemented.

## Run

```sh
npm install
npm run ios
```

Note: native AI needs the iOS dev client/native build from commands above.

## Verify

```sh
npm run typecheck
npm run lint
```
