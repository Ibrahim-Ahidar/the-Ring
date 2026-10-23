import { AudioModule, RecordingPresets, setAudioModeAsync, useAudioRecorder } from "expo-audio";
import * as ImagePicker from "expo-image-picker";
import { useEffect, useRef, useState } from "react";
import { Paperclip } from "lucide-react-native";
import { Alert } from "react-native";
import { useTranslations } from "use-intl";

import { IconButton, Text } from "@/ui";
import { AUDIO_MAX_DURATION_MS, type MediaUploadInput } from "@/data";

type Upload = Omit<MediaUploadInput, "conversationId" | "clientId">;

/**
 * Photo picker and voice-note recorder for the composer. The attach button sits on the left of the
 * input; `recording` / `toggleRecording` drive the round accent button on the right (mic when the
 * draft is empty), as on the web.
 */
export function useMediaComposer({ disabled, onUpload }: { disabled: boolean; onUpload: (u: Upload) => void }) {
  const t = useTranslations();
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [recording, setRecording] = useState(false);
  const startedAt = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  async function pickImage() {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.8 });
    const asset = result.assets?.[0];
    if (result.canceled || !asset) return;
    onUpload({
      uri: asset.uri,
      mimeType: asset.mimeType ?? "image/jpeg",
      fileName: asset.fileName ?? null,
      width: asset.width,
      height: asset.height,
    });
  }

  async function stopAndSend() {
    if (timer.current) clearTimeout(timer.current);
    const durationMs = Date.now() - startedAt.current;
    setRecording(false);
    await recorder.stop();
    await setAudioModeAsync({ allowsRecording: false });
    if (recorder.uri) {
      onUpload({
        uri: recorder.uri,
        mimeType: "audio/mp4",
        fileName: "voice-note.m4a",
        durationMs: Math.min(durationMs, AUDIO_MAX_DURATION_MS),
      });
    }
  }

  async function start() {
    const permission = await AudioModule.requestRecordingPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(t("mobile.media.record"), t("mobile.media.permission"));
      return;
    }
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
    await recorder.prepareToRecordAsync();
    recorder.record();
    startedAt.current = Date.now();
    setRecording(true);
    timer.current = setTimeout(() => void stopAndSend(), AUDIO_MAX_DURATION_MS);
  }

  const attach = recording ? null : (
    <IconButton
      icon={Paperclip}
      label={t("mobile.media.attach")}
      onPress={() => void pickImage()}
      disabled={disabled}
    />
  );
  const recordingLabel = recording ? (
    <Text variant="caption" tone="danger" style={{ flex: 1, paddingHorizontal: 4, paddingVertical: 14 }}>
      {t("mobile.media.recording")}
    </Text>
  ) : null;
  return {
    attach,
    recordingLabel,
    recording,
    toggleRecording: () => void (recording ? stopAndSend() : start()),
  };
}
