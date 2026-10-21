import { canSend } from "./composer";

describe("canSend", () => {
  const base = { online: true, draft: "hi", pending: false };
  it("allows a non-empty draft while online", () => {
    expect(canSend(base)).toBe(true);
  });
  it("blocks sending while offline", () => {
    expect(canSend({ ...base, online: false })).toBe(false);
  });
  it("blocks empty or whitespace drafts and in-flight sends", () => {
    expect(canSend({ ...base, draft: "   " })).toBe(false);
    expect(canSend({ ...base, pending: true })).toBe(false);
  });
});
