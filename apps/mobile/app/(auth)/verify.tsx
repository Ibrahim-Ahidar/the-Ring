import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslations } from "use-intl";

import { AuthShell } from "@/auth/AuthShell";
import { signOut, verifySignInMfa } from "@/data";
import { Button, Text, TextField } from "@/ui";

/** Second sign-in step, same as the web /login/verify. The auth gate moves on once the session is AAL2. */
export default function VerifyScreen() {
  const t = useTranslations("mobile.identity");
  const queryClient = useQueryClient();
  const [code, setCode] = useState("");
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const message = (c: string) => (t.has(`errors.${c}`) ? t(`errors.${c}`) : t("errors.platform.unexpected"));

  async function submit() {
    if (code.length !== 6) {
      setErrorCode("identity.mfa_code_invalid");
      return;
    }
    setBusy(true);
    setErrorCode(null);
    const result = await verifySignInMfa(code);
    setBusy(false);
    if (!result.ok) {
      setErrorCode(result.error.code);
      setCode("");
    }
  }

  async function useAnotherAccount() {
    setBusy(true);
    await signOut();
    queryClient.clear();
    setBusy(false);
  }

  return (
    <AuthShell title={t("mfaVerifyTitle")} subtitle={t("mfaVerifySubtitle")} error={errorCode ? message(errorCode) : null}>
      <TextField
        label={t("mfaCodeLabel")}
        value={code}
        onChangeText={(v) => {
          setCode(v.replace(/\D/g, "").slice(0, 6));
          if (errorCode) setErrorCode(null);
        }}
        keyboardType="number-pad"
        autoComplete="one-time-code"
        textContentType="oneTimeCode"
        maxLength={6}
        autoFocus
        returnKeyType="go"
        onSubmitEditing={() => void submit()}
      />
      <Text variant="caption" tone="textMuted">
        {t("mfaLostHint")}
      </Text>
      <Button title={busy ? t("mfaVerifying") : t("mfaVerifySubmit")} onPress={() => void submit()} loading={busy} disabled={busy} block />
      <Button title={t("mfaUseAnotherAccount")} variant="secondary" onPress={() => void useAnotherAccount()} disabled={busy} block />
    </AuthShell>
  );
}
