/** Matches `auth.minimum_password_length` and `password_requirements = "letters_digits"` in supabase/config.toml. */
export const MIN_PASSWORD_LENGTH = 8;

/** GoTrue's `letters_digits` rule only counts ASCII letters and digits, so this does too. */
export function meetsPasswordPolicy(password: string): boolean {
  return password.length >= MIN_PASSWORD_LENGTH && /[A-Za-z]/.test(password) && /[0-9]/.test(password);
}
