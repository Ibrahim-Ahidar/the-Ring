import { callRpc, type RpcClient } from "@pulse/core/rpc";
import type { Result } from "@pulse/core/result";
import {
  isAccent,
  isLocale,
  isTheme,
  type Accent,
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

export async function updateAccent(
  rpc: RpcClient,
  accent: string,
): Promise<Result<null>> {
  if (!isAccent(accent)) {
    return { ok: false, error: { code: "appearance.invalid_preference" } };
  }
  return callRpc(rpc, "appearance_update_accent", { p_accent: accent });
}

export type { Accent, Locale, Theme };
