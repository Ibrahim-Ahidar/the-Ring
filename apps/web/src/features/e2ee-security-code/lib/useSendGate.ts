"use client";

import { useCallback, useState } from "react";

import type { VerificationStore } from "@pulse/core/e2ee/security-code";

type Args = {
  /** The e2ee flag; when false the gate never interferes. */
  enabled: boolean;
  store: VerificationStore;
  contactId: string;
  /** The contact's current Account Signing Key. */
  currentKey: string | null;
};

/**
 * Warn-before-send gate. `guard(send)` runs `send` at once unless a verified contact's key has
 * changed; then it holds `send` until `confirm()` (Send anyway) or `cancel()`.
 */
export function useSendGate({ enabled, store, contactId, currentKey }: Args) {
  const [pending, setPending] = useState<(() => void | Promise<void>) | null>(null);

  const guard = useCallback(
    (send: () => void | Promise<void>) => {
      if (enabled && currentKey && store.needsKeyChangeWarning(contactId, currentKey)) {
        setPending(() => send);
        return;
      }
      return send();
    },
    [enabled, store, contactId, currentKey],
  );

  const confirm = useCallback(() => {
    const send = pending;
    setPending(null);
    // Acknowledged: stop warning; the contact is no longer treated as verified.
    store.acknowledgeKeyChange(contactId);
    return send?.();
  }, [pending, store, contactId]);

  const cancel = useCallback(() => setPending(null), []);

  return { guard, warning: pending !== null, confirm, cancel };
}
