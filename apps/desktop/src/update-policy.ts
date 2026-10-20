/** Auto-update only runs in packaged builds, and can be disabled with PULSE_NO_UPDATE=1. */
export function shouldCheckForUpdates(opts: {
  isPackaged: boolean;
  env: Record<string, string | undefined>;
}): boolean {
  if (!opts.isPackaged) return false;
  return opts.env.PULSE_NO_UPDATE !== "1";
}
