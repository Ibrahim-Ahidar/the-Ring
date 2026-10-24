"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import QRCode from "qrcode";

import { callRpc } from "@pulse/core";
import { linkTopic, startNewDeviceLink, type LinkTransport } from "@pulse/core/linking";
import { asRpcClient } from "@pulse/core/rpc";

import { openAccountKeyStore } from "@/platform/crypto/account-key";
import { getLocalStore } from "@/platform/local-store";
import { createSupabaseBrowserClient } from "@/platform/supabase/browser";

import { openLinkTransport, type LinkBroadcastClient } from "../broadcast-transport";
import styles from "../e2ee-linking.module.css";

const DEVICE_ID_KEY = "pulse.e2ee.deviceId";

type Row = {
  id: string;
  name: string | null;
  platform: string;
  identity_key: string;
  signing_key: string;
};
type Phase = "idle" | "waiting" | "linking" | "done" | "error";

/** New device: shows the link QR, the safety code and the history progress. */
export function LinkNewDevice() {
  const t = useTranslations("e2ee-linking");
  const [phase, setPhase] = useState<Phase>("idle");
  const [svg, setSvg] = useState("");
  const [qrText, setQrText] = useState("");
  const [code, setCode] = useState("");
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [count, setCount] = useState(0);
  const close = useRef<(() => void) | null>(null);

  useEffect(() => () => close.current?.(), []);

  async function start() {
    setPhase("waiting");
    try {
      const supabase = createSupabaseBrowserClient();
      const rpc = asRpcClient(supabase);
      const deviceId = window.localStorage.getItem(DEVICE_ID_KEY);
      const store = await getLocalStore();
      const listed = await callRpc<Row[]>(rpc, "list_devices", {});
      const me = listed.ok ? listed.value.find((d) => d.id === deviceId) : undefined;
      if (!deviceId || !store || !me) throw new Error("no pending device");
      const keys = await openAccountKeyStore();

      // The relay topic depends on the nonce, which the link object creates; bind it afterwards.
      let inner: LinkTransport | null = null;
      const lazy: LinkTransport = {
        send: (f) => (inner ? inner.send(f) : Promise.reject(new Error("not open"))),
        subscribe: (l) => (inner ? inner.subscribe(l) : () => undefined),
      };
      const link = startNewDeviceLink({
        transport: lazy,
        store,
        device: {
          deviceId,
          name: me.name ?? "",
          platform: me.platform,
          identityKey: me.identity_key,
          signingKey: me.signing_key,
        },
        onSafetyCode: (c) => setCode(c),
        onProgress: (p) => {
          setPhase("linking");
          setProgress({ done: p.done, total: p.total });
        },
        onAccountKey: (seed) => keys.save(seed),
      });
      const opened = await openLinkTransport(
        supabase as unknown as LinkBroadcastClient,
        linkTopic(link.qr.nonce),
      );
      inner = opened.transport;
      close.current = opened.close;
      setQrText(link.qrText);
      setSvg(await QRCode.toString(link.qrText, { type: "svg", margin: 0 }));
      const result = await link.run();
      setCount(result.imported);
      setPhase("done");
      opened.close();
    } catch {
      close.current?.();
      setPhase("error");
    }
  }

  return (
    <div className={styles.panel}>
      {phase === "idle" || phase === "error" ? (
        <>
          {phase === "error" ? (
            <p role="alert" className={styles.error}>
              {t("errorUnexpected")}
            </p>
          ) : null}
          <button type="button" onClick={() => void start()}>
            {t("showCode")}
          </button>
        </>
      ) : null}
      {phase === "waiting" || phase === "linking" ? (
        <>
          {svg ? (
            <div
              className={styles.qr}
              role="img"
              aria-label={t("qrAlt")}
              dangerouslySetInnerHTML={{ __html: svg }}
            />
          ) : null}
          {qrText ? (
            <>
              <p className={styles.meta}>{t("qrText")}</p>
              <textarea className={styles.field} readOnly value={qrText} />
            </>
          ) : null}
          {code ? <p className={styles.code}>{t("safetyCode", { code })}</p> : null}
          <p role="status" className={styles.meta}>
            {progress
              ? t("progress", { done: progress.done, total: progress.total })
              : t("waiting")}
          </p>
        </>
      ) : null}
      {phase === "done" ? <p role="status">{t("done", { count })}</p> : null}
    </div>
  );
}
