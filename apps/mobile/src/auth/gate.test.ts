import { decideRedirect } from "./gate";

describe("decideRedirect", () => {
  it("does nothing while the session is loading", () => {
    expect(decideRedirect({ loading: true, signedIn: false, group: "(app)" })).toBeNull();
    expect(decideRedirect({ loading: true, signedIn: true, group: "(auth)" })).toBeNull();
  });
  it("sends a signed-out user in the app group to login", () => {
    expect(decideRedirect({ loading: false, signedIn: false, group: "(app)" })).toBe("/login");
  });
  it("sends a signed-in user in the auth group home", () => {
    expect(decideRedirect({ loading: false, signedIn: true, group: "(auth)" })).toBe("/");
  });
  it("leaves correctly placed users alone", () => {
    expect(decideRedirect({ loading: false, signedIn: true, group: "(app)" })).toBeNull();
    expect(decideRedirect({ loading: false, signedIn: false, group: "(auth)" })).toBeNull();
  });
  it("treats an unknown group as the app group", () => {
    expect(decideRedirect({ loading: false, signedIn: false, group: undefined })).toBe("/login");
    expect(decideRedirect({ loading: false, signedIn: true, group: undefined })).toBeNull();
  });
  it("holds a signed-in user owing a second factor on verify", () => {
    expect(decideRedirect({ loading: false, signedIn: true, mfaPending: true, group: "(app)" })).toBe("/verify");
    expect(decideRedirect({ loading: false, signedIn: true, mfaPending: true, group: "(auth)", screen: "login" })).toBe("/verify");
    expect(decideRedirect({ loading: false, signedIn: true, mfaPending: true, group: "(auth)", screen: "verify" })).toBeNull();
  });
  it("moves on from verify once the factor is done or the user signs out", () => {
    expect(decideRedirect({ loading: false, signedIn: true, group: "(auth)", screen: "verify" })).toBe("/");
    expect(decideRedirect({ loading: false, signedIn: false, group: "(auth)", screen: "verify" })).toBe("/login");
  });
  it("lets anyone read the legal pages", () => {
    expect(decideRedirect({ loading: false, signedIn: false, group: "legal" })).toBeNull();
    expect(decideRedirect({ loading: false, signedIn: true, group: "legal" })).toBeNull();
  });
});
