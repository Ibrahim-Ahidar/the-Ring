"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useReducer,
  type ReactNode,
} from "react";

import {
  initialShellState,
  shellReducer,
  type ShellState,
} from "./types";

type ShellContextValue = ShellState & {
  openRightPane: (content: ReactNode) => void;
  closeRightPane: () => void;
};

const ShellContext = createContext<ShellContextValue | null>(null);

export function ShellProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(shellReducer, initialShellState);

  const openRightPane = useCallback((content: ReactNode) => {
    dispatch({ type: "openRightPane", content });
  }, []);

  const closeRightPane = useCallback(() => {
    dispatch({ type: "closeRightPane" });
  }, []);

  const value = useMemo(
    () => ({
      ...state,
      openRightPane,
      closeRightPane,
    }),
    [state, openRightPane, closeRightPane],
  );

  return (
    <ShellContext.Provider value={value}>{children}</ShellContext.Provider>
  );
}

export function useShell() {
  const ctx = useContext(ShellContext);
  if (!ctx) {
    throw new Error("useShell must be used within ShellProvider");
  }
  return ctx;
}
