import type {
  BlockRow,
  PrivacyFieldKey,
  PrivacySettings,
  ReportRow,
} from "../types";

export type SafetyState = {
  privacy: PrivacySettings;
  privacyError: string | null;
  savingField: PrivacyFieldKey | null;
  blocks: BlockRow[];
  blocksLoading: boolean;
  blocksError: string | null;
  reports: ReportRow[];
  reportsLoading: boolean;
  reportsError: string | null;
};

export type SafetyAction =
  | { type: "privacy/saving"; field: PrivacyFieldKey }
  | { type: "privacy/saved"; privacy: PrivacySettings }
  | { type: "privacy/error"; code: string }
  | { type: "blocks/loading" }
  | { type: "blocks/loaded"; blocks: BlockRow[] }
  | { type: "blocks/error"; code: string }
  | { type: "blocks/added"; block: BlockRow }
  | { type: "blocks/removed"; blockedId: string }
  | { type: "reports/loading" }
  | { type: "reports/loaded"; reports: ReportRow[] }
  | { type: "reports/error"; code: string }
  | { type: "reports/added"; report: ReportRow };

export function createInitialSafetyState(input: {
  privacy: PrivacySettings;
  blocks: BlockRow[];
  reports: ReportRow[];
}): SafetyState {
  return {
    privacy: input.privacy,
    privacyError: null,
    savingField: null,
    blocks: input.blocks,
    blocksLoading: false,
    blocksError: null,
    reports: input.reports,
    reportsLoading: false,
    reportsError: null,
  };
}

export function safetyReducer(state: SafetyState, action: SafetyAction): SafetyState {
  switch (action.type) {
    case "privacy/saving":
      return {
        ...state,
        savingField: action.field,
        privacyError: null,
      };
    case "privacy/saved":
      return {
        ...state,
        privacy: action.privacy,
        savingField: null,
        privacyError: null,
      };
    case "privacy/error":
      return {
        ...state,
        savingField: null,
        privacyError: action.code,
      };
    case "blocks/loading":
      return { ...state, blocksLoading: true, blocksError: null };
    case "blocks/loaded":
      return {
        ...state,
        blocks: action.blocks,
        blocksLoading: false,
        blocksError: null,
      };
    case "blocks/error":
      return {
        ...state,
        blocksLoading: false,
        blocksError: action.code,
      };
    case "blocks/added":
      return {
        ...state,
        blocks: [
          action.block,
          ...state.blocks.filter((b) => b.blockedId !== action.block.blockedId),
        ],
      };
    case "blocks/removed":
      return {
        ...state,
        blocks: state.blocks.filter((b) => b.blockedId !== action.blockedId),
      };
    case "reports/loading":
      return { ...state, reportsLoading: true, reportsError: null };
    case "reports/loaded":
      return {
        ...state,
        reports: action.reports,
        reportsLoading: false,
        reportsError: null,
      };
    case "reports/error":
      return {
        ...state,
        reportsLoading: false,
        reportsError: action.code,
      };
    case "reports/added":
      return {
        ...state,
        reports: [action.report, ...state.reports],
      };
    default:
      return state;
  }
}
