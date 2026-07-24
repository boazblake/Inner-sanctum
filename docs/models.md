# Offline models

Sanctum does not download models. Add model files yourself, or import a reflection GGUF from Privacy settings.

Default `.bin` and `.gguf` files are not bundled through `expo-asset`. `plugins/withSanctumModels.js` handles iOS native bundling during prebuild:

- iOS: shell build phase copies defaults into app bundle `assets/models/`

## Whisper transcription

Default expected file:

```text
assets/models/ggml-base.en.bin
```

Source family: `ggerganov/whisper.cpp` GGML Whisper models on Hugging Face. Use an English model matching app/device memory goals, such as base English for balanced local transcription.

## Reflection LLM

Default expected file:

```text
assets/models/reflection-1b-q4.gguf
```

Suggested GGUF families on Hugging Face:

- Qwen small instruct GGUF variants
- SmolLM / SmolLM2 instruct GGUF variants

Choose a quantized model sized for target device RAM. You are responsible for model license review and compliance.

## User import option

Privacy → Import GGUF lets user pick a `.gguf` file. App copies it to:

```text
Documents/sanctum-models/<safe-name>.gguf
```

Selected path/display name/size are persisted in AsyncStorage. Reset to default clears selection and returns to bundled/Documents `reflection-1b-q4.gguf` lookup.

## Configurable reflection guidance

Privacy settings include a local guidance editor. Guidance is stored in AsyncStorage and used by both Apple Foundation Models and `llama.rn`. Sanctum appends fixed required instructions for strict JSON output with fields `title`, `topic`, `mood`, `observation`; mood must be one of `settled`, `tender`, `busy`, `heavy`, `clear`. No prompt is sent to any server.

## Apple Foundation Models status

Sanctum includes an optional iOS native bridge named `SanctumFoundationModels`. It compiles FoundationModels usage only behind `#if canImport(FoundationModels)` and `@available(iOS 26.0, *)`. If unavailable at build/runtime, app falls back to the local GGUF path through `llama.rn`.
