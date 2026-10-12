import type { ComponentType, ReactNode } from "react";
import { requireNativeViewManager, requireOptionalNativeModule } from "expo-modules-core";
import { Platform, View, type ViewProps } from "react-native";

type ZoomSourceProps = { zoomId: string; style?: ViewProps["style"]; children?: ReactNode };
type ZoomTargetProps = {
  zoomId: string;
  /** Land the zoom on this view's frame (default) or on the whole screen. */
  align?: boolean;
  /** Swipe-to-dismiss back into the source (default true). */
  interactiveDismiss?: boolean;
  /**
   * The zoom into this screen has landed (route-level targets, `align` false).
   * Fires once; at once when the screen appears without a transition.
   */
  onZoomSettled?: () => void;
  style?: ViewProps["style"];
  children?: ReactNode;
};
type MarkerProps = { generation?: number; style?: ViewProps["style"] };

const nativeModule = Platform.OS === "ios"
  ? requireOptionalNativeModule<{
      zoomTransitionAvailable?: boolean;
      zoomSettledEventAvailable?: boolean;
      contentScrollMarkerAvailable?: boolean;
    }>("NemuWindowLayout")
  : null;

/** True when this binary has the zoom views (older binaries push normally). */
export const zoomTransitionAvailable = nativeModule?.zoomTransitionAvailable === true;
/** True when the target reports `onZoomSettled` (older binaries never do). */
export const zoomSettledEventAvailable = nativeModule?.zoomSettledEventAvailable === true;
const contentScrollMarkerAvailable = nativeModule?.contentScrollMarkerAvailable === true;

const NativeZoomSource: ComponentType<ZoomSourceProps> | null = zoomTransitionAvailable
  ? requireNativeViewManager<ZoomSourceProps>("NemuWindowLayout", "NemuZoomSourceView")
  : null;
const NativeZoomTarget: ComponentType<
  Required<Omit<ZoomTargetProps, "children" | "style" | "onZoomSettled">> &
    Pick<ZoomTargetProps, "children" | "style" | "onZoomSettled">
> | null =
  zoomTransitionAvailable
    ? requireNativeViewManager("NemuWindowLayout", "NemuZoomTargetView")
    : null;
const NativeMarker: ComponentType<MarkerProps> | null = contentScrollMarkerAvailable
  ? requireNativeViewManager<MarkerProps>("NemuWindowLayout", "NemuContentScrollMarkerView")
  : null;

/** The view a cover zoom grows out of. Sized by `style` like any View. */
export function ZoomSource({ zoomId, style, children }: ZoomSourceProps) {
  if (!NativeZoomSource) return <View style={style}>{children}</View>;
  return (
    <NativeZoomSource zoomId={zoomId} style={style}>
      {children}
    </NativeZoomSource>
  );
}

/** Gives the pushed screen a zoom transition from the source with `zoomId`. */
export function ZoomTarget({ zoomId, align = true, interactiveDismiss = true, onZoomSettled, style, children }: ZoomTargetProps) {
  if (!NativeZoomTarget) return <View style={style}>{children}</View>;
  return (
    <NativeZoomTarget
      zoomId={zoomId}
      align={align}
      interactiveDismiss={interactiveDismiss}
      onZoomSettled={onZoomSettled}
      style={style}
    >
      {children}
    </NativeZoomTarget>
  );
}

/** Registers the enclosing list as its screen's content scroll view (tab bar minimise). */
export function ContentScrollMarker({ generation = 0 }: { generation?: number }) {
  if (!NativeMarker) return null;
  // Out of the flow: it must not take a gap in a stacked header.
  return <NativeMarker generation={generation} style={{ position: "absolute", width: 0, height: 0 }} />;
}
