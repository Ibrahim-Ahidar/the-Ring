"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";

import { callRpc } from "@pulse/core";
import { linkTopic, parseLinkQr, runExistingDeviceLink } from "@pulse/core/linking";
import { asRpcClient } from "@pulse/core/rpc";

import { openAccountKeyStore } from "@/platform/crypto/account-key";
import { getLocalStore } from "@/platform/local-store";
import { createSupabaseBrowserClient } from "@/platform/supabase/browser";

import { openLinkTransport, type LinkBroadcastClient } from "../broadcast-transport";
import styles from "../e2ee-linking.module.css";
import { QrScanner, type ScanFailure } from "../scanner/QrScanner";

type Phase = "idle" | "connecting" | "confirm" | "sending" | "done" | "error";

/** Signed-in device: takes the new device's link code, confirms the safety code, sends history. */
export function LinkExistingDevice({ onLinked }: { onLinked?: () => void }) {
  const t = useTranslations("e2ee-linking");
  const [text, setText] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanFailure, setScanFailure] = useState<ScanFailure | null>(null);
  const answer = useRef<((ok: boolean) => void) | null>(null);

  async function connect(source: string = text) {
    setError(null);
    const qrText = source.trim();
    const qr = parseLinkQr(qrText);
    if (!qr) {
      setError(t("errorInvalid"));
      return;
    }
    setPhase("connecting");
    let close: () => void = () => undefined;
    try {
      const supabase = createSupabaseBrowserClient();
      const rpc = asRpcClient(supabase);
      const seed = await (await openAccountKeyStore()).load();
      if (!seed) {
        setError(t("errorNoKey"));
        setPhase("idle");
        return;
      }
      const store = await getLocalStore();
      if (!store) throw new Error("no store");
      const opened = await openLinkTransport(
        supabase as unknown as LinkBroadcastClient,
        linkTopic(qr.nonce),
      );
      close = opened.close;
      const result = await runExistingDeviceLink({
        transport: opened.transport,
        qrText,
        store,
        accountSeed: seed,
        confirm: (_info, safety) =>
          new Promise<boolean>((resolve) => {
            setCode(safety);
            setPhase("confirm");
            answer.current = resolve;
          }),
        onSigned: async (info, signature) => {
          const res = await callRpc<null>(rpc, "approve_device", {
            p_device_id: info.deviceId,
            p_account_signature: signature,
          });
          if (!res.ok) throw new Error(res.error.code);
        },
        onProgress: (p) => {
          setPhase("sending");
          setProgress({ done: p.done, total: p.total });
        },
      });
      void result;
      setPhase("done");
      onLinked?.();
    } catch {
      setPhase("error");
    } finally {
      close();
    }
  }

  function onScanned(decoded: string) {
    setScanning(false);
    setText(decoded);
    void connect(decoded);
  }

  function onScanFailure(reason: ScanFailure) {
    setScanning(false);
    setScanFailure(reason);
  }

  function decide(ok: boolean) {
    answer.current?.(ok);
    answer.current = null;
    setPhase(ok ? "sending" : "idle");
  }

  if (phase === "confirm") {
    return (
      <div className={styles.panel} role="dialog" aria-label={t("confirmTitle", { code })}>
        <p className={styles.code}>{t("confirmTitle", { code })}</p>
        <span className={styles.actions}>
          <button type="button" onClick={() => decide(true)}>
            {t("confirmYes")}
          </button>
          <button type="button" onClick={() => decide(false)}>
            {t("confirmNo")}
          </button>
        </span>
      </div>
    );
  }
  if (phase === "done") {
    return (
      <p className={styles.panel} role="status">
        {t("sent")}
      </p>
    );
  }
  return (
    <div className={styles.panel}>
      <label className={styles.meta} htmlFor="link-code">
        {t("enterCode")}
      </label>
      {scanning ? (
        <>
          <p className={styles.meta}>{t("scanHint")}</p>
          <QrScanner label={t("scanHint")} onDecode={onScanned} onFailure={onScanFailure} />
        </>
      ) : null}
      <button
        type="button"
        disabled={phase === "connecting" || phase === "sending"}
        onClick={() => {
          setScanFailure(null);
          setScanning((on) => !on);
        }}
      >
        {scanning ? t("stopScan") : t("scan")}
      </button>
      {scanFailure ? (
        <p role="alert" className={styles.error}>
          {scanFailure === "denied" ? t("scanDenied") : t("scanUnavailable")}
        </p>
      ) : null}
      <textarea
        id="link-code"
        className={styles.field}
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      {error || phase === "error" ? (
        <p role="alert" className={styles.error}>
          {error ?? t("errorUnexpected")}
        </p>
      ) : null}
      <button
        type="button"
        disabled={phase === "connecting" || phase === "sending" || text.trim() === ""}
        onClick={() => void connect()}
      >
        {t("connect")}
      </button>
      {progress ? (
        <p role="status" className={styles.meta}>
          {t("progress", { done: progress.done, total: progress.total })}
        </p>
      ) : null}
    </div>
  );
}
