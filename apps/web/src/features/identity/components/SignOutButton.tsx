"use client";

import { LogOut } from "lucide-react";
import { useCallback, useState } from "react";
import { useTranslations } from "next-intl";

import { resetTextOutbox } from "@/features/direct-messaging/lib/text-outbox";
import { deleteLocalDatabase } from "@/platform/local-store";
import ui from "@/shell/styles/ui.module.css";
import { signOutAction } from "../actions";

function SignOutButtonInner() {
  const t = useTranslations("identity");
  const [pending, setPending] = useState(false);

  const onClick = useCallback(async () => {
    setPending(true);
    // Logout deletes the on-device database (no-op with the e2ee flag off).
    resetTextOutbox();
    await deleteLocalDatabase().catch(() => {});
    const result = await signOutAction();
    if (!result.ok) {
      setPending(false);
    }
  }, []);

  return (
    <button
      type="button"
      className={`${ui.listRow} ${ui.listRowDanger}`}
      onClick={onClick}
      disabled={pending}
    >
      <LogOut size={24} className="flip-rtl" aria-hidden />
      <span className={ui.listRowBody}>
        <span className={ui.listRowTitle}>{pending ? t("submitting") : t("signOut")}</span>
      </span>
    </button>
  );
}

export const SignOutButton = SignOutButtonInner;
