import { describe, expect, it } from "vitest";

import {
  computeFingerprint,
  createVerificationStore,
  encodeQrPayload,
  formatSecurityCode,
  memoryVerificationStorage,
  parseQrPayload,
  securityCode,
  verifyScan,
} from "./security-code";

const keyA = new Uint8Array(32).fill(1);
const keyB = new Uint8Array(32).fill(2);

describe("security code", () => {
  it("fingerprint is 30 digits and deterministic", async () => {
    const fp = await computeFingerprint({ version: 1, signingKey: keyA, userId: "alice" });
    expect(fp).toMatch(/^\d{30}$/);
    expect(await computeFingerprint({ version: 1, signingKey: keyA, userId: "alice" })).toBe(fp);
    // Fixed vector: guards against accidental algorithm changes.
    expect(fp).toBe("933577910775712467338525694809");
  });

  it("changes with version, key and user id", async () => {
    const base = await computeFingerprint({ version: 1, signingKey: keyA, userId: "alice" });
    expect(await computeFingerprint({ version: 2, signingKey: keyA, userId: "alice" })).not.toBe(base);
    expect(await computeFingerprint({ version: 1, signingKey: keyB, userId: "alice" })).not.toBe(base);
    expect(await computeFingerprint({ version: 1, signingKey: keyA, userId: "bob" })).not.toBe(base);
  });

  it("both users get the same 60 digits", async () => {
    const a = await computeFingerprint({ version: 1, signingKey: keyA, userId: "alice" });
    const b = await computeFingerprint({ version: 1, signingKey: keyB, userId: "bob" });
    const code = securityCode(a, b);
    expect(code).toHaveLength(60);
    expect(securityCode(b, a)).toBe(code);
    expect(formatSecurityCode(code)).toHaveLength(12);
  });

  it("correct QR marks verified, wrong QR is rejected", async () => {
    const a = await computeFingerprint({ version: 1, signingKey: keyA, userId: "alice" });
    const b = await computeFingerprint({ version: 1, signingKey: keyB, userId: "bob" });
    const mine = encodeQrPayload(1, a, b);
    expect(parseQrPayload(mine)).toEqual({ version: 1, fingerprints: [a, b].sort() });
    expect(verifyScan(mine, encodeQrPayload(1, b, a))).toBe("match");
    const c = await computeFingerprint({ version: 1, signingKey: keyB, userId: "mallory" });
    expect(verifyScan(mine, encodeQrPayload(1, a, c))).toBe("mismatch");
    expect(verifyScan(mine, "garbage")).toBe("invalid");
  });
});

describe("verification store", () => {
  it("warns when a verified contact's key changes", () => {
    const store = createVerificationStore(memoryVerificationStorage(), () => 5);
    expect(store.needsKeyChangeWarning("bob", "k1")).toBe(false);
    store.markVerified("bob", "k1");
    expect(store.isVerified("bob", "k1")).toBe(true);
    expect(store.needsKeyChangeWarning("bob", "k1")).toBe(false);
    expect(store.needsKeyChangeWarning("bob", "k2")).toBe(true);
    expect(store.isVerified("bob", "k2")).toBe(false);
    store.acknowledgeKeyChange("bob");
    expect(store.needsKeyChangeWarning("bob", "k2")).toBe(false);
  });
});
