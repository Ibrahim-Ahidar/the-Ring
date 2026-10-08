import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { AppShell } from "@/shell/components/AppShell";
import { tryCreateSupabaseServerClient } from "@/platform/supabase/safe-server";

export const dynamic = "force-dynamic";

export default async function ProtectedAppLayout({
  children,
}: {
  children: ReactNode;
}) {
  const supabase = await tryCreateSupabaseServerClient();
  if (!supabase) {
    redirect("/login");
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return <AppShell>{children}</AppShell>;
}
