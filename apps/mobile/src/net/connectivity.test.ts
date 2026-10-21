import { isOnline } from "./connectivity";

describe("isOnline", () => {
  it("is online when connected and reachable", () => {
    expect(isOnline({ isConnected: true, isInternetReachable: true })).toBe(true);
  });
  it("is offline when not connected (airplane mode)", () => {
    expect(isOnline({ isConnected: false, isInternetReachable: false })).toBe(false);
  });
  it("is offline when connected to a network without internet", () => {
    expect(isOnline({ isConnected: true, isInternetReachable: false })).toBe(false);
  });
  it("treats unknown state as online", () => {
    expect(isOnline({ isConnected: null, isInternetReachable: null })).toBe(true);
  });
});
