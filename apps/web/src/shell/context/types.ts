import type { ReactNode } from "react";

export type ShellState = {
  rightPaneOpen: boolean;
  rightPaneContent: ReactNode | null;
};

export type ShellAction =
  | { type: "openRightPane"; content: ReactNode }
  | { type: "closeRightPane" };

export const initialShellState: ShellState = {
  rightPaneOpen: false,
  rightPaneContent: null,
};

export function shellReducer(state: ShellState, action: ShellAction): ShellState {
  switch (action.type) {
    case "openRightPane":
      return { rightPaneOpen: true, rightPaneContent: action.content };
    case "closeRightPane":
      return { rightPaneOpen: false, rightPaneContent: null };
    default:
      return state;
  }
}
