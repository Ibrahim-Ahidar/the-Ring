import type { ComponentType } from "react";
import type { LucideIcon } from "lucide-react";

import type { TimelineMessage } from "@pulse/core/timeline";

export type ConversationType = "direct" | "group";

export type MemberRole = "owner" | "admin" | "member";

/**
 * Primary shell navigation rail item contributed by a feature module.
 */
export type NavContribution = {
  id: string;
  /** Short key in the feature catalog; resolved as `{feature}.{labelKey}`. */
  labelKey: string;
  href: string;
  icon: LucideIcon;
  order: number;
  badge?: ComponentType;
};

/**
 * Global overlay mounted once in the app shell (command palette, dialogs, etc.).
 */
export type OverlayContribution = {
  id: string;
  Component: ComponentType;
};

export type ComposerToolProps = {
  conversationId: string;
  disabled: boolean;
};

/**
 * Toolbar control beside the message composer for a conversation.
 */
export type ComposerToolContribution = {
  id: string;
  order: number;
  Component: ComponentType<ComposerToolProps>;
};

/**
 * Replaces the send arrow while the draft is empty (e.g. a mic). May also render a
 * flex child that takes the textarea's place (recording bar); the composer hides the
 * textarea itself based on composer activity.
 */
export type ComposerSendActionContribution = {
  id: string;
  Component: ComponentType<ComposerToolProps>;
};

export type MessageActionContext = {
  message: TimelineMessage;
  conversationId: string;
  currentUserId: string;
  role?: MemberRole;
  conversationType: ConversationType;
};

/**
 * Context menu or action sheet entry for a timeline message.
 */
export type MessageActionContribution = {
  id: string;
  order: number;
  labelKey: string;
  icon: LucideIcon;
  /** When true, rendered in a separated destructive section of the action sheet. */
  destructive?: boolean;
  /** Alternative to {@link destructive}; `danger` marks a separated destructive action. */
  tone?: "default" | "danger";
  isAvailable: (ctx: MessageActionContext) => boolean;
  /**
   * When {@link isAvailable} is false, optional short catalog key under the owning
   * feature (same convention as {@link labelKey}) explaining why the action is disabled.
   * Unavailable actions without a reason are hidden instead of shown disabled.
   */
  unavailableReasonKey?: (ctx: MessageActionContext) => string | undefined;
  run: (ctx: MessageActionContext) => void | Promise<void>;
};

/**
 * Extra content rendered inside or beside a message bubble.
 */
export type BubbleExtraContribution = {
  id: string;
  order: number;
  Component: ComponentType<{
    message: TimelineMessage;
    currentUserId: string;
  }>;
};

/**
 * Small badge rendered in the bubble meta row, just before the delivery ticks.
 */
export type BubbleMetaBadgeContribution = {
  id: string;
  Component: ComponentType<{
    message: TimelineMessage;
    currentUserId: string;
  }>;
};

export type MessageRendererType =
  | "text"
  | "image"
  | "file"
  | "audio"
  | "system";

/**
 * Renderer for a specific persisted message type in the timeline.
 */
export type MessageRendererContribution = {
  type: MessageRendererType;
  /** Lower values win when multiple renderers target the same {@link type}. */
  order?: number;
  Component: ComponentType<{
    message: TimelineMessage;
    currentUserId: string;
  }>;
};

/**
 * Status line or presence chip in the conversation header.
 */
export type HeaderStatusContribution = {
  id: string;
  order: number;
  Component: ComponentType<{
    conversationId: string;
    conversationType: ConversationType;
    otherUserId?: string;
  }>;
};

/**
 * Tab in the optional right pane for a conversation.
 */
export type RightPanelTabContribution = {
  id: string;
  order: number;
  labelKey: string;
  Component: ComponentType<{ conversationId: string }>;
};

export type ListItemMenuContext = {
  conversationId: string;
  conversationType: ConversationType;
  membership: {
    pinned_at: string | null;
    muted_until: string | null;
    archived_at: string | null;
  };
  /** Viewport point the menu should anchor to (cursor or row); absent means a sheet. */
  point?: { x: number; y: number } | null;
};

/**
 * Overflow menu action on a conversation list row.
 */
export type ListItemMenuContribution = {
  id: string;
  order: number;
  labelKey: string;
  icon: LucideIcon;
  destructive?: boolean;
  isAvailable: (ctx: ListItemMenuContext) => boolean;
  run: (ctx: ListItemMenuContext) => void | Promise<void>;
};

/**
 * Command palette entry: navigates to `href`. Contributed by any feature.
 */
export type CommandContribution = {
  id: string;
  order: number;
  /** Short key in the feature catalog; resolved as `{feature}.{labelKey}`. */
  labelKey: string;
  href: string;
};

export type FeatureContributions = {
  nav?: NavContribution[];
  overlay?: OverlayContribution[];
  composerTool?: ComposerToolContribution[];
  composerSendAction?: ComposerSendActionContribution[];
  messageAction?: MessageActionContribution[];
  bubbleExtra?: BubbleExtraContribution[];
  bubbleMetaBadge?: BubbleMetaBadgeContribution[];
  messageRenderer?: MessageRendererContribution[];
  headerStatus?: HeaderStatusContribution[];
  rightPanelTab?: RightPanelTabContribution[];
  listItemMenu?: ListItemMenuContribution[];
  command?: CommandContribution[];
};

export const CONTRIBUTION_KINDS = [
  "nav",
  "overlay",
  "composerTool",
  "composerSendAction",
  "messageAction",
  "bubbleExtra",
  "bubbleMetaBadge",
  "messageRenderer",
  "headerStatus",
  "rightPanelTab",
  "listItemMenu",
  "command",
] as const;

export type ContributionKind = (typeof CONTRIBUTION_KINDS)[number];

export type ContributionKindMap = {
  nav: NavContribution;
  overlay: OverlayContribution;
  composerTool: ComposerToolContribution;
  composerSendAction: ComposerSendActionContribution;
  messageAction: MessageActionContribution;
  bubbleExtra: BubbleExtraContribution;
  bubbleMetaBadge: BubbleMetaBadgeContribution;
  messageRenderer: MessageRendererContribution;
  headerStatus: HeaderStatusContribution;
  rightPanelTab: RightPanelTabContribution;
  listItemMenu: ListItemMenuContribution;
  command: CommandContribution;
};

export type ResolvedContribution<K extends ContributionKind> =
  ContributionKindMap[K] & { feature: string; labelKey?: string };
