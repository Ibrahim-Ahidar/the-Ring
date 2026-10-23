import { useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import { Mic, Pause, Play } from "lucide-react-native";
import { useMemo } from "react";
import { Image, Pressable, View } from "react-native";
import { useTranslations } from "use-intl";

import { useMessageMedia } from "@/chats/queries";
import { Icon, Spinner, Text, useTheme } from "@/ui";

function formatClock(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

const WAVE_BARS = 40;

/** Averages any length of samples into a fixed bar count (same as the web renderer). */
function resampleWaveform(samples: number[], bars: number): number[] {
  if (samples.length === 0) return [];
  return Array.from({ length: bars }, (_, index) => {
    const start = Math.floor((index * samples.length) / bars);
    const end = Math.max(start + 1, Math.floor(((index + 1) * samples.length) / bars));
    const slice = samples.slice(start, end);
    return Math.min(1, slice.reduce((sum, value) => sum + value, 0) / slice.length);
  });
}

function AudioPlayer({
  url,
  durationMs,
  waveform: rawWave,
}: {
  url: string;
  durationMs: number | null;
  waveform: unknown;
}) {
  const t = useTranslations();
  const { spacing, colors, radii } = useTheme();
  const player = useAudioPlayer({ uri: url });
  const status = useAudioPlayerStatus(player);
  const waveform = useMemo(
    () => (Array.isArray(rawWave) ? resampleWaveform(rawWave.map((v) => Number(v) || 0), WAVE_BARS) : []),
    [rawWave],
  );
  const total = durationMs ? durationMs / 1000 : status.duration || 0;
  const progress = total > 0 ? Math.min(1, status.currentTime / total) : 0;
  const playedBars = Math.round(progress * waveform.length);
  const started = status.playing || status.currentTime > 0;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10, width: 240, minWidth: 200, paddingTop: 2 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={status.playing ? t("mobile.media.pause") : t("mobile.media.play")}
        onPress={() => {
          if (status.playing) {
            player.pause();
            return;
          }
          if (status.duration > 0 && status.currentTime >= status.duration) void player.seekTo(0);
          player.play();
        }}
        style={{
          width: 40,
          height: 40,
          borderRadius: radii.pill,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: colors.accent,
        }}
      >
        <Icon icon={status.playing ? Pause : Play} size={18} color={colors.accentContrast} />
      </Pressable>
      <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
        {waveform.length > 0 ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 2, height: 26, overflow: "hidden" }}>
            {waveform.map((amp, index) => (
              <View
                key={index}
                style={{
                  flex: 1,
                  minWidth: 0,
                  borderRadius: 2,
                  height: `${Math.max(8, amp * 100)}%`,
                  backgroundColor: index < playedBars ? colors.accent : colors.bubbleMeta,
                  opacity: index < playedBars ? 1 : 0.55,
                }}
              />
            ))}
          </View>
        ) : (
          <View style={{ height: 4, marginVertical: 11, overflow: "hidden", borderRadius: radii.pill, backgroundColor: colors.bubbleMeta, opacity: 0.4 }}>
            <View style={{ height: "100%", width: `${progress * 100}%`, backgroundColor: colors.accent }} />
          </View>
        )}
        <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.s4, minHeight: 15 }}>
          <Icon icon={Mic} size={12} color={colors.bubbleMeta} />
          <Text variant="caption" style={{ color: colors.bubbleMeta, fontVariant: ["tabular-nums"] }}>
            {started ? `${formatClock(status.currentTime)} / ${formatClock(total)}` : formatClock(total)}
          </Text>
        </View>
      </View>
    </View>
  );
}

/** Renders the image or voice note of a finished media message. */
export function MediaBubble({ messageId, type }: { messageId: string; type: "image" | "audio" }) {
  const t = useTranslations();
  const media = useMessageMedia(messageId, true);
  const { radii } = useTheme();
  if (media.isPending) return <Spinner />;
  if (media.isError || !media.data) {
    return <Text tone="danger">{t("mobile.media.mediaLoadError")}</Text>;
  }
  const { attachment, url } = media.data;
  if (type === "audio") return <AudioPlayer url={url} durationMs={attachment.duration_ms} waveform={attachment.waveform} />;
  const ratio = attachment.width && attachment.height ? attachment.width / attachment.height : 1;
  return (
    <View>
      <Image
        source={{ uri: url }}
        style={{ width: 220, maxHeight: 320, borderRadius: radii.bubble, aspectRatio: ratio }}
        accessibilityLabel={t("mobile.media.photo")}
        resizeMode="cover"
      />
    </View>
  );
}
