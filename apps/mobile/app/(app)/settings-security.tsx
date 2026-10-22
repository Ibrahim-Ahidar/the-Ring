import { useQueryClient } from "@tanstack/react-query";
import * as Clipboard from "expo-clipboard";
import { useRouter } from "expo-router";
import { LogOut, Monitor, Smartphone, Tablet } from "lucide-react-native";
import { useState } from "react";
import { Alert, ScrollView, View } from "react-native";
import { SvgXml } from "react-native-svg";
import { useLocale, useTranslations } from "use-intl";

import {
  cancelTotpEnrollment,
  changePassword,
  enrollTotp,
  MAX_TOTP_FACTORS,
  removeTotpFactor,
  revokeOtherSessions,
  revokeSession,
  signOut,
  verifyTotpEnrollment,
  type DeviceSession,
  type MfaEnrollment,
  type MfaFactor,
} from "@/data";
import { describeDeviceLabel, formatLastActive, orderSessions } from "@/security/display";
import { useMfaFactors, useSessions } from "@/security/queries";
import { AppHeader, Banner, Button, ErrorState, ListRow, LoadingState, Screen, Text, TextField, ToggleRow, useTheme } from "@/ui";

type Feedback = { kind: "success" | "error"; message: string } | null;
type PasswordField = "current" | "next" | "confirm";

const FIELD_FOR_CODE: Record<string, PasswordField> = {
  "identity.current_password_wrong": "current",
  "identity.password_required": "current",
  "identity.password_weak": "next",
  "identity.password_same": "next",
  "identity.password_mismatch": "confirm",
};
const KIND_ICON = { desktop: Monitor, mobile: Smartphone, tablet: Tablet } as const;

function useCard() {
  const { colors, spacing, radii } = useTheme();
  return {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.card,
    marginHorizontal: spacing.s16,
    marginTop: spacing.s16,
    padding: spacing.s16,
    gap: spacing.s12,
  };
}

function useMessage() {
  const t = useTranslations("mobile.identity");
  return (code: string | undefined) =>
    code && t.has(`errors.${code}`) ? t(`errors.${code}`) : t("errors.platform.unexpected");
}

function FeedbackText({ feedback }: { feedback: Feedback }) {
  const { colors } = useTheme();
  if (!feedback) return null;
  return (
    <Text variant="caption" style={{ color: feedback.kind === "error" ? colors.danger : colors.accent }}>
      {feedback.message}
    </Text>
  );
}

/** Same order as the web /app/settings/security: password, two-factor, sessions, sign out. */
export default function SecurityScreen() {
  const tr = useTranslations();
  const router = useRouter();
  const back = () => (router.canGoBack() ? router.back() : router.replace("/settings"));

  return (
    <Screen edges={["start", "end"]} background="panel">
      <AppHeader title={tr("routes.settingsSecurity")} onBack={back} backLabel={tr("mobile.chats.back")} />
      <ScrollView contentContainerStyle={{ paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
        <ChangePasswordCard />
        <TwoFactorCard />
        <SessionsCard />
        <SignOutCard />
      </ScrollView>
    </Screen>
  );
}

function ChangePasswordCard() {
  const t = useTranslations("mobile.identity");
  const message = useMessage();
  const card = useCard();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [signOutOthers, setSignOutOthers] = useState(true);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<PasswordField, string>>>({});
  const [feedback, setFeedback] = useState<Feedback>(null);

  async function submit() {
    setErrors({});
    setFeedback(null);
    if (current && next && confirm !== next) {
      setErrors({ confirm: message("identity.password_mismatch") });
      return;
    }
    setBusy(true);
    const result = await changePassword({ currentPassword: current, newPassword: next, signOutOthers });
    setBusy(false);
    if (!result.ok) {
      const field = FIELD_FOR_CODE[result.error.code];
      if (field) setErrors({ [field]: message(result.error.code) });
      else setFeedback({ kind: "error", message: message(result.error.code) });
      return;
    }
    setCurrent("");
    setNext("");
    setConfirm("");
    setFeedback({ kind: "success", message: t("passwordUpdated") });
  }

  return (
    <View style={card}>
      <Text variant="bodyStrong">{t("passwordTitle")}</Text>
      <Text variant="caption" tone="textMuted">
        {t("passwordHint")}
      </Text>
      <TextField
        label={t("currentPasswordLabel")}
        value={current}
        onChangeText={setCurrent}
        secure
        autoComplete="current-password"
        error={errors.current}
      />
      <TextField
        label={t("newPasswordLabel")}
        hint={t("newPasswordHint", { min: 8 })}
        value={next}
        onChangeText={setNext}
        secure
        autoComplete="new-password"
        error={errors.next}
      />
      <TextField
        label={t("confirmPasswordLabel")}
        value={confirm}
        onChangeText={setConfirm}
        secure
        autoComplete="new-password"
        error={errors.confirm}
      />
      <ToggleRow title={t("signOutOthersOnChange")} value={signOutOthers} onValueChange={setSignOutOthers} />
      <FeedbackText feedback={feedback} />
      <Button
        title={busy ? t("submitting") : t("changePasswordSubmit")}
        loading={busy}
        disabled={busy}
        onPress={() => void submit()}
      />
    </View>
  );
}

/** Supabase hands the QR as an SVG data URI. */
function qrXml(dataUri: string): string {
  const body = dataUri.slice(dataUri.indexOf(",") + 1);
  try {
    return decodeURIComponent(body);
  } catch {
    return body;
  }
}

type MfaStep = { kind: "idle" } | { kind: "enroll"; enrollment: MfaEnrollment } | { kind: "remove"; factor: MfaFactor };

function TwoFactorCard() {
  const t = useTranslations("mobile.identity");
  const message = useMessage();
  const card = useCard();
  const { spacing } = useTheme();
  const queryClient = useQueryClient();
  const factors = useMfaFactors();
  const [step, setStep] = useState<MfaStep>({ kind: "idle" });
  const [code, setCode] = useState("");
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);

  const list = factors.data ?? [];
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["security", "mfa"] });
  const reset = () => {
    setStep({ kind: "idle" });
    setCode("");
    setCopied(false);
  };

  async function startEnroll() {
    setFeedback(null);
    setBusy(true);
    const result = await enrollTotp(`${t("mfaDefaultName")} ${list.length + 1}`);
    setBusy(false);
    if (!result.ok) return setFeedback({ kind: "error", message: message(result.error.code) });
    setCode("");
    setStep({ kind: "enroll", enrollment: result.value });
  }

  async function confirmEnroll(enrollment: MfaEnrollment) {
    const hadOne = list.length === 1;
    setBusy(true);
    const result = await verifyTotpEnrollment(enrollment.factorId, code);
    setBusy(false);
    if (!result.ok) return setFeedback({ kind: "error", message: message(result.error.code) });
    reset();
    await refresh();
    setFeedback({ kind: "success", message: hadOne ? t("mfaEnabledSecond") : t("mfaEnabled") });
  }

  async function cancelEnroll(enrollment: MfaEnrollment) {
    reset();
    setFeedback(null);
    await cancelTotpEnrollment(enrollment.factorId);
  }

  async function confirmRemove(factor: MfaFactor) {
    setBusy(true);
    const result = await removeTotpFactor(factor.id, code);
    setBusy(false);
    if (!result.ok) return setFeedback({ kind: "error", message: message(result.error.code) });
    reset();
    await refresh();
    setFeedback({ kind: "success", message: t("mfaRemoved") });
  }

  const codeField = (
    <TextField
      label={t("mfaCodeLabel")}
      value={code}
      onChangeText={(v) => setCode(v.replace(/\D/g, "").slice(0, 6))}
      keyboardType="number-pad"
      autoComplete="one-time-code"
      textContentType="oneTimeCode"
      maxLength={6}
    />
  );

  return (
    <View style={card}>
      <Text variant="bodyStrong">{t("mfaTitle")}</Text>
      <Text variant="caption" tone="textMuted">
        {t("mfaHint")}
      </Text>
      {factors.isPending ? <LoadingState /> : null}
      {factors.isError ? <Banner kind="error" message={message(undefined)} /> : null}

      <View style={{ marginHorizontal: -spacing.s16 }}>
        {list.map((factor) => (
          <ListRow
            key={factor.id}
            title={factor.friendlyName || t("mfaDefaultName")}
            trailing={
              step.kind === "idle" ? (
                <Button
                  title={t("mfaRemove")}
                  variant="secondary"
                  size="sm"
                  onPress={() => {
                    setFeedback(null);
                    setCode("");
                    setStep({ kind: "remove", factor });
                  }}
                />
              ) : undefined
            }
          />
        ))}
      </View>

      {step.kind === "enroll" ? (
        <View style={{ gap: spacing.s12 }}>
          <Text>{t("mfaScan")}</Text>
          <View accessibilityLabel={t("mfaQrAlt")} style={{ alignSelf: "center", backgroundColor: "#fff", padding: spacing.s8 }}>
            <SvgXml xml={qrXml(step.enrollment.qrCode)} width={180} height={180} />
          </View>
          <Text variant="label" tone="textMuted">
            {t("mfaSecretLabel")}
          </Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.s8 }}>
            <Text selectable style={{ flex: 1, fontFamily: "monospace" }}>
              {step.enrollment.secret}
            </Text>
            <Button
              title={copied ? t("mfaCopied") : t("mfaCopy")}
              variant="secondary"
              size="sm"
              onPress={() => void Clipboard.setStringAsync(step.enrollment.secret).then(() => setCopied(true))}
            />
          </View>
          {codeField}
          <View style={{ flexDirection: "row", gap: spacing.s8 }}>
            <Button
              title={t("mfaConfirm")}
              loading={busy}
              disabled={busy || code.length !== 6}
              onPress={() => void confirmEnroll(step.enrollment)}
            />
            <Button title={t("mfaCancel")} variant="secondary" disabled={busy} onPress={() => void cancelEnroll(step.enrollment)} />
          </View>
        </View>
      ) : null}

      {step.kind === "remove" ? (
        <View style={{ gap: spacing.s12 }}>
          <Text>{t("mfaRemovePrompt")}</Text>
          {codeField}
          <View style={{ flexDirection: "row", gap: spacing.s8 }}>
            <Button
              title={t("mfaRemoveConfirm")}
              variant="danger"
              loading={busy}
              disabled={busy || code.length !== 6}
              onPress={() => void confirmRemove(step.factor)}
            />
            <Button title={t("mfaCancel")} variant="secondary" disabled={busy} onPress={reset} />
          </View>
        </View>
      ) : null}

      {step.kind === "idle" && factors.isSuccess && list.length < MAX_TOTP_FACTORS ? (
        <View style={{ gap: spacing.s8 }}>
          {list.length === 1 ? (
            <Text variant="caption" tone="textMuted">
              {t("mfaBackupPrompt")}
            </Text>
          ) : null}
          <Button
            title={list.length === 0 ? t("mfaEnable") : t("mfaAddBackup")}
            loading={busy}
            disabled={busy}
            onPress={() => void startEnroll()}
          />
        </View>
      ) : null}

      {list.length > 0 ? (
        <Text variant="caption" tone="textMuted">
          {t("mfaLostHint")}
        </Text>
      ) : null}
      <FeedbackText feedback={feedback} />
    </View>
  );
}

function SessionsCard() {
  const t = useTranslations("mobile.identity");
  const locale = useLocale();
  const message = useMessage();
  const card = useCard();
  const { spacing } = useTheme();
  const queryClient = useQueryClient();
  const sessions = useSessions();
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [feedback, setFeedback] = useState<Feedback>(null);

  const currentId = sessions.data?.currentId ?? null;
  const rows = orderSessions(sessions.data?.sessions ?? [], currentId).filter((s) => !hidden.has(s.id));
  const others = rows.filter((s) => s.id !== currentId);
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ["security", "sessions"] });

  const nameOf = (s: DeviceSession) => {
    const parts = describeDeviceLabel(s.device_label);
    return parts ? t("deviceLabel", { browser: parts.browser, os: parts.os }) : s.device_label?.trim() || t("unknownDevice");
  };
  const subtitleOf = (s: DeviceSession) => {
    const when = formatLastActive(s.last_seen_at ?? s.created_at, locale);
    if (when) return t("lastSeen", { when });
    return s.id === currentId ? t("activeNow") : t("lastSeen", { when: t("justNow") });
  };

  const hide = (ids: string[]) => setHidden((h) => new Set([...h, ...ids]));
  const unhide = (ids: string[]) =>
    setHidden((h) => {
      const n = new Set(h);
      ids.forEach((id) => n.delete(id));
      return n;
    });

  function confirmRevoke(s: DeviceSession) {
    Alert.alert(t("revokeConfirmTitle"), t("revokeConfirmBody", { device: nameOf(s) }), [
      { text: t("cancel"), style: "cancel" },
      {
        text: t("revokeSession"),
        style: "destructive",
        onPress: async () => {
          setFeedback(null);
          hide([s.id]);
          const result = await revokeSession(s.id);
          if (!result.ok) {
            unhide([s.id]);
            setFeedback({ kind: "error", message: message(result.error.code) });
          } else refresh();
        },
      },
    ]);
  }

  function confirmRevokeOthers() {
    const ids = others.map((s) => s.id);
    Alert.alert(t("revokeOthersTitle"), t("revokeOthersBody"), [
      { text: t("cancel"), style: "cancel" },
      {
        text: t("revokeOthers"),
        style: "destructive",
        onPress: async () => {
          setFeedback(null);
          hide(ids);
          const result = await revokeOtherSessions();
          if (!result.ok) {
            unhide(ids);
            setFeedback({ kind: "error", message: message(result.error.code) });
            return;
          }
          setFeedback({ kind: "success", message: t("revokedOthers", { count: result.value }) });
          refresh();
        },
      },
    ]);
  }

  return (
    <View style={card}>
      <Text variant="bodyStrong">{t("sessionsTitle")}</Text>
      <Text variant="caption" tone="textMuted">
        {t("sessionsHint")}
      </Text>
      {sessions.isPending ? <LoadingState /> : null}
      {sessions.isError ? <ErrorState message={message(undefined)} onRetry={() => void sessions.refetch()} /> : null}
      <View style={{ marginHorizontal: -spacing.s16 }}>
        {rows.map((s) => (
          <ListRow
            key={s.id}
            icon={KIND_ICON[describeDeviceLabel(s.device_label)?.kind ?? "desktop"]}
            title={nameOf(s)}
            subtitle={subtitleOf(s)}
            trailing={
              s.id === currentId ? (
                <Text variant="caption" tone="textMuted">
                  {t("currentSession")}
                </Text>
              ) : (
                <Button title={t("revokeSession")} variant="secondary" size="sm" onPress={() => confirmRevoke(s)} />
              )
            }
          />
        ))}
        {others.length > 0 ? <ListRow icon={LogOut} title={t("revokeOthers")} destructive onPress={confirmRevokeOthers} /> : null}
      </View>
      <FeedbackText feedback={feedback} />
    </View>
  );
}

function SignOutCard() {
  const t = useTranslations("mobile.identity");
  const tr = useTranslations();
  const card = useCard();
  const { spacing } = useTheme();
  const queryClient = useQueryClient();
  const [failed, setFailed] = useState(false);

  async function logout() {
    setFailed(false);
    const result = await signOut();
    // Drop cached server state so the next account never sees this one's data.
    queryClient.clear();
    if (!result.ok) setFailed(true);
  }

  return (
    <View style={[card, { paddingVertical: spacing.s8 }]}>
      {failed ? <Banner kind="error" message={tr("mobile.logout.error")} /> : null}
      <View style={{ marginHorizontal: -spacing.s16 }}>
        <ListRow icon={LogOut} title={t("signOut")} destructive onPress={() => void logout()} />
      </View>
    </View>
  );
}
