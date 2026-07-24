import type { Mood, Reflection } from "./types";

const moods: Mood[] = ["settled", "tender", "busy", "heavy", "clear"];

export function parseReflection(text: string, providerName: string): Reflection {
  const jsonText = extractJson(text, providerName);
  const value = JSON.parse(jsonText) as Partial<Record<keyof Reflection, unknown>>;
  const title = readString(value.title, "title", providerName);
  const topic = readString(value.topic, "topic", providerName);
  const observation = readString(value.observation, "observation", providerName);
  const moodValue = readString(value.mood, "mood", providerName).toLowerCase();
  if (!moods.includes(moodValue as Mood)) {
    throw new Error(`${providerName} returned invalid mood: ${moodValue}. Expected one of ${moods.join(", ")}.`);
  }
  return { title, topic, mood: moodValue as Mood, observation };
}

export function validateReflection(value: Partial<Record<keyof Reflection, unknown>>, providerName: string): Reflection {
  const title = readString(value.title, "title", providerName);
  const topic = readString(value.topic, "topic", providerName);
  const observation = readString(value.observation, "observation", providerName);
  const moodValue = readString(value.mood, "mood", providerName).toLowerCase();
  if (!moods.includes(moodValue as Mood)) {
    throw new Error(`${providerName} returned invalid mood: ${moodValue}. Expected one of ${moods.join(", ")}.`);
  }
  return { title, topic, mood: moodValue as Mood, observation };
}

function extractJson(text: string, providerName: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/iu);
  const candidate = fenced?.[1] ?? text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start < 0 || end <= start) {
    throw new Error(`${providerName} did not return JSON. Raw output: ${text.slice(0, 240)}`);
  }
  return candidate.slice(start, end + 1);
}

function readString(value: unknown, field: keyof Reflection, providerName: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${providerName} JSON missing string field: ${field}.`);
  }
  return value.trim();
}
