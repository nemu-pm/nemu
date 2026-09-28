/**
 * iPhone Duo / foldable signature features. Pure logic lives in
 * `src/lib/mobileDuo*.ts`; integration guide:
 * `artifacts/mobile-review-20260926/duo-signature-integration.md`.
 */
export { DuoBilingualLayoutToggle, type DuoBilingualLayoutToggleProps } from "./DuoBilingualLayoutToggle";
export { DuoBilingualSecondaryPane, type DuoBilingualSecondaryPaneProps } from "./DuoBilingualSecondaryPane";
export { DuoBilingualSpread, type DuoBilingualSpreadProps } from "./DuoBilingualSpread";
export { DuoBookSpineShade, type DuoBookSpineShadeProps } from "./DuoBookSpineShade";
export { DuoDisplayHandoffToast } from "./DuoDisplayHandoffToast";
export { useDuoDisplayHandoff, type DuoDisplayHandoff } from "./useDuoDisplayHandoff";
export { DuoPageFlipOverlay } from "./DuoPageFlipOverlay";
export { useDuoPageFlip, type DuoPageFlipRequest } from "./useDuoPageFlip";
export { useDuoSecondaryPage, type DuoSecondaryPage } from "./useDuoSecondaryPage";
