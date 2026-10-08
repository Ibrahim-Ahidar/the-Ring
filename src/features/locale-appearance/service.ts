import { callRpc, type RpcClient } from "@/platform/rpc";
import type { Result } from "@/platform/result";
import {
  isLocale,
  isTheme,
  type Locale,
  type Theme,
} from "@/shell/locale";

export async function updateLocale(
  rpc: RpcClient,
  locale: string,
): Promise<Result<null>> {
  if (!isLocale(locale)) {
    return { ok: false, error: { code: "appearance.invalid_preference" } };
  }
  return callRpc(rpc, "appearance_update_locale", { p_locale: locale });
}

export async function updateTheme(
  rpc: RpcClient,
  theme: string,
): Promise<Result<null>> {
  if (!isTheme(theme)) {
    return { ok: false, error: { code: "appearance.invalid_preference" } };
  }
  return callRpc(rpc, "appearance_update_theme", { p_theme: theme });
}

export type { Locale, Theme };
