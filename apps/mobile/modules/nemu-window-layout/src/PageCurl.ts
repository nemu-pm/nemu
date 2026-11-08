import type { ComponentType, ReactNode, Ref } from "react";
import { requireNativeViewManager, requireOptionalNativeModule } from "expo-modules-core";
import { Platform, type NativeSyntheticEvent, type StyleProp, type ViewStyle } from "react-native";

/**
 * Native curl pager (`NemuPageCurlView.swift`): a `UIPageViewController` with
 * the page curl transition whose pages are the children, each tagged
 * `nativeID="nemu-curl:<slot>"`. The slide pager (`NemuPageSlideView.swift`)
 * takes the same props and children and slides the pages as Books does.
 */
export type PageCurlViewProps = {
  spine: "min" | "max" | "mid";
  slotCount: number;
  /** Changes whenever a mounted child takes another slot. */
  slotsKey: string;
  /** The curl's frame in this view; spreads centre it on the spine. */
  curlFrame: { x: number; y: number; width: number; height: number };
  turningEnabled: boolean;
  pageBackground: string;
  /** "Match Page": slot index → its page's `#rrggbb` (mounted slots); others take `pageBackground`. */
  slotBackgrounds?: Record<string, string>;
  /** Slide pager: the row is right-to-left reversed (manga), so the earlier page is on the right. */
  rtl?: boolean;
  navigationIndex: number;
  navigationAnimated: boolean;
  navigationToken: number;
  onSettle?: (event: NativeSyntheticEvent<{ slot: number; gesture?: boolean; token?: number }>) => void;
  onEdgeDrag?: (event: NativeSyntheticEvent<{ side: "before" | "after" }>) => void;
  onTurnBegin?: (event: NativeSyntheticEvent<{ slot: number }>) => void;
  /** Every curl's end: landed, cancelled or jumped. */
  onTurnEnd?: (event: NativeSyntheticEvent<Record<string, never>>) => void;
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
  ref?: Ref<PageCurlViewHandle>;
};

/** View functions (`pageCurlTurnAvailable`). */
export type PageCurlViewHandle = {
  /** Starts the turn the next navigation props describe, without waiting for their commit. */
  turn?: (slot: number, animated: boolean, token: number) => Promise<void>;
};

const nativeModule = Platform.OS === "ios"
  ? requireOptionalNativeModule<{
      pageCurlViewAvailable?: boolean;
      pageCurlTurnAvailable?: boolean;
      pageSlideViewAvailable?: boolean;
    }>("NemuWindowLayout")
  : null;

/** True in iOS binaries with the curl pager; anything else keeps the slide. */
export const pageCurlAvailable = nativeModule?.pageCurlViewAvailable === true;
/** The curl view takes a tap turn imperatively (`PageCurlViewHandle.turn`). */
export const pageCurlTurnAvailable = nativeModule?.pageCurlTurnAvailable === true;
/** True in iOS binaries with the Books-style slide pager; anything else keeps the scrolling slide. */
export const pageSlideAvailable = nativeModule?.pageSlideViewAvailable === true;

export const NativePageCurlView: ComponentType<PageCurlViewProps> | null = pageCurlAvailable
  ? requireNativeViewManager<PageCurlViewProps>("NemuWindowLayout", "NemuPageCurlView")
  : null;

export const NativePageSlideView: ComponentType<PageCurlViewProps> | null = pageSlideAvailable
  ? requireNativeViewManager<PageCurlViewProps>("NemuWindowLayout", "NemuPageSlideView")
  : null;
