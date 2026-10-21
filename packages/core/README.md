# @pulse/core

Platform-neutral logic shared by web and mobile. No `next`, `react-dom`, `server-only` or Node built-ins (enforced by ESLint).

## Audit: direct messaging (#172)

`apps/web/src/features/direct-messaging/actions.ts` is a thin server layer. It was audited and split:

Moved here (pure; takes an injected `RpcClient`, no session or framework access):

- `messaging.ts` (was `service.ts`): `openDirect`, `sendText`, `listMessages`, `listConversations`, `getArchivedSummary`, `markRead`, `markDelivered`, `getConversationReceipts`, `getConversation`, cursor helpers.
- `messaging-types.ts` (was `types.ts`): RPC row and summary/detail types.
- `delivery.ts`: ordering, outbound delivery status, first-unread, grouping, plus the new `initialScrollTarget`.

Web keeps one-line re-export shims at the old paths (`service.ts`, `types.ts`, `delivery.ts`), so existing imports are unchanged.

Stays server-only in web `actions.ts`: `"use server"`, session lookup via `getSessionContext`, the server `readPageLimit`, and revalidation. Each action builds an `RpcClient` from the request's Supabase client and calls the functions above.

Mobile builds its own `RpcClient` in `apps/mobile/src/data/rpc.ts` and calls the same functions directly.
