import { mapAuthError } from "./auth-errors";

describe("mapAuthError", () => {
  it("maps invalid credentials", () => {
    expect(mapAuthError({ code: "invalid_credentials", message: "Invalid login credentials" })).toBe(
      "mobile.login.errors.invalidCredentials",
    );
  });
  it("maps unconfirmed email", () => {
    expect(mapAuthError({ code: "email_not_confirmed", message: "x" })).toBe(
      "mobile.login.errors.emailNotConfirmed",
    );
  });
  it("maps rate limiting", () => {
    expect(mapAuthError({ code: "over_request_rate_limit", message: "x", status: 429 })).toBe(
      "mobile.login.errors.rateLimited",
    );
    expect(mapAuthError({ message: "x", status: 429 })).toBe("mobile.login.errors.rateLimited");
  });
  it("maps network failures", () => {
    expect(mapAuthError({ message: "Network request failed", name: "AuthRetryableFetchError" })).toBe(
      "mobile.login.errors.network",
    );
  });
  it("falls back to unexpected", () => {
    expect(mapAuthError({ message: "boom" })).toBe("mobile.login.errors.unexpected");
  });
});
