import { initWhisper } from "whisper.rn/index";
import { locateWhisperModel } from "./modelPaths";

type WhisperContext = Awaited<ReturnType<typeof initWhisper>>;

let cachedWhisper: { key: string; context: WhisperContext } | null = null;

export async function transcribeLocalAudio(uri: string): Promise<string> {
  const model = await locateWhisperModel();
  const audioPath = normalizeFilePath(uri);
  let context: WhisperContext;
  try {
    context = await getWhisperContext(model.path, model.isBundleAsset);
  } catch (error) {
    throw new Error(`Whisper init failed for ${model.source} model at ${model.path}: ${readErrorMessage(error)}`);
  }
  try {
    const { promise } = context.transcribe(audioPath, { language: "en" });
    const result = await promise;
    const transcript = result.result.trim();
    if (transcript.length === 0) {
      throw new Error("Whisper completed locally but returned an empty transcript.");
    }
    return transcript;
  } catch (error) {
    throw new Error(`Whisper transcription failed for audio ${audioPath} using model ${model.path}: ${readErrorMessage(error)}`);
  }
}

async function getWhisperContext(path: string, isBundleAsset: boolean): Promise<WhisperContext> {
  const key = `${isBundleAsset ? "bundle" : "file"}:${path}`;
  if (cachedWhisper?.key === key) {
    return cachedWhisper.context;
  }
  if (cachedWhisper) {
    try {
      await cachedWhisper.context.release();
    } catch {
      // Best effort release when model path changes.
    }
    cachedWhisper = null;
  }
  const context = await initWhisper({ filePath: path, isBundleAsset });
  cachedWhisper = { key, context };
  return context;
}

function normalizeFilePath(uri: string): string {
  return uri.startsWith("file://") ? uri.slice("file://".length) : uri;
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
