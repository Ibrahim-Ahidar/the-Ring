// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { changeEmailAction, changePasswordAction } from "../actions";
import en from "../messages/en.json";
import { ChangeEmailCard } from "./ChangeEmailCard";
import { ChangePasswordCard } from "./ChangePasswordCard";
import { PASSWORD_UPDATED_FLAG, PasswordUpdatedToast } from "./PasswordUpdatedToast";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("../actions", () => ({
  changePasswordAction: vi.fn(),
  changeEmailAction: vi.fn(),
}));

const changePassword = vi.mocked(changePasswordAction);
const changeEmail = vi.mocked(changeEmailAction);

function withIntl(node: React.ReactNode) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ identity: en }}>
      {node}
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  changePassword.mockReset();
  changeEmail.mockReset();
  window.sessionStorage.clear();
});
afterEach(cleanup);

describe("ChangePasswordCard", () => {
  async function fill(user: ReturnType<typeof userEvent.setup>, current: string, next: string, confirm = next) {
    await user.type(screen.getByLabelText("Current password"), current);
    await user.type(screen.getByLabelText("New password"), next);
    await user.type(screen.getByLabelText("Confirm new password"), confirm);
    await user.click(screen.getByRole("button", { name: "Change password" }));
  }

  it("changes the password and signs out other devices by default", async () => {
    changePassword.mockResolvedValue({ ok: true, value: undefined });
    const user = userEvent.setup();
    withIntl(<ChangePasswordCard />);

    expect(screen.getByLabelText<HTMLInputElement>("Sign out of all other devices").checked).toBe(true);
    await fill(user, "old-secret1", "new-secret1");

    expect(changePassword).toHaveBeenCalledWith({
      currentPassword: "old-secret1",
      newPassword: "new-secret1",
      signOutOthers: true,
    });
    // Announced through the shell toast, which survives the page re-render.
    expect(window.sessionStorage.getItem(PASSWORD_UPDATED_FLAG)).toBe("1");
    expect(screen.getByLabelText<HTMLInputElement>("Current password").value).toBe("");
  });

  it("shows the toast at once when it is already mounted", async () => {
    changePassword.mockResolvedValue({ ok: true, value: undefined });
    const user = userEvent.setup();
    withIntl(
      <>
        <PasswordUpdatedToast />
        <ChangePasswordCard />
      </>,
    );

    await fill(user, "old-secret1", "new-secret1");

    expect((await screen.findByRole("status")).textContent).toBe("Password updated");
    expect(window.sessionStorage.getItem(PASSWORD_UPDATED_FLAG)).toBeNull();
  });

  it("shows a wrong current password under that field", async () => {
    changePassword.mockResolvedValue({
      ok: false,
      error: { code: "identity.current_password_wrong" },
    });
    const user = userEvent.setup();
    withIntl(<ChangePasswordCard />);

    await fill(user, "guess-123", "new-secret1");

    const current = screen.getByLabelText("Current password");
    expect(await screen.findByText("That isn’t your current password.")).toBeTruthy();
    expect(current.getAttribute("aria-invalid")).toBe("true");
    expect(document.activeElement).toBe(current);
  });

  it("checks the new password and confirmation before calling the server", async () => {
    const user = userEvent.setup();
    withIntl(<ChangePasswordCard />);

    await fill(user, "old-secret1", "new-secret1", "new-secret2");

    expect(changePassword).not.toHaveBeenCalled();
    expect(screen.getByText("The passwords don't match.")).toBeTruthy();
  });
});

describe("ChangeEmailCard", () => {
  it("shows the current address and a pending change after submitting", async () => {
    changeEmail.mockResolvedValue({ ok: true, value: { pendingEmail: "new@pulse.test" } });
    const user = userEvent.setup();
    withIntl(<ChangeEmailCard email="me@pulse.test" pendingEmail={null} />);

    expect(screen.getByText("me@pulse.test")).toBeTruthy();
    await user.type(screen.getByLabelText("New email"), "new@pulse.test");
    await user.click(screen.getByRole("button", { name: "Change email" }));

    const pending = await screen.findByRole("status");
    expect(pending.textContent).toContain("Check both inboxes");
    expect(pending.textContent).toContain("new@pulse.test");
  });

  it("keeps showing a change that is still pending on load", () => {
    withIntl(<ChangeEmailCard email="me@pulse.test" pendingEmail="next@pulse.test" />);
    expect(screen.getByRole("status").textContent).toContain("next@pulse.test");
  });

  it("explains a taken address under the field", async () => {
    changeEmail.mockResolvedValue({ ok: false, error: { code: "identity.email_taken" } });
    const user = userEvent.setup();
    withIntl(<ChangeEmailCard email="me@pulse.test" pendingEmail={null} />);

    await user.type(screen.getByLabelText("New email"), "taken@pulse.test");
    await user.click(screen.getByRole("button", { name: "Change email" }));

    expect(await screen.findByText("That email is already in use.")).toBeTruthy();
  });
});
