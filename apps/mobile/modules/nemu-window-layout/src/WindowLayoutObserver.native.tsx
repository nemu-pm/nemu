import type { ComponentType } from "react";
import { requireNativeViewManager, requireOptionalNativeModule } from "expo-modules-core";
import type { NativeSyntheticEvent, ViewProps } from "react-native";
import BoundsOnlyObserver from "./WindowLayoutObserver";
import type { MobileWindowLayout, WindowLayoutObserverProps, WindowTransitionTiming } from "./types";

type NativeObserverProps = ViewProps & {
  enabled: boolean;
  onRegionsChange: (event: NativeSyntheticEvent<MobileWindowLayout>) => void;
  onWillTransition?: (event: NativeSyntheticEvent<WindowTransitionTiming>) => void;
};

// iOS and Android both ship the native view. A binary built before the module
// existed (or a host without it) keeps the bounds-only fallback, never a crash.
const NativeObserver: ComponentType<NativeObserverProps> | null = requireOptionalNativeModule("NemuWindowLayout")
  ? requireNativeViewManager("NemuWindowLayout")
  : null;

export default function WindowLayoutObserver(props: WindowLayoutObserverProps) {
  const { style, enabled = true, onLayoutChange, onWillTransition } = props;
  if (!NativeObserver) return <BoundsOnlyObserver {...props} />;
  return <NativeObserver style={style} enabled={enabled} pointerEvents="none" accessible={false}
    onRegionsChange={(event) => onLayoutChange(event.nativeEvent)}
    onWillTransition={onWillTransition ? (event) => onWillTransition(event.nativeEvent) : undefined} />;
}
