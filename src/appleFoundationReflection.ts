import { NativeModules, Platform } from "react-native";
import { parseReflection, validateReflection } from "./reflectionParser";
import { buildReflectionPrompt } from "./reflectionPrompt";
import type { Reflection } from "./types";

type AppleFoundationReflectionModule = {
  isAvailable: () => Promise<boolean>;
  createReflection: (transcript: string, durationSeconds: number, prompt: string) => Promise<string | Reflection>;
};

type NativeModulesWithFoundation = typeof NativeModules & {
  SanctumFoundationModels?: AppleFoundationReflectionModule;
};

export class AppleFoundationModelsUnavailableError extends Error {
  constructor(message = "Apple Foundation Models reflection is unavailable in this build.") {
    super(message);
    this.name = "AppleFoundationModelsUnavailableError";
  }
}

export async function createAppleFoundationReflection(transcript: string, durationSeconds: number): Promise<Reflection> {
  if (Platform.OS !== "ios") {
    throw new AppleFoundationModelsUnavailableError("Apple Foundation Models reflection is iOS-only.");
  }

  const module = (NativeModules as NativeModulesWithFoundation).SanctumFoundationModels;
  if (!module) {
    throw new AppleFoundationModelsUnavailableError("No SanctumFoundationModels native bridge is registered. Using llama.rn fallback.");
  }

  const available = await module.isAvailable();
  if (!available) {
    throw new AppleFoundationModelsUnavailableError("Foundation Models framework is not available on this iOS version, device, or SDK. Using llama.rn fallback.");
  }

  const prompt = await buildReflectionPrompt({ transcript, durationSeconds });
  const result = await module.createReflection(transcript, durationSeconds, prompt);
  return typeof result === "string" ? parseReflection(result, "Apple Foundation Models") : validateReflection(result, "Apple Foundation Models");
}

export function isAppleFoundationModelsUnavailable(error: unknown): boolean {
  return error instanceof AppleFoundationModelsUnavailableError;
}
