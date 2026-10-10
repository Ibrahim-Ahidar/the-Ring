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

export type GroupMemberLabel = { name: string; avatarUrl: string | null };

const directoryCache = new Map<string, Map<string, GroupMemberLabel>>();
const EMPTY_DIRECTORY = new Map<string, GroupMemberLabel>();

/** Whole-roster lookup (userId -> name/avatar) for labelling senders in a group timeline. */
export function useGroupMemberDirectory(
  conversationId: string,
  enabled: boolean,
): Map<string, GroupMemberLabel> {
  const [directory, setDirectory] = useState(
    () => directoryCache.get(conversationId) ?? EMPTY_DIRECTORY,
  );

  useEffect(() => {
    if (!enabled) {
      return;
    }
    const cached = directoryCache.get(conversationId);
    if (cached) {
      setDirectory(cached);
      return;
    }
    let cancelled = false;
    void listMembersAction(conversationId).then((result) => {
      if (cancelled || !result.ok) {
        return;
      }
      const map = new Map<string, GroupMemberLabel>();
      for (const member of result.value) {
        map.set(member.userId, {
          name: member.displayName ?? member.username,
          avatarUrl: member.avatarUrl,
        });
      }
      directoryCache.set(conversationId, map);
      setDirectory(map);
    });
    return () => {
      cancelled = true;
    };
  }, [conversationId, enabled]);

  return directory;
}
