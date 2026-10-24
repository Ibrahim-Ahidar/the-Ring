// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createVerificationStore,
  memoryVerificationStorage,
  type VerificationStore,
} from "@pulse/core/e2ee/security-code";

import en from "../messages/en.json";
import { useSendGate } from "../lib/useSendGate";
import { KeyChangeWarning } from "./KeyChangeWarning";

afterEach(cleanup);

function Harness(props: {
  enabled: boolean;
  currentKey: string;
  store: VerificationStore;
  send: () => void;
}) {
  const gate = useSendGate({
    enabled: props.enabled,
    store: props.store,
    contactId: "bob",
    currentKey: props.currentKey,
  });
  return (
    <NextIntlClientProvider locale="en" messages={{ "e2ee-security-code": en }}>
      <button onClick={() => void gate.guard(props.send)}>send</button>
      {gate.warning ? (
        <KeyChangeWarning name="Bob" onSend={() => void gate.confirm()} onCancel={gate.cancel} />
      ) : null}
    </NextIntlClientProvider>
  );
}

function verifiedStore() {
  const store = createVerificationStore(memoryVerificationStorage());
  store.markVerified("bob", "k1");
  return store;
}

describe("warn-before-send gate", () => {
  it("sends at once when the key is unchanged", () => {
    const send = vi.fn();
    render(<Harness enabled currentKey="k1" store={verifiedStore()} send={send} />);
    fireEvent.click(screen.getByText("send"));
    expect(send).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("holds the message and warns when a verified key changed; send anyway proceeds", () => {
    const send = vi.fn();
    const store = verifiedStore();
    render(<Harness enabled currentKey="k2" store={store} send={send} />);
    fireEvent.click(screen.getByText("send"));
    expect(send).not.toHaveBeenCalled();
    expect(screen.getByRole("alertdialog").textContent).toContain("Bob");
    fireEvent.click(screen.getByText(en.warnSend));
    expect(send).toHaveBeenCalledTimes(1);
    expect(store.needsKeyChangeWarning("bob", "k2")).toBe(false);
  });

  it("cancel drops the send", () => {
    const send = vi.fn();
    render(<Harness enabled currentKey="k2" store={verifiedStore()} send={send} />);
    fireEvent.click(screen.getByText("send"));
    fireEvent.click(screen.getByText(en.warnCancel));
    expect(send).not.toHaveBeenCalled();
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("flag off: never warns", () => {
    const send = vi.fn();
    render(<Harness enabled={false} currentKey="k2" store={verifiedStore()} send={send} />);
    fireEvent.click(screen.getByText("send"));
    expect(send).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });
});
