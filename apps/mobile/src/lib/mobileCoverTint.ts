/**
 * Cover-derived tints for the design-explore surfaces (continue-reading cards,
 * the Books-style detail hero, the "now reading" accessory). Pure colour math:
 * the Skia sampling glue lives in `useMobileCoverTint.ts`.
 *
 * The picker favours the cover's most prominent *chromatic* hue (media apps such
 * as Apple Books tint with the artwork's character colour, not its muddy average),
 * and the palette then clamps lightness/saturation per scheme so a neon cover
 * never shouts and text always clears WCAG AA on the card.
 */

export type MobileCoverRgb = { r: number; g: number; b: number };

export type MobileCoverTintPalette = {
  /**
   * Card fill: the cover's colour at strength (a red cover makes a red card),
   * in both schemes. Its text is white or near-black, whichever the colour
   * calls for, like the artwork's own type.
   */
  card: string;
  /** Primary text on `card`. */
  cardInk: string;
  /** Secondary text on `card` (eyebrows, meta lines). */
  cardInkSecondary: string;
  /** Hairline rim along the card's edge (a lit edge on dark cards, a crisp one on light). */
  cardRim: string;
  /** Coloured glow under the card: the card's own colour, spilling onto the page. */
  cardGlow: string;
  /** Tint for glass in the card's colour (a folder's front pocket). */
  cardGlass: string;
  /** Prominent capsule on `card`: always white, like a lit button on the artwork. */
  action: string;
  /** Text and glyphs on `action`. */
  actionInk: string;
  /** Round secondary button fill on `card`. */
  actionSoft: string;
  /**
   * The page's primary action (Continue / Start reading on the detail hero):
   * the card colour, but never so pale or grey that it reads as disabled
   * beside the clear glass buttons. A muted cover's hue is lifted to a chroma
   * floor; a black-and-white cover gets a high-contrast pill (near black in
   * light mode, near white in dark), the way the system draws a primary
   * button with no accent.
   */
  primary: string;
  /** Text and glyphs on `primary`, at AA. */
  primaryInk: string;
  /**
   * Full-bleed page colour (detail hero, the library wash), and the same
   * colour fully transparent (fade ends). A clear tint of the cover in light
   * mode, a deep shade of it in dark mode; its text keeps the scheme's own
   * ink, so the system bar's title and items stay readable over it.
   */
  page: string;
  pageClear: string;
  /** Primary text on `page`. */
  ink: string;
  /** Secondary text on `page`. */
  inkSecondary: string;
  /** Hairline rules on `page`. */
  rule: string;
  /**
   * Page wash behind the library cards: solid down to the cards, then fading
   * out over their height through the soft and faint stops.
   */
  wash: string;
  washSoft: string;
  washFaint: string;
  washClear: string;
  /** Tinted drop shadow for covers sitting on the page. */
  shadow: string;
  /** Soft coloured glow around a hero cover on the page. */
  glow: string;
};

type Hsl = { h: number; s: number; l: number };

const HUE_BUCKETS = 12;
/** Below this share of chromatic weight a cover counts as monochrome. */
const MIN_CHROMATIC_SHARE = 0.06;
/** nemu indigo (`#5879f4`) — the fallback hue while no cover colour exists. */
const NEMU_FALLBACK_RGB: MobileCoverRgb = { r: 88, g: 121, b: 244 };
const WHITE: MobileCoverRgb = { r: 255, g: 255, b: 255 };

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function mobileRgbToHsl({ r, g, b }: MobileCoverRgb): Hsl {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  const delta = max - min;
  if (delta === 0) return { h: 0, s: 0, l };
  const s = delta / (1 - Math.abs(2 * l - 1));
  let h: number;
  if (max === rn) h = ((gn - bn) / delta) % 6;
  else if (max === gn) h = (bn - rn) / delta + 2;
  else h = (rn - gn) / delta + 4;
  h *= 60;
  if (h < 0) h += 360;
  return { h, s: clamp01(s), l };
}

export function mobileHslToRgb({ h, s, l }: Hsl): MobileCoverRgb {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let rgb: [number, number, number];
  if (hp < 1) rgb = [c, x, 0];
  else if (hp < 2) rgb = [x, c, 0];
  else if (hp < 3) rgb = [0, c, x];
  else if (hp < 4) rgb = [0, x, c];
  else if (hp < 5) rgb = [x, 0, c];
  else rgb = [c, 0, x];
  const m = l - c / 2;
  return {
    r: Math.round((rgb[0] + m) * 255),
    g: Math.round((rgb[1] + m) * 255),
    b: Math.round((rgb[2] + m) * 255),
  };
}

export function mobileRgbString({ r, g, b }: MobileCoverRgb, alpha = 1): string {
  return alpha >= 1
    ? `rgb(${r}, ${g}, ${b})`
    : `rgba(${r}, ${g}, ${b}, ${Math.round(alpha * 1000) / 1000})`;
}

function channelLuminance(value: number): number {
  const v = value / 255;
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

export function mobileRelativeLuminance({ r, g, b }: MobileCoverRgb): number {
  return (
    0.2126 * channelLuminance(r) +
    0.7152 * channelLuminance(g) +
    0.0722 * channelLuminance(b)
  );
}

export function mobileContrastRatio(a: MobileCoverRgb, b: MobileCoverRgb): number {
  const la = mobileRelativeLuminance(a);
  const lb = mobileRelativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/**
 * Picks a representative colour from RGBA pixels (a tiny downsampled cover).
 * Chromatic pixels vote into twelve hue buckets, each pixel weighted mostly
 * by being there (area) and partly by saturation and closeness to mid
 * lightness; the heaviest bucket's weighted mean wins. A
 * cover with almost no colour (ink drawings, black-and-white raws) returns
 * its plain average so the tint stays a quiet grey instead of a random hue.
 */
export function pickMobileCoverTint(
  pixels: ArrayLike<number>,
): MobileCoverRgb | null {
  const buckets = Array.from({ length: HUE_BUCKETS }, () => ({
    weight: 0,
    r: 0,
    g: 0,
    b: 0,
  }));
  let opaque = 0;
  let sumR = 0;
  let sumG = 0;
  let sumB = 0;
  for (let index = 0; index + 3 < pixels.length; index += 4) {
    const alpha = pixels[index + 3]!;
    if (alpha < 128) continue;
    const rgb = {
      r: pixels[index]!,
      g: pixels[index + 1]!,
      b: pixels[index + 2]!,
    };
    opaque += 1;
    sumR += rgb.r;
    sumG += rgb.g;
    sumB += rgb.b;
    const { h, s, l } = mobileRgbToHsl(rgb);
    if (s < 0.18 || l < 0.07 || l > 0.9) continue;
    // Area first, vividness second: a large dark teal field outvotes a small
    // vivid red title band (which used to win on saturation alone).
    const weight = (0.3 + 0.7 * s) * Math.max(0.15, 1 - Math.abs(l - 0.45) * 1.6);
    if (weight <= 0) continue;
    const bucket = buckets[Math.floor(h / (360 / HUE_BUCKETS)) % HUE_BUCKETS]!;
    bucket.weight += weight;
    bucket.r += rgb.r * weight;
    bucket.g += rgb.g * weight;
    bucket.b += rgb.b * weight;
  }
  if (opaque === 0) return null;
  let best = buckets[0]!;
  for (const bucket of buckets) if (bucket.weight > best.weight) best = bucket;
  if (best.weight / opaque < MIN_CHROMATIC_SHARE) {
    return {
      r: Math.round(sumR / opaque),
      g: Math.round(sumG / opaque),
      b: Math.round(sumB / opaque),
    };
  }
  return {
    r: Math.round(best.r / best.weight),
    g: Math.round(best.g / best.weight),
    b: Math.round(best.b / best.weight),
  };
}

/**
 * Saturation ceiling of the dark page by hue. Yellows and yellow-greens turn
 * olive when darkened, so they keep less colour than the other hues.
 */
function darkSaturationCap(hue: number): number {
  const distance = Math.abs(hue - 62);
  return distance >= 40 ? 0.72 : 0.72 - 0.3 * (1 - distance / 40);
}

/**
 * Below this chroma (HSL saturation × how far lightness is from the ends) a
 * cover counts as monochrome: its card stays grey, at the cover's own
 * lightness. Chroma, not saturation: a paper-white cover with a faint cast has
 * a high saturation but no colour to speak of.
 */
const MONOCHROME_CHROMA = 0.07;

function isMonochrome({ s, l }: Hsl): boolean {
  return s * (1 - Math.abs(2 * l - 1)) < MONOCHROME_CHROMA;
}
/** Card lightness band for coloured covers, per scheme: the cover's colour at strength, never a pastel. */
const CARD_LIGHTNESS = { light: [0.42, 0.68], dark: [0.38, 0.62] } as const;
const CARD_SATURATION_MAX = 0.92;
/**
 * The sampled tint is the mean of the cover's leading hue, which is greyer
 * than the colour the eye picks out; the card takes this share of the way
 * from it to full saturation (the page a smaller one). A muted cover (a dusky
 * maroon, a sepia) is lifted less, so its card stays the colour it is.
 */
const CARD_SATURATION_LIFT = 0.4;
const PAGE_SATURATION_LIFT = 0.25;

/** How much of the lift a tint takes: none at the monochrome line, all of it from a clearly coloured tint. */
function liftShare({ s, l }: Hsl): number {
  const chroma = s * (1 - Math.abs(2 * l - 1));
  return Math.min(1, Math.max(0, (chroma - MONOCHROME_CHROMA) / 0.15));
}
/** Monochrome covers keep their lightness within this band (a white cover makes a white card). */
const MONOCHROME_LIGHTNESS = [0.14, 0.9] as const;
/**
 * The card's primary ink clears this, comfortably above AA, so its secondary
 * ink (the same ink, a little translucent) still clears 4.5:1.
 */
const CARD_INK_CONTRAST = 5.6;

const SECONDARY_INK_CONTRAST = 4.5;
const SECONDARY_INK_MAX_ALPHA = 0.92;

/**
 * Opacity of the secondary ink: `base`, raised in small steps until the ink
 * clears WCAG AA on every surface it is used on. Bright hues (yellows, greens)
 * need more than reds and blues, so the quiet look is kept wherever it reads.
 */
function secondaryInkAlpha(ink: MobileCoverRgb, surfaces: MobileCoverRgb[], base: number): number {
  for (let alpha = base; alpha < SECONDARY_INK_MAX_ALPHA; alpha += 0.02) {
    const readable = surfaces.every((surface) => {
      const blended = {
        r: ink.r * alpha + surface.r * (1 - alpha),
        g: ink.g * alpha + surface.g * (1 - alpha),
        b: ink.b * alpha + surface.b * (1 - alpha),
      };
      return mobileContrastRatio(blended, surface) >= SECONDARY_INK_CONTRAST;
    });
    if (readable) return Math.round(alpha * 100) / 100;
  }
  return SECONDARY_INK_MAX_ALPHA;
}

function washStops(page: MobileCoverRgb) {
  return {
    wash: mobileRgbString(page),
    washSoft: mobileRgbString(page, 0.55),
    washFaint: mobileRgbString(page, 0.16),
    washClear: mobileRgbString(page, 0),
  };
}

type CardColour = { card: MobileCoverRgb; ink: MobileCoverRgb; light: boolean };

/**
 * The card for one cover: its colour at strength and the ink that reads on it.
 * White ink is preferred; the card darkens a little where white needs it, and
 * a light colour (yellow, lime, sky, a white cover) takes near-black ink
 * instead of being muddied, whichever moves the colour least.
 */
function cardColour(source: Hsl, scheme: "light" | "dark", fallback: boolean): CardColour {
  const h = source.h;
  const monochrome = !fallback && isMonochrome(source);
  const s = fallback
    ? 0.22
    : monochrome
      ? source.s
      : Math.min(CARD_SATURATION_MAX, source.s + (1 - source.s) * CARD_SATURATION_LIFT * liftShare(source));
  const [low, high] = monochrome ? MONOCHROME_LIGHTNESS : CARD_LIGHTNESS[scheme];
  // No cover colour yet: a quiet indigo that matches the cover placeholder
  // (periwinkle in light mode, deep in dark).
  const start = fallback
    ? scheme === "dark"
      ? 0.4
      : 0.62
    : Math.min(high, Math.max(low, source.l));
  const darkInk = mobileHslToRgb({ h, s: Math.min(s, 0.4), l: 0.12 });
  const at = (l: number) => mobileHslToRgb({ h, s, l });
  // Lightest card at or below `start` that carries white text, and the
  // darkest at or above it that carries the dark ink.
  let whiteL: number | null = null;
  for (let l = start; l >= 0.08; l -= 0.01) {
    if (mobileContrastRatio(WHITE, at(l)) >= CARD_INK_CONTRAST) {
      whiteL = l;
      break;
    }
  }
  let darkL: number | null = null;
  for (let l = start; l <= 0.97; l += 0.01) {
    if (mobileContrastRatio(darkInk, at(l)) >= CARD_INK_CONTRAST) {
      darkL = l;
      break;
    }
  }
  // A small bias toward white: deep, saturated cards read as the artwork's colour.
  const useWhite =
    whiteL !== null && (darkL === null || start - whiteL <= darkL - start + 0.05);
  const l = useWhite ? whiteL! : (darkL ?? start);
  return { card: at(l), ink: useWhite ? WHITE : darkInk, light: !useWhite };
}

/** A primary button below this chroma (saturation × distance from the ends) reads as disabled. */
export const MOBILE_PRIMARY_MIN_CHROMA = 0.3;
/**
 * The primary button's fill stands off the page behind it at least this much,
 * per scheme. Light pages are pale and the button saturated, so WCAG 1.4.11's
 * 3:1 for a control already reads; a dark page is a deep shade of the
 * button's own hue, where 3:1 still let a salmon button melt into a brown
 * page, so it asks for 4.5:1.
 */
export const MOBILE_PRIMARY_PAGE_CONTRAST = { light: 3, dark: 4.5 } as const;

/**
 * Moves the primary's lightness away from the page (darker on a light page,
 * lighter on a dark one) until the fill clears `MOBILE_PRIMARY_PAGE_CONTRAST`
 * for the scheme against it, keeping hue and saturation; its ink is re-picked at AA.
 */
function separateFromPage(
  primary: { fill: MobileCoverRgb; ink: MobileCoverRgb },
  page: MobileCoverRgb,
  scheme: "light" | "dark",
): { fill: MobileCoverRgb; ink: MobileCoverRgb } {
  const target = MOBILE_PRIMARY_PAGE_CONTRAST[scheme];
  if (mobileContrastRatio(primary.fill, page) >= target) return primary;
  const hsl = mobileRgbToHsl(primary.fill);
  const darkInk = mobileHslToRgb({ h: hsl.h, s: Math.min(hsl.s, 0.4), l: 0.12 });
  const step = scheme === "dark" ? 0.01 : -0.01;
  for (let l = hsl.l + step; l > 0.04 && l < 0.97; l += step) {
    const fill = mobileHslToRgb({ h: hsl.h, s: hsl.s, l });
    if (mobileContrastRatio(fill, page) < target) continue;
    if (mobileContrastRatio(WHITE, fill) >= PRIMARY_INK_CONTRAST) return { fill, ink: WHITE };
    if (mobileContrastRatio(darkInk, fill) >= PRIMARY_INK_CONTRAST) return { fill, ink: darkInk };
  }
  return primary;
}
const PRIMARY_INK_CONTRAST = 4.5;

function chromaOf({ s, l }: Hsl): number {
  return s * (1 - Math.abs(2 * l - 1));
}

/**
 * The primary action's fill and ink: the card when it has colour enough,
 * else the same hue at the chroma floor and the lightness nearest the card's
 * that carries white (preferred) or the card's dark ink at AA.
 */
function primaryColour(
  card: MobileCoverRgb,
  cardInk: MobileCoverRgb,
  scheme: "light" | "dark",
  monochrome: boolean,
): { fill: MobileCoverRgb; ink: MobileCoverRgb } {
  const hsl = mobileRgbToHsl(card);
  if (!monochrome && chromaOf(hsl) >= MOBILE_PRIMARY_MIN_CHROMA) return { fill: card, ink: cardInk };
  if (monochrome) {
    return scheme === "dark"
      ? { fill: { r: 242, g: 242, b: 245 }, ink: { r: 18, g: 18, b: 20 } }
      : { fill: { r: 28, g: 28, b: 31 }, ink: WHITE };
  }
  const darkInk = mobileHslToRgb({ h: hsl.h, s: 0.4, l: 0.12 });
  let best: { fill: MobileCoverRgb; ink: MobileCoverRgb; distance: number } | null = null;
  for (let l = 0.3; l <= 0.7001; l += 0.01) {
    const s = Math.min(1, MOBILE_PRIMARY_MIN_CHROMA / (1 - Math.abs(2 * l - 1)));
    const fill = mobileHslToRgb({ h: hsl.h, s, l });
    // White reads as the more confident button: it wins a near tie.
    const whiteOk = mobileContrastRatio(WHITE, fill) >= PRIMARY_INK_CONTRAST;
    const darkOk = mobileContrastRatio(darkInk, fill) >= PRIMARY_INK_CONTRAST;
    if (!whiteOk && !darkOk) continue;
    const distance = Math.abs(l - hsl.l) + (whiteOk ? 0 : 0.06);
    if (!best || distance < best.distance) best = { fill, ink: whiteOk ? WHITE : darkInk, distance };
  }
  return best ? { fill: best.fill, ink: best.ink } : { fill: card, ink: cardInk };
}

/**
 * Turns a sampled cover colour into the surface palette for one scheme.
 * `null` (no cover yet / sampling failed) yields a quiet nemu-indigo palette,
 * so a card never flashes from a placeholder colour to a loud one.
 */
export function buildMobileCoverTintPalette(
  rgb: MobileCoverRgb | null,
  scheme: "light" | "dark",
): MobileCoverTintPalette {
  const source = mobileRgbToHsl(rgb ?? NEMU_FALLBACK_RGB);
  const h = source.h;
  const monochrome = rgb !== null && isMonochrome(source);
  const { card, ink: cardInk, light: lightCard } = cardColour(source, scheme, rgb === null);
  const cardInkSecondary = mobileRgbString(cardInk, secondaryInkAlpha(cardInk, [card], 0.7));
  const cardHsl = mobileRgbToHsl(card);
  const actionInk = mobileHslToRgb({ h, s: Math.min(cardHsl.s, 0.45), l: 0.14 });
  const primary = primaryColour(card, cardInk, scheme, monochrome);
  const shared = {
    card: mobileRgbString(card),
    cardInk: mobileRgbString(cardInk),
    cardInkSecondary,
    action: "rgb(255, 255, 255)",
    actionInk: mobileRgbString(actionInk),
    actionSoft: mobileRgbString(cardInk, lightCard ? 0.1 : 0.18),
    cardGlass: mobileRgbString(card, 0.42),
  };
  // Page saturation: as much of the cover's colour as the scheme carries.
  const pageSaturation =
    rgb === null ? 0.22 : monochrome ? source.s : Math.min(source.s + (1 - source.s) * PAGE_SATURATION_LIFT * liftShare(source), 0.8);
  if (scheme === "dark") {
    const s = monochrome || rgb === null ? pageSaturation : Math.min(pageSaturation, darkSaturationCap(h));
    // Yellows read as olive when deep: they keep a little more light.
    const yellow = Math.abs(h - 62) < 30 && !monochrome && rgb !== null;
    const page = mobileHslToRgb({ h, s, l: yellow ? 0.25 : 0.22 });
    const darkPrimary = separateFromPage(primary, page, scheme);
    return {
      ...shared,
      primary: mobileRgbString(darkPrimary.fill),
      primaryInk: mobileRgbString(darkPrimary.ink),
      cardRim: lightCard ? "rgba(255, 255, 255, 0.35)" : "rgba(255, 255, 255, 0.22)",
      cardGlow: mobileRgbString(card, 0.55),
      page: mobileRgbString(page),
      pageClear: mobileRgbString(page, 0),
      ink: "rgb(255, 255, 255)",
      inkSecondary: mobileRgbString(WHITE, secondaryInkAlpha(WHITE, [page], 0.68)),
      rule: mobileRgbString(WHITE, 0.2),
      ...washStops(page),
      shadow: "rgba(0, 0, 0, 0.55)",
      glow: mobileRgbString(mobileHslToRgb({ h, s: cardHsl.s, l: Math.max(0.35, cardHsl.l) }), 0.5),
    };
  }
  const page = mobileHslToRgb({ h, s: pageSaturation, l: monochrome ? 0.88 : 0.83 });
  const ink = mobileHslToRgb({ h, s: Math.min(pageSaturation, 0.4), l: 0.13 });
  const lightPrimary = separateFromPage(primary, page, scheme);
  return {
    ...shared,
    primary: mobileRgbString(lightPrimary.fill),
    primaryInk: mobileRgbString(lightPrimary.ink),
    cardRim: lightCard ? "rgba(255, 255, 255, 0.55)" : "rgba(255, 255, 255, 0.28)",
    cardGlow: mobileRgbString(mobileHslToRgb({ h, s: cardHsl.s, l: Math.min(cardHsl.l, 0.42) }), 0.4),
    page: mobileRgbString(page),
    pageClear: mobileRgbString(page, 0),
    ink: mobileRgbString(ink),
    inkSecondary: mobileRgbString(ink, secondaryInkAlpha(ink, [page], 0.66)),
    rule: mobileRgbString(ink, 0.18),
    ...washStops(page),
    shadow: mobileRgbString(mobileHslToRgb({ h, s: Math.min(pageSaturation, 0.5), l: 0.25 }), 0.28),
    glow: mobileRgbString(mobileHslToRgb({ h, s: cardHsl.s, l: Math.min(cardHsl.l, 0.45) }), 0.38),
  };
}
