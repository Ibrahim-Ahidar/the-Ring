# Pulse: media, files, and voice notes

**Status:** ready-for-agent

**Wave:** 2

**Blocked by:** direct-messaging

**Owns:** `/app/media/[conversationId]`, the media service, attachment storage, and the composer-tool, message-renderer, and right-panel contributions for images, files, audio, and shared media.

**Must not edit:** `sendText`, the foundation media constants, the foundation migration's tables, or another feature's module. A new migration is allowed only to add an index that this spec's queries prove they need.

## Problem Statement

Members can exchange text only. They cannot send an image, a document, or a voice note, see upload progress, retry a failed upload, or browse what has been shared in a conversation.

## Solution

A member attaches an image, a document, or a voice recording. The file is checked against the foundation limits, uploaded to a private object path the server chooses, and represented as a message plus an attachment row. The thread shows progress and failure inside the bubble. A media browser for that conversation separates images, files, and links. Voice notes record in the browser, store duration, and play back with accessible controls.

## User Stories

1. As a member, I want to pick an image to send, so that I can share a picture.
2. As a member, I want a local preview before the upload finishes, so that I see what I chose.
3. As a member, I want upload progress on the bubble, so that a large file does not look stuck.
4. As a member, I want a failed upload to stay as a failed attachment with retry and cancel, so that I can recover.
5. As a member, I want retry not to create a second message, so that the same client id is reused.
6. As a member, I want an oversized or disallowed file rejected before upload, so that I get a clear error and no object is stored.
7. As a member, I want a document to show its name, size, and type, so that I know what I am downloading.
8. As a member, I want to download a file I am allowed to see, so that I can open it locally.
9. As a member, I want a non-member's download to fail, so that private files stay inside the conversation.
10. As a member, I want images to show width and height when known, so that the layout does not jump after load.
11. As a member, I want to record a voice note, so that I can send audio.
12. As a member, I want the recording to show duration and stop at three minutes, so that the foundation audio limit holds.
13. As a member, I want playback with play, pause, and a duration label, so that I can listen without a custom unlabeled control.
14. As a member, I want a waveform summary only when the client can compute a small series locally, so that the bubble has shape metadata without a server transcode.
15. As a member, I want my storage usage counted, so that the 100 MB quota is enforced.
16. As a member, I want an upload that would exceed my quota refused, so that the cap is real.
17. As a member, I want the shared media page to list images, files, and links for one conversation, so that I can browse history.
18. As a member, I want the links tab to list URLs that appear in text messages I can see, so that links are findable without a separate unfurl service.
19. As a member, I want a non-member to receive not-found for the media page, so that shared media is not a back door.
20. As a member, I want an empty media tab explained, so that a new chat does not look broken.
21. As a recipient, I want the attachment message to arrive over the conversation channel, so that I see the file without refresh.
22. As a member, I want a deleted-for-everyone attachment message to stop being downloadable, so that retract removes access to the file.
23. As a member, I want upload rate limits honored, so that the foundation upload limiter applies.
24. As a member, I want media chrome in Arabic, English, and French, with file sizes formatted for the locale, so that units look right.
25. As a member on a small screen, I want the picker and the recorder usable in the single-pane layout, so that mobile can attach.
26. As a member using the keyboard, I want attach, retry, cancel, and play to have accessible names, so that media controls are not icon-only mysteries.
27. As a member, I want a message of type image, file, or audio rendered by this spec's renderer, so that the timeline's unknown-type fallback is replaced for those types via the message renderer contribution.

## Implementation Decisions

- Service operations: `prepareUpload({ conversationId, clientId, kind, mimeType, sizeBytes, fileName, durationMs })`, `completeUpload({ messageId, width, height, waveform })`, `failUpload({ messageId })`, `getDownloadUrl({ attachmentId })`, `listShared({ conversationId, tab, cursor })`.
- `prepareUpload` checks membership, `limit` for upload, the foundation mime and size constants, and `storage_usage` plus the new object against the 100 MB cap. It inserts a message with the given client id, the matching type, `metadata.upload = "pending"`, and an attachment row whose storage path is chosen on the server. It returns a signed upload target for that path. A repeat client id returns the existing message and a fresh signed target when the upload is not ready, and does not insert a second message.
- The sender's client shows progress locally, keyed by client id. Other members must not see the message while `metadata.upload` is `pending`. If `listMessages` does not already exclude those rows for everyone except the sender, add that one condition. Do not otherwise rewrite `listMessages`.
- The browser uploads bytes to the signed target. It does not send the file through the application server as a buffered body.
- `completeUpload` sets `metadata.upload` to `ready`, stores width, height, duration, and waveform, and increments `storage_usage` by `size_bytes` once. A second complete does not increment again. Declared size must match the object's size when the platform reports it; otherwise complete returns `media.rejected` and leaves the message pending.
- `failUpload` deletes the object if one was stored, sets `metadata.upload` to `failed`, and does not increment usage. The sender sees retry. Other members still do not see a pending or failed upload. Retry uses the same client id.
- Download URLs are signed and short-lived. `getDownloadUrl` checks membership and that the message is not deleted for everyone and not hidden for the caller. Path traversal is impossible because the path is read from the attachment row, not from the client.
- Voice recording uses the browser media recorder. Max duration 180 seconds, then stop and send. Waveform is at most 64 amplitude numbers computed in the client, stored in `waveform`. No server transcode.
- Shared media tabs: `media` (image), `files` (file), `links` (text messages whose body contains an http or https URL). Cursor pagination, page size 30. Links are parsed the same way as message-actions link display; do not fetch them.
- Right-panel contribution opens the shared media route. Composer tool is the attach and record control.
- Message renderer contributions handle `image`, `file`, and `audio`.
- On delete-for-everyone of a ready attachment, the message-actions service already tombstones the message. This spec's download check refuses those. Object deletion can follow: when a message becomes deleted for everyone, subtract `size_bytes` from `storage_usage` and delete the object. Implement that in `getDownloadUrl`'s sibling `purgeIfDeleted(messageId)` called from a small hook this spec adds by wrapping... Do not edit `deleteForEveryone`. Instead, `getDownloadUrl` and `listShared` ignore deleted messages, and a periodic-style function `reconcileDeletedAttachments(conversationId)` may be invoked at the start of `listShared` to delete objects for tombstoned messages in that conversation and fix `storage_usage`. That keeps the purge inside this module.
- Catalogs in Arabic, English, and French. Format byte sizes with `Intl.NumberFormat`.
- Client reducer tracks local uploads by client id: progress, preview object URL, error. Revoke object URLs on remove. Presentational cards are memoized.

## Testing Decisions

Service tests: prepare rejects a disallowed mime and an oversized file without inserting a ready message; quota rejection leaves usage unchanged; complete is idempotent and increments usage once; a non-member cannot get a download URL; a deleted-for-everyone attachment cannot be downloaded; listShared returns only ready images for the media tab and only to members; the same client id does not create two messages; link tab finds a URL in a text message and ignores a non-member.

Browser: the attach control has an accessible name in Arabic. Recording tests that need a microphone permission are not required in CI; the duration cap is a pure function `clampRecordingMs` tested in Vitest.

No prior media tests. Use the messaging service to create the conversation and the user-scoped client for downloads.

## Out of Scope

- Virus scanning and image thumbnail generation pipelines. Store width and height from the client-provided metadata after a sanity range check (1 to 20000). Do not trust the client for mime or size; re-check declared size against the constant before signing, and if the platform reports the uploaded object size, reject completion when it disagrees.
- Server-side transcoding.
- Public CDN URLs.
- Stickers and GIFs as a separate product surface. A gif that is an allowed image mime may be sent as an image.

## Further Notes

Implement this spec only. The cost cap is part of the feature, not a follow-up. If an upload path lets the client choose the object key, it is wrong.
