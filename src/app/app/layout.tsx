import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { MessagingProvider } from "@/features/direct-messaging/context/MessagingProvider";
import { assertAppAccess } from "@/features/identity/session-guard";
import { loginPath, parseLoginReason } from "@/platform/login-redirect";
import { getSessionContext } from "@/platform/session";
import { AppShell } from "@/shell/components/AppShell";

export const dynamic = "force-dynamic";

export default async function ProtectedAppLayout({
  children,
}: {
  children: ReactNode;
}) {
  // Always send a reason: middleware returns signed-in members without one to /app,
  // which would loop when the auth cookie is valid but the session check failed.
  const session = await getSessionContext();
  if (!session) {
    redirect(loginPath({ reason: "signed_out" }));
  }

  const access = await assertAppAccess(session.rpc, session.user, session.supabase);
  if (!access.ok) {
    if (access.error.code === "identity.mfa_required") {
      redirect("/login/verify");
    }
    redirect(loginPath({ reason: parseLoginReason(access.error.code) ?? "signed_out" }));
  }

  return (
    <AppShell>
      <MessagingProvider userId={session.userId}>{children}</MessagingProvider>
    </AppShell>
  );
}
