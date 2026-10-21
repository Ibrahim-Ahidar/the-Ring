export interface TrayMenuOptions {
  loginEnabled: boolean;
  onOpen: () => void;
  onToggleLogin: (enabled: boolean) => void;
  onQuit: () => void;
}

export interface TrayMenuItem {
  label?: string;
  type?: "checkbox" | "separator";
  checked?: boolean;
  click?: (item: { checked: boolean }) => void;
}

export function buildTrayMenu(o: TrayMenuOptions): TrayMenuItem[] {
  return [
    { label: "Open Pulse", click: () => o.onOpen() },
    {
      label: "Launch at login",
      type: "checkbox",
      checked: o.loginEnabled,
      click: (item) => o.onToggleLogin(item.checked),
    },
    { type: "separator" },
    { label: "Quit", click: () => o.onQuit() },
  ];
}
