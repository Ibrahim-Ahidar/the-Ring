# Pulse mobile UI kit (`@/ui`)

Import everything from `@/ui`. Never hard-code colors, spacing or radii in screens; read them from `useTheme()`.
Tokens mirror `apps/web/src/shell/styles/tokens.css` (`--color-text-muted` -> `colors.textMuted`; `light-dark()` pairs -> `lightColors` / `darkColors`).
`theme.test.ts` fails if they drift from the web CSS.

## Theme

`ThemeProvider` (mounted in `app/_layout.tsx`, inside `PreferencesProvider`) resolves light/dark from the system scheme and the accent ("indigo" default, "green" classic) from preferences.

```tsx
const { colors, spacing, radii, fontSizes, controlHeights, shadows, motion, isDark } = useTheme();
```

- `colors`: bg, panel, card, modal, elevated, input, hover, selected, pressed, text, textMuted, textDisabled, icon, border, borderStrong, accent, accentStrong, accentSoft, accentContrast, focus, danger, dangerSoft, warning, read, link, online, overlay, chatBg, chatPattern, bubbleIn, bubbleOut, bubbleMeta, quote, system, avatar1..avatar6, avatarText, sender1..sender4.
- `spacing`: s2 s4 s6 s8 s10 s12 s16 s20 s24 s32 (px numbers).
- `radii`: control 8, bubble 8, card 12, pill 999.
- `fontSizes`: xs 11, sm 13, md 14.5, lg 16, xl 19, xxl 22 (`arabicMdFontSize` 15.5).
- `controlHeights`: control 40, controlSm 32, hit 44 (minimum touch target), header 60, row 72, listRow 56.
- `shadows`: bubble, menu, modal (spread into style). `motion`: 120 / 180 / 220 ms.
- `avatarColor(colors, index)` picks avatar1..6.

RTL: use `paddingStart`/`paddingEnd`/`start`/`end`, never left/right. Directional icons take `flipRtl`.

## Primitives

| Primitive | Use for |
|---|---|
| `Screen` | Root of every screen: safe area, themed background. `scroll`, `padded`, `edges`, `background="bg"\|"panel"\|"chatBg"`. |
| `AppHeader` | Top bar (60px): `title`, `subtitle`, `onBack` (RTL-flipped arrow), `leading`, `actions`. Set `safeTop={false}` if Screen already pads the top. |
| `Text` | All text. `variant`: title, heading, body, bodyStrong, caption, label, muted, micro. `tone` picks a color token. |
| `Button` | Text actions. `variant` primary/secondary/ghost/danger, `size` sm/md, `loading`, `disabled`, `icon`, `block`. |
| `IconButton` | Icon-only actions. `label` required. `accent` (send button), `selected`, `size`, `flipRtl`. 44pt hit area. |
| `Icon` | Any lucide icon: `<Icon icon={Search} size tone color flipRtl />`. Never import lucide components directly into JSX. |
| `TextField` | Forms: `label`, `hint`, `error`, `secure`, `multiline`, `trailing`. |
| `SearchField` | Search input with clear button. |
| `Surface` | Card/panel container. `tone` card/elevated/input/flat, `padded`. |
| `ListRow` | Chat list, contacts, settings rows. `leading` (Avatar) or `icon`, `meta`, `trailing`, `chevron`, `selected`, `destructive`. Pass `onPress` to make it interactive. |
| `ToggleRow` | Settings row with a Switch. |
| `SectionHeader` | Label above a group. `muted`, `action`. |
| `Divider` | Hairline; `inset={72}` aligns with ListRow text. |
| `Avatar` | `name`, `seed` (stable id), `src`, `size`, `online`. Initials + color match the web. |
| `UnreadCount` | Count pill (`count`, `muted`); renders nothing for 0. `Badge`/`Dot` for labels and presence dots. |
| `EmptyState` | Nothing-here block: `icon`, `title`, `description`, `action`. |
| `ErrorState` | Failure block with `onRetry`. |
| `Spinner` / `LoadingState` | Inline spinner / centered loading view. |
| `Banner` | `kind` offline/info/error status strip with optional `action`. |
| `Sheet` | Bottom sheet modal: `visible`, `onClose`, `title`. |

All pressables give pressed feedback, have a 44pt minimum hit target, and set accessibilityRole/Label. Pass `accessibilityLabel` whenever visible text is not enough.
