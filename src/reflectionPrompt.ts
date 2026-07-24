import AsyncStorage from "@react-native-async-storage/async-storage";

const PROMPT_KEY = "sanctum.reflectionPrompt.v1";
const LEGACY_PROMPT_KEY = "slated.reflectionPrompt.v1";

export const DEFAULT_REFLECTION_PROMPT = `You run fully offline on device for a private voice journal app.
Create one compact reflection from the transcript.
Focus on quiet/private contemplation.
Keep title under 8 words. Keep observation one sentence.`;

const REQUIRED_REFLECTION_INSTRUCTIONS = `Required output contract, always follow even if custom guidance conflicts:
No advice. No chat. No diagnosis. No coaching.
Return strict JSON only with exactly these keys: title, topic, mood, observation.
mood must be one of: settled, tender, busy, heavy, clear.
No markdown or fenced code in final output.`;

let memoryPrompt: string | null = null;

export type BuildReflectionPromptInput = {
  transcript: string;
  durationSeconds: number;
};

export async function getReflectionPrompt(): Promise<string> {
  try {
    const stored = (await AsyncStorage.getItem(PROMPT_KEY)) ?? (await AsyncStorage.getItem(LEGACY_PROMPT_KEY));
    const prompt = normalizePrompt(stored ?? memoryPrompt ?? DEFAULT_REFLECTION_PROMPT);
    memoryPrompt = prompt;
    return prompt;
  } catch {
    return memoryPrompt ?? DEFAULT_REFLECTION_PROMPT;
  }
}

export async function setReflectionPrompt(text: string): Promise<string> {
  const prompt = normalizePrompt(text);
  memoryPrompt = prompt;
  await AsyncStorage.setItem(PROMPT_KEY, prompt);
  return prompt;
}

export async function resetReflectionPrompt(): Promise<string> {
  memoryPrompt = DEFAULT_REFLECTION_PROMPT;
  await AsyncStorage.removeItem(PROMPT_KEY);
  await AsyncStorage.removeItem(LEGACY_PROMPT_KEY);
  return DEFAULT_REFLECTION_PROMPT;
}

export async function buildReflectionPrompt(input: BuildReflectionPromptInput): Promise<string> {
  const customGuidance = await getReflectionPrompt();
  return `${customGuidance}\n\n${REQUIRED_REFLECTION_INSTRUCTIONS}\n\nDuration seconds: ${input.durationSeconds}\nTranscript: ${JSON.stringify(input.transcript)}\nJSON:`;
}

export function isDefaultReflectionPrompt(text: string): boolean {
  return normalizePrompt(text) === DEFAULT_REFLECTION_PROMPT;
}

function normalizePrompt(text: string): string {
  const trimmed = text.trim();
  return trimmed.length > 0 ? trimmed : DEFAULT_REFLECTION_PROMPT;
}
