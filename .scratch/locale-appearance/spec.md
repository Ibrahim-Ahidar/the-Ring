# Pulse: locale, appearance, and command palette

**Status:** ready-for-agent

**Wave:** 1

**Blocked by:** platform-foundation

**Owns:** `/app/settings/language`, `/app/settings/appearance`, the overlay contribution for the command palette, and the shortcut help.

**Must not edit:** shell layout structure, design token definitions, another feature's catalogs, the foundation migration, or the package manifest. Persist `locale` and `theme` through this spec's service.

## Problem Statement

The shell can render Arabic, English, and French, but a member has no switcher, no theme control, and no keyboard way to move around Pulse. Each later screen will ship its own translations; nothing yet lets a person change locale and see direction, dates, and theme follow.

## Solution

Language and appearance settings save locale and theme on the profile. The shell, which already reads those columns, updates direction and palette. A command palette and a small set of global shortcuts let a member jump to the main destinations and see shortcut help. This spec does not translate other features; it proves the shell responds.

## User Stories

1. As a member, I want my current language shown, so that I know which locale is active.
2. As a member, I want to switch to Arabic, English, or French, so that product chrome follows my choice.
3. As a member, I want Arabic to lay the shell out right to left immediately, so that I do not reload to get RTL.
4. As a member, I want English and French to lay the shell out left to right, so that LTR locales are not stuck in RTL.
5. As a member, I want the preference stored on my profile, so that the next session keeps it.
6. As a member, I want dates and relative times in the shell to use the active locale, so that a timestamp is not hardcoded in English.
7. As a member, I want a fast language switcher in the shell as well as the settings page, so that I can change language without hunting.
8. As a member, I want to choose light, dark, or system theme, so that the accent and surfaces follow the token set.
9. As a member, I want system theme to track the operating system preference, so that I do not pick a palette by hand.
10. As a member, I want theme stored on my profile, so that it persists across sessions.
11. As a member, I want reduced motion left intact when I change theme, so that appearance does not re-enable animation.
12. As a member, I want a command palette that opens from the keyboard, so that I can jump to chats, search, contacts, notifications, and settings.
13. As a member, I want the palette to list commands contributed by whichever features are installed, so that this spec does not hardcode another feature's routes.
14. As a member, I want to filter palette commands by typing, so that a long list stays usable.
15. As a member, I want shortcut help listing the global shortcuts, so that I can learn them.
16. As a member, I want Escape to close the palette and Return to run the highlighted command, so that the palette is keyboard-complete.
17. As a member, I want focus restored to the previous control when the palette closes, so that I do not lose my place.
18. As a member, I want palette and settings copy in Arabic, English, and French, so that these screens are localized.
19. As a member, I want an unknown locale value rejected, so that a bad write cannot blank the UI.
20. As a member on a small screen, I want the palette and settings usable at the shell's single-pane width, so that the controls are not desktop-only.

## Implementation Decisions

- Service operations: `updateLocale(locale)`, `updateTheme(theme)`. Locale must be `ar`, `en`, or `fr`. Theme must be `system`, `light`, or `dark`. Anything else returns `appearance.invalid_preference`. The service writes only those columns on the caller's profile.
- The shell already applies `dir` and tokens from the profile. This spec does not reimplement that runtime. After a successful update, the client reducer stores the new preference and the shell reads it from the refreshed session profile.
- Command contributions use the foundation `overlay` and command shape: a stable id, a label key inside the contributing feature's catalog, and an href. This spec ships the palette UI and the commands for destinations that exist on the route map: chats, search, contacts, notifications, settings. Features that are not merged yet simply contribute nothing; the palette omits them rather than linking to a broken action.
- Global shortcuts: palette toggle, go to chats, go to search, go to settings, show shortcut help. They do not fire while the member is typing in a text field, except the palette toggle. Document the key combination in shortcut help. Do not bind shortcuts that collide with browser essentials (reload, close tab, find in some browsers). Use a modifier combination for navigation.
- Client state is an appearance context and reducer: palette open, query, highlighted index, help open. Presentational list rows are memoized.
- Catalogs in the appearance module cover settings labels, palette chrome, and shortcut names in Arabic, English, and French. Do not edit shell catalogs or other features' catalogs to "finish" translation.
- Directional icons in the palette and back affordances mirror only if they point backward relative to the locale. The Pulse name and any logo do not mirror.
- Focus trap inside the palette dialog. Restore focus on close.

## Testing Decisions

Service tests: `updateLocale` and `updateTheme` persist legal values and reject others; a second user cannot change the first user's locale.

Browser tests are required for this spec because the behavior is presentation: switching to Arabic sets `dir="rtl"` on the shell; switching to French sets `dir="ltr"` and shows the French shell string already shipped by the foundation; choosing dark applies the dark token set to the shell background; the palette opens from the keyboard, filters, activates a command, and restores focus; shortcut help opens and closes. Use the foundation Playwright harness. Do not screenshot-diff as the acceptance criterion; assert direction, accessible names, and navigation.

No prior appearance tests. UI assertions stay on observable DOM (direction, accessible name, navigation URL), not on React state.

## Out of Scope

- Translating feature catalogs. Each feature owns its three locales.
- Per-message translation.
- Custom accent color pickers and font size settings.
- A new design system. Tokens stay as the foundation defined them.

## Further Notes

Implement this spec only. If a destination route has no page yet, the palette command still navigates to the foundation frame. Do not build that feature's screen.
