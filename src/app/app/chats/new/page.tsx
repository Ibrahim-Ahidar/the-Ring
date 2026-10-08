import { Suspense } from "react";
import { redirect } from "next/navigation";

import { NewChatClient } from "@/features/direct-messaging/components/NewChatClient";
import { getSessionContext } from "@/platform/session";

export default async function NewChatPage() {
  const session = await getSessionContext();
  if (!session) {
    redirect("/login");
  }

  return (
    <Suspense fallback={null}>
      <NewChatClient />
    </Suspense>
  );
}
