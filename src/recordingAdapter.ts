import { Audio } from "expo-av";
import { Platform } from "react-native";
import * as AudioStudio from "@siteed/audio-studio";
import type { RecordingResult, RecordingState } from "./types";

type SiteedRecordingConfig = {
  sampleRate: 16000;
  channels: 1;
  encoding: "pcm_16bit";
  keepAwake: false;
  showNotification: false;
  enableProcessing: false;
  android: { audioFocusStrategy: "none" };
  output: {
    primary: { enabled: true };
    compressed: { enabled: false };
  };
};

type SiteedAudioStudioModule = {
  getPermissionsAsync?: () => Promise<{ granted?: boolean; status?: string }>;
  requestPermissionsAsync?: () => Promise<{ granted?: boolean; status?: string }>;
  startRecording?: (config: SiteedRecordingConfig) => Promise<unknown>;
  stopRecording?: () => Promise<unknown>;
};

const highQualityOptions = Audio.RecordingOptionsPresets.HIGH_QUALITY as Audio.RecordingOptions;

const whisperWavRecordingOptions: Audio.RecordingOptions = {
  isMeteringEnabled: true,
  android: highQualityOptions.android,
  web: highQualityOptions.web,
  ios: {
    extension: ".wav",
    outputFormat: Audio.IOSOutputFormat.LINEARPCM,
    audioQuality: Audio.IOSAudioQuality.MAX,
    sampleRate: 16000,
    numberOfChannels: 1,
    bitRate: 256000,
    linearPCMBitDepth: 16,
    linearPCMIsBigEndian: false,
    linearPCMIsFloat: false
  }
};

let activeRecording: Audio.Recording | null = null;
let activeSiteedRecording = false;
let startedAt = 0;

const siteedWavRecordingOptions: SiteedRecordingConfig = {
  sampleRate: 16000,
  channels: 1,
  encoding: "pcm_16bit",
  keepAwake: false,
  showNotification: false,
  enableProcessing: false,
  android: { audioFocusStrategy: "none" },
  output: {
    primary: { enabled: true },
    compressed: { enabled: false }
  }
};

export const recordingAdapter = {
  async start(): Promise<RecordingState> {
    try {
      if (Platform.OS === "android") {
        const permission = await withTimeout(requestSiteedMicrophonePermission(), 8000, "Android microphone permission timed out.");
        if (!permission) {
          return { status: "error", seconds: 0, error: "Microphone permission denied." };
        }
        await withTimeout(startSiteedRecording(), 8000, "Android WAV recorder did not start. Rebuild the dev client or reset microphone permission.");
        startedAt = Date.now();
        return { status: "recording", seconds: 0 };
      }
      const permission = await Audio.requestPermissionsAsync();
      if (!permission.granted) {
        return { status: "error", seconds: 0, error: "Microphone permission denied." };
      }
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const recording = new Audio.Recording();
      await recording.prepareToRecordAsync(whisperWavRecordingOptions);
      await recording.startAsync();
      activeRecording = recording;
      startedAt = Date.now();
      return { status: "recording", seconds: 0 };
    } catch (error) {
      activeRecording = null;
      activeSiteedRecording = false;
      startedAt = 0;
      return { status: "error", seconds: 0, error: readErrorMessage(error) };
    }
  },

  async stop(visibleSeconds: number): Promise<RecordingResult> {
    const elapsedSeconds = Math.max(visibleSeconds, Math.round((Date.now() - startedAt) / 1000));
    if (!activeRecording) {
      if (Platform.OS === "android" && activeSiteedRecording) {
        try {
          const uri = await stopSiteedRecording();
          activeSiteedRecording = false;
          return {
            uri,
            durationSeconds: elapsedSeconds
          };
        } catch (error) {
          activeSiteedRecording = false;
          throw error instanceof Error ? error : new Error("Unable to stop Android WAV recording and read local audio file.");
        }
      }
      throw new Error("No active native recording found. Use a development build on device/simulator with expo-av linked; no simulated audio is saved.");
    }
    try {
      await activeRecording.stopAndUnloadAsync();
      const uri = activeRecording.getURI();
      activeRecording = null;
      if (!uri) {
        throw new Error("Recording stopped, but Expo AV did not return an audio file URI.");
      }
      return {
        uri,
        durationSeconds: elapsedSeconds
      };
    } catch (error) {
      activeRecording = null;
      activeSiteedRecording = false;
      throw error instanceof Error ? error : new Error("Unable to stop recording and read local audio file.");
    }
  }
};

async function requestSiteedMicrophonePermission(): Promise<boolean> {
  const audioStudioModule = readAudioStudioModule();
  const existing = typeof audioStudioModule.getPermissionsAsync === "function" ? await audioStudioModule.getPermissionsAsync() : null;
  if (existing?.granted || existing?.status === "granted") return true;
  if (typeof audioStudioModule.requestPermissionsAsync !== "function") {
    throw new Error("@siteed/audio-studio permission API is unavailable. Rebuild the Android dev client.");
  }
  const requested = await audioStudioModule.requestPermissionsAsync();
  return Boolean(requested?.granted || requested?.status === "granted");
}

async function startSiteedRecording(): Promise<void> {
  const audioStudioModule = readAudioStudioModule();
  if (typeof audioStudioModule.startRecording !== "function") {
    throw new Error("@siteed/audio-studio native recorder is unavailable. Rebuild the Android dev client.");
  }
  await audioStudioModule.startRecording(siteedWavRecordingOptions);
  activeSiteedRecording = true;
}

async function stopSiteedRecording(): Promise<string> {
  const audioStudioModule = readAudioStudioModule();
  if (typeof audioStudioModule.stopRecording !== "function") {
    throw new Error("@siteed/audio-studio native recorder is unavailable. Rebuild the Android dev client.");
  }
  const result = await audioStudioModule.stopRecording();
  const uri = readRecordingUri(result);
  if (!uri) {
    throw new Error("Recording stopped, but @siteed/audio-studio did not return a WAV file URI.");
  }
  return uri;
}

function readAudioStudioModule(): SiteedAudioStudioModule {
  const module = (AudioStudio as Record<string, unknown>).AudioStudioModule;
  return module && typeof module === "object" ? (module as SiteedAudioStudioModule) : {};
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error(message)), timeoutMs);
      })
    ]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

function readRecordingUri(result: unknown): string | null {
  if (typeof result === "string") {
    return result;
  }
  if (!result || typeof result !== "object") {
    return null;
  }
  const recordingResult = result as Record<string, unknown>;
  const file = recordingResult.file;
  const uri = recordingResult.uri ?? recordingResult.fileUri ?? recordingResult.path ?? recordingResult.url;
  if (typeof uri === "string") {
    return uri;
  }
  if (file && typeof file === "object") {
    const fileUri = (file as Record<string, unknown>).uri ?? (file as Record<string, unknown>).path;
    if (typeof fileUri === "string") {
      return fileUri;
    }
  }
  return null;
}

function readErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message === "[object Object]" ? JSON.stringify({ message: error.message }, null, 2) : error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  try {
    return JSON.stringify(error, null, 2) ?? String(error);
  } catch {
    return String(error);
  }
}
