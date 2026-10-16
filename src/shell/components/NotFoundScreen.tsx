import Link from "next/link";
import { getTranslations } from "next-intl/server";

import ui from "@/shell/styles/ui.module.css";

type Props = { variant?: "page" | "conversation" };

/** Localized not-found body with a way back to the chat list. */
export async function NotFoundScreen({ variant = "page" }: Props) {
  const t = await getTranslations("shell.errors");
  return (
    <div style={{ padding: "2rem" }}>
      {variant === "conversation" ? (
        <p role="status">{t("conversationNotFound")}</p>
      ) : (
        <>
          <h1>{t("notFoundTitle")}</h1>
          <p>{t("notFoundBody")}</p>
        </>
      )}
      <Link href="/app/chats" className={`${ui.btn} ${ui.btnPrimary}`}>
        {t("backToChats")}
      </Link>
    </div>
  );
}
