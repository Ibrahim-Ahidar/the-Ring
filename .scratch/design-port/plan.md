# Design port plan: `design/` → Pulse app

Source of truth: `design/css/{tokens,layout,components,base}.css`, `design/screens/*.html`.
Rule: implement only what existing code backs. "IGNORE" = no UI at all for that element.

## 0. Findings that shape the plan

- The app is a username-first chat with a 72px nav rail (`ShellNavRail`), a mobile back bar, a hidden right pane, and feature pages that render inside `RouteFrame`-style `route-frame` containers with 24px padding.
- Chats (`/app/chats`, `/app/chats/[id]`) are rendered by `direct-messaging/ChatsLayout` as two bordered cards; the thread header renders every `rightPanelTab` contribution inline (members toggle, in-conversation search toggle, shared-media link).
- `list_conversations` returns one page of 30 rows and the client never loads more. Any client-side filter (Unread, Groups) would silently drop rows past 30, so those chips are not backed.
- Typing state lives in a per-conversation `TypingPresenceProvider` used only by the header status slot. Presence is per conversation subject, not per list row.
- Timeline messages carry: `type`, `body`, `reply_to_id`, `edited_at`, `deletion_scope`, `pinned_at`, `forwarded`, `attachments` (1 per message, with `waveform`, `duration_ms`, `width/height`), `reactions`. No sender names, no link metadata, no delivered state.
- Read state: `outboundDeliveryStatus()` gives `pending | failed | sent | read` (read only when the other user sends receipts).
- Feature CSS references ~20 undefined tokens (`--radius-panel`, `--color-on-accent`, `--color-surface*`, `--color-fg`, `--color-muted`, `--radius-sm|md|lg`, `--space-4`, `--space-48`, `--color-panel-elevated`, `--font-size-*`, `--color-backdrop`, `--color-accent-fg|text`) and a non-existent `visually-hidden` class. These render with fallbacks today; the port repoints them at real tokens.
- No accent switching, no reduce-motion setting, no link previews, no emoji picker in the composer, no username-availability action reachable from the client, no "keep me signed in".
- Message requests are note-based (`note`, accept/decline), not conversations with messages.
- Uncommitted work from other agents exists (groups, message-requests, two migrations). It is treated as existing code; commits from this port include only files this port touched.

## 1. Element audit

### Shell / layout (`layout.css`, all screens)

| Design element | Existing code | Decision |
| --- | --- | --- |
| `.app` grid sidebar \| main \| drawer, breakpoints 1200 / 768 | `AppShell`, `shell.css`, `ChatsLayout` | IMPLEMENT: new shell `PaneLayout` (sidebar/main/drawer, `data-view`, `data-drawer`) used by chats and secondary pages |
| No nav rail, no tab bar | `ShellNavRail` | IMPLEMENT: rail removed from `AppShell`; entries re-homed (see §5) |
| `.sidebar__header` avatar + "Chats" | identity `getOwnProfile` | IMPLEMENT: avatar (initials / avatar URL) links to `/app/settings` |
| `.sidebar__header` back arrow + title (secondary pages) | routes | IMPLEMENT: shell `PaneHeader` with back link to `/app/chats` |
| `.sidebar__actions` "Mark all read" (notifications) | `markAllRead` | IMPLEMENT |
| `.sidebar__actions` user-plus (contacts → find by username) | username search lives on `/app/contacts` already | IGNORE: the search is already on the page |
| `.drawer` contact / group info | `rightPanelTab` slot, `ShellContext.openRightPane` (unused) | PARTIAL: drawer driven by `?info=1` inside `ChatsLayout` (must stay inside `MessagingProvider`); holds hero + rightPanelTab contributions + list-item menu |
| Mobile single pane (`data-view`) | `ChatsLayout` `data-mobile-thread`, `MobileBackBar` | IMPLEMENT: view from route (`list` / `conversation` / `drawer` via `?info=1`); `MobileBackBar` becomes the conv-header back button |
| `/app` home | `RouteFrame titleKey="home"` (title only) | IMPLEMENT: redirect `/app` → `/app/chats` (design has no home; chats empty state is home) |

### Chats list (`chats.html`)

| Design element | Existing code | Decision |
| --- | --- | --- |
| `.search` "Search or start a new chat" | `/app/search` (`SearchProvider`) | PARTIAL: submits to `/app/search?q=`; search page seeds the query |
| `.chips` All | `FolderStrip` "All chats" | IMPLEMENT |
| Chips Unread / Groups with counts | none server-side; list is 1 page of 30 | IGNORE: a client filter over a truncated page is wrong data |
| Chip Favourites | favourites are users (`discovery-contacts`), not conversations | IGNORE |
| Chip "Work" (user folders) | `chat_folders`, `FolderStrip` | IMPLEMENT (+ existing "New folder" control kept as `chip--icon`) |
| `.archive-row` "Archived" + count | `?archived=1` filter, "Archived" chip | PARTIAL: row linking to the archived view; no count (not returned) |
| `.chat-row` avatar, name, time, preview | `ConversationSummary` | IMPLEMENT (initials avatar, deterministic colour from id) |
| Time "Yesterday", weekday, date | `last_message_at` | IMPLEMENT via `Intl` |
| `.chat-row__time--unread`, `.badge` | `unread_count` | IMPLEMENT |
| `.badge--muted`, bell-off icon | `muted_until` | IMPLEMENT |
| Pin icon | `pinned_at` | IMPLEMENT |
| Preview ticks | no last-sender in summary | IGNORE |
| Preview media icon (photo / mic / file) | preview text comes from SQL; no type column returned | IGNORE |
| Preview deleted | `last_message_deletion_scope` | IMPLEMENT (ban icon + text) |
| Preview "typing…" | typing is per open conversation only | IGNORE |
| Presence dot on avatar | no per-row presence | IGNORE |
| Row overflow menu (not in design) | `listItemMenu` (organization sheet) | KEEP: icon-btn revealed on hover/focus, no longer nested inside the link |
| `.empty-state` welcome, quick actions | `/app/chats/new`, `/app/groups/new`, `/app/contacts` | IMPLEMENT (all three targets exist) |
| `.empty-state__foot` Ctrl K hint | command palette (`mod+k`) | IMPLEMENT |

### Conversation (`chat.html`, `group.html`)

| Design element | Existing code | Decision |
| --- | --- | --- |
| `.conv-header` avatar, title, back (mobile) | `ThreadPanel` | IMPLEMENT |
| `.conv-header__subtitle` online / last seen / typing | `headerStatus` slot (typing-presence) | IMPLEMENT (restyle `HeaderStatusView`) |
| Group subtitle "Karim, Nadia…" | no member names in DM | IGNORE |
| Header search button | `ConversationSearchTab` (rightPanelTab) | PARTIAL: opens the info drawer where the search tab lives |
| Header more menu | `listItemMenu` contributions | IMPLEMENT (runs the same menu as the list row) |
| `.conv-header__info` → drawer | `?info=1` | IMPLEMENT |
| `.pinned-bar` | `messages.pinned_at` | PARTIAL: latest pinned message among loaded pages; click jumps (`?message=`); unpin stays in the message menu (DM can't import message-actions) |
| `.messages` patterned background | — | IMPLEMENT |
| `.system-note` "You started a conversation…" | none | IGNORE |
| `.system-note` group events | `groups/SystemMessageRenderer` | IMPLEMENT (restyle) |
| `.day-divider` | `created_at` | IMPLEMENT |
| `.unread-divider` | `unreadSeparatorByConversation` | IMPLEMENT (restyle, existing "New messages" copy) |
| `.msg--first` tail, grouping | `shouldGroupWithPrevious` | IMPLEMENT |
| `.msg__avatar`, `.bubble__sender` (groups) | no sender name/avatar in timeline | IGNORE |
| `.bubble__meta` time | `created_at` | IMPLEMENT |
| Ticks sent / read | `outboundDeliveryStatus` | IMPLEMENT (pending = clock, failed = alert + retry) |
| Ticks delivered | not tracked | IGNORE |
| `unicode-bidi: plaintext` on text, names, previews | — | IMPLEMENT |
| `.bubble__quote` reply | `reply_to_id` | PARTIAL: author + text when the quoted message is loaded, generic label otherwise |
| `.bubble__forwarded` | `forwarded` | IMPLEMENT |
| "Edited" in meta | `edited_at` | IMPLEMENT |
| `.bubble__deleted` | `deletion_scope = everyone` | IMPLEMENT |
| `.bubble--media`, caption, overlay meta | `ImageMessageRenderer` | IMPLEMENT (single image; caption = body if present) |
| `.media-row` + `.media-more` "+N" | one attachment per message | IGNORE |
| `.bubble__file`, `.file-icon` | `FileMessageRenderer` / `MediaDownloadButton` | IMPLEMENT |
| `.voice` play, waveform, time | `AudioMessageRenderer`, stored `waveform`, `duration_ms` | IMPLEMENT (played bars from `<audio>` progress) |
| `.voice` avatar | sender avatar not available | IGNORE |
| `.link-preview` | none | IGNORE |
| `.bubble__text a` link colour | `LinkedText` | IMPLEMENT |
| `.mark` mention highlight | none in bubbles; search snippets have highlight | IMPLEMENT for search snippets only |
| `.reactions` pill | `ReactionBubbleExtra` | IMPLEMENT (pill of per-emoji toggle buttons; counts) |
| `.typing` bubble in timeline | typing state is header-scoped | IGNORE |
| `.bubble-actions` hover bar | `MessageActionHost` (one menu) | PARTIAL: single chevron trigger revealed on hover/focus; menu styled as `.menu` |
| `.reaction-picker` | `ReactionPickerOverlay` | IMPLEMENT (restyle; still a modal) |
| `.msg--highlight` | `jumpHighlight` | IMPLEMENT |
| `.composer__bar` | `MessageComposer` | IMPLEMENT |
| Composer emoji button | no emoji picker | IGNORE |
| Composer attach | `MediaComposerTool` | IMPLEMENT |
| Composer mic ↔ send swap | `VoiceRecorder` lives in media tool | PARTIAL: mic (media tool) and send both shown; send is the accent button |
| `.composer__reply` | `ReplyComposerTool` | IMPLEMENT (restyle) |
| `.recording` | `VoiceRecorder` | IMPLEMENT (restyle) |
| `.request-bar` accept/block/delete | requests are notes, not conversations | IGNORE in conversation; accept/decline restyled on the requests page |

### Drawer (`chat-info.html`, `group.html`)

| Design element | Existing code | Decision |
| --- | --- | --- |
| `.drawer__header` close + title | — | IMPLEMENT |
| `.profile-hero` avatar, name, @handle | `ConversationDetail` | IMPLEMENT |
| `.profile-actions` search / favourite / mute | search tab, favourites (profile page), organization menu | PARTIAL: hero links to the full profile (`/app/profile/[username]`) where favourite/block/report live |
| About | bio not in detail | IGNORE |
| Media grid + count | `SharedMediaPanelTab` (link) | PARTIAL: link row to `/app/media/[id]`; no grid/count |
| Pinned messages row | none | IGNORE |
| Mute / favourite switches | organization sheet / profile page | PARTIAL: "Conversation options" row opens the existing sheet |
| Groups in common | `ProfileView.sharedGroups` (profile page) | IGNORE in drawer (on profile page) |
| Block / Report | safety buttons on profile page | PARTIAL: via profile link |
| Delete chat | none | IGNORE |
| Group: members list, roles (`.tag`) | `MembersPanelTab` | IMPLEMENT (`member-row` + tag) |
| Group: add member / invite link | `GroupAdminClient` (`/app/groups/[id]`) | PARTIAL: "Manage group" row links to admin page; no invite link |
| Group: leave / report group | `GroupAdminClient` | PARTIAL: via manage-group page |
| Edit group pencil | admin page | PARTIAL: same link |

### Search (`search.html`)

| Design element | Existing code | Decision |
| --- | --- | --- |
| Back + title header | route | IMPLEMENT |
| `.search` with clear button | `GlobalSearchView` | IMPLEMENT (clear button resets the query) |
| Result-type chips | no type filter in search RPCs | IGNORE |
| Sections People / Chats / Messages as `chat-row` | `SearchResultRows` | IMPLEMENT |
| `.mark` highlight | `SnippetHighlight` | IMPLEMENT |
| `.notice` exact-username hint | discovery rule | IMPLEMENT (copy added to search catalog) |
| Main pane public profile | `/app/profile/[username]` (separate route) | PARTIAL: profile page restyled with `profile-hero` + settings-card; main pane of search shows empty state |

### Contacts (`contacts.html`)

| Design element | Existing code | Decision |
| --- | --- | --- |
| Favourites section, `member-row` | `FavoritesList` | IMPLEMENT |
| Alphabetical contact list | no contacts list (only favourites + recents) | IGNORE |
| Recent searches | `RecentSearches` | IMPLEMENT (styled as member rows) |
| Username search | `UsernameSearch` | IMPLEMENT (`.search`) |
| Presence "online" | not in favourites data | IGNORE |
| Main pane profile | profile route | PARTIAL (as search) |

### Requests (`requests.html`)

| Design element | Existing code | Decision |
| --- | --- | --- |
| Header back + title | route | IMPLEMENT |
| `.notice` explainer | none | IGNORE (no copy exists; would be invented policy text) |
| Request rows as `chat-row` | `IncomingRequestRow`, `OutgoingRequestRow` | IMPLEMENT |
| "Possible spam" tag | none | IGNORE |
| Accept / Decline buttons | existing | IMPLEMENT (`btn--primary`, `btn--secondary`) |
| Block / Delete | not on requests | IGNORE |

### Notifications (`notifications.html`)

| Design element | Existing code | Decision |
| --- | --- | --- |
| Back + title + mark-all-read | `NotificationsInbox` | IMPLEMENT |
| Filter chips | paginated list, no type/unread filter | IGNORE |
| New / Earlier sections | `readAt` | IMPLEMENT (unread = New) |
| `.notif` avatar + kind badge | `actorUsername`, `type` | IMPLEMENT (message / reaction / generic icon) |
| Rich text with conversation names, quotes | not in row data | IGNORE |
| Unread `.dot` | `readAt` | IMPLEMENT |
| "Review" action on request notifications | no request type in rows | IGNORE |
| Preferences pane | `NotificationsSettingsForm` (in-app, push, mentions only) | IMPLEMENT as switches in main pane + on `/app/settings/notifications` |
| Per-type toggles (DMs, groups, reactions, requests, added, roles) | none | IGNORE |

### Settings (`settings.html`)

| Design element | Existing code | Decision |
| --- | --- | --- |
| Sidebar header back + title | — | IMPLEMENT (new `settings/layout.tsx`) |
| Search settings | none | IGNORE |
| `.profile-card` | `getOwnProfile` | IMPLEMENT → account page |
| Rows Account / Privacy / Security / Notifications / Appearance / Language | existing routes | IMPLEMENT |
| Keyboard shortcuts row | `ShortcutHelpDialog` opens via shortcut only, inside another provider | IGNORE (still on `mod+shift+/`) |
| Log out row | `signOutAction` | IMPLEMENT |
| Theme cards | `ThemeOptionList` | IMPLEMENT |
| Accent swatches | none | IGNORE |
| Language radio rows | `LocaleOptionList` | IMPLEMENT |
| Reduce motion switch | none (OS setting honoured in CSS) | IGNORE |
| Privacy toggles / selects | `PrivacySettingsView`, `ToggleControl` | IMPLEMENT (`setting` + `.switch`) |
| Account / Security forms | `AccountSettings`, `SecuritySettings` | IMPLEMENT (cards, fields, buttons) |

### Auth (`login.html`, `signup.html`)

| Design element | Existing code | Decision |
| --- | --- | --- |
| `.auth__top` brand + language select | `saveLocaleAction` (works anonymously, cookie) | IMPLEMENT |
| `.auth-card` two columns + art | — | IMPLEMENT (art uses translated tagline; no fictional chat bubbles with names) |
| Fields, `.input`, `.btn--primary` | `LoginForm`, `SignupForm` | IMPLEMENT |
| "Keep me signed in" | none | IGNORE |
| Forgot password | `requestPasswordResetAction` | IMPLEMENT (link-style button) |
| Signup `@` username prefix | — | IMPLEMENT |
| Live "@x is available" | `checkUsernameAvailable` has no client action | IGNORE |
| Field error state | server error codes | PARTIAL: `aria-invalid` + `field__error` on the field matching the returned code (username / credentials) |
| `.auth__legal` | `/legal/terms`, `/legal/privacy` | IMPLEMENT |

### Out of scope regardless
Calls, video, status/stories, channels, E2E encryption, accent colours, `.swatch`, `.kbd` outside the palette hint.

## 2. Token map (design → `src/shell/styles/tokens.css`)

Reuse (same name, new value as `light-dark()` pair): `--color-bg`, `--color-panel`, `--color-card`, `--color-modal`, `--color-text`, `--color-text-muted`, `--color-border`, `--color-accent`, `--color-accent-contrast`, `--color-focus`, `--color-danger`, `--radius-control`, `--radius-bubble` (16 → 8), `--space-8/12/16/24`, `--motion-*`.

Add: `--color-elevated`, `--color-input`, `--color-hover`, `--color-selected`, `--color-pressed`, `--color-overlay`, `--color-text-disabled`, `--color-icon`, `--color-border-strong`, `--color-accent-strong`, `--color-accent-soft`, `--color-danger-soft`, `--color-warning`, `--color-online`, `--color-read`, `--color-link`, `--color-chat-bg`, `--color-chat-pattern`, `--color-bubble-in`, `--color-bubble-out`, `--color-bubble-meta`, `--color-quote`, `--color-system`, `--avatar-1..6`, `--avatar-text`, `--sender-1..4`, `--radius-card`, `--radius-pill`, `--space-2`, `--space-4`, `--font-sans`, `--text-xs/sm/md/lg/xl/2xl`, `--weight-regular/medium/bold`, `--sidebar-width`, `--drawer-width`, `--header-height`, `--row-height`, `--bubble-max`, `--shadow-bubble`, `--shadow-menu`, `--shadow-modal`.

Theme wiring: `<html data-theme>` already set from profile/cookie (`system|light|dark`). `:root { color-scheme: light dark }`, `[data-theme=light|dark]` pin it. The old `@media (prefers-color-scheme)` duplicate block is no longer needed. `[data-accent]` variants are not added (no accent switching exists). `[lang="ar"]` font + `--text-md` override added.

Undefined tokens used by features get repointed: `--radius-panel|lg → --radius-card`, `--radius-sm|md → --radius-control`, `--color-surface*`/`--color-panel-elevated → --color-elevated`/`--color-input`, `--color-fg → --color-text`, `--color-muted → --color-text-muted`, `--color-on-accent|accent-fg → --color-accent-contrast`, `--color-accent-text → --color-accent-strong`, `--color-backdrop → --color-overlay`, `--font-size-meta → --text-xs`, `--font-size-title → --text-lg`, `--space-48 → calc(var(--space-24) * 2)`. `visually-hidden` → `sr-only`.

## 3. Icon map (`i-*` → `lucide-react`)

| Sprite | Lucide | Sprite | Lucide |
| --- | --- | --- | --- |
| i-chats | MessageCircle | i-groups | Users |
| i-search | Search | i-contacts | UserRound |
| i-bell | Bell | i-bell-off | BellOff |
| i-settings | Settings | i-more | EllipsisVertical |
| i-plus | Plus | i-new-chat | MessageSquarePlus |
| i-attach | Paperclip | i-smile | Smile |
| i-mic | Mic | i-send | SendHorizontal |
| i-check | Check | i-check-check | CheckCheck |
| i-back | ArrowLeft (ArrowRight in RTL) | i-close | X |
| i-pin | Pin | i-archive | Archive |
| i-image | Image | i-file | FileText |
| i-lock | Lock | i-chevron | ChevronRight (ChevronLeft in RTL) |
| i-chevron-down | ChevronDown | i-star | Star |
| i-sun | Sun | i-moon | Moon |
| i-monitor | Monitor | i-globe | Globe |
| i-shield | Shield | i-key | KeyRound |
| i-palette | Palette | i-logout | LogOut (flipped in RTL) |
| i-user-plus | UserPlus | i-reply | Reply |
| i-forward | Forward | i-copy | Copy |
| i-trash | Trash2 | i-edit | Pencil |
| i-inbox | Inbox | i-download | Download |
| i-play | Play (Pause when playing) | i-at | AtSign |
| i-ban | Ban | i-flag | Flag |
| i-link | Link | i-mail | Mail |
| i-eye | Eye | i-filter | Filter |
| i-clock | Clock | i-message | MessageSquare |
| i-heart | Heart | i-keyboard | Keyboard |

`logo` is a brand mark, not an icon: rendered as a small inline SVG in a shell `BrandMark` component (two circles, `currentColor`). Directional icons flip in RTL with a `.flip` rule (`[dir=rtl] … { transform: scaleX(-1) }`) rather than swapping components, except where an existing component already swaps.

## 4. Risks

- **Unit tests** referencing copy or roles: `FolderStrip.test` (toolbar name, "Create folder" button, no-folders hint), `SignupForm.test` (labels "البريد الإلكتروني", "كلمة المرور", "اسم المستخدم"; button "إنشاء حساب"), `MessageActionHost.test`, `NotificationsInbox.empty.test`, `PrivacySettingsView.test`, `CommandPalette.test`, `GlobalSearchView.test`, `NewGroupForm.test`, `MediaComposerTool.test`, `RequestRequiredForm.test`, `ReactionChip.test`. Keep labels and roles stable; the "Archived" chip moving to an archive row only affects the folder strip render.
- **Catalog test** requires identical keys in ar/en/fr and no dotted keys: every new key added in all three.
- **E2E**: smoke only checks landing, `/app` → `/login`, and that `/login` `/signup` render a password input in RTL. Safe as long as forms keep `input[type=password]`.
- **Navigation loss**: removing the rail drops direct entries to Home, Groups, Search, Contacts, Notifications (badge), Message requests (badge), Settings. Re-homed in §5.
- **Mobile back**: `MobileBackBar` derived `/app/settings` from `/app/settings/account`, which 404s today; a settings index page fixes this.
- **Context boundaries**: anything that uses `useMessaging` must render inside `ChatsApp`; the drawer therefore lives in `ChatsLayout`, not in the shell right pane.
- **RTL**: bubble tails (clip-path swaps), back/chevron/send/logout icons must flip; usernames wrapped in an LTR-isolated span; `float: inline-end` for meta needs logical support (all evergreen browsers).
- **Concurrent agents / WIP**: groups and message-requests are uncommitted with a known `Result<null>` vs `Result<void>` typecheck error in `groups/service.ts`. If baseline typecheck fails there, it's reported, not "fixed" by this port unless trivial and isolated.
- **Overflow menu inside a link** in `ConversationList` (invalid nesting today) is fixed by moving the button out of the `<a>`.
- **Side effects in render**: `ImageMessageRenderer` and `AudioMessageRenderer` call `getDownloadUrlAction` during render; moved into effects while restyling.

## 5. Re-homed navigation

| Entry (rail) | New home |
| --- | --- |
| Home | `/app` redirects to `/app/chats` |
| Chats | Back arrows on every secondary page; command palette |
| Settings | Sidebar avatar → `/app/settings`; palette |
| Groups | Chats empty-state "New group"; settings "More" list (`list-row`); palette (new command) |
| Search | Chats sidebar search box; settings "More" list; palette |
| Contacts | Empty-state "Find by username"; settings "More" list; palette |
| Notifications (+ badge) | Settings "More" list with the nav badge; palette |
| Message requests (+ badge) | Settings "More" list with the nav badge; palette (new command) |

The "More" list is rendered from the same shell items + `nav` contributions the rail used, so feature badges still register through `src/shell/slots`.

## 6. Order of work / commits

1. Tokens + base (`tokens.css`, `globals.css`), repoint undefined tokens.
2. Shell: `AppShell`, `PaneLayout`, `PaneHeader`, `Avatar`, `BrandMark`, `ui.module.css` primitives, `MobileBackBar`, nav list, `/app` redirect, settings layout.
3. Features in the order: direct-messaging → message-actions → reactions → media → typing-presence → conversation-organization → groups → message-requests → search / discovery-contacts → notifications → safety → locale-appearance / settings → identity.
4. States / RTL / responsive pass.
5. typecheck, lint, vitest, playwright; visual comparison notes.
