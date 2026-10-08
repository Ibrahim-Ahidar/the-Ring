# Direct messaging

Wave-1 spine for direct chats: open by username, text send/history, list previews, read cursors, optimistic pending sends, reconnect merge, and timeline slots for later features.

## RPC (PostgreSQL)

All calls go through `callRpc` / `supabase.rpc` — no direct table access from the app.

| Function | Purpose |
| --- | --- |
| `open_direct(p_username)` | Create or return direct conversation; `decide_interaction` + `create_conversation` rate limit on insert |
| `send_text(p_conversation_id, p_client_id, p_body, p_reply_to_id?)` | Idempotent on `(sender_id, client_id)`; `send_message` rate limit; `notify` peers |
| `list_conversations(p_cursor?, p_include_archived?, p_folder_id?)` | Page 30; unread via read cursor |
| `list_messages(p_conversation_id, p_cursor?)` | Page 50, newest first; hides + tombstones; each row carries `attachments` and `reactions` (jsonb arrays) |
| `mark_read(p_conversation_id, p_message_id)` | Forward-only read cursor |
| `get_conversation(p_conversation_id)` | Membership + direct peer display fields |

Stable errors: `messaging.not_allowed`, `messaging.request_required`, `messaging.not_member`, `messaging.send_not_allowed`, `messaging.not_found`, `messaging.reply_not_found`, `messaging.body_required`, `messaging.body_too_long`.

## Client

- Realtime: `joinConversation` / `joinInbox` only (see `@/platform/realtime-hub`).
- Composer signals: `emitComposerActivity` from `@/platform/composer-events`.
- Slots: `getContributions` for `messageRenderer`, `messageAction`, `bubbleExtra`, `composerTool`, `headerStatus`, `rightPanelTab`, `listItemMenu`, `requestRequired`.

## Tests

`tests/db/direct-messaging.test.ts` (PGlite, user-scoped RPC clients).
