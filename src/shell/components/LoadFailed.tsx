"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

import ui from "@/shell/styles/ui.module.css";

/** Shown where a list failed to load, so an outage is not mistaken for "empty". */
export function LoadFailed() {
  const t = useTranslations("shell.errors");
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <div role="alert" style={{ textAlign: "center", padding: "1.5rem 1rem" }}>
      <p>{t("loadFailed")}</p>
      <button
        type="button"
        className={`${ui.btn} ${ui.btnPrimary}`}
        disabled={pending}
        onClick={() => startTransition(() => router.refresh())}
      >
        {t("retry")}
      </button>
    </div>
  );
}
