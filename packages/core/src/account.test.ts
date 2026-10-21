import { describe, expect, it } from "vitest";

import { isOtpCode, mapOtpError, mapSignUpAuthError, meetsPasswordPolicy, mapUpdatePasswordAuthError } from "./account";

describe("account helpers", () => {
  it("checks the password policy", () => {
    expect(meetsPasswordPolicy("abc12345")).toBe(true);
    expect(meetsPasswordPolicy("abcdefgh")).toBe(false);
    expect(meetsPasswordPolicy("a1")).toBe(false);
  });

  it("accepts only 6 digit codes", () => {
    expect(isOtpCode("123456")).toBe(true);
    expect(isOtpCode(" 123456 ")).toBe(true);
    expect(isOtpCode("12345")).toBe(false);
    expect(isOtpCode("12345a")).toBe(false);
  });

  it("maps auth errors by code", () => {
    expect(mapOtpError({ code: "otp_expired" })).toBe("identity.code_expired");
    expect(mapOtpError({ code: "invalid_otp" })).toBe("identity.code_invalid");
    expect(mapOtpError({ status: 429 })).toBe("platform.rate_limited");
    expect(mapOtpError({ code: "x" })).toBe("platform.unexpected");
    expect(mapSignUpAuthError({ code: "email_exists" })).toBe("identity.email_registered");
    expect(mapSignUpAuthError({ code: "weak_password" })).toBe("identity.password_weak");
    expect(mapUpdatePasswordAuthError({ code: "same_password" })).toBe("identity.password_same");
    expect(mapUpdatePasswordAuthError({ status: 401 })).toBe("identity.reset_session_expired");
  });
});
