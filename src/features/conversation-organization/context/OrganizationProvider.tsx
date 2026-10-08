"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  type ReactNode,
} from "react";

import { listFoldersAction } from "../actions";
import { organizationReducer } from "./reducer";
import { createInitialOrganizationState, type OrganizationState } from "./types";

type OrganizationContextValue = {
  state: OrganizationState;
  refreshFolders: () => Promise<void>;
};

const OrganizationContext = createContext<OrganizationContextValue | null>(null);

export function OrganizationProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(
    organizationReducer,
    undefined,
    createInitialOrganizationState,
  );

  const refreshFolders = useCallback(async () => {
    const result = await listFoldersAction();
    if (!result.ok) {
      dispatch({ type: "folders/error", code: result.error.code });
      return;
    }
    dispatch({ type: "folders/set", folders: result.value });
  }, []);

  useEffect(() => {
    void refreshFolders();
  }, [refreshFolders]);

  const value = useMemo(
    () => ({ state, refreshFolders }),
    [refreshFolders, state],
  );

  return (
    <OrganizationContext.Provider value={value}>{children}</OrganizationContext.Provider>
  );
}

export function useOrganization() {
  const ctx = useContext(OrganizationContext);
  if (!ctx) {
    throw new Error("useOrganization must be used within OrganizationProvider");
  }
  return ctx;
}
