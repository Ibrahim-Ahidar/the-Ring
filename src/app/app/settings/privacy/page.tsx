import { redirect } from "next/navigation";

import { PrivacySettingsShell } from "@/features/safety/components/PrivacySettingsShell";
import {
  getPrivacy,
  listBlocks,
  listMyReports,
} from "@/features/safety/service";
import { getSessionContext } from "@/platform/session";

export default async function SettingsPrivacyPage() {
  const session = await getSessionContext();
  if (!session) {
    redirect("/login");
  }

  const [privacyResult, blocksResult, reportsResult] = await Promise.all([
    getPrivacy(session.rpc),
    listBlocks(session.rpc),
    listMyReports(session.rpc),
  ]);

  if (!privacyResult.ok) {
    redirect("/login");
  }

  return (
    <PrivacySettingsShell
      initialPrivacy={privacyResult.value}
      initialBlocks={blocksResult.ok ? blocksResult.value : []}
      initialReports={reportsResult.ok ? reportsResult.value : []}
    />
  );
}
