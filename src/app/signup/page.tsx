import { getTranslations } from "next-intl/server";

import { SignupForm } from "@/features/identity/components/SignupForm";
import styles from "@/features/identity/identity.module.css";

export default async function SignupPage() {
  const t = await getTranslations("identity");

  return (
    <main className={styles.stack} style={{ margin: "var(--space-24)" }}>
      <h1 className="route-frame-title">{t("signupTitle")}</h1>
      <SignupForm />
    </main>
  );
}
