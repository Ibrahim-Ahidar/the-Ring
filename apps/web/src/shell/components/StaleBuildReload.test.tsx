import { UnrecognizedActionError } from "next/dist/client/components/unrecognized-action-error";
import { describe, expect, it } from "vitest";

import { shouldReloadForStaleBuild } from "./StaleBuildReload";

const stale = new UnrecognizedActionError('Server Action "abc" was not found on the server.');

describe("shouldReloadForStaleBuild", () => {
  it("reloads when an action is unknown to the server", () => {
    expect(shouldReloadForStaleBuild(stale, 100_000, null)).toBe(true);
  });

  it("ignores other errors", () => {
    expect(shouldReloadForStaleBuild(new TypeError("Failed to fetch"), 100_000, null)).toBe(false);
  });

  it("does not reload again within the cooldown", () => {
    expect(shouldReloadForStaleBuild(stale, 100_000, 90_000)).toBe(false);
    expect(shouldReloadForStaleBuild(stale, 200_000, 90_000)).toBe(true);
  });
});
