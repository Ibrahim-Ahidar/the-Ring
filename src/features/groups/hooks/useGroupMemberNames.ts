"use client";

import { useEffect, useState } from "react";

import { listMembersAction } from "../actions";

const cache = new Map<string, Map<string, string>>();

export function useGroupMemberName(
  conversationId: string,
  userId: string | null,
): string | null {
  const [name, setName] = useState<string | null>(() => {
    if (!userId) {
      return null;
    }
    return cache.get(conversationId)?.get(userId) ?? null;
  });

  useEffect(() => {
    if (!userId) {
      return;
    }
    const existing = cache.get(conversationId)?.get(userId);
    if (existing) {
      setName(existing);
      return;
    }

    let cancelled = false;
    void listMembersAction(conversationId).then((result) => {
      if (cancelled || !result.ok) {
        return;
      }
      const map = new Map<string, string>();
      for (const member of result.value) {
        const label = member.displayName ?? member.username;
        map.set(member.userId, label);
      }
      cache.set(conversationId, map);
      if (!cancelled) {
        setName(map.get(userId) ?? userId);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [conversationId, userId]);

  return name ?? userId;
}
