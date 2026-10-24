"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";

import { isE2eeEnabled } from "@pulse/core";

import { classifyChange } from "../devices-changed";
import styles from "../e2ee-devices.module.css";
import { useDevicesSession } from "../hooks/use-devices-session";
import { useDevicesTopic } from "../hooks/use-devices-topic";
import { accountKeyVersions } from "../service";

type Props = { otherUserId?: string };

function Notice({ otherUserId }: { otherUserId: string }) {
  const t = useTranslations("e2ee-devices");
  const { supabase, rpc } = useDevicesSession();
  const version = useRef<number | undefined>(undefined);
  const [kind, setKind] = useState<"new_device" | "security_code_changed" | null>(null);

  useEffect(() => {
    let live = true;
    void accountKeyVersions(rpc, [otherUserId]).then((res) => {
      if (live && res.ok) version.current = res.value[0]?.version;
    });
    return () => {
      live = false;
    };
  }, [rpc, otherUserId]);

  useDevicesTopic(supabase, otherUserId, () => {
    void accountKeyVersions(rpc, [otherUserId]).then((res) => {
      if (!res.ok) return;
      const after = res.value[0]?.version;
      setKind(classifyChange(version.current, after));
      version.current = after;
    });
  });

  if (!kind) return null;
  const name = otherUserId.slice(0, 8);
  return (
    <span role="status" className={styles.notice}>
      {kind === "security_code_changed"
        ? t("noticeSecurityCode", { name })
        : t("noticeNewDevice", { name })}{" "}
      <button type="button" onClick={() => setKind(null)}>
        {t("dismiss")}
      </button>
    </span>
  );
}

/** Chat header notice: the other person added a device or their security code changed. */
export function DeviceChangeNotice({ otherUserId }: Props) {
  if (!isE2eeEnabled() || !otherUserId) return null;
  return <Notice otherUserId={otherUserId} />;
}
