"use client";

import { memo, useCallback } from "react";

import styles from "./PrivacySettings.module.css";

type ToggleControlProps = {
  label: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
};

export const ToggleControl = memo(function ToggleControl({
  label,
  checked,
  disabled,
  onChange,
}: ToggleControlProps) {
  const toggle = useCallback(() => {
    if (!disabled) {
      onChange(!checked);
    }
  }, [checked, disabled, onChange]);

  return (
    <div className={styles.controlRow}>
      <span className={styles.rowLabel} id={`toggle-label-${label}`}>
        {label}
      </span>
      <button
        type="button"
        className={styles.toggle}
        role="switch"
        aria-checked={checked}
        aria-labelledby={`toggle-label-${label}`}
        disabled={disabled}
        onClick={toggle}
      >
        <span className={styles.toggleThumb} aria-hidden />
      </button>
    </div>
  );
});
