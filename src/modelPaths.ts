import { Platform } from "react-native";
import RNFS from "react-native-fs";
import { getSelectedReflectionModel } from "./modelSettings";

export const WHISPER_MODEL_FILE = "ggml-base.en.bin";
export const REFLECTION_MODEL_FILE = "reflection-1b-q4.gguf";

export type ModelKind = "whisper" | "reflection";

export type LocatedModel = {
  kind: ModelKind;
  fileName: string;
  path: string;
  isBundleAsset: boolean;
  source: "selected" | "documents" | "bundle" | "androidAsset";
};

export class MissingModelError extends Error {
  readonly modelFile: string;
  readonly checkedPaths: string[];

  constructor(modelFile: string, checkedPaths: string[]) {
    super(`Missing offline AI model: ${modelFile}. Import a local GGUF from Privacy settings for reflection, add default files under assets/models and rebuild, or copy models to Documents/sanctum-models. Checked: ${checkedPaths.join(", ")}`);
    this.name = "MissingModelError";
    this.modelFile = modelFile;
    this.checkedPaths = checkedPaths;
  }
}

export async function locateWhisperModel(): Promise<LocatedModel> {
  return locateModel("whisper", WHISPER_MODEL_FILE);
}

export async function findDefaultWhisperModelPath(): Promise<string | null> {
  try {
    const model = await locateModel("whisper", WHISPER_MODEL_FILE);
    return model.path;
  } catch {
    return null;
  }
}

export async function locateReflectionModel(): Promise<LocatedModel> {
  const selected = await getSelectedReflectionModel();
  if (selected) {
    if (await RNFS.exists(selected.path)) {
      return { kind: "reflection", fileName: selected.displayName, path: selected.path, isBundleAsset: false, source: "selected" };
    }
  }
  return locateModel("reflection", REFLECTION_MODEL_FILE);
}

export async function findDefaultReflectionModelPath(): Promise<string | null> {
  try {
    const model = await locateModel("reflection", REFLECTION_MODEL_FILE);
    return model.path;
  } catch {
    return null;
  }
}

async function locateModel(kind: ModelKind, fileName: string): Promise<LocatedModel> {
  const documentPath = `${RNFS.DocumentDirectoryPath}/sanctum-models/${fileName}`;
  const legacyDocumentPath = `${RNFS.DocumentDirectoryPath}/slated-models/${fileName}`;
  const bundlePath = `${RNFS.MainBundlePath}/${fileName}`;
  const nestedBundlePath = `${RNFS.MainBundlePath}/assets/models/${fileName}`;
  const checkedPaths = [documentPath, legacyDocumentPath, bundlePath, nestedBundlePath];

  for (const path of checkedPaths) {
    if (await RNFS.exists(path)) {
      return { kind, fileName, path, isBundleAsset: false, source: path === documentPath || path === legacyDocumentPath ? "documents" : "bundle" };
    }
  }

  if (Platform.OS === "android") {
    const androidAssetPath = `models/${fileName}`;
    checkedPaths.push(`android asset:${androidAssetPath}`);
    if (await RNFS.existsAssets(androidAssetPath)) {
      return { kind, fileName, path: androidAssetPath, isBundleAsset: true, source: "androidAsset" };
    }
  }

  throw new MissingModelError(fileName, checkedPaths);
}

export function explainOfflineAISetup(error: unknown): string {
  if (error instanceof MissingModelError) {
    return `${error.message}\n\nDefault local models:\n• assets/models/${WHISPER_MODEL_FILE}\n• assets/models/${REFLECTION_MODEL_FILE}\n\nReflection model option: Privacy → Import GGUF copies a user-provided .gguf into app documents and uses it locally.\n\nAfter adding bundled files, run a new dev build. Expo Go cannot load these native offline AI modules.`;
  }
  if (error instanceof Error) {
    return `Offline AI failed: ${error.name}: ${stringifyUnknown(error.message)}\n\nOpen Privacy → Check offline AI to see which model paths are visible to the app.`;
  }
  return `Offline AI failed with a non-Error value: ${stringifyUnknown(error)}\n\nOpen Privacy → Check offline AI to see which model paths are visible to the app.`;
}

function stringifyUnknown(value: unknown): string {
  if (typeof value === "string") return value === "[object Object]" ? JSON.stringify({ message: value }, null, 2) : value;
  try {
    return JSON.stringify(value, null, 2) ?? String(value);
  } catch {
    return String(value);
  }
}

export async function describeOfflineAIStatus(): Promise<string> {
  const lines: string[] = [];
  await appendModelStatus(lines, "Whisper", locateWhisperModel);
  await appendModelStatus(lines, "Reflection", locateReflectionModel);
  return lines.join("\n\n");
}

async function appendModelStatus(lines: string[], label: string, locate: () => Promise<LocatedModel>): Promise<void> {
  try {
    const model = await locate();
    lines.push(`${label}: found\nfile: ${model.fileName}\nsource: ${model.source}\npath: ${model.path}`);
  } catch (error) {
    lines.push(`${label}: missing/error\n${explainOfflineAISetup(error)}`);
  }
}
