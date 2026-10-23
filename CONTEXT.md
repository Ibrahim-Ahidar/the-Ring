# Context

Shared vocabulary for the chat app. Use these terms in code, tests and docs.

## Glossary

- **Archived chat:** a membership with `archived_at` set; hidden from every list except the Archived view.
- **Built-in filter:** All, Unread, Groups — fixed chips before user folders.
- **Folder:** a private, user-created, ordered group; a chat is in at most one.
- **Theme:** the light/dark scheme a user picks — System (follows the OS, default), Light or Dark.
- **Client:** one way a user reaches Pulse — Web Client (the browser site), Desktop Client (Electron) or Mobile Client (React Native, Android first). All Clients share one account, one set of chats and the same rules.
- **Device:** one installed Desktop or Mobile Client signed in as one user; a Mobile Device holds the push token used to reach that user when the app is closed. Signing out removes the Device.
- **Accent:** the brand palette a user picks, independent of Theme — Indigo (default, matches the app icon) or Green (the classic look). An Accent sets the brand colour, sent-bubble colour and neutral surfaces together.

### Local-first and E2EE terms (see `docs/specs/local-first-e2ee.md`)

Under that spec a browser running the Web Client is also a Device: it holds its own keys and counts toward the 5-Device limit.

- **Linked Device:** a Device added by scanning a QR code on an existing Device; it receives the Account Signing Key and the message history from it.
- **Fresh Device:** a Device added by password sign-in; it gets contacts, the chat list and groups plus new messages, and old history only by restoring a Backup.
- **Mailbox:** the server table that holds Envelopes until every recipient Device acks them, for 30 days at most.
- **Envelope:** one encrypted message for one recipient Device.
- **Control Message:** an Envelope that changes state instead of showing a bubble — reaction, edit, delete, receipt, read, sender key and the like.
- **Backup Device:** the one Device per account that writes encrypted backups to Google Drive or a file (the phone by default).
- **Security Code:** the 60-digit number (and QR code) two users compare to verify each other's Account Signing Keys.
