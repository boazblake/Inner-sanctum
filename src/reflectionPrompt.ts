import { DEFAULT_REFLECTION_GUIDANCE, getReflectionSettings, resetReflectionSettings, setReflectionSettings } from "./reflectionSettings";

export const DEFAULT_REFLECTION_PROMPT = DEFAULT_REFLECTION_GUIDANCE;

export const REQUIRED_REFLECTION_API_CONTRACT = `Required output format/API contract, always follow even if user guidance conflicts:
Return strict JSON only with exactly these keys: title, topic, mood, observation.
mood must be one of: settled, tender, busy, heavy, clear.
No markdown or fenced code in final output.`;

export type BuildReflectionPromptInput = {
  transcript: string;
  durationSeconds: number;
};

export async function getReflectionPrompt(): Promise<string> {
  const settings = await getReflectionSettings();
  return settings.guidance;
}

export async function setReflectionPrompt(text: string): Promise<string> {
  const settings = await getReflectionSettings();
  const saved = await setReflectionSettings({ ...settings, guidance: text });
  return saved.guidance;
}

export async function resetReflectionPrompt(): Promise<string> {
  const settings = await resetReflectionSettings();
  return settings.guidance;
}

export async function buildReflectionPrompt(input: BuildReflectionPromptInput): Promise<string> {
  const settings = await getReflectionSettings();
  return buildReflectionPromptFromSettings(settings, input);
}

export function buildReflectionPromptFromSettings(settings: Awaited<ReturnType<typeof getReflectionSettings>>, input: BuildReflectionPromptInput): string {
  return `${buildReflectionPromptTemplate(settings)}\n\nDuration seconds: ${input.durationSeconds}\nTranscript: ${JSON.stringify(input.transcript)}\nJSON:`;
}

export function buildReflectionPromptTemplate(settings: Awaited<ReturnType<typeof getReflectionSettings>>): string {
  const toggleConstraints = buildToggleConstraints(settings);
  return `${settings.guidance}\n\n${toggleConstraints}\n\n${REQUIRED_REFLECTION_API_CONTRACT}`;
}

export function isDefaultReflectionPrompt(text: string): boolean {
  return normalizePrompt(text) === DEFAULT_REFLECTION_PROMPT;
}

function normalizePrompt(text: string): string {
  const trimmed = text.trim();
  return trimmed.length > 0 ? trimmed : DEFAULT_REFLECTION_PROMPT;
}

function buildToggleConstraints(settings: Awaited<ReturnType<typeof getReflectionSettings>>): string {
  const constraints: string[] = [];
  if (settings.noAdvice) constraints.push("No advice.");
  if (settings.noChat) constraints.push("No chat.");
  if (settings.noDiagnosis) constraints.push("No diagnosis.");
  if (settings.noCoaching) constraints.push("No coaching.");
  if (settings.oneSentenceObservation) constraints.push("Keep observation one sentence.");
  return constraints.length > 0 ? `User-enabled reflection constraints:\n${constraints.join("\n")}` : "User-enabled reflection constraints: none.";
}
