"use server";

import { randomUUID } from "node:crypto";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { AVATARS_BUCKET, avatarObjectName } from "@/platform/avatars";
import { loginPath } from "@/platform/login-redirect";
import { getSessionContext, type SessionContext } from "@/platform/session";
import { createSupabaseAdminClient } from "@/platform/supabase/admin";
import { tryCreateSupabaseServerClient } from "@/platform/supabase/safe-server";
import { asRpcClient } from "@/platform/rpc";
import { err, ok, type Result } from "@/platform/result";

import {
  clearDeviceId,
  readDeviceId,
  writeDeviceId,
} from "./device-cookie";
import { deviceLabelFromUserAgent } from "./device-label";
import * as identity from "./service";
import type { DeviceSession, OwnProfile, SignUpResult } from "./types";

function appOrigin(): string {
  return process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "http://localhost:3000";
}

async function anonRpc() {
  const supabase = await tryCreateSupabaseServerClient();
  if (!supabase) {
    return null;
  }
  return asRpcClient(supabase);
}

export async function signUpAction(input: {
  email: string;
  password: string;
  username: string;
  displayName?: string;
}): Promise<Result<SignUpResult>> {
  const supabase = await tryCreateSupabaseServerClient();
  const rpc = await anonRpc();
  if (!supabase || !rpc) {
    return err("platform.auth_unavailable");
  }

  return identity.signUp(
    supabase,
    rpc,
    input,
    asRpcClient(createSupabaseAdminClient()),
  );
}

export async function signInAction(input: {
  email: string;
  password: string;
}): Promise<Result<void>> {
  const ctx = await getSessionContext();
  const supabase = ctx?.supabase ?? (await tryCreateSupabaseServerClient());
  if (!supabase) {
    return err("platform.unexpected");
  }

  const rpc = ctx?.rpc ?? asRpcClient(supabase);
  const deviceLabel = deviceLabelFromUserAgent((await headers()).get("user-agent"));
  // A stale cookie from another account is replaced by a fresh id inside signIn.
  const result = await identity.signIn(
    supabase,
    rpc,
    { ...input, deviceLabel: deviceLabel ?? undefined },
    await readDeviceId(),
    randomUUID,
  );
  if (!result.ok) {
    return result;
  }
  await writeDeviceId(result.value);
  return ok(undefined);
}

export async function verifySignupCodeAction(input: {
  email: string;
  token: string;
  deviceLabel?: string;
}): Promise<Result<void>> {
  const supabase = await tryCreateSupabaseServerClient();
  if (!supabase) {
    return err("platform.auth_unavailable");
  }

  const result = await identity.verifySignupCode(
    supabase,
    asRpcClient(supabase),
    input,
    await readDeviceId(),
    randomUUID,
  );
  if (!result.ok) {
    return result;
  }
  await writeDeviceId(result.value);
  return ok(undefined);
}

export async function resendConfirmationAction(
  email: string,
): Promise<Result<void>> {
  const supabase = await tryCreateSupabaseServerClient();
  if (!supabase) {
    return err("platform.auth_unavailable");
  }
  return identity.resendSignupCode(supabase, email);
}

export async function signOutAction(): Promise<Result<void>> {
  const ctx = await getSessionContext();
  const supabase = ctx?.supabase ?? (await tryCreateSupabaseServerClient());
  if (!supabase) {
    return err("platform.unexpected");
  }

  const result = await identity.signOut(supabase);
  if (result.ok) {
    await clearDeviceId();
    redirect(loginPath({ reason: "signed_out" }));
  }
  return result;
}

export async function requestPasswordResetAction(
  email: string,
): Promise<Result<void>> {
  const supabase = await tryCreateSupabaseServerClient();
  if (!supabase) {
    return err("platform.auth_unavailable");
  }

  return identity.requestPasswordReset(
    supabase,
    email,
    `${appOrigin()}/auth/callback?next=/reset-password`,
  );
}

export async function verifyRecoveryCodeAction(input: {
  email: string;
  token: string;
  deviceLabel?: string;
}): Promise<Result<void>> {
  const supabase = await tryCreateSupabaseServerClient();
  if (!supabase) {
    return err("platform.auth_unavailable");
  }

  const result = await identity.verifyRecoveryCode(
    supabase,
    asRpcClient(supabase),
    input,
    await readDeviceId(),
    randomUUID,
  );
  if (!result.ok) {
    return result;
  }
  await writeDeviceId(result.value);
  return ok(undefined);
}

export async function updatePasswordAction(
  password: string,
): Promise<Result<void>> {
  const ctx = await getSessionContext();
  if (!ctx) {
    return err("identity.reset_session_expired");
  }
  return identity.updatePassword(ctx.supabase, ctx.rpc, password, await readDeviceId());
}

export async function loadOwnProfileAction(): Promise<Result<OwnProfile | null>> {
  const ctx = await getSessionContext();
  if (!ctx) {
    return err("platform.unauthenticated");
  }
  return identity.getOwnProfile(ctx.rpc);
}

export async function updateProfileAction(input: {
  displayName?: string;
  bio?: string;
  timezone?: string;
}): Promise<Result<void>> {
  const ctx = await getSessionContext();
  if (!ctx) {
    return err("platform.unauthenticated");
  }
  return identity.updateProfile(ctx.rpc, input);
}

export async function changeUsernameAction(
  username: string,
): Promise<Result<void>> {
  const ctx = await getSessionContext();
  if (!ctx) {
    return err("platform.unauthenticated");
  }
  return identity.changeUsername(ctx.rpc, username);
}

export async function uploadAvatarAction(
  formData: FormData,
): Promise<Result<void>> {
  const ctx = await getSessionContext();
  if (!ctx) {
    return err("platform.unauthenticated");
  }

  const file = formData.get("avatar");
  if (!(file instanceof File) || file.size === 0) {
    return err("identity.avatar_rejected");
  }

  const validated = identity.validateAvatarUpload(file.type, file.size);
  if (!validated.ok) {
    return validated;
  }

  const ext =
    file.type === "image/jpeg"
      ? "jpg"
      : file.type === "image/png"
        ? "png"
        : file.type === "image/webp"
          ? "webp"
          : "gif";

  const previous = await identity.getOwnProfile(ctx.rpc);
  const previousPath = previous.ok ? (previous.value?.avatar_url ?? null) : null;

  const objectName = `${ctx.userId}/${randomUUID()}.${ext}`;
  const storagePath = `${AVATARS_BUCKET}/${objectName}`;
  const bucket = ctx.supabase.storage.from(AVATARS_BUCKET);
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error: uploadError } = await bucket.upload(objectName, buffer, {
    contentType: file.type,
    upsert: false,
  });

  if (uploadError) {
    return err("identity.avatar_rejected");
  }

  const saved = await identity.setAvatarPath(ctx.rpc, storagePath);
  if (!saved.ok) {
    await bucket.remove([objectName]);
    return saved;
  }

  await removeOwnAvatarObject(ctx.supabase, ctx.userId, previousPath);
  return saved;
}

export async function removeAvatarAction(): Promise<Result<void>> {
  const ctx = await getSessionContext();
  if (!ctx) {
    return err("platform.unauthenticated");
  }

  const cleared = await identity.clearAvatar(ctx.rpc);
  if (!cleared.ok) {
    return cleared;
  }

  await removeOwnAvatarObject(ctx.supabase, ctx.userId, cleared.value);
  return ok(undefined);
}

/** Best-effort delete of a replaced photo; only touches the caller's own folder. */
async function removeOwnAvatarObject(
  supabase: SessionContext["supabase"],
  userId: string,
  storagePath: string | null,
): Promise<void> {
  const objectName = storagePath ? avatarObjectName(storagePath) : null;
  if (!objectName || !objectName.startsWith(`${userId}/`)) {
    return;
  }
  await supabase.storage.from(AVATARS_BUCKET).remove([objectName]);
}

export async function listSessionsAction(): Promise<Result<DeviceSession[]>> {
  const ctx = await getSessionContext();
  if (!ctx) {
    return err("platform.unauthenticated");
  }
  return identity.listSessions(ctx.rpc);
}

export async function revokeSessionAction(
  deviceId: string,
): Promise<Result<void>> {
  const ctx = await getSessionContext();
  if (!ctx) {
    return err("platform.unauthenticated");
  }
  return identity.revokeSession(ctx.rpc, deviceId);
}

export async function revokeOtherSessionsAction(): Promise<Result<number>> {
  const ctx = await getSessionContext();
  if (!ctx) {
    return err("platform.unauthenticated");
  }
  return identity.revokeOtherSessions(ctx.rpc, await readDeviceId());
}

export async function deleteAccountAction(
  usernameConfirm: string,
): Promise<Result<void>> {
  const ctx = await getSessionContext();
  if (!ctx) {
    return err("platform.unauthenticated");
  }

  const deleted = await identity.deleteAccount(ctx.rpc, usernameConfirm);
  if (!deleted.ok) {
    return deleted;
  }

  const admin = createSupabaseAdminClient();
  await admin.auth.admin.updateUserById(ctx.userId, {
    password: randomUUID(),
    email: `deleted+${ctx.userId}@void.pulse`,
  });

  await identity.signOut(ctx.supabase);
  await clearDeviceId();
  redirect("/login");
}

export async function exportDataAction(): Promise<Result<void>> {
  return identity.requestDataExport();
}
