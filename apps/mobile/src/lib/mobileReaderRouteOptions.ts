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
 * iOS 26 ships a native full-screen "content pop" gesture, and the owner wants
 * it on everywhere: react-native-screens treats an unset
 * `fullScreenGestureEnabled` as enabled there already, but every stack states
 * it explicitly so the intent survives a library default change. The reader
 * is the one place that must not pop on a horizontal drag; it opts out with
 * `MOBILE_READER_STACK_GESTURE_OPTIONS` (its own route) plus the host lock
 * below (the outer stack screen that contains the whole sources flow).
 */
export const MOBILE_STACK_FULL_SCREEN_GESTURE_OPTIONS: MobileStackGestureOptions =
  {
    fullScreenGestureEnabled: true,
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

type SetStackGestureOptions = (options: MobileStackGestureOptions) => void;

let readerHostGestureLocks = 0;

/**
 * The sources flow (manga detail + reader) is a single screen of the root
 * stack, so the root stack's full-screen pop gesture would pop the whole flow
 * on a reader page turn or scrub. While at least one reader is mounted, the
 * host screen takes the reader's gesture options; the last reader to unmount
 * restores the app-wide options. Counted rather than toggled because a chapter
 * switch (`router.replace`) mounts the next reader before the previous one
 * unmounts — a plain restore-on-unmount would re-enable the pop mid-read.
 */
export function acquireMobileReaderHostGestureLock(
  setOptions: SetStackGestureOptions | undefined,
): () => void {
  readerHostGestureLocks += 1;
  setOptions?.(MOBILE_READER_STACK_GESTURE_OPTIONS);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    readerHostGestureLocks = Math.max(0, readerHostGestureLocks - 1);
    if (readerHostGestureLocks === 0) {
      setOptions?.(MOBILE_STACK_FULL_SCREEN_GESTURE_OPTIONS);
    }
  };
}

/** Exposed for tests. */
export function resetMobileReaderHostGestureLocksForTesting(): void {
  readerHostGestureLocks = 0;
}

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
