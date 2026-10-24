"use client";

import { useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";

import type { BackupSecret } from "@pulse/core/backup";

import { getLocalStore } from "@/platform/local-store";
import styles from "../backup.module.css";
import {
  backupFileName,
  createBackupFile,
  createRecoveryKey,
  restoreFromBackupFile,
  type BackupFailure,
} from "../service";
import { useBackupErrorText } from "./useBackupErrorText";

type Mode = "passphrase" | "recovery";

function download(bytes: Uint8Array, name: string) {
  const url = URL.createObjectURL(
    new Blob([bytes as BlobPart], { type: "application/octet-stream" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

function ModeChoice({ mode, setMode }: { mode: Mode; setMode: (m: Mode) => void }) {
  const t = useTranslations("backup");
  return (
    <div className={styles.row} role="radiogroup" aria-label={t("protectWith")}>
      <label>
        <input type="radio" checked={mode === "passphrase"} onChange={() => setMode("passphrase")} />{" "}
        {t("passphrase")}
      </label>
      <label>
        <input type="radio" checked={mode === "recovery"} onChange={() => setMode("recovery")} />{" "}
        {t("recoveryKey")}
      </label>
    </div>
  );
}

export function ExportBackup() {
  const t = useTranslations("backup");
  const errorText = useBackupErrorText();
  const [mode, setMode] = useState<Mode>("passphrase");
  const [pass, setPass] = useState("");
  const [confirm, setConfirm] = useState("");
  const [recovery] = useState(() => createRecoveryKey());
  const [includeMedia, setIncludeMedia] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setDone(false);
    if (mode === "passphrase" && pass !== confirm) {
      setError(t("mismatch"));
      return;
    }
    const secret: BackupSecret =
      mode === "passphrase"
        ? { kind: "passphrase", passphrase: pass }
        : { kind: "recovery", recoveryKey: recovery };
    setBusy(true);
    const res = await createBackupFile(await getLocalStore(), secret, includeMedia);
    setBusy(false);
    if (!res.ok) {
      setError(errorText(res.error));
      return;
    }
    download(res.value, backupFileName());
    setDone(true);
  }

  return (
    <form className={styles.card} onSubmit={(e) => void onSubmit(e)}>
      <h2 className={styles.title}>{t("exportTitle")}</h2>
      <p className={styles.meta}>{t("exportIntro")}</p>
      <ModeChoice mode={mode} setMode={setMode} />
      {mode === "passphrase" ? (
        <>
          <label className={styles.field}>
            {t("passphrase")}
            <input
              className={styles.input}
              type="password"
              autoComplete="new-password"
              value={pass}
              onChange={(e) => setPass(e.target.value)}
            />
          </label>
          <label className={styles.field}>
            {t("confirmPassphrase")}
            <input
              className={styles.input}
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </label>
        </>
      ) : (
        <>
          <p className={styles.meta}>{t("recoveryWriteDown")}</p>
          <p className={styles.key} data-testid="recovery-key">
            {recovery}
          </p>
        </>
      )}
      <label className={styles.row}>
        <input
          type="checkbox"
          checked={includeMedia}
          onChange={(e) => setIncludeMedia(e.target.checked)}
        />
        {t("includeMedia")}
      </label>
      <p className={styles.meta}>{t("includeMediaHint")}</p>
      {error ? (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      ) : null}
      {done ? (
        <p role="status" className={styles.ok}>
          {t("exportDone")}
        </p>
      ) : null}
      <button type="submit" className={styles.button} disabled={busy}>
        {busy ? t("working") : t("exportAction")}
      </button>
    </form>
  );
}

export function RestoreBackup({ onRestored }: { onRestored?: () => void }) {
  const t = useTranslations("backup");
  const errorText = useBackupErrorText();
  const [mode, setMode] = useState<Mode>("passphrase");
  const [secretText, setSecretText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [restored, setRestored] = useState<number | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!file) {
      setError(t("chooseFile"));
      return;
    }
    const secret: BackupSecret =
      mode === "passphrase"
        ? { kind: "passphrase", passphrase: secretText }
        : { kind: "recovery", recoveryKey: secretText };
    setBusy(true);
    let res: Awaited<ReturnType<typeof restoreFromBackupFile>>;
    try {
      res = await restoreFromBackupFile(
        await getLocalStore(),
        new Uint8Array(await file.arrayBuffer()),
        secret,
      );
    } catch {
      res = { ok: false, error: "unexpected" as BackupFailure };
    }
    setBusy(false);
    if (!res.ok) {
      setError(errorText(res.error));
      return;
    }
    setRestored(res.value.conversations);
    onRestored?.();
  }

  return (
    <form className={styles.card} onSubmit={(e) => void onSubmit(e)}>
      <h2 className={styles.title}>{t("restoreTitle")}</h2>
      <p className={styles.meta}>{t("restoreIntro")}</p>
      <label className={styles.field}>
        {t("file")}
        <input
          className={styles.input}
          type="file"
          accept=".pbk,application/octet-stream"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
      </label>
      <ModeChoice mode={mode} setMode={setMode} />
      <label className={styles.field}>
        {mode === "passphrase" ? t("passphrase") : t("recoveryKey")}
        <input
          className={styles.input}
          type={mode === "passphrase" ? "password" : "text"}
          autoComplete="off"
          value={secretText}
          onChange={(e) => setSecretText(e.target.value)}
        />
      </label>
      {mode === "recovery" ? <p className={styles.meta}>{t("recoveryHint")}</p> : null}
      {error ? (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      ) : null}
      {restored !== null ? (
        <p role="status" className={styles.ok}>
          {t("restoreDone", { count: restored })}
        </p>
      ) : null}
      <button type="submit" className={styles.button} disabled={busy}>
        {busy ? t("working") : t("restoreAction")}
      </button>
    </form>
  );
}

export function BackupSettings() {
  return (
    <div className={styles.stack}>
      <ExportBackup />
      <RestoreBackup />
    </div>
  );
}
