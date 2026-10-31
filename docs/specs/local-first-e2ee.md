# Local-first storage, end-to-end encryption and faster delivery

Status: agreed design, not started. Issue: #213. Phase tickets are made from section 12. The phase order (P0–P10) was proposed and not objected to; treat it as agreed unless changed.

## 1. Why

Supabase today stores every message, reaction, receipt and file forever, and every Client reads them back
from it. On the free plan that runs into every ceiling at once: database size, storage, egress, Realtime
connections and messages. Messages also arrive slowly, because they travel through `postgres_changes`.

Target: WhatsApp's model.

- Message history lives on the user's Devices.
- The server is a short-lived, encrypted Mailbox and a directory of users, conversations and keys.
- Every message is end-to-end encrypted.
- Backups go to the user's own Google Drive or to a file.

Goals, in order:

1. Supabase can no longer read message content.
2. The database stays small (under 50 MB) whatever the history size.
3. Sending is instant and arrival is fast (section 11).
4. The design is clean enough to explain in an interview.

## 2. Decisions

| # | Decision |
|---|---|
| D1 | Every Device is equal (WhatsApp multi-device). There is no "phone is the master" mode. |
| D2 | Two ways to add a Device. A **Linked Device** is added by QR code from an existing Device and receives history from it. A **Fresh Device** is added by password sign-in: it gets contacts, the chat list and groups, plus new messages, and old history only by restoring a backup. |
| D3 | A Fresh Device triggers an alert on the user's other Devices and a "new device" notice to contacts. Devices can be removed in Settings. "Require approval from an existing device" is on by default once an account has a Device. |
| D4 | At most 5 Devices per account. A browser running the Web Client counts as one. |
| D5 | The server keeps an Envelope until every recipient Device has confirmed it, and for 30 days at most. |
| D6 | Testers' data is wiped at the switch-over. Nothing is migrated. |
| D7 | Accepted losses: no message text in pushes from the server, no server search, reports carry only messages the reporter chooses, link previews are made by the sender, and a new browser has no history until it is linked or restored. |
| D8 | Media is encrypted on the device and stored in Cloudflare R2, which deletes it after 30 days. Media that was never downloaded or backed up shows as "media expired". |
| D9 | Backups are encrypted, go to the hidden Google Drive app folder or to an exported file, and work like WhatsApp's. iCloud comes later, when there is an iOS app. |
| D10 | Encryption uses vodozemac: Olm for 1:1 Device sessions, Megolm for groups. We write no cryptography of our own. |
| D11 | The Desktop Client keeps the web UI (ADR 0001). The preload layer gives it a real SQLite file and OS key storage through `safeStorage`. |
| D12 | Losing every Device without a backup means losing history. The server never holds a key that could read messages (no key escrow). |
| D13 | Groups have at most 256 members. Each sending key rotates when a member or Device leaves, and after 100 messages or 7 days. |
| D14 | A sender also encrypts each message for its own other Devices. Edits, deletions, reactions and receipts are encrypted Control Messages. Drafts stay on one Device. |
| D15 | Mobile pushes become data-only FCM messages. The phone decrypts the message and shows the notification itself. |
| D16 | Search is local, using SQLite FTS5. The server can still search users and chats. |
| D17 | The work ships as phases P0–P10 behind an `e2ee` flag, then turns on in one switch-over release. |
| D18 | The only security UI is a security-code verification screen, with a QR code and a 60-digit number. |

## 3. What the server keeps

**Kept (metadata):**
- `profiles`, usernames, contacts, blocks, message requests
- `conversations`, group membership and roles
- per-user chat state: archived, muted, pinned, folders
- `devices` and their public keys, `account_keys`, `one_time_keys`
- push tokens
- `mailbox`
- encrypted `group_state` blobs

**Dropped at the switch-over (P10):**
- `messages.body` and, later, the `messages` table itself
- `attachments`, `message_reactions`, `message_hides`, `message_audio_plays`
- the read and delivered receipt columns
- the `search` functions on message bodies
- the `attachments` Storage bucket

**Stays plain and short-lived:** typing indicators and presence go over Broadcast. They carry no content.

## 4. Keys and Devices

### 4.1 Key types

| Key | Where | Purpose |
|---|---|---|
| Account Signing Key (Ed25519) | Every Linked Device of the user. It is moved during QR linking and never sent to the server in clear. | Signs the user's Device list. The Security Code is derived from it. |
| Device identity keys (Curve25519 + Ed25519) | One Device | Olm sessions and Megolm message signatures |
| One-time keys and a fallback key (Curve25519) | Public half on the server | Start new Olm sessions |
| Megolm outbound session | The sending Device | Group messages |
| Local storage key | OS key storage: `expo-secure-store`, Electron `safeStorage`, or a non-extractable WebCrypto key in IndexedDB | Encrypts the pickled crypto state and the local database file |

### 4.2 Server tables (new)

```sql
account_keys (user_id pk, signing_key text, version int, created_at)
devices (id uuid pk, user_id, name, platform, identity_key, signing_key,
         account_signature text,          -- Device signed by the Account Signing Key
         fallback_key text, created_at, last_seen_at, push_token text null)
one_time_keys (device_id, key_id, public_key, primary key (device_id, key_id))
mailbox (id uuid pk, recipient_device_id, sender_device_id, sender_user_id,
         conversation_id null, kind smallint, ciphertext bytea,
         created_at, expires_at default now() + interval '30 days')
group_state (conversation_id pk, version int, ciphertext bytea, updated_by_device)
```

RPCs:
- `register_device`
- `upload_keys`: keep 50 one-time keys, top up when fewer than 10 remain
- `claim_keys(device_ids[])`: atomic, falls back to the fallback key
- `list_devices(user_ids[])`
- `send_envelopes(batch)`
- `fetch_mailbox(after, limit)`
- `ack_envelopes(ids[])`
- `remove_device`
- `approve_device`

Access rules: a Device can read only its own `mailbox` rows, and can insert rows only for Devices of users it shares a conversation or message request with. Block rules are enforced in `send_envelopes`.

### 4.3 Adding a Device

- **Linked (QR):**
  1. The new Device shows a QR code containing a temporary Curve25519 key, its Device id and a nonce.
  2. An existing Device scans it and opens an encrypted relay over Broadcast topic `link:<nonce>`.
  3. The user confirms on the existing Device.
  4. The existing Device sends the Account Signing Key, signs the new Device, and starts the history transfer (section 7).
  5. The Security Code does not change.
- **Fresh, with approval on and an existing Device online:** the new Device asks for approval. The existing Device shows "Allow <name>?" and, on yes, signs the new Device. The Security Code does not change, but contacts see a "new device" notice.
- **Fresh, with approval off, or "I lost my devices":** the new Device creates a new Account Signing Key, so `account_keys.version` goes up and all older Devices are signed out. Contacts see "security code changed".
- After sign-in, a Fresh Device always offers "Restore from Google Drive or a backup file" (section 8).

The user's Devices sign their Device list. Any change to it (a Device added, removed, or the account key replaced) goes out as a Broadcast `devices_changed` event to the user's contacts. Their clients refresh the list and show a notice in the chat.

Limits and cleanup:
- Adding a sixth Device is refused. The user must first remove one.
- A Device inactive for 30 days is removed by pg_cron, and its mailbox rows are deleted.

### 4.4 Security Code

The Security Code works like Signal's safety numbers:
- For each user, hash `version ‖ Account Signing Key ‖ user id` with 5200 rounds of SHA-512 and take 30 digits.
- Concatenate both users' digits in sorted order to get 60 digits.
- The same data is shown as a QR code.

Scanning it on the other person's phone marks the contact as verified, locally. A change to a verified contact's code shows a warning before the next message is sent.

## 5. Messages

### 5.1 Envelope and plaintext

An **Envelope** is one ciphertext for one recipient Device. Inside, after decryption:

```ts
type Plain = {
  v: 1; id: string /* client uuid */; conversationId: string; sentAt: number;
  kind: 'text' | 'media' | 'reaction' | 'edit' | 'delete' | 'receipt' | 'read' |
        'audio_play' | 'pin' | 'group_event' | 'sender_key' | 'group_state_key' |
        'history_chunk' | 'device_notice';
  body: unknown; // shaped by kind
};
```

The plaintext is padded to a multiple of 256 bytes, so message length leaks less.

A **Control Message** is any `kind` other than `text` and `media`. They follow the same path and are never shown as bubbles.

### 5.2 Sending a 1:1 message (fast path plus durable path)

1. The UI writes the message to the local `outbox` and `messages`. The bubble appears at once with a clock icon.
2. The worker resolves recipient Devices: the peer's Devices plus the sender's own other Devices. It uses a cached Device list and refreshes it on `devices_changed`.
3. It encrypts once per Device with Olm, claiming one-time keys when no session exists yet.
4. Two paths run in parallel:
   - **Fast path:** the client sends each Envelope directly as a Broadcast on the private topic `device:<id>`.
   - **Durable path:** `send_envelopes` inserts the batch into `mailbox`. On success the bubble shows ✓.
5. The recipient Device receives the Envelope from whichever path comes first.
   - Envelopes are deduplicated by mailbox id.
   - The Device decrypts the Envelope, stores the message, calls `ack_envelopes` (which deletes the row), and sends an encrypted `receipt` back. The sender then shows ✓✓.
   - When the message is read, a `read` Control Message turns the ticks blue.
6. If an Envelope is larger than the Broadcast payload limit, the fast path sends only the mailbox id and the recipient fetches the row.

Realtime access rules: a user may send to `device:*` topics of users it shares a conversation with, and may join only its own `device:<id>` topics.

### 5.3 Offline Devices

When a Device connects, it pages through `fetch_mailbox`, 500 rows at a time, in creation order. It decrypts the rows, stores them, and acks each page. A daily pg_cron job deletes rows past `expires_at`.

### 5.4 Groups (Megolm)

- Each member Device keeps one outbound Megolm session per group. Its key goes to every member Device as an Olm `sender_key` Control Message.
- When a new Device appears for a member, sessions are shared with it from then on. It never receives older keys.
- A group message is one Megolm ciphertext, stored as one mailbox row per recipient Device. The ciphertext is identical in each row and the rows are small, which keeps the work low at up to 256 members.
- The outbound session rotates when a member leaves, a Device is removed, after 100 messages, or after 7 days.
- Group name, description and photo are stored in `group_state`, encrypted with a group state key. That key is shared with member Devices in the same way, so a Fresh Device can show the chat list.
- The server still knows membership and roles, so admin rights keep working server-side.

## 6. Local storage

### 6.1 One interface, three adapters

`packages/core` defines a `LocalStore` interface (the repository and its queries) and a `CryptoEngine` interface. Each Client provides adapters:

| Client | Database | Crypto |
|---|---|---|
| Mobile | `expo-sqlite` | Expo native module wrapping vodozemac (Rust via uniffi), Android first |
| Desktop | `better-sqlite3` in the Electron main process, exposed through `contextBridge`. The local storage key is held with `safeStorage`. | vodozemac compiled to WebAssembly, in a worker |
| Web | SQLite WebAssembly with OPFS in a worker. `navigator.storage.persist()` is requested. | vodozemac compiled to WebAssembly, in a worker |

The Web Client uses the desktop bridge when it is present, and falls back to OPFS otherwise. Log out deletes the local database and the keys.

**Consequence:** the native crypto module means the Mobile Client can no longer run in Expo Go. It needs an EAS development build, and the `start` scripts change accordingly.

### 6.2 Schema (same on every Client)

```sql
conversations (id pk, kind, title, avatar, last_message_id, unread_count, updated_at)
messages (id pk, conversation_id, sender_user_id, sender_device_id, sent_at, received_at,
          kind, body, reply_to_id, edited_at, deleted int, status, media_json)
reactions (message_id, user_id, emoji, primary key (message_id, user_id))
receipts (message_id, user_id, delivered_at, read_at, primary key (message_id, user_id))
outbox (id pk, payload, attempts, next_attempt_at)
media (message_id pk, r2_key, key_b64, sha256, mime, size, local_path, expired int)
crypto_state (name pk, pickle blob)        -- encrypted with the local storage key
messages_fts (fts5 over messages.body)
kv (key pk, value)                          -- cursors, flags, sync state
```

Server data (conversations, members, profiles) is cached in the same tables and refreshed with `updated_at` cursors. The UI reads only from the local database. The network only writes to it.

## 7. History transfer to a Linked Device

After QR approval, the existing Device sends its history as encrypted `history_chunk` messages over the link channel:
- messages, reactions and receipts
- media as references only, so they still expire with R2

If the export is larger than 5 MB, it uploads one encrypted archive to R2 instead and sends the key and location. The new Device imports the history and shows progress. Chats appear newest first.

## 8. Backups

| Setting | Value |
|---|---|
| Who writes | One Backup Device per account, the phone by default, changeable in Settings |
| Contents | Messages and chat state always. Media optional, off by default. Never crypto keys or sessions. |
| Frequency | Weekly by default, or daily, or manual. On mobile, Wi-Fi only. |
| Destination | Google Drive app-data folder (`drive.appdata` scope) as `pulse-backup-v1.bin` with a manifest, or a manual file export |
| Encryption | A random 32-byte backup key encrypts the file with XChaCha20-Poly1305 in streamed chunks (libsodium). The backup key is wrapped either by a passphrase stretched with Argon2id or by a 64-digit key the user writes down. |
| Restore | Offered after sign-in on a Fresh Device, and from Settings. It imports into the local database. |

Restoring never brings back keys. If the sign-in replaced the Account Signing Key, the Security Code still changes as in section 4.3.

## 9. Media

1. The sender picks a random 32-byte key and encrypts the file with AES-256-GCM in chunks.
2. The Edge Function `media-upload-url` checks the size limits (image and audio 8 MB, file 20 MB, voice notes 180 s) and conversation membership, then returns a pre-signed R2 PUT link valid for 5 minutes.
3. The sender uploads the encrypted file directly to R2.
4. The `media` message carries the R2 key, the file key, a SHA-256 hash, the type, the size, and a small encrypted thumbnail inline.
5. The recipient downloads, checks the hash, decrypts, and keeps the file locally.
6. An R2 lifecycle rule deletes objects after 30 days. A download that returns 404 marks the media "expired".

### 9.1 Owner setup for R2 (one time, needs your Cloudflare account)

Everything is built and tested against a mocked R2. To go live:

1. In Cloudflare, create an R2 bucket (for example `pulse-media`, private, no public access) and an R2 API token with Object Read & Write on that bucket. Note the account id, the access key id and the secret access key.
2. Set the secrets on the Supabase project (replace the placeholders):

```
supabase secrets set R2_ACCOUNT_ID=<cloudflare-account-id> R2_ACCESS_KEY_ID=<r2-access-key-id> R2_SECRET_ACCESS_KEY=<r2-secret-access-key> R2_BUCKET=<bucket-name>
```

3. Bucket CORS (R2 bucket, Settings, CORS policy). Replace the origins with your web and desktop origins:

```json
[
  {
    "AllowedOrigins": ["https://<your-web-origin>", "http://localhost:3000"],
    "AllowedMethods": ["GET", "PUT"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

4. Lifecycle rule: R2 bucket, Settings, Object lifecycle rules, add a rule on the whole bucket (empty prefix), action "Delete objects", after 30 days. CLI equivalent: `npx wrangler r2 bucket lifecycle add <bucket-name> --name expire-30d --expire-days 30`.
5. Deploy the function: `supabase functions deploy media-upload-url`.
6. Turn the flag on for the build (`NEXT_PUBLIC_PULSE_E2EE=1`). With it off, the old Supabase-storage media path is used unchanged.

The function is configured only by these four secrets. Without them it answers `media.not_configured` (503).

## 10. Push notifications

`push-notify` sends a data-only FCM message containing only `{ mailbox_id }`. It sends no title and no text.

On the phone, a background message handler (react-native-firebase messaging) does the rest:
1. Fetches and decrypts the Envelope.
2. Writes it to the local database.
3. Shows a local notification with the sender's name and up to 140 characters.

If decryption fails, the notification says "New message". The web and desktop Clients notify only while they are open.

## 11. Speed targets and measurement

Before P0, add a development-only timing tool:
- Each Envelope carries `sentAt`.
- The recipient logs `receivedAt − sentAt`, adjusted for the clock offset reported by the server.
- Chat open time and cold-start time are logged on every Client.
- Supabase database size and egress are recorded weekly.

| Metric | Baseline | Target |
|---|---|---|
| Send to arrival on another Device, p50 / p95, same region | measure | < 150 ms / < 300 ms |
| Tap to bubble shown (sender) | measure | < 16 ms (one frame) |
| Chat open from local database | measure | < 100 ms |
| Cold start to chat list | measure | < 1.5 s on mobile |
| Supabase database size | measure | < 50 MB |

Also check the Supabase project region against where testers are. Moving the project closer is part of P1.

**Timing tool (issue #215, built).** Core: `packages/core/src/timing` (recorder with p50/p95, NTP-style clock offset). Web and desktop: `apps/web/src/platform/timing`, enabled when `NODE_ENV !== "production"` or `NEXT_PUBLIC_PULSE_TIMING=1`, otherwise the dynamic import is dead code and the runtime is not bundled. Mobile: dev builds only (`__DEV__`). Until the Envelope carries `sentAt`, arrival is measured against the message row's `created_at` (server clock) corrected by the `server_now()` offset; swap in the Envelope `sentAt` in `runtime.ts` `arrival()` once section 5 lands. How to run it: docs/operations/README.md.

**Baseline (to fill).** Needs a live backend and real devices, so it is not measured yet. Run the tool on two Devices in the same region (web, desktop, one physical phone), send about 30 messages each way, open about 10 chats, cold start about 5 times, then copy p50 / p95 from `window.__pulseTiming.summaries()` (mobile: the `[pulse-timing]` log) into the Baseline column above. Database size: run docs/operations/db-size.sql and record it.

**Region check.** The project in use (`pjaljbmuapcrrbfnujvx`, "the ring", read with `supabase projects list`) is in `eu-west-2` (London). The testers' location is not known here: the user must confirm where testers are. If they are in the UK or western Europe, same-region targets are realistic; if they are elsewhere (for example North Africa or the Middle East), expect higher latency and decide in P1 whether to move the project. The other project in the account (`Synexa`) is in `eu-west-1` and is not this app.

## 12. Phases

Each phase is one ticket, or a few. Everything sits behind the `e2ee` flag until P10.

### P0 Local store and instant sending (no dependencies)
- `LocalStore` and its three adapters, including the desktop preload bridge and OPFS.
- The UI reads from the local database, with an outbox, optimistic sending and FTS5 search.
- The timing tool and the baseline numbers.
- **Accept:** opening a chat makes no network read when the cache is warm. Search works offline. Baseline metrics are recorded in this file.

### P1 Mailbox transport (depends on P0)
- The `mailbox` table, `send_envelopes`, `fetch_mailbox` and `ack_envelopes`, the `device:<id>` Broadcast fast path with its access rules, and the pg_cron cleanup.
- Envelopes are still plaintext JSON behind the flag.
- **Accept:** p95 arrival < 300 ms. A Device offline for an hour gets every message once and in order. The mailbox is empty after all Devices ack.

### P2 Devices and keys (no dependencies, alongside P0 and P1)
- The `CryptoEngine` interface, vodozemac as WebAssembly and as the Expo native module, and the EAS development build.
- The `devices`, `account_keys` and `one_time_keys` tables and RPCs.
- The 5-Device cap, the Devices screen in Settings, the approval flow, `devices_changed` notices, and removal of inactive Devices.
- **Accept:** a sixth Device is refused. Removing a Device ends its sessions. A Fresh Device with approval on waits for approval.

### P3 Encrypted 1:1 chats (depends on P1 and P2)
- Olm Envelopes, copies to the sender's own Devices, and every Control Message kind.
- Unread counts are computed locally.
- **Accept:** the server stores only ciphertext (checked by a test that greps `mailbox` for plaintext). A tampered ciphertext is rejected. A removed Device cannot decrypt new messages.

### P4 Encrypted groups (depends on P3)
- Megolm, the rotation rules, `group_state`, and the 256-member cap.
- **Accept:** a member who left cannot read new messages. A new member cannot read messages from before they joined.

### P5 Encrypted media on R2 (depends on P3)
- The upload-link Edge Function, chunked encryption, the lifecycle rule, and the "expired" state.
- **Accept:** a raw R2 object is unreadable. Expiry shows correctly.

### P6 Data-only push (depends on P3)
- FCM data-only messages, the background handler, and the change to `push-notify`.
- **Accept:** the push payload contains no text. The notification shows decrypted text while the app is killed.

### P7 QR linking and history transfer (depends on P3)
- **Accept:** linking keeps the Security Code. 10,000 messages transfer in under 60 s on Wi-Fi.

### P8 Backups (depends on P3)
- Drive app-data and file export, the passphrase or 64-digit key, the schedule, the Backup Device setting, and restore after sign-in.
- **Accept:** a restore on a Fresh Device rebuilds the chats. A wrong passphrase fails cleanly. Drive holds only ciphertext.

### P9 Security-code screen (depends on P3)
- **Accept:** both phones show the same 60 digits. Scanning marks the contact verified. A changed key warns before sending.

### P10 Switch-over (depends on P0–P9)
- Raise `mobile_min_version`. Old RPCs return an "update required" error.
- One migration drops the plaintext tables, the search functions and the `attachments` bucket, and wipes testers' chats.
- Remove the old code paths and the flag. Give testers a day's notice.
- **Accept:** no table holds message content. The final metrics are recorded in section 11.

P5–P9 touch separate code and can run in parallel.

## 13. Risks

- **The Expo native module (vodozemac over uniffi)** is the largest unknown. Spike it first in P2, and keep a WebAssembly-in-JSI fallback in mind.
- **Free-plan Realtime message quota:** every message becomes one Broadcast per recipient Device. Watch the monthly count after P1.
- **Browser storage can still be cleared by the user.** The Web Client then behaves like a Fresh Device.
- **Clock skew** affects the timing tool only, never message ordering. Messages are ordered by `sentAt`, with the server's `created_at` as the tie-break.
