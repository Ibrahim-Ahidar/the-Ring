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
  blockUserAction,
  fetchBlocksAction,
  fetchMyReportsAction,
  reportMessageAction,
  reportUserAction,
  unblockUserAction,
  updatePrivacyAction,
} from "../actions";
import type { PrivacyFieldKey, PrivacyPatch, ReportCategory } from "../types";
import {
  createInitialSafetyState,
  safetyReducer,
  type SafetyState,
} from "./safety-reducer";

type SafetyContextValue = {
  state: SafetyState;
  savePrivacyField: (field: PrivacyFieldKey, patch: PrivacyPatch) => Promise<void>;
  refreshBlocks: () => Promise<void>;
  confirmBlock: (blockedId: string) => Promise<boolean>;
  confirmUnblock: (blockedId: string) => Promise<boolean>;
  submitReport: (input: {
    category: ReportCategory;
    details?: string | null;
    targetUserId?: string | null;
    targetMessageId?: string | null;
  }) => Promise<boolean>;
  refreshReports: () => Promise<void>;
};

const SafetyContext = createContext<SafetyContextValue | null>(null);

export function SafetyProvider({
  initialPrivacy,
  initialBlocks,
  initialReports,
  children,
}: {
  initialPrivacy: SafetyState["privacy"];
  initialBlocks: SafetyState["blocks"];
  initialReports: SafetyState["reports"];
  children: ReactNode;
}) {
  const [state, dispatch] = useReducer(
    safetyReducer,
    createInitialSafetyState({
      privacy: initialPrivacy,
      blocks: initialBlocks,
      reports: initialReports,
    }),
  );

  const savePrivacyField = useCallback(
    async (field: PrivacyFieldKey, patch: PrivacyPatch) => {
      dispatch({ type: "privacy/saving", field });
      const result = await updatePrivacyAction(patch);
      if (!result.ok) {
        dispatch({ type: "privacy/error", code: result.error.code });
        return;
      }
      dispatch({ type: "privacy/saved", privacy: result.value });
    },
    [],
  );

  const refreshBlocks = useCallback(async () => {
    dispatch({ type: "blocks/loading" });
    const result = await fetchBlocksAction();
    if (!result.ok) {
      dispatch({ type: "blocks/error", code: result.error.code });
      return;
    }
    dispatch({ type: "blocks/loaded", blocks: result.value });
  }, []);

  const confirmBlock = useCallback(async (blockedId: string) => {
    const result = await blockUserAction(blockedId);
    if (!result.ok) {
      return false;
    }
    dispatch({ type: "blocks/added", block: result.value });
    return true;
  }, []);

  const confirmUnblock = useCallback(async (blockedId: string) => {
    const result = await unblockUserAction(blockedId);
    if (!result.ok) {
      return false;
    }
    dispatch({ type: "blocks/removed", blockedId });
    return true;
  }, []);

  const submitReport = useCallback(
    async (input: {
      category: ReportCategory;
      details?: string | null;
      targetUserId?: string | null;
      targetMessageId?: string | null;
    }) => {
      const result = input.targetMessageId
        ? await reportMessageAction({
            targetMessageId: input.targetMessageId,
            category: input.category,
            details: input.details,
            targetUserId: input.targetUserId,
          })
        : await reportUserAction({
            targetUserId: input.targetUserId!,
            category: input.category,
            details: input.details,
          });

      if (!result.ok) {
        return false;
      }

      dispatch({
        type: "reports/added",
        report: {
          id: result.value,
          targetUserId: input.targetUserId ?? null,
          targetMessageId: input.targetMessageId ?? null,
          category: input.category,
          details: input.details ?? null,
          status: "open",
          createdAt: new Date().toISOString(),
        },
      });
      return true;
    },
    [],
  );

  const refreshReports = useCallback(async () => {
    dispatch({ type: "reports/loading" });
    const result = await fetchMyReportsAction();
    if (!result.ok) {
      dispatch({ type: "reports/error", code: result.error.code });
      return;
    }
    dispatch({ type: "reports/loaded", reports: result.value });
  }, []);

  const value = useMemo(
    () => ({
      state,
      savePrivacyField,
      refreshBlocks,
      confirmBlock,
      confirmUnblock,
      submitReport,
      refreshReports,
    }),
    [
      state,
      savePrivacyField,
      refreshBlocks,
      confirmBlock,
      confirmUnblock,
      submitReport,
      refreshReports,
    ],
  );

  return <SafetyContext.Provider value={value}>{children}</SafetyContext.Provider>;
}

export function useSafety(): SafetyContextValue {
  const ctx = useContext(SafetyContext);
  if (!ctx) {
    throw new Error("useSafety must be used within SafetyProvider");
  }
  return ctx;
}
