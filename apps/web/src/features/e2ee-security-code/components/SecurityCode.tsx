"use client";

import QRCode from "qrcode";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import {
  computeFingerprint,
  encodeQrPayload,
  formatSecurityCode,
  securityCode,
  verifyScan,
  type VerificationStore,
} from "@pulse/core/e2ee/security-code";

import ui from "@/shell/styles/ui.module.css";

import styles from "../e2ee-security-code.module.css";

type Party = { userId: string; signingKey: string; version: number };

type Props = {
  contactName: string;
  me: Party;
  contact: Party;
  store: VerificationStore;
};

function b64ToBytes(b64: string): Uint8Array {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

/** Security Code screen: 12 groups of 5 digits, a QR, and scan-to-verify (spec 4.4). */
export function SecurityCode({ contactName, me, contact, store }: Props) {
  const t = useTranslations("e2ee-security-code");
  const [code, setCode] = useState<string | null>(null);
  const [payload, setPayload] = useState<string | null>(null);
  const [svg, setSvg] = useState("");
  const [verified, setVerified] = useState(() =>
    store.isVerified(contact.userId, contact.signingKey),
  );
  const [scan, setScan] = useState("");
  const [result, setResult] = useState<"match" | "mismatch" | "invalid" | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [a, b] = await Promise.all([
        computeFingerprint({
          version: me.version,
          signingKey: b64ToBytes(me.signingKey),
          userId: me.userId,
        }),
        computeFingerprint({
          version: contact.version,
          signingKey: b64ToBytes(contact.signingKey),
          userId: contact.userId,
        }),
      ]);
      const p = encodeQrPayload(me.version, a, b);
      const s = await QRCode.toString(p, { type: "svg", margin: 0 });
      if (cancelled) return;
      setCode(securityCode(a, b));
      setPayload(p);
      setSvg(s);
    })();
    return () => {
      cancelled = true;
    };
  }, [me, contact]);

  function submitScan() {
    if (!payload) return;
    const r = verifyScan(payload, scan);
    setResult(r);
    if (r === "match") {
      store.markVerified(contact.userId, contact.signingKey);
      setVerified(true);
    }
  }

  return (
    <section aria-label={t("title")}>
      <h2 className={ui.dialogTitle}>{t("title")}</h2>
      <p className={ui.dialogText}>{t("intro", { name: contactName })}</p>
      {code ? (
        <>
          <ol className={styles.groups} aria-label={t("codeLabel")}>
            {formatSecurityCode(code).map((g, i) => (
              <li key={i}>{g}</li>
            ))}
          </ol>
          <div
            className={styles.qr}
            role="img"
            aria-label={t("qrLabel")}
            dangerouslySetInnerHTML={{ __html: svg }}
          />
        </>
      ) : (
        <p role="status">{t("computing")}</p>
      )}
      <p className={styles.status}>{verified ? t("verified") : t("notVerified")}</p>
      <div className={styles.scan}>
        <label htmlFor="sc-scan">{t("scanLabel", { name: contactName })}</label>
        <input id="sc-scan" value={scan} onChange={(e) => setScan(e.target.value)} />
        <button
          type="button"
          className={`${ui.btn} ${ui.btnPrimary}`}
          onClick={submitScan}
          disabled={!code}
        >
          {t("scanSubmit")}
        </button>
        {result ? (
          <p role="status">
            {result === "match"
              ? t("scanOk", { name: contactName })
              : result === "mismatch"
                ? t("scanMismatch")
                : t("scanInvalid")}
          </p>
        ) : null}
        {verified ? (
          <button
            type="button"
            className={`${ui.btn} ${ui.btnSecondary}`}
            onClick={() => {
              store.unverify(contact.userId);
              setVerified(false);
              setResult(null);
            }}
          >
            {t("unverify")}
          </button>
        ) : null}
      </div>
    </section>
  );
}
