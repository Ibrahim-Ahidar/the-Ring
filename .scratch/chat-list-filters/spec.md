# Chat list filters and archive redesign

**Status:** ready-for-agent

**Touches:** `src/features/direct-messaging` (ChatsSidebar, ChatsShell, InboxTypeFilter, inbox filters, list service/actions), `src/features/conversation-organization` (FolderStrip, menus, messages), a new Supabase migration for `list_conversations`.

## Problem

The chat list header has two chip rows: `All / Groups` and `All chats / <folders> / Archived / +`. Two "All"s, and Archived looks like a folder. Worse, `?archived=1` passes `p_include_archived = true`, so the Archived view lists **every** chat, not only archived ones. Folders can be created but never renamed, deleted or reordered (actions exist, no UI). The "folder empty" hint shows whenever a folder is selected, and "No folders yet" shows always.

## Decisions (agreed with the user)

1. **Archived view = only archived chats.** "All" and every filter/folder exclude archived chats.
2. **Archive is a place, not a chip.** Remove the Archived chip. At the top of the chat list render one row `Archived · n` (n = archived chat count), only when n ≥ 1, with an unread badge (sum of unread across archived chats) when > 0. Clicking it opens the archived view: header `← Archived` (back returns to the previous list), chip strip hidden. Unarchive stays in the existing row menu.
3. **One chip row, single-select:** `All · Unread · Groups · <user folders by position> · +`. Exactly one chip active. Remove the separate `InboxTypeFilter` row and the "All chats" chip.
4. **Unread filter:** chats with `unread_count > 0` (non-archived).
5. **New message does not unarchive.** Chat stays archived; the Archived row badge shows the unread.
6. **Archive wins over folders:** archived chats are hidden from folder views; folder membership is kept so they return on unarchive (current behavior — keep).
7. **Hints:** remove the always-on "No folders yet" text. Show "This folder is empty" only when the active folder's list is actually empty.
8. **Folder chip menu:** right-click / long-press (and keyboard: context-menu key or Shift+F10) on a folder chip opens a small menu: Rename · Delete · Move left · Move right. Uses existing `renameFolderAction`, `deleteFolderAction`, `reorderFoldersAction`, the existing `FolderNameDialog` rename mode, and the existing bottom-sheet/focus-trap patterns. Delete asks for confirmation and never archives chats.
9. **URL params keep their names, new meanings:** `?archived=1` = archived only; `?filter=groups|unread`; `?folder=<id>`. Clicking any chip clears the others' params (single-select). `/app/groups` redirect keeps working.

## Implementation notes

- New migration: replace `list_conversations` so the archived param means "archived only" (e.g. rename to `p_archived_only` or add it; drop the old signature like `20261017000000_list_conversations_type_filter.sql` does) and add an unread-only option. Keep keyset pagination intact.
- Archived row needs count + unread sum: add a small RPC (e.g. `archived_summary()` returning `count, unread`) or equivalent; keep it fresh on archive/unarchive and on new messages via the existing realtime/store paths.
- Update `parseInboxFilters` / `inboxFiltersToListArgs` and the client store filter matching so realtime inserts respect the new semantics (an archived chat must not pop into All).
- i18n: add/rename keys in ar, en, fr for both modules (Unread, Archived row, back label, folder menu items, delete confirm). Remove unused keys.

## Tests

- Service/SQL: archived view returns only archived; default excludes archived; unread filter returns only unread non-archived; folder view excludes archived; archived summary counts are right.
- Component: strip renders `All · Unread · Groups · folders · +`, single active chip, clicking a chip clears other params; Archived row hidden at 0, shows count/badge; folder chip menu calls rename/delete/reorder.
- Update existing tests that assert the old two-row layout or `includeArchived` behavior.

## Done when

`npm run typecheck`, `npm run lint`, and `npm test` pass; the migration applies cleanly on the local Supabase.

## Glossary (add to CONTEXT.md)

- **Archived chat:** a membership with `archived_at` set; hidden from every list except the Archived view.
- **Built-in filter:** All, Unread, Groups — fixed chips before user folders.
- **Folder:** a private, user-created, ordered group; a chat is in at most one.
