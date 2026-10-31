// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { uploadEncryptedMedia, downloadDecryptedMedia, type FetchFn } from "@pulse/core/e2ee-media/media-transfer";
import type { MediaBody } from "@pulse/core/e2ee/plain-envelope";
import { ok } from "@pulse/core/result";
import type { TimelineMessage } from "@pulse/core/timeline";

import { resetExpiredMediaCache } from "../hooks/useEncryptedMedia";

// The legacy hooks must not be reached for an encrypted message.
vi.mock("../hooks/useDownloadUrl", () => ({ useDownloadUrl: () => null }));
vi.mock("../hooks/useAttachmentList", () => ({ useAttachmentList: () => [] }));
vi.mock("../actions", () => ({}));

const net = vi.hoisted(() => ({
  objects: new Map<string, Uint8Array>(),
  gets: [] as string[],
  puts: [] as { url: string; body: Uint8Array }[],
  tamper: false,
  offline: false,
  markExpired: undefined as undefined | ((id: string) => Promise<void>),
}));

vi.mock("../encrypted-media-runtime", async () => {
  const media = await import("@pulse/core/e2ee-media/media-transfer");
  const fetchFn: FetchFn = async (url, init) => {
    if (init?.method === "PUT") {
      net.puts.push({ url, body: init.body as Uint8Array });
      net.objects.set(url, init.body as Uint8Array);
      return { ok: true, status: 200, arrayBuffer: async () => new ArrayBuffer(0) };
    }
    net.gets.push(url);
    if (net.offline) return { ok: false, status: 503, arrayBuffer: async () => new ArrayBuffer(0) };
    const stored = net.objects.get(url);
    if (!stored) return { ok: false, status: 404, arrayBuffer: async () => new ArrayBuffer(0) };
    const copy = new Uint8Array(stored);
    if (net.tamper) copy[copy.length - 1] ^= 0xff;
    return { ok: true, status: 200, arrayBuffer: async () => copy.buffer as ArrayBuffer };
  };
  return {
    getEncryptedMediaDeps: () => ({
      download: (conversationId: string, body: MediaBody) =>
        media.downloadDecryptedMedia({
          conversationId,
          body,
          requestDownloadUrl: async (req) => ok({ url: `https://r2.test/${req.key}` }),
          fetchFn,
        }),
      markExpired: (id: string) => net.markExpired!(id),
    }),
    __fetchFn: fetchFn,
  };
});

const runtime = (await import("../encrypted-media-runtime")) as unknown as { __fetchFn: FetchFn };

const messages = {
  media: {
    mediaExpired: "This media has expired",
    mediaDownloadFailed: "Could not load this media",
    imageAlt: "Image",
    loadingImage: "Loading image",
  },
};

const PNG = new Uint8Array([137, 80, 78, 71, 1, 2, 3, 4, 5, 6, 7, 8]);

async function uploaded(): Promise<MediaBody> {
  const res = await uploadEncryptedMedia({
    conversationId: "conv-1",
    bytes: PNG,
    mimeType: "image/png",
    fileName: "pic.png",
    width: 10,
    height: 10,
    requestUploadUrl: async (req) => ok({ url: "https://r2.test/obj-1", key: "obj-1", headers: {} }),
    fetchFn: runtime.__fetchFn,
  });
  if (!res.ok) throw new Error("upload failed");
  return res.value;
}

function messageFor(body: MediaBody, over: Partial<MediaBody & { expired: boolean }> = {}): TimelineMessage {
  return {
    id: "m1",
    conversation_id: "conv-1",
    sender_id: "u2",
    client_id: null,
    type: "image",
    body: null,
    reply_to_id: null,
    created_at: "2026-10-31T10:00:00Z",
    edited_at: null,
    deleted_at: null,
    deletion_scope: "none",
    pinned_at: null,
    forwarded: false,
    metadata: { e2eeMedia: { ...body, expired: false, ...over } },
  } as unknown as TimelineMessage;
}

async function renderView(message: TimelineMessage) {
  const { EncryptedMediaView } = await import("./EncryptedMediaView");
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <EncryptedMediaView message={message} currentUserId="u1" />
    </NextIntlClientProvider>,
  );
}

let created: string[];
let revoked: string[];
let blobs: Blob[];

beforeEach(() => {
  net.objects.clear();
  net.gets.length = 0;
  net.puts.length = 0;
  net.tamper = false;
  net.offline = false;
  net.markExpired = vi.fn(async () => undefined);
  resetExpiredMediaCache();
  created = [];
  revoked = [];
  blobs = [];
  URL.createObjectURL = vi.fn((b: Blob) => {
    blobs.push(b);
    const u = `blob:test/${created.length}`;
    created.push(u);
    return u;
  });
  URL.revokeObjectURL = vi.fn((u: string) => void revoked.push(u));
});

afterEach(() => cleanup());

describe("encrypted media view", () => {
  it("fetches, verifies and renders the decrypted image, then revokes the object URL", async () => {
    const body = await uploaded();
    // Only ciphertext reached the network.
    expect(net.puts).toHaveLength(1);
    expect(Buffer.from(net.puts[0]!.body).includes(Buffer.from(PNG))).toBe(false);

    const view = await renderView(messageFor(body));
    const img = (await screen.findByRole("img")) as HTMLImageElement;
    expect(img.getAttribute("src")).toMatch(/^blob:test\//);
    const shown = blobs[blobs.length - 1]!;
    expect(new Uint8Array(await shown.arrayBuffer())).toEqual(PNG);
    expect(net.gets).toHaveLength(1);

    view.unmount();
    expect(revoked).toContain(created[created.length - 1]);
  });

  it("shows the expired text on 404, persists expired: true and never refetches", async () => {
    const body = { ...(await uploaded()), r2Key: "gone" };
    const first = await renderView(messageFor(body));
    expect(await screen.findByText("This media has expired")).toBeTruthy();
    expect(net.markExpired).toHaveBeenCalledWith("m1");
    expect(net.gets).toHaveLength(1);
    first.unmount();

    // Re-view, once from the persisted row (expired: true) and once from the session cache.
    await renderView(messageFor(body, { expired: true }));
    expect(await screen.findByText("This media has expired")).toBeTruthy();
    cleanup();
    await renderView(messageFor(body));
    expect(await screen.findByText("This media has expired")).toBeTruthy();
    expect(net.gets).toHaveLength(1);
    expect(net.markExpired).toHaveBeenCalledTimes(1);
  });

  it("shows the error state and never the bytes on a hash mismatch", async () => {
    const body = await uploaded();
    net.tamper = true;
    await renderView(messageFor(body));
    expect(await screen.findByText("Could not load this media")).toBeTruthy();
    expect(screen.queryByRole("img")).toBeNull();
    await waitFor(() => expect(net.gets).toHaveLength(1));
    expect(blobs).toHaveLength(0);
    expect(net.markExpired).not.toHaveBeenCalled();
  });

  it("retries a transient download failure when the failed image is tapped", async () => {
    const body = await uploaded();
    net.offline = true;
    await renderView(messageFor(body));
    const failed = await screen.findByRole("button", { name: /Could not load this media/ });
    expect(net.gets).toHaveLength(1);
    net.offline = false;
    fireEvent.click(failed);
    expect(await screen.findByRole("img")).toBeTruthy();
    expect(net.gets).toHaveLength(2);
    expect(screen.queryByText("Could not load this media")).toBeNull();
  });

  it("offers no retry for expired media", async () => {
    const body = { ...(await uploaded()), r2Key: "gone" };
    await renderView(messageFor(body));
    expect(await screen.findByText("This media has expired")).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("is used by the image renderer for an encrypted message only", async () => {
    const body = await uploaded();
    const { ImageMessageRenderer } = await import("./ImageMessageRenderer");
    render(
      <NextIntlClientProvider locale="en" messages={{ media: { ...messages.media, attachmentMissing: "Missing" } }}>
        <ImageMessageRenderer message={messageFor(body)} currentUserId="u1" />
      </NextIntlClientProvider>,
    );
    expect(await screen.findByRole("img")).toBeTruthy();
    cleanup();
    const legacy = { ...messageFor(body), metadata: {} } as TimelineMessage;
    render(
      <NextIntlClientProvider locale="en" messages={{ media: { ...messages.media, attachmentMissing: "Missing" } }}>
        <ImageMessageRenderer message={legacy} currentUserId="u1" />
      </NextIntlClientProvider>,
    );
    expect(screen.getByText("Missing")).toBeTruthy();
    expect(downloadDecryptedMedia).toBeTypeOf("function");
  });
});
