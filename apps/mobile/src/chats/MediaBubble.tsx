import { useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from "react-native";
import { useTranslations } from "use-intl";

import { useMessageMedia } from "@/chats/queries";

function formatClock(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function AudioPlayer({ url, mine }: { url: string; mine: boolean }) {
  const t = useTranslations();
  const player = useAudioPlayer({ uri: url });
  const status = useAudioPlayerStatus(player);
  return (
    <Pressable
      style={styles.audio}
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
    >
      <Text style={mine ? styles.mineText : undefined}>{status.playing ? "⏸" : "▶"}</Text>
      <Text style={[styles.dur, mine && styles.mineText]}>
        {t("mobile.media.voiceNote")} {formatClock(status.duration || 0)}
      </Text>
    </Pressable>
  );
}

/** Renders the image or voice note of a finished media message. */
export function MediaBubble({ messageId, type, mine }: { messageId: string; type: "image" | "audio"; mine: boolean }) {
  const t = useTranslations();
  const media = useMessageMedia(messageId, true);
  if (media.isPending) return <ActivityIndicator />;
  if (media.isError || !media.data) {
    return <Text style={mine ? styles.mineText : undefined}>{t("mobile.media.mediaLoadError")}</Text>;
  }
  const { attachment, url } = media.data;
  if (type === "audio") return <AudioPlayer url={url} mine={mine} />;
  const ratio = attachment.width && attachment.height ? attachment.width / attachment.height : 1;
  return (
    <View>
      <Image
        source={{ uri: url }}
        style={[styles.image, { aspectRatio: ratio }]}
        accessibilityLabel={t("mobile.media.photo")}
        resizeMode="cover"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  image: { width: 220, maxHeight: 320, borderRadius: 8 },
  audio: { flexDirection: "row", alignItems: "center", gap: 8, minWidth: 160 },
  dur: { fontSize: 13 },
  mineText: { color: "#fff" },
});
