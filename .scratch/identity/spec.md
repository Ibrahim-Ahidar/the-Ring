# Pulse: identity, username, and sessions

**Status:** ready-for-agent

**Wave:** 1

**Blocked by:** platform-foundation

**Owns:** `/login`, `/signup`, `/app/settings/account`, `/app/settings/security`, and the identity application service.

**Must not edit:** the foundation migration, `decideInteraction`, `notify`, `limit`, the shell layout, the package manifest, or any other feature module. Call the foundation username normalizer. Do not rewrite it.

## Problem Statement

A person cannot yet create a Pulse account, reserve a username, or manage the session they are using. Other features can fabricate profiles in tests, but a visitor has no real way to become a member.

## Solution

A visitor signs up with email and password, confirms their email, and reserves a unique username before entering the app. A member can edit their display name, bio, and avatar, change username within the cooldown, sign out, revoke other sessions, and delete the account. The username remains the identity other people search for.

## User Stories

1. As a visitor, I want to sign up with email and password, so that I can create an account without a phone number.
2. As a visitor, I want to choose my username during signup, so that my public identity exists before I enter Pulse.
3. As a visitor, I want an optional display name that defaults to my username, so that I can be searchable even if I skip the extra field.
4. As a visitor, I want invalid usernames explained with a specific reason, so that I can fix length, characters, or a reserved word.
5. As a visitor, I want a taken username rejected, including when it differs only by case, so that I do not collide with an existing member.
6. As a visitor, I want a confirmation message after signup when my email is not yet verified, so that I know I cannot enter the app yet.
7. As a visitor, I want to open the verification link and then sign in, so that an unverified account cannot use conversations.
8. As a visitor, I want to sign in with email and password, so that I can return to my account.
9. As a visitor, I want a failed sign-in to say that the credentials were not accepted, so that the form does not reveal which field was wrong.
10. As a visitor, I want to request a password reset email, so that I can recover access.
11. As a member, I want to sign out of the current device, so that a shared computer does not keep my session.
12. As a member, I want my current session recorded with a device label and last seen time, so that I can recognize it in the security settings.
13. As a member, I want to revoke another session, so that a lost device stops working.
14. As a member, I want a revoked session to be refused on its next request, so that revoke is effective.
15. As a member, I want to edit my display name, bio, and avatar, so that my profile shows who I am.
16. As a member, I want avatar upload limited to the foundation image types and size, so that a profile photo cannot bypass the media constants.
17. As a member, I want to change my username only when the 14-day cooldown has passed, so that my public handle stays stable.
18. As a member, I want my previous username to become available after a successful change, so that the old normalized name is not locked forever.
19. As a member, I want timezone stored on my profile, so that later timestamps can use it.
20. As a member, I want to delete my account through a typed confirmation, so that destruction is deliberate.
21. As a member, I want account deletion to release my username, anonymize my profile as a deleted member, revoke sessions, and leave my memberships, so that old messages remain for other people without my identity.
22. As a member, I want an export action that explains export is not available yet, so that the account screen acknowledges the request without pretending a file was produced.
23. As a member using a keyboard, I want every identity form reachable and labeled, so that I can sign up without a pointer.
24. As a member, I want identity screens in Arabic, English, and French, so that the account flow matches my locale.
25. As a member who submits signup twice quickly, I want the limiter to refuse the extra attempt, so that account creation is rate limited.

## Implementation Decisions

- Identity service operations: `signUp`, `signIn`, `requestPasswordReset`, `signOut`, `updateProfile`, `changeUsername`, `listSessions`, `revokeSession`, `deleteAccount`. Each returns a `Result` and an error code. Screens map codes through the identity catalogs.
- Signup uses Supabase email and password. The member chooses username and optional display name in the same flow. The profile row is created only after the auth user exists, with the foundation normalizer applied first. Email must be confirmed before `/app` loads. The test fixture remains the way other features get a user; this spec's tests may also drive signup.
- Username change cooldown is 14 days from `username_changed_at`. The first reservation during signup sets `username_changed_at` so the cooldown starts at creation. A change writes the new display form, the new normalized form, and the timestamp in one operation. Uniqueness conflicts return `identity.username_taken`. Cooldown conflicts return `identity.username_cooldown`.
- Profile fields this service may write: `display_name`, `bio`, `avatar_url`, `timezone`, `username`, `normalized_username`, `username_changed_at`. It does not write privacy or theme columns.
- Avatar bytes go to the private bucket under a server-chosen path for that user. The profile stores the path. Reject anything outside the foundation image allowlist or size limit with `identity.avatar_rejected`.
- Sessions are `devices` rows. Sign-in upserts the current device. Revoke sets `revoked_at`. A revoked device cannot load `/app`. A member cannot revoke a session that is not theirs (`identity.not_found` so other people's ids are not distinguishable).
- Account deletion requires the member to type their username. Then: revoke all devices, set memberships' `left_at`, set display name to the localized deleted-member label stored as a stable key the UI translates, clear bio and avatar, set username to a non-reusable deleted marker that still satisfies uniqueness, and set `discoverable` false. Do not hard-delete messages. Do not cascade-delete reports they filed.
- The export control records nothing and returns `identity.export_unavailable`. The screen explains that no archive is generated.
- Client state for the forms is an identity context and reducer: field values, submitting, and the latest error code. Presentational fields are memoized.
- Catalogs in Arabic, English, and French live in the identity module. Use plurals if a story ever shows a count. Use the shell's direction.
- Empty, loading, and error states exist for the session list and the account form. A session list with only the current device shows that device, not a blank page.

## Testing Decisions

Test the identity service with user-scoped clients and, for signup, the auth admin only inside the fixture setup. Assert error codes and the rows a second user can see.

Cover: signup rejects bad and duplicate usernames; unverified users are not treated as app members; sign-in failure uses one code; username cooldown and successful rename; profile update does not change `who_can_message`; revoke hides that device from a later session check; deleteAccount anonymizes the profile, frees the old normalized username for a new signup, and leaves message rows in place; a second user cannot list the first user's devices.

Browser coverage is limited to one path: the signup frame renders in Arabic with labeled controls. Deeper browser journeys belong to the browser-journeys spec.

No prior identity tests exist. Follow the foundation harness.

## Out of Scope

- Passwordless login, OAuth, and captcha.
- Producing a real data export archive.
- Privacy toggles, blocks, and reports.
- Editing another member's profile.
- Multi-device draft sync.

## Further Notes

Implement this spec only. Do not build chat, search, or settings screens you do not own. If the foundation spec is not merged, stop.
