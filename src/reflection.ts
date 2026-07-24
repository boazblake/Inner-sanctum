import type { Mood, Reflection } from "./types";

const topics = ["work", "family", "health", "money", "friend", "home", "plan", "rest"];

export function createBlankDraft(): string {
  return "";
}

export function createDeterministicReflection(transcript: string, durationSeconds: number): Reflection {
  const clean = transcript.trim() || "Private voice note captured locally.";
  const words = clean.split(/\s+/).filter(Boolean);
  const topic = topics.find((candidate) => clean.toLowerCase().includes(candidate)) ?? "personal";
  const mood = detectMood(clean);
  const title = words.slice(0, 6).join(" ").replace(/[.,!?;:]$/u, "") || "Private note";
  return {
    title: title.length > 0 ? title : "Private note",
    topic,
    mood,
    observation: `Local placeholder: ${words.length} words over ${durationSeconds}s, centered on ${topic}.`
  };
}

function detectMood(text: string): Mood {
  const value = text.toLowerCase();
  if (/calm|good|steady|okay|grateful/u.test(value)) {
    return "settled";
  }
  if (/sad|miss|soft|tender/u.test(value)) {
    return "tender";
  }
  if (/busy|rush|many|overload/u.test(value)) {
    return "busy";
  }
  if (/hard|heavy|angry|tired/u.test(value)) {
    return "heavy";
  }
  return "clear";
}
