"use client";

import { useEffect, useRef } from "react";

import styles from "../e2ee-linking.module.css";

export type ScanFailure = "denied" | "unavailable";

type Detector = { detect(source: CanvasImageSource): Promise<Array<{ rawValue: string }>> };
type DetectorCtor = new (opts: { formats: string[] }) => Detector;

const SCAN_INTERVAL_MS = 250;

/** Camera preview that decodes a QR code and reports its text once (BarcodeDetector, else jsQR). */
export function QrScanner({
  onDecode,
  onFailure,
  label,
}: {
  onDecode: (text: string) => void;
  onFailure: (reason: ScanFailure) => void;
  label: string;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const handlers = useRef({ onDecode, onFailure });
  handlers.current = { onDecode, onFailure };

  useEffect(() => {
    let cancelled = false;
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setInterval> | undefined;

    const stop = () => {
      if (timer !== undefined) clearInterval(timer);
      timer = undefined;
      stream?.getTracks().forEach((track) => track.stop());
      stream = null;
    };

    async function start() {
      const media = typeof navigator === "undefined" ? undefined : navigator.mediaDevices;
      if (!media?.getUserMedia) {
        handlers.current.onFailure("unavailable");
        return;
      }
      let got: MediaStream;
      try {
        got = await media.getUserMedia({ video: { facingMode: "environment" }, audio: false });
      } catch (e) {
        if (cancelled) return;
        const name = (e as { name?: string } | null)?.name;
        const missing = name === "NotFoundError" || name === "OverconstrainedError";
        handlers.current.onFailure(missing ? "unavailable" : "denied");
        return;
      }
      stream = got;
      if (cancelled) {
        stop();
        return;
      }
      const video = videoRef.current;
      if (!video) return;
      video.srcObject = got;
      await video.play?.().catch(() => undefined);

      const Native = (globalThis as { BarcodeDetector?: DetectorCtor }).BarcodeDetector;
      const detector = Native ? new Native({ formats: ["qr_code"] }) : null;
      const canvas = detector ? null : document.createElement("canvas");
      let busy = false;

      const decodeFrame = async (): Promise<string | null> => {
        if (detector) {
          const found = await detector.detect(video);
          return found[0]?.rawValue ?? null;
        }
        if (!canvas || !video.videoWidth) return null;
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) return null;
        ctx.drawImage(video, 0, 0);
        const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const { default: jsQR } = await import("jsqr");
        return jsQR(image.data, image.width, image.height)?.data ?? null;
      };

      timer = setInterval(() => {
        if (busy || cancelled) return;
        busy = true;
        decodeFrame()
          .then((text) => {
            if (text && !cancelled) {
              cancelled = true;
              stop();
              handlers.current.onDecode(text);
            }
          })
          .catch(() => undefined)
          .finally(() => {
            busy = false;
          });
      }, SCAN_INTERVAL_MS);
    }

    void start();
    return () => {
      cancelled = true;
      stop();
    };
  }, []);

  return <video ref={videoRef} className={styles.video} aria-label={label} muted playsInline />;
}
