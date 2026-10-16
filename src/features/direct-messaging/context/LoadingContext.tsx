"use client";

import { createContext, useContext } from "react";

/** Which chat data is still streaming in from the server. */
export type ChatsLoading = {
  /** The first page of the chat list has not arrived yet. */
  inbox: boolean;
  /** The open conversation has no messages to show yet. */
  thread: boolean;
  /** The chat list read failed, so an empty list must not read as "no chats". */
  inboxFailed?: boolean;
};

const LoadingContext = createContext<ChatsLoading>({ inbox: false, thread: false });

export const ChatsLoadingProvider = LoadingContext.Provider;

export function useChatsLoading(): ChatsLoading {
  return useContext(LoadingContext);
}
