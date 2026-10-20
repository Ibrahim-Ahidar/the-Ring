import { validateUsername } from "@pulse/core/username";

import { meetsPasswordPolicy } from "./password-policy";

/** Light shape check; the server stays the authority on deliverability. */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function emailError(email: string): string | null {
  const value = email.trim();
  if (!value) {
    return "identity.email_required";
  }
  return EMAIL_PATTERN.test(value) ? null : "identity.email_invalid";
}

export function newPasswordError(password: string): string | null {
  if (!password) {
    return "identity.password_required";
  }
  return meetsPasswordPolicy(password) ? null : "identity.password_weak";
}

export function usernameError(username: string): string | null {
  const result = validateUsername(username);
  return result.ok ? null : result.error.code;
}

export type LoginField = "email" | "password";
export type SignupField = "email" | "username" | "password" | "confirm";

export type FieldErrors<F extends string> = Partial<Record<F, string>>;

export function validateLogin(input: { email: string; password: string }): FieldErrors<LoginField> {
  const errors: FieldErrors<LoginField> = {};
  const email = emailError(input.email);
  if (email) {
    errors.email = email;
  }
  if (!input.password) {
    errors.password = "identity.password_required";
  }
  return errors;
}

export function validateSignup(input: {
  email: string;
  username: string;
  password: string;
  confirm: string;
}): FieldErrors<SignupField> {
  const errors: FieldErrors<SignupField> = {};
  const email = emailError(input.email);
  if (email) {
    errors.email = email;
  }
  const username = usernameError(input.username);
  if (username) {
    errors.username = username;
  }
  const password = newPasswordError(input.password);
  if (password) {
    errors.password = password;
  } else if (input.password !== input.confirm) {
    errors.confirm = "identity.password_mismatch";
  }
  return errors;
}

/** Which signup field a server error code belongs to, if any. */
export function signupFieldForError(code: string): SignupField | null {
  if (code.startsWith("identity.username_")) {
    return "username";
  }
  if (code === "identity.password_weak") {
    return "password";
  }
  if (code === "identity.email_invalid") {
    return "email";
  }
  return null;
}
