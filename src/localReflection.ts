import { initLlama } from "llama.rn";
import { Platform } from "react-native";
import RNFS from "react-native-fs";
import { createDeterministicReflection } from "./reflection";
import { locateReflectionModel } from "./modelPaths";
import { parseReflection } from "./reflectionParser";
import { buildReflectionPrompt } from "./reflectionPrompt";
import { getReflectionSettings } from "./reflectionSettings";
import type { Reflection } from "./types";

type LlamaContext = Awaited<ReturnType<typeof initLlama>>;
type ResolvedLlamaModel = { path: string; isBundleAsset: boolean };

let cachedLlama: { key: string; context: LlamaContext } | null = null;

export async function createLocalReflection(transcript: string, durationSeconds: number): Promise<Reflection> {
  const model = await locateReflectionModel();
  let context: LlamaContext;
  try {
    context = await getLlamaContext(model.path, model.isBundleAsset);
  } catch (error) {
    throw new Error(`Local LLM init failed for ${model.source} model at ${model.path}: ${readErrorMessage(error)}`);
  }
  try {
    const prompt = await buildReflectionPrompt({ transcript, durationSeconds });
    const settings = await getReflectionSettings();
    const result = await context.completion({
      prompt,
      n_predict: settings.maxTokens,
      temperature: settings.temperature,
      stop: ["</json>", "\n\n"]
    });
    return parseReflection(result.content || result.text, "Local LLM");
  } catch (error) {
    throw new Error(`Local LLM reflection failed using model ${model.path}: ${readErrorMessage(error)}`);
  }
}

export { createDeterministicReflection };

async function getLlamaContext(path: string, isBundleAsset: boolean): Promise<LlamaContext> {
  const model = await resolveLlamaModelPath(path, isBundleAsset);
  const key = `${model.isBundleAsset ? "bundle" : "file"}:${model.path}`;
  if (cachedLlama?.key === key) {
    return cachedLlama.context;
  }
  if (cachedLlama) {
    try {
      await cachedLlama.context.release();
    } catch {
      // Best effort release when model path changes.
    }
    cachedLlama = null;
  }
  const context = await initLlama({ model: model.path, is_model_asset: model.isBundleAsset, n_ctx: 1024, n_threads: 4, n_gpu_layers: 0 });
  cachedLlama = { key, context };
  return context;
}

async function resolveLlamaModelPath(path: string, isBundleAsset: boolean): Promise<ResolvedLlamaModel> {
  if (!isBundleAsset || Platform.OS !== "android") {
    return { path, isBundleAsset };
  }

  const fileName = path.split("/").pop() || "reflection-model.gguf";
  const modelDir = `${RNFS.DocumentDirectoryPath}/sanctum-models`;
  const targetPath = `${modelDir}/${fileName}`;

  if (!(await RNFS.exists(modelDir))) {
    await RNFS.mkdir(modelDir);
  }
  if (!(await RNFS.exists(targetPath))) {
    await RNFS.copyFileAssets(path, targetPath);
  }

  return { path: targetPath, isBundleAsset: false };
}

function readErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message === "[object Object]" ? JSON.stringify({ message: error.message }, null, 2) : error.message;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error, null, 2) ?? String(error);
  } catch {
    return String(error);
  }
}
