import { Check, CheckCheck, CircleAlert, Clock, Forward, type LucideIcon } from "lucide-react-native";
import { memo, useMemo, useState } from "react";
import { Pressable, View, useWindowDimensions } from "react-native";
import { useTranslations } from "use-intl";

import { MediaBubble } from "@/chats/MediaBubble";
import { clockTime } from "@/chats/format";
import { tickFor } from "@/chats/timeline";
import { groupReactions, outboundDeliveryStatus, type MessageReaction, type OutboundDelivery, type RpcMessageRow } from "@/data";
import { Icon, Text, useTheme } from "@/ui";

type DeliveryContext = Parameters<typeof outboundDeliveryStatus>[1];

const DELIVERY_ICON: Record<OutboundDelivery, LucideIcon> = {
  pending: Clock,
  failed: CircleAlert,
  sent: Check,
  delivered: CheckCheck,
  read: CheckCheck,
};

export type MessageBubbleProps = {
  item: RpcMessageRow;
  mine: boolean;
  userId: string;
  /** Conversation detail, used for delivery/read state of own messages. */
  detail: DeliveryContext;
  reactions: MessageReaction[] | undefined;
  quote: string | null;
  /** Quote author line (web `.quoteAuthor`). */
  quoteAuthor?: string | null;
  quoteSelf?: boolean;
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
  quoteAuthor,
  quoteSelf,
  grouped,
  dayLabel,
  unreadDivider,
  onLongPress,
  onToggleReaction,
}: MessageBubbleProps) {
  const t = useTranslations();
  const { colors, spacing, radii, shadows, fontWeights, fontSizes } = useTheme();
  // Measured width of the inline meta, reserved at the end of the text so the last line leaves room for it.
  const [metaWidth, setMetaWidth] = useState(64);
  const deleted = item.deletion_scope === "everyone";
  const delivery = mine ? outboundDeliveryStatus(item, detail) : null;
  const tick = delivery ? tickFor(delivery) : null;
  const groups = useMemo(() => (reactions?.length ? groupReactions(reactions, userId) : []), [reactions, userId]);
  const isMedia = !deleted && (item.type === "image" || item.type === "audio");
  const metaColor = colors.bubbleMeta;
  const bubbleColor = mine ? colors.bubbleOut : colors.bubbleIn;
  const { width } = useWindowDimensions();
  const quoteColor = quoteSelf ? colors.accent : colors.sender3;

  if (item.type === "system") {
    return (
      <View
        style={{
          alignSelf: "center",
          marginVertical: spacing.s12,
          paddingHorizontal: spacing.s12,
          paddingVertical: 5,
          borderRadius: radii.control,
          backgroundColor: colors.system,
          ...shadows.bubble,
        }}
      >
        <Text style={{ fontSize: 12.5, color: colors.textMuted, textAlign: "center" }}>{item.body ?? ""}</Text>
      </View>
    );
  }

  return (
    <View style={{ marginTop: grouped ? spacing.s2 : spacing.s8, paddingHorizontal: Math.min(72, Math.max(spacing.s16, width * 0.06)) }}>
      {dayLabel ? (
        <View
          style={{
            alignSelf: "center",
            marginVertical: spacing.s12,
            paddingHorizontal: spacing.s12,
            paddingVertical: 5,
            borderRadius: radii.control,
            backgroundColor: colors.system,
            ...shadows.bubble,
          }}
        >
          <Text style={{ fontSize: 12.5, color: colors.textMuted }}>{dayLabel}</Text>
        </View>
      ) : null}
      {unreadDivider ? (
        <View style={{ alignSelf: "stretch", marginVertical: spacing.s12, padding: 5, backgroundColor: `${colors.panel}b3` }}>
          <Text style={{ fontSize: 12.5, color: colors.textMuted, textAlign: "center" }}>
            {t("mobile.chats.unreadDivider")}
          </Text>
        </View>
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
        {item.forwarded && !deleted ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.s4, marginBottom: spacing.s2 }}>
            <Icon icon={Forward} size={14} tone="textMuted" flipRtl />
            <Text style={{ fontSize: 12.5, fontStyle: "italic", color: colors.textMuted }}>
              {t("mobile.chats.forwarded")}
            </Text>
          </View>
        ) : null}
        {item.reply_to_id && !deleted ? (
          <View
            style={{
              borderStartWidth: 4,
              borderStartColor: quoteColor,
              backgroundColor: colors.quote,
              borderRadius: 6,
              marginTop: -2,
              marginStart: -5,
              marginEnd: -4,
              paddingStart: spacing.s8,
              paddingEnd: spacing.s12,
              paddingVertical: 6,
              marginBottom: spacing.s4,
            }}
          >
            {quoteAuthor ? (
              <Text variant="caption" style={{ color: quoteColor, fontWeight: fontWeights.medium }}>
                {quoteAuthor}
              </Text>
            ) : null}
            <Text variant="caption" numberOfLines={2} style={{ color: colors.textMuted }}>
              {quote ?? "…"}
            </Text>
          </View>
        ) : null}
        {isMedia ? (
          <MediaBubble messageId={item.id} type={item.type as "image" | "audio"} />
        ) : (
          <Text
            style={{
              fontSize: fontSizes.md,
              lineHeight: Math.round(fontSizes.md * 1.38),
              ...(deleted ? { fontStyle: "italic", color: colors.textMuted } : null),
            }}
          >
            {deleted ? t("mobile.chats.deleted") : item.type === "text" ? item.body : t("mobile.chats.unsupported")}
            {/* Reserves the meta's footprint so it sits on the last line when it fits (web float: inline-end). */}
            {isMedia ? null : <View style={{ width: metaWidth, height: 1 }} />}
          </Text>
        )}
        <View
          onLayout={(e) => {
            const w = Math.ceil(e.nativeEvent.layout.width) + 8;
            if (!isMedia && Math.abs(w - metaWidth) > 1) setMetaWidth(w);
          }}
          style={
            isMedia
              ? { flexDirection: "row", alignItems: "center", alignSelf: "flex-end", gap: 3, marginTop: spacing.s2 }
              : {
                  position: "absolute",
                  end: 6,
                  bottom: 6,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 3,
                }
          }
        >
          {item.edited_at && !deleted ? (
            <Text style={{ fontSize: fontSizes.xs, lineHeight: 15, color: metaColor }}>
              {t("mobile.actions.edited")} ·
            </Text>
          ) : null}
          <Text style={{ fontSize: fontSizes.xs, lineHeight: 15, color: metaColor }}>{clockTime(item.created_at)}</Text>
          {tick && delivery ? (
            <View accessible accessibilityLabel={t(tick.labelKey)}>
              <Icon
                icon={DELIVERY_ICON[delivery]}
                size={delivery === "pending" ? 14 : 16}
                color={tick.read ? colors.read : delivery === "failed" ? colors.danger : metaColor}
              />
            </View>
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
