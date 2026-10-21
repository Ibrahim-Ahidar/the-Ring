import { getContributions } from "@/shell/slots";

export type PaletteCommand = {
  id: string;
  labelKey: string;
  href: string;
  order: number;
  feature: string;
};

/** Palette commands from every installed feature, sorted, with full label keys. */
export function collectPaletteCommands(): PaletteCommand[] {
  return getContributions("command").map((entry) => ({
    id: entry.id,
    labelKey: entry.labelKey,
    href: entry.href,
    order: entry.order,
    feature: entry.feature,
  }));
}
