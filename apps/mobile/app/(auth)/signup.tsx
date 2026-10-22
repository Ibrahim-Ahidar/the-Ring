import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { useTranslations } from "use-intl";

import { accountErrorKey } from "@/account/errors";
import { AuthLink, AuthShell } from "@/auth/AuthShell";
import { MIN_PASSWORD_LENGTH, validateUsername } from "@pulse/core";
import { checkUsernameAvailable, resendSignupCode, signUpWithPassword, verifySignupCode } from "@/data";
import { Button, Text, TextField, useTheme } from "@/ui";

export default function SignupScreen() {
  const t = useTranslations();
  const id = useTranslations("mobile.identity");
  const router = useRouter();
  const { spacing } = useTheme();
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [availability, setAvailability] = useState<"idle" | "checking" | "available" | "taken">("idle");
  const [code, setCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Same live check as the web SignupForm: debounced, only for a well-formed username.
  useEffect(() => {
    if (!validateUsername(username).ok) {
      setAvailability("idle");
      return;
    }
    setAvailability("checking");
    let live = true;
    const timer = setTimeout(() => {
      void checkUsernameAvailable(username).then((result) => {
        if (live) setAvailability(result.ok ? (result.value ? "available" : "taken") : "idle");
      });
    }, 400);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [username]);

  const errorText = (code: string) =>
    t.has(`mobile.identity.errors.${code}`) ? t(`mobile.identity.errors.${code}`) : t(accountErrorKey(code, t.has));

  async function submit() {
    if (!codeSent && password !== confirm) {
      setErrorCode("identity.password_mismatch");
      return;
    }
    setBusy(true);
    setErrorCode(null);
    setInfo(null);
    const result = codeSent
      ? await verifySignupCode(email, code)
      : await signUpWithPassword({ email, password, username, displayName });
    setBusy(false);
    if (!result.ok) {
      setErrorCode(result.error.code);
      return;
    }
    // After the code is accepted the auth gate opens the app.
    if (!codeSent) setCodeSent(true);
  }

  async function resend() {
    setErrorCode(null);
    const result = await resendSignupCode(email);
    if (result.ok) setInfo(t("mobile.account.codeResent"));
    else setErrorCode(result.error.code);
  }

  return (
    <AuthShell
      title={id("signupTitle")}
      subtitle={codeSent ? t("mobile.account.codeSentTo", { email: email.trim() }) : id("signupSubtitle")}
      error={errorCode ? errorText(errorCode) : null}
      info={info}
      footer={
        <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.s4 }}>
          <Text tone="textMuted">{id("hasAccount")}</Text>
          <AuthLink label={id("loginLink")} onPress={() => router.replace("/login")} />
        </View>
      }
    >
      {codeSent ? (
        <>
          <TextField
            label={t("mobile.account.code")}
            value={code}
            onChangeText={setCode}
            keyboardType="number-pad"
            maxLength={6}
            autoComplete="one-time-code"
            textContentType="oneTimeCode"
          />
          <Button title={t("mobile.account.verify")} onPress={() => void submit()} loading={busy} block />
          <Button title={t("mobile.account.resend")} variant="ghost" onPress={() => void resend()} block />
        </>
      ) : (
        <>
          <TextField
            label={id("emailLabel")}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            returnKeyType="next"
          />
          <TextField
            label={id("usernameLabel")}
            hint={
              availability === "checking"
                ? id("usernameChecking")
                : availability === "available"
                  ? id("usernameAvailable", { username })
                  : id("usernameHint")
            }
            error={availability === "taken" ? errorText("identity.username_taken") : undefined}
            value={username}
            onChangeText={setUsername}
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={20}
            returnKeyType="next"
          />
          <TextField
            label={id("passwordLabel")}
            hint={id("newPasswordHint", { min: MIN_PASSWORD_LENGTH })}
            value={password}
            onChangeText={setPassword}
            autoCapitalize="none"
            secure
            textContentType="newPassword"
            returnKeyType="next"
          />
          <TextField
            label={id("confirmSignupPasswordLabel")}
            value={confirm}
            onChangeText={setConfirm}
            autoCapitalize="none"
            secure
            textContentType="newPassword"
            returnKeyType="next"
          />
          <TextField
            label={id("displayNameLabel")}
            hint={id("displayNameHint")}
            value={displayName}
            onChangeText={setDisplayName}
            maxLength={50}
            returnKeyType="go"
            onSubmitEditing={() => void submit()}
          />
          {errorCode === "identity.email_registered" ? (
            <AuthLink label={id("loginInstead")} onPress={() => router.replace("/login")} />
          ) : null}
          <Button
            title={busy ? id("submittingSignup") : id("submitSignup")}
            onPress={() => void submit()}
            loading={busy}
            block
          />
        </>
      )}
    </AuthShell>
  );
}
