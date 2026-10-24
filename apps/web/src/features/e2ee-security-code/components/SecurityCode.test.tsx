// @vitest-environment jsdom

import { webcrypto } from "node:crypto";

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import {
  computeFingerprint,
  createVerificationStore,
  encodeQrPayload,
  memoryVerificationStorage,
} from "@pulse/core/e2ee/security-code";

import en from "../messages/en.json";
import { SecurityCode } from "./SecurityCode";

beforeAll(() => {
  vi.stubGlobal("crypto", webcrypto);
});
afterEach(cleanup);

const b64 = (n: number) => btoa(String.fromCharCode(...new Array<number>(32).fill(n)));
const me = { userId: "alice", signingKey: b64(1), version: 1 };
const bob = { userId: "bob", signingKey: b64(2), version: 1 };
const dec = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

describe("SecurityCode", () => {
  it("shows 12 groups and a QR; a wrong scan is rejected, the right one verifies", async () => {
    const store = createVerificationStore(memoryVerificationStorage());
    const { container } = render(
      <NextIntlClientProvider locale="en" messages={{ "e2ee-security-code": en }}>
        <SecurityCode contactName="Bob" me={me} contact={bob} store={store} />
      </NextIntlClientProvider>,
    );
    await waitFor(() => expect(screen.getAllByRole("listitem")).toHaveLength(12), {
      timeout: 15000,
    });
    expect(container.querySelector("svg")).not.toBeNull();

    const input = screen.getByLabelText(/Paste the scanned code/);
    fireEvent.change(input, { target: { value: "nope" } });
    fireEvent.click(screen.getByText(en.scanSubmit));
    expect(screen.getByText(en.scanInvalid)).toBeTruthy();
    expect(store.isVerified("bob", bob.signingKey)).toBe(false);

    const a = await computeFingerprint({ version: 1, signingKey: dec(me.signingKey), userId: "alice" });
    const b = await computeFingerprint({ version: 1, signingKey: dec(bob.signingKey), userId: "bob" });
    fireEvent.change(input, { target: { value: encodeQrPayload(1, b, a) } });
    fireEvent.click(screen.getByText(en.scanSubmit));
    expect(screen.getByText("The codes match. Bob is now verified.")).toBeTruthy();
    expect(store.isVerified("bob", bob.signingKey)).toBe(true);
  }, 40000);
});
