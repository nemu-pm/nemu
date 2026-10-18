import type { NemuButtonDepthVariant } from "@/design/nemuButtonDepth";

/**
 * Pure geometry and semantics for `MobileChip`: toggle, menu, icon and static variants.
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

/**
 * Selected chips sit on the primary surface; the rest are recessed wells. A
 * selected chip marked `included` (on because "All" is on) takes the soft
 * primary tint instead.
 */
export function getMobileChipDepthVariant(
  selected: boolean,
  included = false,
): NemuButtonDepthVariant {
  return selected ? (included ? "chip-included" : "chip-selected") : "chip";
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
