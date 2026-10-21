import { useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import { Pause, Play } from "lucide-react-native";
import { Image, Pressable, View } from "react-native";
import { useTranslations } from "use-intl";

import { useMessageMedia } from "@/chats/queries";
import { Icon, Spinner, Text, useTheme } from "@/ui";

function formatClock(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function AudioPlayer({ url }: { url: string }) {
  const t = useTranslations();
  const { spacing, controlHeights } = useTheme();
  const player = useAudioPlayer({ uri: url });
  const status = useAudioPlayerStatus(player);
  return (
    <Pressable
      style={{ flexDirection: "row", alignItems: "center", gap: spacing.s8, minWidth: 160, minHeight: controlHeights.hit }}
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
      <Icon icon={status.playing ? Pause : Play} size={20} tone="text" />
      <Text variant="caption" tone="text">
        {t("mobile.media.voiceNote")} {formatClock(status.duration || 0)}
      </Text>
    </Pressable>
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
  if (type === "audio") return <AudioPlayer url={url} />;
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
