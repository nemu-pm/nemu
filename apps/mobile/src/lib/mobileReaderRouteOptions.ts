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

export type MobileStackContentStyleOptions = { contentStyle: { backgroundColor: string } };
type SetStackContentStyleOptions = (options: MobileStackContentStyleOptions) => void;

let readerHostBackgroundHolders: { color: string }[] = [];

/**
 * The host screen (the root stack's screen holding the sources flow) paints
 * the reader's page background while a reader is mounted: a chapter switch
 * (`router.replace`) animates the next reader in as a rounded card, and what
 * shows at its corners is this screen's background (the app's, black in the
 * dark theme: 0–10 corner pixels for ~0.25 s over a white reader). Counted
 * like the gesture lock: the next reader mounts before the previous one
 * unmounts, and the latest holder's colour wins. The last one out restores
 * `restoreColor`.
 */
export function acquireMobileReaderHostBackground(
  setOptions: SetStackContentStyleOptions | undefined,
  color: string,
  restoreColor: string,
): () => void {
  const holder = { color };
  readerHostBackgroundHolders = [...readerHostBackgroundHolders, holder];
  setOptions?.({ contentStyle: { backgroundColor: color } });
  let released = false;
  return () => {
    if (released) return;
    released = true;
    readerHostBackgroundHolders = readerHostBackgroundHolders.filter((entry) => entry !== holder);
    const latest = readerHostBackgroundHolders[readerHostBackgroundHolders.length - 1];
    setOptions?.({ contentStyle: { backgroundColor: latest ? latest.color : restoreColor } });
  };
}

/** Exposed for tests. */
export function resetMobileReaderHostBackgroundForTesting(): void {
  readerHostBackgroundHolders = [];
}

export type MobileReaderScreenOptions = {
  /** The reader's page background behind its content (never the stack's black). */
  contentStyle?: { backgroundColor: string };
  statusBarAnimation: "fade";
  statusBarHidden: boolean;
  statusBarStyle: "light" | "dark";
  /** iOS: the home indicator fades out while reading immersively (back on the first touch, as in Photos and TV). */
  autoHideHomeIndicator: boolean;
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
  lightPage = false,
  backgroundColor,
}: {
  showControls: boolean;
  /** The page background: what shows at the screen's corners in a chapter switch. */
  backgroundColor?: string;
  /** The page background is light (白色, or a light border under 跟随页面). */
  lightPage?: boolean;
}): MobileReaderScreenOptions {
  // Glyphs that read against what is around the page: light over a dark
  // background and its dark top scrim, dark over a light one and its light
  // scrim.
  return {
    ...(backgroundColor ? { contentStyle: { backgroundColor } } : {}),
    statusBarAnimation: "fade",
    statusBarHidden: !showControls,
    statusBarStyle: lightPage ? "dark" : "light",
    autoHideHomeIndicator: !showControls,
  };
}

/**
 * Whether expo-router's route segments are the reader's
 * (`app/sources/[registryId]/[sourceId]/[mangaId]/[chapterId]`).
 */
export function isMobileReaderRouteSegments(segments: readonly string[]): boolean {
  const readerSegments = MOBILE_READER_ROUTE_NAME.split("/");
  const start = segments.length - readerSegments.length;
  return (
    start >= 1 &&
    segments[start - 1] === "sources" &&
    readerSegments.every((segment, index) => segments[start + index] === segment)
  );
}

/**
 * What the sources stack paints behind its screens. A chapter switch
 * (`router.replace`) animates the next reader in as a rounded card over the
 * stack's own container (not the host screen below it), so while the reader
 * is on top the container is the reader's page background: never black
 * corners over a white reader. Elsewhere it stays the app's background.
 */
export function mobileSourcesStackContainerBackground(input: {
  segments: readonly string[];
  readerBackgroundColor: string;
  appBackgroundColor: string;
}): string {
  return isMobileReaderRouteSegments(input.segments) ? input.readerBackgroundColor : input.appBackgroundColor;
}
