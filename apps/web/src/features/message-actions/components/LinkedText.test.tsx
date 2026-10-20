// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { LinkedText } from "./LinkedText";

describe("LinkedText", () => {
  it("renders external links with noreferrer noopener", () => {
    render(<LinkedText text="Visit https://example.com today" />);
    const link = screen.getByRole("link", { name: "https://example.com" });
    expect(link.getAttribute("href")).toBe("https://example.com");
    expect(link.getAttribute("rel")).toBe("noreferrer noopener");
  });
});
