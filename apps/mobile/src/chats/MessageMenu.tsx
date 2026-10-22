import { Copy, CornerUpLeft, Pencil, Trash2, type LucideIcon } from "lucide-react-native";
import { Pressable, View } from "react-native";
import { useTranslations } from "use-intl";

import { ALLOWED_REACTION_EMOJI, type MessageAction } from "@/data";
import { Icon, Sheet, Text, useTheme } from "@/ui";

const ACTION_ICON: Record<Exclude<MessageAction, "react">, LucideIcon> = {
  reply: CornerUpLeft,
  copy: Copy,
  edit: Pencil,
  delete: Trash2,
};
const ACTION_ORDER = ["reply", "copy", "edit", "delete"] as const;

type Props = {
  visible: boolean;
  actions: MessageAction[];
  mineEmoji: readonly string[];
  onReact: (emoji: string) => void;
  onAction: (action: Exclude<MessageAction, "react">) => void;
  onClose: () => void;
};

/** Long-press menu: reaction row plus the message actions the permission rules allow. */
export function MessageMenu({ visible, actions, mineEmoji, onReact, onAction, onClose }: Props) {
  const t = useTranslations();
  const { colors, spacing, radii, controlHeights, fontSizes } = useTheme();
  const rest = ACTION_ORDER.filter((a) => actions.includes(a));
  return (
    <Sheet visible={visible} onClose={onClose} closeLabel={t("mobile.actions.cancel")}>
      {actions.includes("react") ? (
        <View style={{ flexDirection: "row", justifyContent: "space-around", paddingBottom: spacing.s8 }}>
          {ALLOWED_REACTION_EMOJI.map((emoji) => (
            <Pressable
              key={emoji}
              onPress={() => onReact(emoji)}
              accessibilityRole="button"
              accessibilityLabel={t("mobile.actions.reactionLabel", { emoji })}
              style={{
                width: controlHeights.hit,
                height: controlHeights.hit,
                alignItems: "center",
                justifyContent: "center",
                borderRadius: radii.pill,
                backgroundColor: mineEmoji.includes(emoji) ? colors.accentSoft : "transparent",
              }}
            >
              <Text style={{ fontSize: fontSizes.xxl, lineHeight: fontSizes.xxl * 1.3 }}>{emoji}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      {rest.map((action) => (
        <Pressable
          key={action}
          onPress={() => onAction(action)}
          accessibilityRole="button"
          style={({ pressed }) => ({
            minHeight: controlHeights.hit,
            flexDirection: "row",
            alignItems: "center",
            gap: spacing.s12,
            paddingHorizontal: spacing.s12,
            borderRadius: radii.card,
            backgroundColor: pressed ? colors.hover : "transparent",
          })}
        >
          <Icon icon={ACTION_ICON[action]} size={18} tone={action === "delete" ? "danger" : "icon"} />
          <Text tone={action === "delete" ? "danger" : "text"}>{t(`mobile.actions.${action}`)}</Text>
        </Pressable>
      ))}
    </Sheet>
  );
}
