import type { FeatureContributions } from "@/shell/slots/types";

import { LocaleAppearanceOverlay } from "@/features/locale-appearance/components/LocaleAppearanceOverlay";

export const contributions: FeatureContributions = {
  overlay: [
    {
      id: "locale-appearance",
      Component: LocaleAppearanceOverlay,
    },
  ],
  command: [
    {
      id: "go-chats",
      labelKey: "cmdChats",
      href: "/app/chats",
      order: 10,
    },
    {
      id: "go-search",
      labelKey: "cmdSearch",
      href: "/app/search",
      order: 20,
    },
    {
      id: "go-contacts",
      labelKey: "cmdContacts",
      href: "/app/contacts",
      order: 30,
    },
    {
      id: "go-notifications",
      labelKey: "cmdNotifications",
      href: "/app/notifications",
      order: 40,
    },
    {
      id: "go-settings",
      labelKey: "cmdSettings",
      href: "/app/settings/account",
      order: 50,
    },
  ],
};
