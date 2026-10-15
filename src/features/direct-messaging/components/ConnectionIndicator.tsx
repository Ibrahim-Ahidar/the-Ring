"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import {
  createConnectionIndicator,
  type ConnectionIndicatorOutput,
  type ConnectionIndicatorStatus,
} from "@/features/direct-messaging/lib/connection-indicator";
import styles from "@/features/direct-messaging/components/ConnectionIndicator.module.css";

type Props = {
  status: ConnectionIndicatorStatus;
};

/**
 * Slim bar for the top edge of the thread header (its container needs
 * `position: relative`). Renders nothing until the connection has been down for
 * a few seconds of visible time.
 */
export function ConnectionIndicator({ status }: Props) {
  const t = useTranslations("direct-messaging");
  const [output, setOutput] = useState<ConnectionIndicatorOutput>("none");
  const [controller, setController] = useState<ReturnType<
    typeof createConnectionIndicator
  > | null>(null);

  useEffect(() => {
    const next = createConnectionIndicator({ onChange: setOutput });
    next.setVisible(document.visibilityState !== "hidden");
    const onVisibility = () => {
      next.setVisible(document.visibilityState !== "hidden");
    };
    document.addEventListener("visibilitychange", onVisibility);
    setController(next);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      next.dispose();
      setController(null);
    };
  }, []);

  useEffect(() => {
    controller?.setStatus(status);
  }, [controller, status]);

  if (output === "none") {
    return null;
  }

  return (
    <div className={styles.bar} role="status" aria-live="polite">
      <span className={styles.label}>
        {t(
          output === "waitingForNetwork"
            ? "connection.waitingForNetwork"
            : "connection.connecting",
        )}
      </span>
    </div>
  );
}
