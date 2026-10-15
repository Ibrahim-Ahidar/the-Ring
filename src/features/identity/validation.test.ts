import { describe, expect, it } from "vitest";

import { meetsPasswordPolicy, MIN_PASSWORD_LENGTH } from "./password-policy";
import { signupFieldForError, validateLogin, validateSignup } from "./validation";

describe("meetsPasswordPolicy", () => {
  it("requires the minimum length, a letter, and a digit", () => {
    expect(MIN_PASSWORD_LENGTH).toBe(8);
    expect(meetsPasswordPolicy("abc12")).toBe(false);
    expect(meetsPasswordPolicy("abcdefgh")).toBe(false);
    expect(meetsPasswordPolicy("12345678")).toBe(false);
    expect(meetsPasswordPolicy("abcdefg1")).toBe(true);
    // Mirrors the server: non-ASCII letters do not count toward `letters_digits`.
    expect(meetsPasswordPolicy("كلمةسرية1")).toBe(false);
    expect(meetsPasswordPolicy("كلمةسرية1a")).toBe(true);
  });
});

describe("validateLogin", () => {
  it("flags missing and malformed fields before any request", () => {
    expect(validateLogin({ email: "", password: "" })).toEqual({
      email: "identity.email_required",
      password: "identity.password_required",
    });
    expect(validateLogin({ email: "not-an-email", password: "x" })).toEqual({
      email: "identity.email_invalid",
    });
    expect(validateLogin({ email: " a@b.co ", password: "x" })).toEqual({});
  });
});

describe("validateSignup", () => {
  const valid = {
    email: "new@pulse.test",
    username: "new_member",
    password: "secret123",
    confirm: "secret123",
  };

  it("accepts a valid form", () => {
    expect(validateSignup(valid)).toEqual({});
  });

  it("reports each invalid field", () => {
    expect(
      validateSignup({ email: "x", username: "1abc", password: "short", confirm: "" }),
    ).toEqual({
      email: "identity.email_invalid",
      username: "identity.username_invalid_start",
      password: "identity.password_weak",
    });
  });

  it("checks the confirmation only once the password itself is valid", () => {
    expect(validateSignup({ ...valid, confirm: "secret124" })).toEqual({
      confirm: "identity.password_mismatch",
    });
  });
});

describe("signupFieldForError", () => {
  it("routes server errors to their field", () => {
    expect(signupFieldForError("identity.username_taken")).toBe("username");
    expect(signupFieldForError("identity.password_weak")).toBe("password");
    expect(signupFieldForError("identity.email_invalid")).toBe("email");
    expect(signupFieldForError("platform.rate_limited")).toBeNull();
  });
});
