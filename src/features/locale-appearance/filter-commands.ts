import type { PaletteCommand } from "@/features/locale-appearance/collect-commands";

export function filterCommands(
  commands: readonly PaletteCommand[],
  query: string,
  resolveLabel: (command: PaletteCommand) => string,
): PaletteCommand[] {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) {
    return [...commands];
  }

  return commands.filter((command) => {
    const label = resolveLabel(command).toLowerCase();
    const id = command.id.toLowerCase();
    return label.includes(trimmed) || id.includes(trimmed);
  });
}
