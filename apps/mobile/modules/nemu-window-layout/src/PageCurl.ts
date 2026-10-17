import type { ComponentType, ReactNode } from "react";
import { requireNativeViewManager, requireOptionalNativeModule } from "expo-modules-core";
import { Platform, type NativeSyntheticEvent, type StyleProp, type ViewStyle } from "react-native";

/**
 * Native curl pager (`NemuPageCurlView.swift`): a `UIPageViewController` with
 * the page curl transition whose pages are the children, each tagged
 * `nativeID="nemu-curl:<slot>"`.
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
  navigationIndex: number;
  navigationAnimated: boolean;
  navigationToken: number;
  onSettle?: (event: NativeSyntheticEvent<{ slot: number; gesture?: boolean }>) => void;
  onEdgeDrag?: (event: NativeSyntheticEvent<{ side: "before" | "after" }>) => void;
  onTurnBegin?: (event: NativeSyntheticEvent<{ slot: number }>) => void;
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
};

const nativeModule = Platform.OS === "ios"
  ? requireOptionalNativeModule<{ pageCurlViewAvailable?: boolean }>("NemuWindowLayout")
  : null;

/** True in iOS binaries with the curl pager; anything else keeps the slide. */
export const pageCurlAvailable = nativeModule?.pageCurlViewAvailable === true;

export const NativePageCurlView: ComponentType<PageCurlViewProps> | null = pageCurlAvailable
  ? requireNativeViewManager<PageCurlViewProps>("NemuWindowLayout", "NemuPageCurlView")
  : null;
