import { memo, useMemo } from "react";
import { Pressable, View, useWindowDimensions } from "react-native";
import { useTranslations } from "use-intl";

import { MediaBubble } from "@/chats/MediaBubble";
import { clockTime } from "@/chats/format";
import { tickFor } from "@/chats/timeline";
import { groupReactions, outboundDeliveryStatus, type MessageReaction, type RpcMessageRow } from "@/data";
import { Text, useTheme } from "@/ui";

type DeliveryContext = Parameters<typeof outboundDeliveryStatus>[1];

export type MessageBubbleProps = {
  item: RpcMessageRow;
  mine: boolean;
  userId: string;
  /** Conversation detail, used for delivery/read state of own messages. */
  detail: DeliveryContext;
  reactions: MessageReaction[] | undefined;
  quote: string | null;
  /** Same sender and day as the older neighbour: tighten spacing. */
  grouped: boolean;
  /** Day separator drawn above this message. */
  dayLabel: string | null;
  unreadDivider: boolean;
  onLongPress: (item: RpcMessageRow) => void;
  onToggleReaction: (messageId: string, emoji: string, op: "add" | "remove") => void;
};

/** One message: day separator, unread divider, bubble, reactions. Memoized for list performance. */
export const MessageBubble = memo(function MessageBubble({
  item,
  mine,
  userId,
  detail,
  reactions,
  quote,
  grouped,
  dayLabel,
  unreadDivider,
  onLongPress,
  onToggleReaction,
}: MessageBubbleProps) {
  const t = useTranslations();
  const { colors, spacing, radii, shadows, fontSizes } = useTheme();
  const deleted = item.deletion_scope === "everyone";
  const tick = mine ? tickFor(outboundDeliveryStatus(item, detail)) : null;
  const groups = useMemo(() => (reactions?.length ? groupReactions(reactions, userId) : []), [reactions, userId]);
  const isMedia = !deleted && (item.type === "image" || item.type === "audio");
  const metaColor = colors.bubbleMeta;
  const bubbleColor = mine ? colors.bubbleOut : colors.bubbleIn;
  const { width } = useWindowDimensions();

  return (
    <View style={{ marginTop: grouped ? spacing.s2 : spacing.s8, paddingHorizontal: Math.min(72, Math.max(spacing.s16, width * 0.06)) }}>
      {dayLabel ? (
        <View
          style={{
            alignSelf: "center",
            marginVertical: spacing.s8,
            paddingHorizontal: spacing.s12,
            paddingVertical: spacing.s4,
            borderRadius: radii.pill,
            backgroundColor: colors.system,
          }}
        >
          <Text variant="micro">{dayLabel}</Text>
        </View>
      ) : null}
      {unreadDivider ? (
        <Text variant="micro" tone="accentStrong" style={{ alignSelf: "center", marginVertical: spacing.s8 }}>
          {t("mobile.chats.unreadDivider")}
        </Text>
      ) : null}
      <Pressable
        onLongPress={() => onLongPress(item)}
        accessibilityHint={t("mobile.actions.menuTitle")}
        style={[
          {
            // Web phone bubble: max 85%, padding 6/8/8/9, squared corner + tail on a group's first message.
            maxWidth: "85%",
            alignSelf: mine ? "flex-end" : "flex-start",
            paddingTop: 6,
            paddingBottom: spacing.s8,
            paddingStart: 9,
            paddingEnd: spacing.s8,
            borderRadius: radii.bubble,
            ...(grouped ? null : mine ? { borderTopEndRadius: 0 } : { borderTopStartRadius: 0 }),
            backgroundColor: bubbleColor,
          },
          shadows.bubble,
        ]}
      >
        {grouped ? null : (
          <View
            pointerEvents="none"
            style={{
              position: "absolute",
              top: 0,
              ...(mine ? { end: -8 } : { start: -8 }),
              width: 0,
              height: 0,
              borderTopWidth: 13,
              borderTopColor: bubbleColor,
              ...(mine
                ? { borderEndWidth: 8, borderEndColor: "transparent" }
                : { borderStartWidth: 8, borderStartColor: "transparent" }),
            }}
          />
        )}
        {item.reply_to_id ? (
          <View
            style={{
              borderStartWidth: 3,
              borderStartColor: colors.accent,
              backgroundColor: colors.quote,
              borderRadius: radii.control / 2,
              paddingStart: spacing.s8,
              paddingEnd: spacing.s8,
              paddingVertical: spacing.s4,
              marginBottom: spacing.s4,
            }}
          >
            <Text variant="caption" numberOfLines={2}>
              {quote ?? "…"}
            </Text>
          </View>
        ) : null}
        {isMedia ? (
          <MediaBubble messageId={item.id} type={item.type as "image" | "audio"} />
        ) : (
          <Text variant="body" style={deleted ? { fontStyle: "italic", color: colors.textMuted } : undefined}>
            {deleted ? t("mobile.chats.deleted") : item.type === "text" ? item.body : t("mobile.chats.unsupported")}
          </Text>
        )}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            alignSelf: "flex-end",
            gap: spacing.s4,
            marginTop: spacing.s2,
          }}
        >
          {item.edited_at && !deleted ? (
            <Text variant="micro" style={{ color: metaColor }}>
              {t("mobile.actions.edited")}
            </Text>
          ) : null}
          <Text variant="micro" style={{ color: metaColor }}>
            {clockTime(item.created_at)}
          </Text>
          {tick ? (
            <Text
              variant="micro"
              accessibilityLabel={t(tick.labelKey)}
              style={{
                fontSize: fontSizes.xs,
                color: tick.read ? colors.read : tick.glyph === "!" ? colors.danger : metaColor,
              }}
            >
              {tick.glyph}
            </Text>
          ) : null}
        </View>
      </Pressable>
      {!deleted && groups.length > 0 ? (
        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            gap: spacing.s4,
            marginTop: spacing.s2,
            alignSelf: mine ? "flex-end" : "flex-start",
          }}
        >
          {groups.map((g) => (
            <Pressable
              key={g.emoji}
              onPress={() => onToggleReaction(item.id, g.emoji, g.mine ? "remove" : "add")}
              accessibilityRole="button"
              accessibilityLabel={t("mobile.actions.reactionLabel", { emoji: g.emoji })}
              hitSlop={spacing.s8}
              style={{
                paddingHorizontal: spacing.s8,
                paddingVertical: spacing.s2,
                borderRadius: radii.pill,
                backgroundColor: g.mine ? colors.accentSoft : colors.input,
              }}
            >
              <Text variant="caption" style={{ color: g.mine ? colors.accentStrong : colors.text }}>
                {g.emoji} {g.count}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
});
