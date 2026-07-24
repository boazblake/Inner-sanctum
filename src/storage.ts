import AsyncStorage from "@react-native-async-storage/async-storage";
import type { JournalEntry } from "./types";

const STORAGE_KEY = "sanctum.entries.v1";
const LEGACY_STORAGE_KEY = "slated.entries.v1";

let memoryEntries: JournalEntry[] = [];

async function readEntries(): Promise<JournalEntry[]> {
  try {
    const raw = (await AsyncStorage.getItem(STORAGE_KEY)) ?? (await AsyncStorage.getItem(LEGACY_STORAGE_KEY));
    if (!raw) {
      return memoryEntries;
    }
    const parsed = JSON.parse(raw) as JournalEntry[];
    memoryEntries = parsed;
    return parsed;
  } catch {
    return memoryEntries;
  }
}

async function writeEntries(entries: JournalEntry[]): Promise<void> {
  memoryEntries = entries;
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // Keep in-memory fallback for environments where native storage is unavailable.
  }
}

export const entryStore = {
  async list(): Promise<JournalEntry[]> {
    const entries = await readEntries();
    return [...entries].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },
  async save(entry: JournalEntry): Promise<void> {
    const entries = await readEntries();
    await writeEntries([entry, ...entries.filter((item) => item.id !== entry.id)]);
  },
  async remove(id: string): Promise<void> {
    const entries = await readEntries();
    await writeEntries(entries.filter((entry) => entry.id !== id));
  },
  async clear(): Promise<void> {
    await writeEntries([]);
    try {
      await AsyncStorage.removeItem(STORAGE_KEY);
      await AsyncStorage.removeItem(LEGACY_STORAGE_KEY);
    } catch {
      // In-memory clear above is enough for fallback.
    }
  }
};
