"use client";

import { memo, useEffect, useMemo } from "react";
import { useTranslations } from "next-intl";

import { createSupabaseBrowserClient } from "@/platform/supabase/browser";
import type { TimelineMessage } from "@pulse/core/timeline";

import {
  aggregateEmojiCounts,
} from "../context/reactions-reducer";
import {
  retainConversationReactions,
  useMessageReactions,
} from "../context/conversation-reactions-store";
import { useToggleReaction } from "../hooks/use-toggle-reaction";
import { ReactionChip } from "./ReactionChip";
import styles from "../reactions.module.css";

type Props = {
  message: TimelineMessage;
  currentUserId: string;
};

function isReactableMessage(message: TimelineMessage): boolean {
  if (message.id.startsWith("pending-")) {
    return false;
  }
  if (message.deletion_scope === "everyone") {
    return false;
  }
  return true;
}

function ReactionBubbleExtraInner({ message, currentUserId }: Props) {
  const t = useTranslations("reactions");
  const conversationId = message.conversation_id;
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  useEffect(() => {
    if (!isReactableMessage(message)) {
      return undefined;
    }
    return retainConversationReactions(
      conversationId,
      supabase,
      currentUserId,
      message.id,
      message.reactions,
    );
  }, [
    conversationId,
    currentUserId,
    message.id,
    message.reactions,
    supabase,
    message,
  ]);

  const reactions = useMessageReactions(conversationId, message.id);
  const toggle = useToggleReaction({
    conversationId,
    messageId: message.id,
    userId: currentUserId,
  });

  const chips = useMemo(
    () => aggregateEmojiCounts(reactions, currentUserId),
    [reactions, currentUserId],
  );

  if (!isReactableMessage(message) || chips.length === 0) {
    return null;
  }

  return (
    <div className={styles.row} role="group" aria-label={t("reactionsGroup")} data-overhang>
      {chips.map((chip) => (
        <ReactionChip
          key={chip.emoji}
          emoji={chip.emoji}
          count={chip.count}
          reactedByMe={chip.reactedByMe}
          onToggle={() => {
            void toggle(chip.emoji, chip.reactedByMe);
          }}
        />
      ))}
    </div>
  );
}

export const ReactionBubbleExtra = memo(ReactionBubbleExtraInner);
