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
      id: "go-contacts",
      labelKey: "cmdContacts",
      href: "/app/contacts",
      order: 30,
    },
    {
      id: "go-groups",
      labelKey: "cmdGroups",
      href: "/app/groups",
      order: 42,
    },
    {
      id: "go-settings",
      labelKey: "cmdSettings",
      href: "/app/settings/account",
      order: 50,
    },
  ],
};
