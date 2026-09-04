// Web and non-Metro tooling use the same animated layers as iOS. Metro picks
// the `.android.ts` or `.ios.ts` sibling before this fallback, so native
// bundles never retain the other platform's unused glow treatment.
export { getNemuPortraitGlowAssets } from "./nemuPortraitGlowAssets.ios";
export type { NemuPortraitGlowAssets } from "./nemuPortraitGlowAssets.shared";
