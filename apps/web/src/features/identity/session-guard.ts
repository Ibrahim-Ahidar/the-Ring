import "server-only";

import { after } from "next/server";

import { callRpc } from "@pulse/core/rpc";
import { err, ok, type Result } from "@pulse/core/result";
import type { SessionContext } from "@/platform/session";

import { MFA_REQUIRED } from "./service";

/**
 * Gate for `/app` access: verified email, AAL2 for members with a second factor, and a non-revoked device row.
 * All three were already answered by the single `identity_assert_access` call behind `getSessionContext`;
 * this only turns that answer into an error code, so it adds no round trip.
 */
export function assertAppAccess(session: SessionContext): Result<void> {
  const { emailConfirmed, mfaRequired, deviceActive, deviceId } = session.access;

  if (!emailConfirmed) {
    return err("identity.confirmation_required");
  }

  // A member with a verified authenticator must step up to AAL2 first.
  if (mfaRequired) {
    return err(MFA_REQUIRED);
  }

  if (!deviceActive) {
    return err("identity.session_revoked");
  }

  // Keeps "Last active" current; the RPC writes at most every 5 minutes.
  // Runs after the response so it never delays the page; a failed touch must
  // not lock the member out, so it is only logged.
  after(async () => {
    try {
      const touch = await callRpc<null>(session.rpc, "identity_touch_device", {
        p_device_id: deviceId,
      });
      if (!touch.ok) {
        console.error("[identity] identity_touch_device failed", touch.error.code);
      }
    } catch (cause) {
      console.error("[identity] identity_touch_device threw", cause);
    }
  });

  return ok(undefined);
}
