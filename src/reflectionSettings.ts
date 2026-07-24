import AsyncStorage from "@react-native-async-storage/async-storage";

const SETTINGS_KEY = "sanctum.reflectionSettings.v1";
const LEGACY_PROMPT_KEY = "sanctum.reflectionPrompt.v1";
const OLDER_PROMPT_KEY = "slated.reflectionPrompt.v1";

export type ReflectionSettings = {
  guidance: string;
  noAdvice: boolean;
  noChat: boolean;
  noDiagnosis: boolean;
  noCoaching: boolean;
  oneSentenceObservation: boolean;
  temperature: number;
  maxTokens: number;
};

export const DEFAULT_REFLECTION_GUIDANCE = `You run fully offline on device for a private voice journal app.
Create one compact reflection from the transcript.
Focus on quiet/private contemplation.
Keep title under 8 words.`;

export const DEFAULT_REFLECTION_SETTINGS: ReflectionSettings = {
  guidance: DEFAULT_REFLECTION_GUIDANCE,
  noAdvice: true,
  noChat: true,
  noDiagnosis: true,
  noCoaching: true,
  oneSentenceObservation: true,
  temperature: 0.2,
  maxTokens: 180
};

let memorySettings: ReflectionSettings | null = null;

export async function getReflectionSettings(): Promise<ReflectionSettings> {
  try {
    const raw = await AsyncStorage.getItem(SETTINGS_KEY);
    if (raw) {
      const settings = normalizeSettings(JSON.parse(raw) as Partial<ReflectionSettings>);
      memorySettings = settings;
      return settings;
    }
    const legacyGuidance = (await AsyncStorage.getItem(LEGACY_PROMPT_KEY)) ?? (await AsyncStorage.getItem(OLDER_PROMPT_KEY));
    const settings = normalizeSettings({ ...(memorySettings ?? DEFAULT_REFLECTION_SETTINGS), guidance: legacyGuidance ?? memorySettings?.guidance });
    memorySettings = settings;
    return settings;
  } catch {
    return memorySettings ?? DEFAULT_REFLECTION_SETTINGS;
  }
}

export async function setReflectionSettings(settings: ReflectionSettings): Promise<ReflectionSettings> {
  const normalized = normalizeSettings(settings);
  memorySettings = normalized;
  await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(normalized));
  return normalized;
}

export async function resetReflectionSettings(): Promise<ReflectionSettings> {
  memorySettings = DEFAULT_REFLECTION_SETTINGS;
  await AsyncStorage.removeItem(SETTINGS_KEY);
  await AsyncStorage.removeItem(LEGACY_PROMPT_KEY);
  await AsyncStorage.removeItem(OLDER_PROMPT_KEY);
  return DEFAULT_REFLECTION_SETTINGS;
}

export function normalizeSettings(settings: Partial<ReflectionSettings>): ReflectionSettings {
  return {
    guidance: normalizeGuidance(settings.guidance ?? DEFAULT_REFLECTION_SETTINGS.guidance),
    noAdvice: settings.noAdvice ?? DEFAULT_REFLECTION_SETTINGS.noAdvice,
    noChat: settings.noChat ?? DEFAULT_REFLECTION_SETTINGS.noChat,
    noDiagnosis: settings.noDiagnosis ?? DEFAULT_REFLECTION_SETTINGS.noDiagnosis,
    noCoaching: settings.noCoaching ?? DEFAULT_REFLECTION_SETTINGS.noCoaching,
    oneSentenceObservation: settings.oneSentenceObservation ?? DEFAULT_REFLECTION_SETTINGS.oneSentenceObservation,
    temperature: clampNumber(settings.temperature, 0, 1, DEFAULT_REFLECTION_SETTINGS.temperature),
    maxTokens: Math.round(clampNumber(settings.maxTokens, 64, 512, DEFAULT_REFLECTION_SETTINGS.maxTokens))
  };
}

function normalizeGuidance(text: string): string {
  const trimmed = text.trim();
  return trimmed.length > 0 ? trimmed : DEFAULT_REFLECTION_SETTINGS.guidance;
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, numeric));
}
