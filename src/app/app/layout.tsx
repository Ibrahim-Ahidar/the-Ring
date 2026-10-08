import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { assertAppAccess } from "@/features/identity/session-guard";
import { getSessionContext } from "@/platform/session";
import { AppShell } from "@/shell/components/AppShell";

export const dynamic = "force-dynamic";

export default async function ProtectedAppLayout({
  children,
}: {
  children: ReactNode;
}) {
  const session = await getSessionContext();
  if (!session) {
    redirect("/login");
  }

  const access = await assertAppAccess(session.rpc, session.user);
  if (!access.ok) {
    redirect(`/login?reason=${encodeURIComponent(access.error.code)}`);
  }

  return <AppShell>{children}</AppShell>;
}
