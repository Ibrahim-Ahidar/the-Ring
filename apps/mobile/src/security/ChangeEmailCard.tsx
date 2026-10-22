import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { View } from "react-native";
import { useTranslations } from "use-intl";

import { changeEmail } from "@/data";
import { Banner, Button, Text, TextField, useTheme } from "@/ui";

import { useEmailState } from "./queries";

/** Mirrors the web ChangeEmailCard: current address, pending change, and a new-address form. */
export function ChangeEmailCard() {
  const t = useTranslations("mobile.identity");
  const { colors, spacing, radii } = useTheme();
  const queryClient = useQueryClient();
  const state = useEmailState();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [formError, setFormError] = useState<string | null>(null);

  const current = state.data?.email ?? "";
  const pending = state.data?.pendingEmail ?? null;
  const message = (code: string) => (t.has(`errors.${code}`) ? t(`errors.${code}`) : t("errors.platform.unexpected"));
  const strong = (chunks: React.ReactNode) => <Text variant="bodyStrong">{chunks}</Text>;

  async function submit() {
    setFieldError(undefined);
    setFormError(null);
    setBusy(true);
    const result = await changeEmail(current, email);
    setBusy(false);
    if (!result.ok) {
      const code = result.error.code;
      if (code.startsWith("identity.email_")) setFieldError(message(code));
      else setFormError(message(code));
      return;
    }
    setEmail("");
    queryClient.setQueryData(["security", "email"], { email: current, pendingEmail: result.value.pendingEmail });
  }

  return (
    <View
      style={{
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: radii.card,
        marginHorizontal: spacing.s16,
        marginTop: spacing.s16,
        padding: spacing.s16,
        gap: spacing.s12,
      }}
    >
      <Text variant="bodyStrong">{t("emailTitle")}</Text>
      {current ? (
        <Text variant="caption" tone="textMuted">
          {t.rich("emailHint", { email: () => strong(current) })}
        </Text>
      ) : null}
      {pending ? (
        <Text variant="caption" tone="textMuted">
          {t.rich("emailPending", { email: () => strong(pending) })}
        </Text>
      ) : null}
      {formError ? <Banner kind="error" message={formError} /> : null}
      <TextField
        label={t("newEmailLabel")}
        value={email}
        onChangeText={(v) => {
          setEmail(v);
          setFieldError(undefined);
        }}
        error={fieldError}
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
      />
      <Button
        title={t("emailChangeSubmit")}
        loading={busy}
        disabled={busy || !email.trim()}
        onPress={() => void submit()}
      />
    </View>
  );
}
