import AsyncStorage from "@react-native-async-storage/async-storage";
import * as DocumentPicker from "expo-document-picker";
import RNFS from "react-native-fs";

const SETTINGS_KEY = "sanctum.reflectionModel.v1";
const LEGACY_SETTINGS_KEY = "slated.reflectionModel.v1";
const MODEL_DIR = `${RNFS.DocumentDirectoryPath}/sanctum-models`;

export type ReflectionModelSettings = {
  path: string;
  displayName: string;
  sizeBytes?: number;
};

export type ReflectionModelStatus = {
  source: "selected" | "default" | "missing";
  title: string;
  detail: string;
};

let memorySettings: ReflectionModelSettings | null = null;

export async function getSelectedReflectionModel(): Promise<ReflectionModelSettings | null> {
  try {
    const raw = (await AsyncStorage.getItem(SETTINGS_KEY)) ?? (await AsyncStorage.getItem(LEGACY_SETTINGS_KEY));
    if (!raw) {
      return memorySettings;
    }
    const parsed = JSON.parse(raw) as ReflectionModelSettings;
    memorySettings = parsed;
    return parsed;
  } catch {
    return memorySettings;
  }
}

export async function setSelectedReflectionModel(settings: ReflectionModelSettings): Promise<void> {
  memorySettings = settings;
  await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

export async function clearSelectedReflectionModel(): Promise<void> {
  memorySettings = null;
  await AsyncStorage.removeItem(SETTINGS_KEY);
  await AsyncStorage.removeItem(LEGACY_SETTINGS_KEY);
}

export async function importReflectionModelFromPicker(): Promise<ReflectionModelSettings | null> {
  const result = await DocumentPicker.getDocumentAsync({
    copyToCacheDirectory: true,
    multiple: false,
    type: ["application/octet-stream", "*/*"]
  });

  if (result.canceled) {
    return null;
  }

  const asset = result.assets[0];
  if (!asset) {
    throw new Error("Document picker returned no file.");
  }

  if (!asset.name.toLowerCase().endsWith(".gguf")) {
    throw new Error("Choose a .gguf reflection model file.");
  }

  await RNFS.mkdir(MODEL_DIR);
  const safeName = makeSafeGgufName(asset.name);
  const destination = `${MODEL_DIR}/${Date.now()}-${safeName}`;
  await RNFS.copyFile(stripFileScheme(asset.uri), destination);

  const settings: ReflectionModelSettings = {
    path: destination,
    displayName: asset.name,
    sizeBytes: asset.size
  };
  await setSelectedReflectionModel(settings);
  return settings;
}

export async function getReflectionModelStatus(defaultExists: () => Promise<string | null>): Promise<ReflectionModelStatus> {
  const selected = await getSelectedReflectionModel();
  if (selected) {
    const exists = await RNFS.exists(selected.path);
    return {
      source: exists ? "selected" : "missing",
      title: exists ? selected.displayName : "Selected model missing",
      detail: exists ? `Imported GGUF · ${formatBytes(selected.sizeBytes)} · stays on device` : `Saved path not found: ${selected.path}`
    };
  }

  const defaultPath = await defaultExists();
  if (defaultPath) {
    return { source: "default", title: "Default reflection model", detail: defaultPath };
  }
  return { source: "missing", title: "No reflection model found", detail: "Import a GGUF or add assets/models/reflection-1b-q4.gguf and rebuild." };
}

function makeSafeGgufName(name: string): string {
  const cleaned = name.replace(/[^a-zA-Z0-9._-]/gu, "-").replace(/-+/gu, "-");
  return cleaned.toLowerCase().endsWith(".gguf") ? cleaned : `${cleaned}.gguf`;
}

function stripFileScheme(uri: string): string {
  return uri.startsWith("file://") ? uri.slice("file://".length) : uri;
}

function formatBytes(sizeBytes: number | undefined): string {
  if (!sizeBytes) {
    return "size unknown";
  }
  const gib = sizeBytes / 1024 / 1024 / 1024;
  if (gib >= 1) {
    return `${gib.toFixed(2)} GB`;
  }
  return `${(sizeBytes / 1024 / 1024).toFixed(0)} MB`;
}
