import type { VerificationStorage, VerifiedContact } from "@pulse/core/e2ee/security-code";

const KEY = "pulse.e2ee.verifiedContacts";

/** Verified contacts live only on this device (spec 4.4). Falls back to nothing if storage is blocked. */
export function localStorageVerification(): VerificationStorage {
  return {
    load() {
      try {
        const raw = window.localStorage.getItem(KEY);
        return raw ? (JSON.parse(raw) as VerifiedContact[]) : [];
      } catch {
        return [];
      }
    },
    save(list) {
      try {
        window.localStorage.setItem(KEY, JSON.stringify(list));
      } catch {
        /* storage blocked: verification just will not persist */
      }
    },
  };
}
