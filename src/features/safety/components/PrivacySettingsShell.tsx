"use client";

import { memo, type ReactNode } from "react";

import { SafetyProvider } from "../context/safety-context";
import type { BlockRow, PrivacySettings, ReportRow } from "../types";
import { PrivacySettingsView } from "./PrivacySettingsView";

type PrivacySettingsShellProps = {
  initialPrivacy: PrivacySettings;
  initialBlocks: BlockRow[];
  initialReports: ReportRow[];
  leading?: ReactNode;
};

export const PrivacySettingsShell = memo(function PrivacySettingsShell({
  initialPrivacy,
  initialBlocks,
  initialReports,
  leading,
}: PrivacySettingsShellProps) {
  return (
    <SafetyProvider
      initialPrivacy={initialPrivacy}
      initialBlocks={initialBlocks}
      initialReports={initialReports}
    >
      <PrivacySettingsView leading={leading} />
    </SafetyProvider>
  );
});
