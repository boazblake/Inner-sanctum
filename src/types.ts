export type ScreenName = "home" | "record" | "entries" | "detail" | "recap" | "settings";

export type Mood = "settled" | "tender" | "busy" | "heavy" | "clear";

export type JournalEntry = {
  id: string;
  createdAt: string;
  durationSeconds: number;
  transcript: string;
  audioUri?: string;
  title: string;
  topic: string;
  mood: Mood;
  observation: string;
};

export type Reflection = Pick<JournalEntry, "title" | "topic" | "mood" | "observation">;

export type RecordingState = {
  status: "idle" | "requestingPermission" | "recording" | "processing" | "error";
  seconds: number;
  uri?: string;
  error?: string;
};

export type RecordingResult = {
  uri: string;
  durationSeconds: number;
};
