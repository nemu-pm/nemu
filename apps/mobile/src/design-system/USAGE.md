# Nemu Mobile Design System

Use `@/design-system` for new mobile UI. The package is the public entry point for shared tokens, primitives, composite components, native navigation helpers, and selected reusable business-level mobile components.

## Inventory

- Foundations: `nemuTokens`, `radius`, `spacing`, `nemuText`, `nemuFontWeight`, `createNemuShadowStyle`, and native navigation helpers.
- Button depth colors follow web `src/index.css` `.btn-nemu-*` classes via `nemuWebButtonPalette` / `nemuButtonDepth`.
- Primitives in `src/design-system/components`: `NemuPressable`, `GlassSurface`, `NemuButton`, `NemuToolbarAction`, `NemuInlineEmptyState`, `NemuListRow`, `NemuNativeProgressView`, and `NemuNativeSwitch`.
- Composites in `src/design-system/components`: `PageScaffold`, `PageHeader`, `MobileNativeSheetScaffold`, `MobileSheetScaffold` compatibility wrapper, and `MobileSheetBackdrop`.
- Feature components: `MangaCard`, `SourceCard`, manga/source sheets, empty states, skeletons, and reader controls remain in `src/components` unless they become general primitives/patterns. Components exported by `@/design-system` must still be imported through the public entry point.

## Rules

- Import shared UI from `@/design-system` in screens and shared components. Do not import `@/design/*`, `@/design-system/components/*`, or design-system-owned `@/components/*` paths outside `src/design-system`.
- Use `Stack.Toolbar` on iOS and Android through `renderNemuNativeToolbarButtons`; use `PageHeader` and `NemuToolbarAction` for web fallback.
- Android-native controls should use Expo UI Material/Jetpack Compose primitives when available. Prefer `@expo/ui/jetpack-compose` or `@expo/ui/community/*` drop-ins for Android switches, menus, progress, segmented controls, sliders, sheets, and similar controls instead of hand-rolled React Native fallbacks.
- Use `NemuPressable` with `buttonDepth` for custom icon/text buttons that should share Nemu's glass halo, inset highlight, and pressed depth instead of hand-rolled `boxShadow` strings. Depth variants mirror web `Button` variants (`default` → `primary`, `outline`, `secondary`, `ghost`, `destructive`).
- Toolbar actions use Nemu purple by default through `NemuToolbarAction` depth styling. Do not hand-code white toolbar buttons with custom shadows in screens.
- Use `PageScaffold` pull-to-refresh instead of adding a refresh toolbar button unless the action is not equivalent to drag-to-refresh.
- Use `nemuText` and `nemuFontWeight`; never hard-code raw `fontWeight` values in screens or components.
- Use `GlassSurface`, `NemuListRow`, `NemuButton`, `MangaCard`, and `SourceCard` before adding local card, list row, button, manga, or source layouts.
- Use `NemuInlineEmptyState` for inline empty/loading/error placeholders inside sections. Avoid raw square `GlassSurface` placeholders in screens.
- Sheets should use `MobileNativeSheetScaffold` for native-feeling bottom sheets. `MobileSheetScaffold` exists only as a compatibility wrapper over the native scaffold, and sheets should not add redundant Done buttons when drag/tap dismissal is the primary interaction.

## Sheet Escape Routes

**A sheet must always have at least one escape route.** A user who opens a sheet must always be able to leave it, including — especially — while an operation is in flight.

- Drag-to-dismiss is the default escape route. `MobileNativeSheetScaffold` renders a dismiss control automatically whenever `enablePanDownToClose` is `false`, and a caller's `showDismissButton={false}` cannot override that. Do not try to build a sheet with neither.
- `MobileSheetScaffold`'s `backdropDisabled` turns off pan-down-to-close, so it implies the mandatory dismiss control. Pass `dismissLabel` so that control reads as the right verb (usually Cancel).
- Never gate the close handler on a busy flag (`if (loading) return;`). The sheet reports a close only *after* it has closed, so swallowing it strands the caller's `visible` flag on a sheet that is no longer on screen.
- Keep Cancel enabled during in-flight work. Cancel should abort the operation where an abort path exists (pass an `AbortSignal` down); where none exists it should still dismiss and let the operation settle in the background, surfacing its result via a toast.
- Android hardware back dismisses sheets — `MobileNativeSheetScaffold` installs the `BackHandler` for you. Screens must not register a competing handler that swallows back while a sheet is open.

## Migration Notes

The current mobile codebase still has many local `StyleSheet.create` blocks because complex reader/source/search screens predate the design-system entry point. New work should migrate the touched surface into `@/design-system` first, then implement feature code against the shared component.
