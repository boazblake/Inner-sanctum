import { Platform } from "react-native";
import { createAppleFoundationReflection, isAppleFoundationModelsUnavailable } from "./appleFoundationReflection";
import { createLocalReflection } from "./localReflection";
import type { Reflection } from "./types";

export async function createReflectionWithBestLocalProvider(transcript: string, durationSeconds: number): Promise<Reflection> {
  if (Platform.OS === "ios") {
    try {
      return await createAppleFoundationReflection(transcript, durationSeconds);
    } catch (error) {
      if (!isAppleFoundationModelsUnavailable(error)) {
        throw error;
      }
      // Apple built-in provider unavailable; llama.rn remains local fallback.
    }
  }

  return createLocalReflection(transcript, durationSeconds);
}
