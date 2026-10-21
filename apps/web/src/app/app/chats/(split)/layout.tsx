import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { ChatsShell } from "@/features/direct-messaging/components/ChatsShell";
import { streamInbox } from "@/features/direct-messaging/streamed";
import { getSessionContext } from "@/platform/session";

import { loadViewer } from "../../_lib/viewer";

/**
 * The persistent chats frame (sidebar + thread pane). It stays mounted while the
 * open conversation changes; pages only seed the app-wide messaging store.
 */
export default async function ChatsSplitLayout({ children }: { children: ReactNode }) {
  const session = await getSessionContext();
  if (!session) {
    redirect("/login");
  }

  // Streamed: the frame renders now, the list fills in when it arrives.
  const inbox = streamInbox(session.rpc, {});
  const viewer = await loadViewer(session.rpc);

  return (
    <ChatsShell userId={session.userId} viewer={viewer} inbox={inbox}>
      {children}
    </ChatsShell>
  );
}
