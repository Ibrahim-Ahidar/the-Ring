"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useReducer,
  type ReactNode,
} from "react";

type IdentityFormState = {
  errorCode: string | null;
  submitting: boolean;
  successMessage: string | null;
};

type IdentityFormAction =
  | { type: "submit_start" }
  | { type: "submit_end"; errorCode?: string | null; successMessage?: string | null }
  | { type: "clear_feedback" };

const initialState: IdentityFormState = {
  errorCode: null,
  submitting: false,
  successMessage: null,
};

function reducer(
  state: IdentityFormState,
  action: IdentityFormAction,
): IdentityFormState {
  switch (action.type) {
    case "submit_start":
      return {
        ...state,
        submitting: true,
        errorCode: null,
        successMessage: null,
      };
    case "submit_end":
      return {
        ...state,
        submitting: false,
        errorCode: action.errorCode ?? null,
        successMessage: action.successMessage ?? null,
      };
    case "clear_feedback":
      return { ...state, errorCode: null, successMessage: null };
    default:
      return state;
  }
}

type IdentityFormContextValue = IdentityFormState & {
  startSubmit: () => void;
  finishSubmit: (input: {
    errorCode?: string | null;
    successMessage?: string | null;
  }) => void;
  clearFeedback: () => void;
};

const IdentityFormContext = createContext<IdentityFormContextValue | null>(null);

export function IdentityFormProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  const startSubmit = useCallback(() => {
    dispatch({ type: "submit_start" });
  }, []);

  const finishSubmit = useCallback(
    (input: {
      errorCode?: string | null;
      successMessage?: string | null;
    }) => {
      dispatch({ type: "submit_end", ...input });
    },
    [],
  );

  const clearFeedback = useCallback(() => {
    dispatch({ type: "clear_feedback" });
  }, []);

  const value = useMemo(
    () => ({
      ...state,
      startSubmit,
      finishSubmit,
      clearFeedback,
    }),
    [state, startSubmit, finishSubmit, clearFeedback],
  );

  return (
    <IdentityFormContext.Provider value={value}>
      {children}
    </IdentityFormContext.Provider>
  );
}

export function useIdentityForm(): IdentityFormContextValue {
  const ctx = useContext(IdentityFormContext);
  if (!ctx) {
    throw new Error("useIdentityForm must be used within IdentityFormProvider");
  }
  return ctx;
}
