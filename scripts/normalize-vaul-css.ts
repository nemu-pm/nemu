const VAUL_SELECTOR_FIXES = [
  ["[data-vaul-handle-hitarea]: {", "[data-vaul-handle-hitarea] {"],
  ["[data-vaul-handle-hitarea]:{", "[data-vaul-handle-hitarea]{"],
] as const;

/** Normalize the malformed pointer-media selector shipped by Vaul 1.1.2. */
export function normalizeVaulCss(source: string): string {
  let normalized = source;
  for (const [invalid, valid] of VAUL_SELECTOR_FIXES) {
    normalized = normalized.replaceAll(invalid, valid);
  }
  return normalized;
}
