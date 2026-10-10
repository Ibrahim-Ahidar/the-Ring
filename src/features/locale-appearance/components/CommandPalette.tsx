"use client";

import { memo, useCallback, useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ChevronRight, Search } from "lucide-react";

import { collectPaletteCommands } from "@/features/locale-appearance/collect-commands";
import { filterCommands } from "@/features/locale-appearance/filter-commands";
import { useAppearance } from "@/features/locale-appearance/context/AppearanceContext";
import styles from "@/features/locale-appearance/components/locale-appearance.module.css";
import ui from "@/shell/styles/ui.module.css";

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function CommandPaletteInner() {
  const t = useTranslations("locale-appearance");
  const router = useRouter();
  const dialogRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  const { state, dispatch } = useAppearance();
  const commands = useMemo(() => collectPaletteCommands(), []);

  const resolveLabel = useCallback(
    (command: { labelKey: string }) => {
      const [namespace, ...rest] = command.labelKey.split(".");
      if (namespace === "locale-appearance" && rest.length) {
        return t(rest.join(".") as "cmdChats");
      }
      return command.labelKey;
    },
    [t],
  );

  const filtered = useMemo(
    () => filterCommands(commands, state.paletteQuery, resolveLabel),
    [commands, state.paletteQuery, resolveLabel],
  );

  const maxIndex = Math.max(0, filtered.length - 1);
  const highlightedIndex = Math.min(state.highlightedIndex, maxIndex);

  const close = useCallback(() => {
    dispatch({ type: "close_palette" });
    const restore = restoreFocusRef.current;
    if (restore && typeof restore.focus === "function") {
      restore.focus();
    }
  }, [dispatch]);

  const runHighlighted = useCallback(() => {
    const command = filtered[highlightedIndex];
    if (!command) {
      return;
    }
    close();
    router.push(command.href);
  }, [close, filtered, highlightedIndex, router]);

  useEffect(() => {
    if (!state.paletteOpen) {
      return;
    }
    restoreFocusRef.current = document.activeElement as HTMLElement | null;
    inputRef.current?.focus();

    const trap = (event: KeyboardEvent) => {
      if (event.key !== "Tab" || !dialogRef.current) {
        return;
      }
      const nodes = [
        ...dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE),
      ];
      if (nodes.length === 0) {
        return;
      }
      const first = nodes[0]!;
      const last = nodes[nodes.length - 1]!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", trap);
    return () => document.removeEventListener("keydown", trap);
  }, [state.paletteOpen]);

  if (!state.paletteOpen) {
    return null;
  }

  return (
    <>
      <div
        className={styles.backdrop}
        aria-hidden
        onClick={close}
      />
      <div
        ref={dialogRef}
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-label={t("paletteTitle")}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            close();
            return;
          }
          if (event.key === "ArrowDown") {
            event.preventDefault();
            dispatch({
              type: "move_highlight",
              delta: 1,
              maxIndex,
            });
            return;
          }
          if (event.key === "ArrowUp") {
            event.preventDefault();
            dispatch({
              type: "move_highlight",
              delta: -1,
              maxIndex,
            });
            return;
          }
          if (event.key === "Enter") {
            event.preventDefault();
            runHighlighted();
          }
        }}
      >
        <div className={styles.dialogHeader}>
          <h2 className="sr-only">{t("paletteTitle")}</h2>
          <div className={ui.search}>
            <Search size={20} aria-hidden />
            <input
              ref={inputRef}
              type="search"
              aria-label={t("paletteTitle")}
              value={state.paletteQuery}
              placeholder={t("palettePlaceholder")}
              aria-controls="command-palette-list"
              onChange={(event) =>
                dispatch({
                  type: "set_palette_query",
                  query: event.target.value,
                  maxIndex: Math.max(
                    0,
                    filterCommands(
                      commands,
                      event.target.value,
                      resolveLabel,
                    ).length - 1,
                  ),
                })
              }
            />
          </div>
        </div>
        {filtered.length === 0 ? (
          <p className={styles.emptyState}>{t("paletteEmpty")}</p>
        ) : (
          <ul id="command-palette-list" className={styles.commandList} role="listbox">
            {filtered.map((command, index) => (
              <li key={command.id} role="presentation">
                <button
                  type="button"
                  role="option"
                  aria-selected={index === highlightedIndex}
                  className={styles.commandItem}
                  data-active={index === highlightedIndex ? "true" : "false"}
                  onMouseEnter={() =>
                    dispatch({ type: "set_highlight", index })
                  }
                  onClick={() => {
                    close();
                    router.push(command.href);
                  }}
                >
                  <span className={styles.commandLabel}>{resolveLabel(command)}</span>
                  <ChevronRight size={16} className="flip-rtl" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

export const CommandPalette = memo(CommandPaletteInner);
