import type { ComponentProps } from "react";
import { Platform } from "react-native";
import { useNemuTheme, MobileSheetScaffold } from "@/design-system";

import { SheetProgressObserver } from "../../../../modules/nemu-window-layout";

type SheetProps = ComponentProps<typeof MobileSheetScaffold>;

export type JapaneseLearningSurfaceFrameProps = SheetProps & {
  onPresentationProgress?: (progress: number) => void;
};

/**
 * Content style for surfaces that lay out their own web padding (sentence
 * view, chat): no frame padding (`paddingHorizontal` must be zeroed
 * explicitly — it wins over `padding`), and on an iOS sheet the content
 * starts where web's drawer content does, ~12pt below the grabber (the
 * native sheet already reserves ~10pt under its grabber). `bleed` widens
 * the content past the hosted edges (see `useJapaneseLearningDrawerFrame`).
 */
export function japaneseLearningEdgeToEdgeContentStyle(bleed = 0) {
  const style =
    Platform.OS !== "ios" ? EDGE_TO_EDGE_CONTENT : EDGE_TO_EDGE_IOS_SHEET_CONTENT;
  return bleed > 0 ? { ...style, marginHorizontal: -bleed } : style;
}

const EDGE_TO_EDGE_CONTENT = { padding: 0, paddingHorizontal: 0, gap: 0 } as const;
const EDGE_TO_EDGE_IOS_SHEET_CONTENT = { ...EDGE_TO_EDGE_CONTENT, paddingTop: 2 } as const;

/**
 * One frame for every Japanese Learning surface: the native sheet, in every
 * pose and on every display (the system places sheets clear of the fold).
 */
export function JapaneseLearningSurfaceFrame({ onPresentationProgress, children, ...sheet }: JapaneseLearningSurfaceFrameProps) {
  const { tokens } = useNemuTheme();
  return <MobileSheetScaffold backgroundColor={tokens.background} {...sheet}>
    {onPresentationProgress ? <SheetProgressObserver visible={sheet.visible} onProgress={onPresentationProgress} /> : null}
    {children}
  </MobileSheetScaffold>;
}
