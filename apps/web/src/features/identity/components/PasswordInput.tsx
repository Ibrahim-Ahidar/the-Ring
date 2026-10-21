"use client";

import { Eye, EyeOff } from "lucide-react";
import { forwardRef, memo, useState, type InputHTMLAttributes } from "react";
import { useTranslations } from "next-intl";

import ui from "@/shell/styles/ui.module.css";

import styles from "../identity.module.css";

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "className" | "id"> & {
  id: string;
};

const PasswordInputInner = forwardRef<HTMLInputElement, Props>(function PasswordInput(
  { id, ...inputProps },
  ref,
) {
  const t = useTranslations("identity");
  const [visible, setVisible] = useState(false);

  return (
    <div className={styles.passwordField}>
      <input
        {...inputProps}
        ref={ref}
        id={id}
        className={ui.input}
        type={visible ? "text" : "password"}
        autoCapitalize="none"
        spellCheck={false}
      />
      <button
        type="button"
        className={styles.passwordToggle}
        aria-controls={id}
        aria-pressed={visible}
        aria-label={visible ? t("hidePassword") : t("showPassword")}
        onClick={() => setVisible((shown) => !shown)}
      >
        {visible ? <EyeOff size={18} aria-hidden /> : <Eye size={18} aria-hidden />}
      </button>
    </div>
  );
});

export const PasswordInput = memo(PasswordInputInner);
