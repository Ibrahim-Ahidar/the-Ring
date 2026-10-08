# Pulse — parallel spec map

Product: **Pulse**, a username-first realtime chat. Source blueprint: the portfolio specification. Each directory under `.scratch/` is one agent-sized spec. Status on every spec is `ready-for-agent`.

Implementation tickets are GitHub issues on [Ibrahim-Ahidar/the-Ring](https://github.com/Ibrahim-Ahidar/the-Ring/issues?q=label%3Aready-for-agent) with native blocked-by links. An agent picks one open ticket with no open blockers, works on its own branch, and implements that ticket against its linked spec. The table below is the spec-level map; tickets split each spec further. Wave 1 agents run at the same time. Wave 2 agents run at the same time after direct messaging is merged. The browser-journey agent runs last.

Shared contracts live in the platform foundation spec. Later agents call those contracts. They do not redefine them, and they do not edit another feature's module, catalogs, or an existing migration.

| Wave | Spec | Blocked by | Owns |
| --- | --- | --- | --- |
| 0 | [platform-foundation](platform-foundation/spec.md) | None | Schema, RLS, predicates, ports, shell, slots, i18n runtime, design tokens, test harness |
| 1 | [identity](identity/spec.md) | platform-foundation | Signup, session, profile edit, account lifecycle |
| 1 | [safety](safety/spec.md) | platform-foundation | Privacy settings, blocks, reports |
| 1 | [locale-appearance](locale-appearance/spec.md) | platform-foundation | Language and theme settings, command palette, shortcuts |
| 1 | [notifications](notifications/spec.md) | platform-foundation | In-app notification inbox and preferences |
| 1 | [discovery-contacts](discovery-contacts/spec.md) | platform-foundation | Exact username search, public profile, favorites |
| 1 | [direct-messaging](direct-messaging/spec.md) | platform-foundation | Direct conversations, text send, realtime, read cursors, reconnect |
| 1 | [typing-presence](typing-presence/spec.md) | platform-foundation | Ephemeral typing and presence |
| 1 | [ci-observability](ci-observability/spec.md) | platform-foundation | CI pipeline, error reporting hook, env and backup docs |
| 2 | [message-actions](message-actions/spec.md) | direct-messaging | Reply, edit, delete, forward, pin, copy, link display |
| 2 | [reactions](reactions/spec.md) | direct-messaging | Emoji reactions |
| 2 | [media](media/spec.md) | direct-messaging | Images, files, voice notes, shared media |
| 2 | [groups](groups/spec.md) | direct-messaging | Groups, roles, invites, member admin |
| 2 | [search](search/spec.md) | direct-messaging | Global and in-conversation search |
| 2 | [conversation-organization](conversation-organization/spec.md) | direct-messaging | Folders, pin, mute, archive |
| 2 | [message-requests](message-requests/spec.md) | direct-messaging | Request inbox when messaging is restricted |
| 3 | [browser-journeys](browser-journeys/spec.md) | identity, safety, locale-appearance, discovery-contacts, direct-messaging, typing-presence, message-actions, reactions, media, groups, message-requests | Browser journeys only |

Follow-ups that are intentionally not specs yet: web push, email export archive, portfolio case-study page, voice and video calls, end-to-end encryption.
