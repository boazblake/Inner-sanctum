import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import * as Clipboard from "expo-clipboard";
import { describeOfflineAIStatus, explainOfflineAISetup, findDefaultReflectionModelPath } from "./src/modelPaths";
import { clearSelectedReflectionModel, getReflectionModelStatus, importReflectionModelFromPicker } from "./src/modelSettings";
import { createBlankDraft } from "./src/reflection";
import { buildReflectionPromptTemplate, REQUIRED_REFLECTION_API_CONTRACT } from "./src/reflectionPrompt";
import { DEFAULT_REFLECTION_GUIDANCE, DEFAULT_REFLECTION_SETTINGS, getReflectionSettings, normalizeSettings, resetReflectionSettings, setReflectionSettings } from "./src/reflectionSettings";
import { createReflectionWithBestLocalProvider } from "./src/reflectionProvider";
import { recordingAdapter } from "./src/recordingAdapter";
import { entryStore } from "./src/storage";
import { transcribeLocalAudio } from "./src/transcription";
import type { JournalEntry, RecordingState, ScreenName } from "./src/types";
import type { ReflectionSettings } from "./src/reflectionSettings";
import type { ReflectionModelStatus } from "./src/modelSettings";
import { formatDuration, formatLongDate, formatShortDate } from "./src/utils";

const copy = Platform.select({
  ios: {
    homeTitle: "Step into quiet.",
    homeBody: "A private voice journal for contemplation you do not want to turn into a post, chat, or task.",
    platformCue: "Voice-first now. Lock Screen or Dynamic Island capture can come later.",
    recordTitle: "Voice note",
    recordIdle: "Ready when you are. Recording stays on this device.",
    recordActive: "Recording. Keep talking, or stop to save.",
    recordBusy: "Running offline transcription and reflection.",
    recordNote: "Microphone access is used only while recording. Offline AI requires a development build with local model files; no fake transcript is created.",
    privacyDevice: "Sanctum is transparent by design: entries, model choices, and prompts stay on this device. No accounts, billing, analytics, hidden servers, remote AI, or fake AI fallback are wired.",
    privacyPlatform: "Microphone permission is requested only when you record. You can inspect model status, import/reset models, and edit the reflection prompt.",
    inputPlaceholder: "Optional typed transcript. Leave blank to transcribe local audio with Whisper."
  },
  android: {
    homeTitle: "Make a private voice note.",
    homeBody: "Record quick thoughts without sending them to an account, feed, assistant, or server.",
    platformCue: "Voice-first now. Notification or Quick Settings capture can come later.",
    recordTitle: "Record note",
    recordIdle: "Ready to record. Saved entries stay local.",
    recordActive: "Recording. Stop to save this entry.",
    recordBusy: "Running offline transcription and reflection.",
    recordNote: "Uses microphone permission while recording. Offline AI requires a development build with local model files; no fake transcript is created.",
    privacyDevice: "Entries are stored on this device. No sign-in, billing, analytics, network calls, remote AI, or fake AI fallback are wired.",
    privacyPlatform: "Android INTERNET permission is not requested. Future quick capture belongs in notifications or Quick Settings.",
    inputPlaceholder: "Optional typed transcript. Leave blank to transcribe local audio with Whisper."
  },
  default: {
    homeTitle: "Make a private voice note.",
    homeBody: "Record quick thoughts without sending them to an account, feed, assistant, or server.",
    platformCue: "Voice-first now. Quick capture can come later.",
    recordTitle: "Record note",
    recordIdle: "Ready to record. Saved entries stay local.",
    recordActive: "Recording. Stop to save this entry.",
    recordBusy: "Running offline transcription and reflection.",
    recordNote: "Offline AI requires native modules and local model files; no fake transcript is created.",
    privacyDevice: "Entries are stored on this device. No sign-in, billing, analytics, network calls, remote AI, or fake AI fallback are wired.",
    privacyPlatform: "No network behavior is wired.",
    inputPlaceholder: "Optional typed transcript. Leave blank to transcribe local audio with Whisper."
  }
});

export default function App() {
  const [screen, setScreen] = useState<ScreenName>("home");
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);
  const [recording, setRecording] = useState<RecordingState>({ status: "idle", seconds: 0 });
  const [draftText, setDraftText] = useState(createBlankDraft());
  const [modelStatus, setModelStatus] = useState<ReflectionModelStatus>({ source: "missing", title: "Checking model", detail: "Looking for local reflection model." });
  const [lastSaveError, setLastSaveError] = useState<string | null>(null);
  const [reflectionSettings, setReflectionSettingsState] = useState<ReflectionSettings>(DEFAULT_REFLECTION_SETTINGS);

  useEffect(() => {
    void loadEntries();
    void refreshModelStatus();
    void loadReflectionSettings();
  }, []);

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | undefined;
    if (recording.status === "recording") {
      timer = setInterval(() => {
        setRecording((current) => ({ ...current, seconds: current.seconds + 1 }));
      }, 1000);
    }
    return () => {
      if (timer) {
        clearInterval(timer);
      }
    };
  }, [recording.status]);

  const selectedEntry = useMemo(
    () => entries.find((entry) => entry.id === selectedEntryId) ?? null,
    [entries, selectedEntryId]
  );

  async function loadEntries() {
    const stored = await entryStore.list();
    setEntries(stored);
  }

  async function refreshModelStatus() {
    const status = await getReflectionModelStatus(findDefaultReflectionModelPath);
    setModelStatus(status);
  }

  async function loadReflectionSettings() {
    setReflectionSettingsState(await getReflectionSettings());
  }

  async function startRecording() {
    setLastSaveError(null);
    setRecording({ status: "requestingPermission", seconds: 0 });
    const next = await recordingAdapter.start();
    setRecording(next);
  }

  async function stopRecording() {
    setRecording((current) => ({ ...current, status: "processing" }));
    try {
      const result = await recordingAdapter.stop(recording.seconds);
      const typedTranscript = draftText.trim();
      const transcript = typedTranscript.length > 0 ? typedTranscript : await transcribeLocalAudio(result.uri);
      const reflection = await createReflectionWithBestLocalProvider(transcript, result.durationSeconds);
      const entry: JournalEntry = {
        id: `${Date.now()}`,
        createdAt: new Date().toISOString(),
        durationSeconds: result.durationSeconds,
        transcript,
        audioUri: result.uri,
        ...reflection
      };
      await entryStore.save(entry);
      setDraftText(createBlankDraft());
      setRecording({ status: "idle", seconds: 0 });
      await loadEntries();
      setSelectedEntryId(entry.id);
      setScreen("detail");
    } catch (error) {
      setRecording({ status: "idle", seconds: 0 });
      setLastSaveError(explainOfflineAISetup(error));
      setScreen("record");
    }
  }

  async function clearEntries() {
    await entryStore.clear();
    setEntries([]);
    setSelectedEntryId(null);
    setScreen("home");
  }

  async function deleteEntry(id: string) {
    await entryStore.remove(id);
    await loadEntries();
    if (selectedEntryId === id) {
      setSelectedEntryId(null);
      setScreen("entries");
    }
  }

  function confirmDeleteEntry(id: string) {
    Alert.alert("Delete note?", "This removes this local journal entry from this app install.", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => { void deleteEntry(id); } }
    ]);
  }

  async function importReflectionModel() {
    try {
      const imported = await importReflectionModelFromPicker();
      await refreshModelStatus();
      if (imported) {
        Alert.alert("Reflection model imported", `${imported.displayName} now runs locally for reflection generation.`);
      }
    } catch (error) {
      Alert.alert("Import failed", error instanceof Error ? error.message : "Unable to import GGUF model.");
    }
  }

  async function resetReflectionModel() {
    try {
      await clearSelectedReflectionModel();
      await refreshModelStatus();
      Alert.alert("Reflection model reset", "Sanctum will use bundled/Documents default lookup again.");
    } catch (error) {
      Alert.alert("Reset failed", error instanceof Error ? error.message : "Unable to reset model setting.");
    }
  }

  async function saveReflectionSettings() {
    try {
      const saved = await setReflectionSettings(reflectionSettings);
      setReflectionSettingsState(saved);
      Alert.alert("Settings saved", "Reflection controls updated for Apple Foundation Models and llama.rn.");
    } catch (error) {
      setLastSaveError(`Reflection settings save failed: ${readErrorMessage(error)}`);
      setScreen("record");
    }
  }

  async function resetReflectionControls() {
    try {
      setReflectionSettingsState(await resetReflectionSettings());
      Alert.alert("Settings reset", "Default reflection controls restored.");
    } catch (error) {
      setLastSaveError(`Reflection settings reset failed: ${readErrorMessage(error)}`);
      setScreen("record");
    }
  }

  function resetReflectionGuidance() {
    updateReflectionSettings({ guidance: DEFAULT_REFLECTION_GUIDANCE });
  }

  function updateReflectionSettings(patch: Partial<ReflectionSettings>) {
    setReflectionSettingsState((current) => normalizeSettings({ ...current, ...patch }));
  }

  async function checkOfflineAI() {
    try {
      setLastSaveError(await describeOfflineAIStatus());
      setScreen("record");
    } catch (error) {
      setLastSaveError(explainOfflineAISetup(error));
      setScreen("record");
    }
  }

  async function copyLastSaveError() {
    if (!lastSaveError) {
      return;
    }
    await Clipboard.setStringAsync(lastSaveError);
    Alert.alert("Copied", "Error copied to clipboard.");
  }

  async function copyReflectionPromptTemplate() {
    await Clipboard.setStringAsync(buildReflectionPromptTemplate(reflectionSettings));
    Alert.alert("Copied", "Active reflection template copied to clipboard.");
  }

  function openEntry(id: string) {
    setSelectedEntryId(id);
    setScreen("detail");
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.canvas} />
      <View style={styles.shell}>
        <Header screen={screen} setScreen={setScreen} />
        {screen === "home" ? <Home entries={entries} onRecord={() => setScreen("record")} onOpenEntry={openEntry} /> : null}
        {screen === "record" ? <Record recording={recording} draftText={draftText} setDraftText={setDraftText} lastSaveError={lastSaveError} onCopyError={() => { void copyLastSaveError(); }} onStart={startRecording} onStop={stopRecording} /> : null}
        {screen === "entries" ? <Entries entries={entries} onOpenEntry={openEntry} onDeleteEntry={confirmDeleteEntry} /> : null}
        {screen === "detail" ? <Detail entry={selectedEntry} onBack={() => setScreen("entries")} onDeleteEntry={confirmDeleteEntry} /> : null}
        {screen === "recap" ? <Recap entries={entries} /> : null}
        {screen === "settings" ? <Settings modelStatus={modelStatus} reflectionSettings={reflectionSettings} onReflectionSettingsChange={updateReflectionSettings} onResetGuidance={resetReflectionGuidance} onCopyPromptTemplate={() => { void copyReflectionPromptTemplate(); }} onSaveSettings={() => { void saveReflectionSettings(); }} onResetSettings={() => { void resetReflectionControls(); }} onImportModel={() => { void importReflectionModel(); }} onResetModel={() => { void resetReflectionModel(); }} onCheckOfflineAI={() => { void checkOfflineAI(); }} onClear={() => { void clearEntries(); }} /> : null}
      </View>
    </SafeAreaView>
  );
}

function Header({ screen, setScreen }: { screen: ScreenName; setScreen: (screen: ScreenName) => void }) {
  const tabs: Array<{ label: string; screen: ScreenName }> = [
    { label: "Today", screen: "home" },
    { label: Platform.select({ ios: "Voice", android: "Record", default: "Record" }), screen: "record" },
    { label: "Entries", screen: "entries" },
    { label: "Recap", screen: "recap" },
    { label: "Privacy", screen: "settings" }
  ];
  return (
    <View style={styles.header}>
      <View style={styles.brandRow}>
        <View>
          <Text style={styles.appTitle}>Sanctum</Text>
          <Text style={styles.appSubtitle}>Quiet private contemplation</Text>
        </View>
        <View style={styles.localBadge}>
          <View style={styles.localDot} />
          <Text style={styles.localBadgeText}>Local</Text>
        </View>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
        {tabs.map((tab) => (
          <Pressable key={tab.screen} onPress={() => setScreen(tab.screen)} style={({ pressed }) => [styles.tab, screen === tab.screen && styles.tabActive, pressed && styles.pressed]} android_ripple={{ color: colors.ripple, borderless: false }}>
            <Text style={[styles.tabText, screen === tab.screen && styles.tabTextActive]}>{tab.label}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

function Home({ entries, onRecord, onOpenEntry }: { entries: JournalEntry[]; onRecord: () => void; onOpenEntry: (id: string) => void }) {
  const latest = entries[0];
  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.heroCard}>
        <Text style={styles.eyebrow}>{formatLongDate(new Date().toISOString())}</Text>
        <Text style={styles.heroTitle}>{copy.homeTitle}</Text>
        <Text style={styles.body}>{copy.homeBody}</Text>
        <PrimaryButton label={Platform.select({ ios: "Start voice note", android: "Record voice note", default: "Record voice note" })} onPress={onRecord} />
      </View>
      <View style={styles.platformStrip}>
        <Text style={styles.stripText}>{copy.platformCue}</Text>
      </View>
      {latest ? <EntryCard entry={latest} onPress={() => onOpenEntry(latest.id)} label="Latest entry" /> : <EmptyCard title="No entries yet" text="Add local model files, then record a short note to create your first on-device reflection." />}
    </ScrollView>
  );
}

function Record({ recording, draftText, setDraftText, lastSaveError, onCopyError, onStart, onStop }: { recording: RecordingState; draftText: string; setDraftText: (text: string) => void; lastSaveError: string | null; onCopyError: () => void; onStart: () => void; onStop: () => void }) {
  const isRecording = recording.status === "recording";
  const disabled = recording.status === "requestingPermission" || recording.status === "processing";
  const statusText = getRecordingStatusText(recording);
  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={[styles.recorderCard, isRecording && styles.recorderCardActive]}>
        <View style={styles.recorderTopRow}>
          <Text style={styles.eyebrow}>{copy.recordTitle}</Text>
          <RecordingPill recording={recording} />
        </View>
        <View style={styles.meterWrap}>
          <View style={[styles.meterRing, isRecording && styles.meterRingActive]}>
            <Text style={styles.timer}>{formatDuration(recording.seconds)}</Text>
          </View>
        </View>
        <Text style={styles.bodyCentered}>{statusText}</Text>
      </View>
      <TextInput value={draftText} onChangeText={setDraftText} multiline placeholder={copy.inputPlaceholder} placeholderTextColor={colors.muted} style={styles.input} />
      {isRecording ? <DangerButton label="Stop and save" onPress={onStop} disabled={disabled} /> : <PrimaryButton label={disabled ? "Preparing…" : "Start recording"} onPress={onStart} disabled={disabled} />}
      {lastSaveError ? <ErrorCard message={lastSaveError} onCopy={onCopyError} /> : null}
      <Text style={styles.note}>{copy.recordNote}</Text>
    </ScrollView>
  );
}

function ErrorCard({ message, onCopy }: { message: string; onCopy: () => void }) {
  return (
    <View style={styles.errorCard}>
      <Text style={styles.cardTitle}>Offline AI details</Text>
      <ScrollView style={styles.errorScroll} contentContainerStyle={styles.errorScrollContent}>
        <Text selectable style={styles.errorText}>{message}</Text>
      </ScrollView>
      <DangerButton label="Copy error" onPress={onCopy} />
    </View>
  );
}

function getRecordingStatusText(recording: RecordingState) {
  if (recording.status === "requestingPermission") {
    return Platform.select({ ios: "Waiting for microphone permission.", android: "Waiting for microphone permission.", default: "Waiting for microphone permission." });
  }
  if (recording.status === "recording") {
    return copy.recordActive;
  }
  if (recording.status === "processing") {
    return copy.recordBusy;
  }
  if (recording.status === "error") {
    return recording.error ?? "Recording stopped. Try again.";
  }
  return copy.recordIdle;
}

function RecordingPill({ recording }: { recording: RecordingState }) {
  const isRecording = recording.status === "recording";
  const label = isRecording ? "Recording" : recording.status === "idle" ? "Ready" : recording.status === "processing" ? "Saving" : "Permission";
  return (
    <View style={[styles.recordingPill, isRecording && styles.recordingPillActive]}>
      <View style={[styles.recordDot, isRecording && styles.recordDotActive]} />
      <Text style={[styles.recordingPillText, isRecording && styles.recordingPillTextActive]}>{label}</Text>
    </View>
  );
}

function Entries({ entries, onOpenEntry, onDeleteEntry }: { entries: JournalEntry[]; onOpenEntry: (id: string) => void; onDeleteEntry: (id: string) => void }) {
  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.title}>Entries</Text>
      {entries.length === 0 ? <EmptyCard title="No saved entries" text="Saved voice notes appear here." /> : entries.map((entry) => <EntryCard key={entry.id} entry={entry} onPress={() => onOpenEntry(entry.id)} onDelete={() => onDeleteEntry(entry.id)} />)}
    </ScrollView>
  );
}

function Detail({ entry, onBack, onDeleteEntry }: { entry: JournalEntry | null; onBack: () => void; onDeleteEntry: (id: string) => void }) {
  if (!entry) {
    return <EmptyState title="Entry not found" action="Back to entries" onPress={onBack} />;
  }
  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.eyebrow}>{formatLongDate(entry.createdAt)} · {formatDuration(entry.durationSeconds)}</Text>
      <Text style={styles.title}>{entry.title}</Text>
      <InfoRow label="Topic" value={entry.topic} />
      <InfoRow label="Mood" value={entry.mood} />
      <InfoRow label="Observation" value={entry.observation} />
      <Text style={styles.sectionTitle}>Transcript</Text>
      <View style={styles.transcriptCard}>
        <Text style={styles.cardText}>{entry.transcript}</Text>
      </View>
      <DangerButton label="Delete note" onPress={() => onDeleteEntry(entry.id)} />
      <SecondaryButton label="Back to entries" onPress={onBack} />
    </ScrollView>
  );
}

function Recap({ entries }: { entries: JournalEntry[] }) {
  const weekEntries = entries.slice(0, 7);
  const topics = [...new Set(weekEntries.map((entry) => entry.topic))];
  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.title}>Weekly recap</Text>
      <Text style={styles.body}>Summary from saved local entries only.</Text>
      <InfoRow label="Entries" value={`${weekEntries.length}`} />
      <InfoRow label="Topics" value={topics.length > 0 ? topics.join(", ") : "None yet"} />
      <InfoRow label="Pattern" value={weekEntries.length > 1 ? "Several moments captured. Review titles for recurring themes." : "Record more entries to reveal patterns."} />
    </ScrollView>
  );
}

function Settings({ modelStatus, reflectionSettings, onReflectionSettingsChange, onResetGuidance, onCopyPromptTemplate, onSaveSettings, onResetSettings, onImportModel, onResetModel, onCheckOfflineAI, onClear }: { modelStatus: ReflectionModelStatus; reflectionSettings: ReflectionSettings; onReflectionSettingsChange: (patch: Partial<ReflectionSettings>) => void; onResetGuidance: () => void; onCopyPromptTemplate: () => void; onSaveSettings: () => void; onResetSettings: () => void; onImportModel: () => void; onResetModel: () => void; onCheckOfflineAI: () => void; onClear: () => void }) {
  const promptTemplate = buildReflectionPromptTemplate(reflectionSettings);
  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.title}>Privacy</Text>
      <View style={styles.privacyCard}>
        <Text style={styles.cardTitle}>Transparent by design</Text>
        <Text style={styles.cardText}>{copy.privacyDevice}</Text>
      </View>
      <View style={styles.privacyCardMuted}>
        <Text style={styles.cardText}>{copy.privacyPlatform}</Text>
      </View>
      <View style={styles.privacyCard}>
        <Text style={styles.cardTitle}>Reflection model</Text>
        <InfoRow label="Status" value={`${modelStatus.source}: ${modelStatus.title}`} />
        <Text style={styles.cardText}>{modelStatus.detail}</Text>
        <SecondaryButton label="Check offline AI" onPress={onCheckOfflineAI} />
        <PrimaryButton label="Import GGUF" onPress={onImportModel} />
        <SecondaryButton label="Reset to default" onPress={onResetModel} />
        <Text style={styles.note}>No downloads or hidden swaps. Imported models stay local in app documents. Current source/status is shown above. Suggested families: Qwen or SmolLM GGUF, balanced for device memory. You are responsible for model license compliance.</Text>
      </View>
      <View style={styles.privacyCard}>
        <Text style={styles.cardTitle}>Reflection guidance</Text>
        <TextInput value={reflectionSettings.guidance} onChangeText={(guidance) => onReflectionSettingsChange({ guidance })} multiline placeholder="Reflection guidance" placeholderTextColor={colors.muted} style={styles.promptInput} />
        <SecondaryButton label="Reset guidance to default" onPress={onResetGuidance} />
        <Text style={styles.note}>Guidance influences tone/content and stays local. Everything outside the API contract below is editable here or via toggles.</Text>
        <ToggleRow label="No advice" value={reflectionSettings.noAdvice} onToggle={() => onReflectionSettingsChange({ noAdvice: !reflectionSettings.noAdvice })} />
        <ToggleRow label="No chat" value={reflectionSettings.noChat} onToggle={() => onReflectionSettingsChange({ noChat: !reflectionSettings.noChat })} />
        <ToggleRow label="No diagnosis" value={reflectionSettings.noDiagnosis} onToggle={() => onReflectionSettingsChange({ noDiagnosis: !reflectionSettings.noDiagnosis })} />
        <ToggleRow label="No coaching" value={reflectionSettings.noCoaching} onToggle={() => onReflectionSettingsChange({ noCoaching: !reflectionSettings.noCoaching })} />
        <ToggleRow label="Observation one sentence" value={reflectionSettings.oneSentenceObservation} onToggle={() => onReflectionSettingsChange({ oneSentenceObservation: !reflectionSettings.oneSentenceObservation })} />
      </View>
      <View style={styles.privacyCard}>
        <Text style={styles.cardTitle}>Advanced reflection</Text>
        <SettingNumberInput label="Temperature" value={`${reflectionSettings.temperature}`} onChangeText={(value) => onReflectionSettingsChange({ temperature: Number(value) })} />
        <SettingNumberInput label="Max tokens" value={`${reflectionSettings.maxTokens}`} onChangeText={(value) => onReflectionSettingsChange({ maxTokens: Number(value) })} />
        <Text style={styles.note}>Temperature is clamped 0–1. Max tokens clamped 64–512. Apple Foundation Models may ignore generation numbers; prompt controls still apply.</Text>
        <PrimaryButton label="Save reflection settings" onPress={onSaveSettings} />
        <SecondaryButton label="Reset reflection settings" onPress={onResetSettings} />
      </View>
      <View style={styles.privacyCard}>
        <Text style={styles.cardTitle}>Prompt transparency</Text>
        <Text style={styles.note}>Enforced API contract only:</Text>
        <View style={styles.transcriptCard}>
          <Text selectable style={styles.errorText}>{REQUIRED_REFLECTION_API_CONTRACT}</Text>
        </View>
        <Text style={styles.note}>Active template sent before transcript/duration:</Text>
        <ScrollView style={styles.errorScroll} contentContainerStyle={styles.errorScrollContent}>
          <Text selectable style={styles.errorText}>{promptTemplate}</Text>
        </ScrollView>
        <SecondaryButton label="Copy active template" onPress={onCopyPromptTemplate} />
      </View>
      <DangerButton label="Clear local entries" onPress={() => Alert.alert("Clear entries?", "This removes local journal entries from this app install.", [{ text: "Cancel", style: "cancel" }, { text: "Clear", style: "destructive", onPress: onClear }])} />
    </ScrollView>
  );
}

function ToggleRow({ label, value, onToggle }: { label: string; value: boolean; onToggle: () => void }) {
  return (
    <Pressable onPress={onToggle} style={({ pressed }) => [styles.toggleRow, pressed && styles.pressed]}>
      <Text style={styles.cardText}>{label}</Text>
      <Text style={styles.toggleValue}>{value ? "On" : "Off"}</Text>
    </Pressable>
  );
}

function SettingNumberInput({ label, value, onChangeText }: { label: string; value: string; onChangeText: (value: string) => void }) {
  return (
    <View style={styles.settingInputRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <TextInput value={value} onChangeText={onChangeText} keyboardType="decimal-pad" style={styles.numberInput} />
    </View>
  );
}

function EntryCard({ entry, onPress, onDelete, label }: { entry: JournalEntry; onPress: () => void; onDelete?: () => void; label?: string }) {
  return (
    <View style={styles.card}>
      <Pressable onPress={onPress} style={({ pressed }) => [styles.entryPress, pressed && styles.pressed]} android_ripple={{ color: colors.ripple }}>
        {label ? <Text style={styles.eyebrow}>{label}</Text> : null}
        <Text style={styles.cardTitle}>{entry.title}</Text>
        <Text style={styles.cardText}>{formatShortDate(entry.createdAt)} · {entry.mood} · {entry.topic}</Text>
      </Pressable>
      {onDelete ? <SecondaryButton label="Delete note" onPress={onDelete} /> : null}
    </View>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return <View style={styles.infoRow}><Text style={styles.infoLabel}>{label}</Text><Text style={styles.infoValue}>{value}</Text></View>;
}

function EmptyCard({ title, text }: { title: string; text: string }) {
  return <View style={styles.card}><Text style={styles.cardTitle}>{title}</Text><Text style={styles.cardText}>{text}</Text></View>;
}

function EmptyState({ title, action, onPress }: { title: string; action: string; onPress: () => void }) {
  return <View style={styles.content}><Text style={styles.title}>{title}</Text><SecondaryButton label={action} onPress={onPress} /></View>;
}

function PrimaryButton({ label, onPress, disabled = false }: { label: string; onPress: () => void; disabled?: boolean }) {
  return <Pressable onPress={onPress} disabled={disabled} style={({ pressed }) => [styles.button, disabled && styles.disabled, pressed && styles.pressed]} android_ripple={{ color: colors.rippleLight }}><Text style={styles.buttonText}>{label}</Text></Pressable>;
}

function SecondaryButton({ label, onPress }: { label: string; onPress: () => void }) {
  return <Pressable onPress={onPress} style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]} android_ripple={{ color: colors.ripple }}><Text style={styles.secondaryButtonText}>{label}</Text></Pressable>;
}

function DangerButton({ label, onPress, disabled = false }: { label: string; onPress: () => void; disabled?: boolean }) {
  return <Pressable onPress={onPress} disabled={disabled} style={({ pressed }) => [styles.dangerButton, disabled && styles.disabled, pressed && styles.pressed]} android_ripple={{ color: "rgba(255,255,255,0.18)" }}><Text style={styles.buttonText}>{label}</Text></Pressable>;
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

const colors = {
  canvas: "#f6efe4",
  ink: "#241d18",
  body: "#504239",
  muted: "#8a7665",
  card: "#fffaf2",
  cardSoft: "#efe2d1",
  accent: "#c56b45",
  danger: "#9d2f25",
  ripple: "rgba(36,29,24,0.12)",
  rippleLight: "rgba(255,250,242,0.18)"
};

const shadow = Platform.select({
  ios: { shadowColor: "#5b4032", shadowOpacity: 0.11, shadowRadius: 24, shadowOffset: { width: 0, height: 14 } },
  android: { elevation: 2 },
  default: {}
});

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.canvas },
  shell: { flex: 1, paddingTop: Platform.select({ ios: 12, android: 8, default: 12 }) },
  header: { paddingTop: 4 },
  brandRow: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 20 },
  appTitle: { color: colors.ink, fontSize: 31, fontWeight: "800", letterSpacing: -0.6 },
  appSubtitle: { color: colors.muted, fontSize: 13, fontWeight: "600", marginTop: 2 },
  localBadge: { alignItems: "center", backgroundColor: colors.card, borderRadius: 999, flexDirection: "row", gap: 6, paddingHorizontal: 10, paddingVertical: 7 },
  localDot: { backgroundColor: "#4d7f54", borderRadius: 999, height: 7, width: 7 },
  localBadgeText: { color: colors.body, fontSize: 12, fontWeight: "800" },
  tabs: { gap: 8, padding: 16, paddingBottom: 12 },
  tab: { backgroundColor: colors.cardSoft, borderRadius: Platform.select({ ios: 999, android: 18, default: 999 }), overflow: "hidden", paddingHorizontal: 14, paddingVertical: 9 },
  tabActive: { backgroundColor: colors.ink },
  tabText: { color: colors.body, fontSize: 14, fontWeight: "700" },
  tabTextActive: { color: colors.card },
  content: { gap: 16, padding: 20, paddingBottom: 44 },
  heroCard: { backgroundColor: colors.card, borderRadius: Platform.select({ ios: 30, android: 24, default: 28 }), gap: 14, overflow: "hidden", padding: 22, ...shadow },
  platformStrip: { backgroundColor: "#ead7c3", borderLeftColor: colors.accent, borderLeftWidth: 4, borderRadius: 16, padding: 14 },
  stripText: { color: colors.body, fontSize: 14, fontWeight: "700", lineHeight: 20 },
  eyebrow: { color: colors.muted, fontSize: 12, fontWeight: "800", letterSpacing: 0.8, textTransform: "uppercase" },
  heroTitle: { color: colors.ink, fontSize: 34, fontWeight: "900", letterSpacing: -1.1, lineHeight: 39 },
  title: { color: colors.ink, fontSize: 29, fontWeight: "900", letterSpacing: -0.7, lineHeight: 35 },
  sectionTitle: { color: colors.ink, fontSize: 18, fontWeight: "900" },
  body: { color: colors.body, fontSize: 16, lineHeight: 23 },
  bodyCentered: { color: colors.body, fontSize: 16, lineHeight: 23, textAlign: "center" },
  note: { color: colors.muted, fontSize: 13, lineHeight: 19, textAlign: Platform.select({ ios: "center", android: "left", default: "left" }) },
  recorderCard: { alignItems: "center", backgroundColor: colors.card, borderRadius: Platform.select({ ios: 32, android: 24, default: 28 }), gap: 18, padding: 22, ...shadow },
  recorderCardActive: { backgroundColor: "#fff4ed" },
  recorderTopRow: { alignItems: "center", alignSelf: "stretch", flexDirection: "row", justifyContent: "space-between" },
  meterWrap: { alignItems: "center", paddingVertical: 8 },
  meterRing: { alignItems: "center", borderColor: "#ead7c3", borderRadius: 999, borderWidth: 10, height: 188, justifyContent: "center", width: 188 },
  meterRingActive: { borderColor: colors.accent },
  timer: { color: colors.ink, fontSize: 48, fontVariant: ["tabular-nums"], fontWeight: "900", letterSpacing: -1.2, textAlign: "center" },
  recordingPill: { alignItems: "center", backgroundColor: colors.cardSoft, borderRadius: 999, flexDirection: "row", gap: 6, paddingHorizontal: 10, paddingVertical: 7 },
  recordingPillActive: { backgroundColor: colors.ink },
  recordingPillText: { color: colors.body, fontSize: 12, fontWeight: "800" },
  recordingPillTextActive: { color: colors.card },
  recordDot: { backgroundColor: colors.muted, borderRadius: 999, height: 7, width: 7 },
  recordDotActive: { backgroundColor: colors.accent },
  input: { backgroundColor: colors.card, borderColor: "#e5d7c6", borderRadius: Platform.select({ ios: 20, android: 14, default: 18 }), borderWidth: 1, color: colors.ink, fontSize: 16, lineHeight: 22, minHeight: 124, padding: 16, textAlignVertical: "top" },
  card: { backgroundColor: colors.card, borderRadius: Platform.select({ ios: 22, android: 18, default: 20 }), gap: 8, overflow: "hidden", padding: 18, ...shadow },
  entryPress: { gap: 8 },
  transcriptCard: { backgroundColor: colors.card, borderRadius: 18, padding: 18 },
  errorCard: { backgroundColor: "#fff1ec", borderColor: colors.danger, borderRadius: 22, borderWidth: 1, gap: 10, padding: 16, ...shadow },
  errorScroll: { backgroundColor: colors.card, borderRadius: 14, maxHeight: 220 },
  errorScrollContent: { padding: 12 },
  errorText: { color: colors.ink, fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: undefined }), fontSize: 12, lineHeight: 18 },
  promptInput: { backgroundColor: "#f3e6d6", borderColor: "#e5d7c6", borderRadius: 14, borderWidth: 1, color: colors.ink, fontSize: 14, lineHeight: 20, minHeight: 220, padding: 14, textAlignVertical: "top" },
  toggleRow: { alignItems: "center", backgroundColor: "#f3e6d6", borderRadius: 14, flexDirection: "row", justifyContent: "space-between", padding: 14 },
  toggleValue: { color: colors.ink, fontSize: 14, fontWeight: "900" },
  settingInputRow: { backgroundColor: "#f3e6d6", borderRadius: 14, gap: 8, padding: 14 },
  numberInput: { backgroundColor: colors.card, borderColor: "#e5d7c6", borderRadius: 10, borderWidth: 1, color: colors.ink, fontSize: 16, fontWeight: "700", padding: 12 },
  privacyCard: { backgroundColor: colors.card, borderRadius: 22, gap: 8, padding: 18, ...shadow },
  privacyCardMuted: { backgroundColor: colors.cardSoft, borderRadius: 18, padding: 16 },
  cardTitle: { color: colors.ink, fontSize: 20, fontWeight: "900", letterSpacing: -0.2 },
  cardText: { color: colors.body, fontSize: 15, lineHeight: 22 },
  infoRow: { backgroundColor: colors.card, borderRadius: Platform.select({ ios: 18, android: 14, default: 16 }), gap: 4, padding: 15 },
  infoLabel: { color: colors.muted, fontSize: 12, fontWeight: "900", letterSpacing: 0.6, textTransform: "uppercase" },
  infoValue: { color: colors.ink, fontSize: 16, fontWeight: "700", lineHeight: 22 },
  button: { alignItems: "center", backgroundColor: colors.ink, borderRadius: Platform.select({ ios: 18, android: 14, default: 16 }), overflow: "hidden", padding: 16 },
  dangerButton: { alignItems: "center", backgroundColor: colors.danger, borderRadius: Platform.select({ ios: 18, android: 14, default: 16 }), overflow: "hidden", padding: 16 },
  secondaryButton: { alignItems: "center", borderColor: colors.ink, borderRadius: Platform.select({ ios: 18, android: 14, default: 16 }), borderWidth: 1, overflow: "hidden", padding: 16 },
  buttonText: { color: colors.card, fontSize: 16, fontWeight: "900" },
  secondaryButtonText: { color: colors.ink, fontSize: 16, fontWeight: "900" },
  disabled: { opacity: 0.55 },
  pressed: { opacity: Platform.select({ ios: 0.72, android: 0.94, default: 0.8 }) }
});
