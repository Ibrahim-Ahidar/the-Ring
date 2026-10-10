import type { ReactNode } from "react";

import ui from "@/shell/styles/ui.module.css";
import { MobileBackBar } from "./MobileBackBar";

type Props = {
  /**
   * Page heading. Omit when the feature view renders its own h1; it should then
   * place {@link SettingsBack} next to that heading.
   */
  title?: string;
  children: ReactNode;
};

/** Mobile back arrow to the settings list. */
export function SettingsBack() {
  return <MobileBackBar href="/app/settings" />;
}

/** Main-pane frame for one settings page: centred column of cards, mobile back arrow. */
export function SettingsSection({ title, children }: Props) {
  return (
    <div className={ui.settingsPage}>
      <div className={ui.settingsInner}>
        {title ? (
          <div className={ui.settingsTitleRow}>
            <SettingsBack />
            <h1 className={ui.pageTitle}>{title}</h1>
          </div>
        ) : null}
        {children}
      </div>
    </div>
  );
}
