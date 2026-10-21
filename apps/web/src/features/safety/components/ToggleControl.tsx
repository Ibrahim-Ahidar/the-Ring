"use client";

import { memo, useCallback, useId } from "react";

import ui from "@/shell/styles/ui.module.css";

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
  const labelId = useId();
  const toggle = useCallback(() => {
    if (!disabled) {
      onChange(!checked);
    }
  }, [checked, disabled, onChange]);

  return (
    <div className={ui.setting}>
      <span className={ui.settingBody} id={labelId}>
        {label}
      </span>
      <button
        type="button"
        className={ui.switch}
        role="switch"
        aria-checked={checked}
        aria-labelledby={labelId}
        disabled={disabled}
        onClick={toggle}
      />
    </div>
  );
});
