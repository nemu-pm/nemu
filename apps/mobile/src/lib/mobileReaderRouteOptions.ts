/**
 * Route name of the reader inside the `app/sources` stack, i.e. the path of
 * `app/sources/[registryId]/[sourceId]/[mangaId]/[chapterId].tsx` relative to
 * that stack's layout.
 */
export const MOBILE_READER_ROUTE_NAME =
  "[registryId]/[sourceId]/[mangaId]/[chapterId]";

export type MobileStackGestureOptions = {
  fullScreenGestureEnabled: boolean;
  gestureEnabled: boolean;
};

/**
 * iOS 26 ships a native full-screen "content pop" gesture, and
 * react-native-screens treats an unset `fullScreenGestureEnabled` as *enabled*
 * there (`RNSScreenView.isFullScreenSwipeEffectivelyEnabled`). Every stack in
 * the app therefore has to opt out explicitly, or a horizontal drag anywhere
 * on screen pops the top screen of *that* stack — including the outer stack
 * that hosts the whole sources flow, which is why disabling the gesture on the
 * reader screen alone was not enough. Screens keep the usual edge swipe back.
 */
export const MOBILE_STACK_EDGE_ONLY_GESTURE_OPTIONS: MobileStackGestureOptions =
  {
    fullScreenGestureEnabled: false,
    gestureEnabled: true,
  };

/**
 * The reader owns every horizontal drag (page turns, pinch-pan, scrubbing) and
 * exits through its own toolbar back button, so it takes no pop gesture at all.
 * These are declared statically on the route: options set from inside the
 * screen only apply after it has mounted.
 */
export const MOBILE_READER_STACK_GESTURE_OPTIONS: MobileStackGestureOptions = {
  fullScreenGestureEnabled: false,
  gestureEnabled: false,
};

export type MobileReaderScreenOptions = {
  statusBarAnimation: "fade";
  statusBarHidden: boolean;
  statusBarStyle: "light";
};

/**
 * Options the reader still has to set from inside the screen, because they
 * follow its chrome. Native-stack status-bar options use the scene's view
 * controller on iOS; the legacy UIApplication path is a no-op when linked with
 * the iOS 27 SDK. Gesture options are deliberately absent — the route owns
 * them, so toggling the chrome cannot resurrect the pop gesture.
 */
export function mobileReaderScreenOptions({
  showControls,
}: {
  showControls: boolean;
}): MobileReaderScreenOptions {
  return {
    statusBarAnimation: "fade",
    statusBarHidden: !showControls,
    statusBarStyle: "light",
  };
}
