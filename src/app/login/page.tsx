import { getTranslations } from "next-intl/server";

import { LoginForm } from "@/features/identity/components/LoginForm";
import styles from "@/features/identity/identity.module.css";

export default async function LoginPage() {
  const t = await getTranslations("identity");

  return (
    <main className={styles.stack} style={{ margin: "var(--space-24)" }}>
      <h1 className="route-frame-title">{t("loginTitle")}</h1>
      <LoginForm />
    </main>
  );
}
