import type { ReactNode } from "react";

import { SignOutButton } from "@/features/identity/components/SignOutButton";
import { getSessionContext } from "@/platform/session";
import { SettingsLayoutView } from "@/shell/components/SettingsLayoutView";

import { loadViewer } from "../_lib/viewer";

export default async function SettingsLayout({ children }: { children: ReactNode }) {
  const ctx = await getSessionContext();
  const viewer = ctx ? await loadViewer(ctx.rpc) : null;

  return (
    <SettingsLayoutView profile={viewer} signOut={<SignOutButton />}>
      {children}
    </SettingsLayoutView>
  );
}
