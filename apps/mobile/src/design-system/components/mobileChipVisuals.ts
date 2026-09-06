import type { NemuButtonDepthVariant } from "@/design/nemuButtonDepth";

/**
 * Pure geometry/semantics for `MobileChip`, kept out of the component so the
 * variant rules are testable without a renderer.
 *
 * - `toggle` — leading icon/glyph + label + optional badge, optionally with a
 *   trailing glyph (`close` for a removable filter chip).
 * - `menu` — an already-composed `label: value` string plus a chevron.
 * - `icon` — a bare glyph in a square well (the filter funnel).
 * - `static` — a read-only tag or status badge: same pill, nothing to press.
 */
export type MobileChipVariant = "toggle" | "menu" | "icon" | "static";

/**
 * `md` is the 30pt chip the design mock specifies and the default everywhere.
 * `sm` exists only for the micro tags that ride inside a single text line (a
 * source version, an "unsupported" marker, a cover-card genre) where a 30pt
 * pill would out-measure the line it annotates.
 */
export type MobileChipSize = "md" | "sm";

export type MobileChipAccessibilityRole =
  | "button"
  | "checkbox"
  | "tab"
  | "radio";

export type MobileChipAccessibilityState = {
  checked?: boolean;
  selected?: boolean;
  disabled?: boolean;
};

const GLYPH_SIZE: Record<MobileChipSize, number> = { md: 16, sm: 13 };
const TRAILING_GLYPH_SIZE: Record<MobileChipSize, number> = { md: 14, sm: 12 };

/** Leading glyph (and remote icon square) size for a chip size. */
export function getMobileChipGlyphSize(size: MobileChipSize): number {
  return GLYPH_SIZE[size];
}

/** Trailing chevron/close glyph size for a chip size. */
export function getMobileChipTrailingGlyphSize(size: MobileChipSize): number {
  return TRAILING_GLYPH_SIZE[size];
}

/** Only `static` chips render as a plain view instead of a pressable. */
export function isMobileChipPressable(variant: MobileChipVariant): boolean {
  return variant !== "static";
}

/** Selected chips sit on the primary surface; the rest are recessed wells. */
export function getMobileChipDepthVariant(
  selected: boolean,
): NemuButtonDepthVariant {
  return selected ? "chip-selected" : "chip";
}

/** `menu` chips carry a chevron unless the caller names another glyph. */
export function resolveMobileChipTrailingIcon<T extends string>({
  variant,
  trailingIcon,
}: {
  variant: MobileChipVariant;
  trailingIcon?: T;
}): T | "chevron-down" | undefined {
  if (trailingIcon) return trailingIcon;
  return variant === "menu" ? "chevron-down" : undefined;
}

/**
 * A caller-supplied state always wins. Otherwise a checkbox/radio chip reports
 * `checked` (a tri-state filter is a checkbox) and everything else reports
 * `selected`, so VoiceOver announces the same thing the pill paints.
 */
export function resolveMobileChipAccessibilityState({
  accessibilityRole,
  accessibilityState,
  disabled,
  selected,
}: {
  accessibilityRole: MobileChipAccessibilityRole;
  accessibilityState?: MobileChipAccessibilityState;
  disabled: boolean;
  selected: boolean;
}): MobileChipAccessibilityState {
  if (accessibilityState) return accessibilityState;
  return accessibilityRole === "checkbox" || accessibilityRole === "radio"
    ? { checked: selected, disabled }
    : { selected, disabled };
}
