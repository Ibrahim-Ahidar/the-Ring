import { describe, expect, it } from "vitest";
import { isPulseUrl } from "./origin";

const base = "https://pulse.example.com";

describe("isPulseUrl", () => {
  it("accepts same origin paths", () => {
    expect(isPulseUrl("https://pulse.example.com/app/chats/1?x=1", base)).toBe(true);
  });
  it("rejects other hosts, schemes and ports", () => {
    expect(isPulseUrl("https://evil.com/", base)).toBe(false);
    expect(isPulseUrl("http://pulse.example.com/", base)).toBe(false);
    expect(isPulseUrl("https://pulse.example.com:8443/", base)).toBe(false);
  });
  it("rejects lookalike hosts", () => {
    expect(isPulseUrl("https://pulse.example.com.evil.com/", base)).toBe(false);
    expect(isPulseUrl("https://pulse.example.com@evil.com/", base)).toBe(false);
  });
  it("rejects garbage and non-http schemes", () => {
    expect(isPulseUrl("not a url", base)).toBe(false);
    expect(isPulseUrl("javascript:alert(1)", base)).toBe(false);
    expect(isPulseUrl("file:///etc/passwd", base)).toBe(false);
  });
  it("works for localhost dev", () => {
    expect(isPulseUrl("http://localhost:3000/x", "http://localhost:3000")).toBe(true);
  });
});
