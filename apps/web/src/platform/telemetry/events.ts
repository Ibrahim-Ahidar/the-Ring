/** Portfolio product events named in the CI / observability spec. */
export const PORTFOLIO_EVENT_NAMES = [
  "signup_completed",
  "username_created",
  "conversation_started",
  "message_sent",
  "message_failed",
  "attachment_uploaded",
  "group_created",
  "search_used",
  "language_changed",
  "report_submitted",
] as const;

export type PortfolioEventName = (typeof PORTFOLIO_EVENT_NAMES)[number];

export type TelemetryEventName = "app.error" | PortfolioEventName;

const PORTFOLIO_SET = new Set<string>(PORTFOLIO_EVENT_NAMES);

export function isKnownTelemetryEventName(name: string): boolean {
  return name === "app.error" || PORTFOLIO_SET.has(name);
}
