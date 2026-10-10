import { Settings } from "lucide-react";
import { getTranslations } from "next-intl/server";

import ui from "@/shell/styles/ui.module.css";

export default async function SettingsIndexPage() {
  const t = await getTranslations("shell.settings");

  return (
    <div className={ui.emptyState}>
      <div className={ui.emptyStateArt} aria-hidden="true">
        <Settings size={48} />
      </div>
      <h1 className={ui.emptyStateTitle}>{t("title")}</h1>
      <p className={ui.emptyStateText}>{t("chooseSection")}</p>
    </div>
  );
}
