import { Audio } from "expo-av";
import type { RecordingResult, RecordingState } from "./types";

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
let startedAt = 0;

export const recordingAdapter = {
  async start(): Promise<RecordingState> {
    try {
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
      startedAt = 0;
      return { status: "error", seconds: 0, error: readErrorMessage(error) };
    }
  },

  async stop(visibleSeconds: number): Promise<RecordingResult> {
    const elapsedSeconds = Math.max(visibleSeconds, Math.round((Date.now() - startedAt) / 1000));
    if (!activeRecording) {
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
      throw error instanceof Error ? error : new Error("Unable to stop recording and read local audio file.");
    }
  }
};

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
