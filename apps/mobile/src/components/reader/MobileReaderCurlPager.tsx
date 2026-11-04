import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode,
  type Ref,
} from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { mobileReaderPageFrameLayoutTransition } from "@/lib/mobileReaderMotionAnimations";
import {
  NativePageCurlView,
  pageCurlTurnAvailable,
  type PageCurlViewHandle,
} from "../../../modules/nemu-window-layout";
import type { ReadingMode } from "@/data/schema";
import type { WindowLayoutRect } from "@/lib/mobileWindowLayout";
import {
  buildMobileReaderCurlSlots,
  mobileReaderCurlEdgeIntent,
  mobileReaderCurlFrameForSlot,
  mobileReaderCurlLayout,
  mobileReaderCurlReanchorFrame,
  mobileReaderCurlSlotForFrame,
  mobileReaderCurlSlotWindow,
  mobileReaderCurlSpine,
  mobileReaderCurlTurnsImmediately,
  nextMobileReaderCurlNavigation,
  type MobileReaderCurlNavigation,
  type MobileReaderCurlSlot,
} from "@/lib/mobileReaderPageCurl";
import { mobileReaderSplitWideHalfRects } from "@/lib/mobileReaderSpreads";
import {
  MOBILE_READER_LONE_PAGE_SETTLE_MS,
  mobileReaderCentresLonePages,
  mobileReaderFlatSpreadState,
  mobileReaderLoneCentreShift,
  mobileReaderLoneCopyShift,
} from "@/lib/mobileReaderLoneSpreadPage";
import type { MobileReaderPage } from "@/sources/mobileSourcePages";
import { MobileReaderSplitWideHalf } from "./MobileReaderSplitWideHalf";
import { MobileReaderCurlLeafOffsetContext } from "./mobileReaderCurlLeafOffset";

export type MobileReaderCurlPagerHandle = {
  /** Visual frame (the slide pager's scroll index); one frame away curls, further jumps. */
  goToFrame(frame: number, animated: boolean): void;
};

/**
 * Paged reading with the curl page turn (翻页 › 卷页): the native page curl
 * over the gallery's visual frames. It only replaces the slide pager's
 * scrolling: the frames, the spread table, tap zones, chrome and progress all
 * stay the gallery's and the reader's.
 */
export function MobileReaderCurlPager({
  anchorFrame,
  backgroundColor,
  displayedPages,
  fitClip,
  foldGap,
  frames,
  initialFrame,
  isPageReady,
  isWide,
  mode,
  onEdgeIntent,
  onSettleFrame,
  onTurningChange,
  overlaysOnPages = false,
  pageFrameSize,
  pageGlide = false,
  pagerRef,
  renderImage,
  renderTextPage,
  spreadMode,
  spreadSlots,
  stage,
  turningEnabled,
}: {
  /**
   * The visual frame the reader is on: where the pager goes when the frames
   * change around it and its own frame's pages are gone (seamless paged
   * reading). Read only then; turns are the pager's own.
   */
  anchorFrame?: number;
  backgroundColor: string;
  displayedPages: MobileReaderPage[];
  fitClip: boolean;
  foldGap?: { start: number; end: number } | null;
  /** Visual frames: page indexes (single) or spreads in reading order, RTL reversed. */
  frames: readonly (readonly number[])[];
  initialFrame: number;
  isWide: (pageIndex: number) => boolean;
  /**
   * Flat spread: the page's image has loaded (or failed). A pair whose second
   * page is not ready shows its first page centred (`mobileReaderFlatSpreadState`).
   */
  isPageReady?: (pageIndex: number) => boolean;
  mode: ReadingMode;
  onEdgeIntent: (intent: "next" | "previous") => void;
  onSettleFrame: (frame: number) => void;
  /** A leaf is turning (overlays wait for the settled page). */
  onTurningChange?: (turning: boolean) => void;
  /** Single pages: the leaf is the page's own box, so its margins never curl. */
  pageFrameSize?: (page: MobileReaderPage) => { width: number; height: number };
  /**
   * Page overlays (Japanese-learning bubbles) are mounted: a tap turn waits
   * for the commit that unmounts them, so the leaf never lifts with them.
   */
  overlaysOnPages?: boolean;
  /**
   * Flat ⇄ book with a spread: the facing pages glide to their new boxes
   * (as the slide pager's slots do) instead of jumping there.
   */
  pageGlide?: boolean;
  pagerRef: Ref<MobileReaderCurlPagerHandle>;
  renderImage: (page: MobileReaderPage) => ReactNode;
  renderTextPage: (page: MobileReaderPage, pageIndex: number) => ReactNode;
  spreadMode: boolean;
  spreadSlots?: readonly WindowLayoutRect[] | null;
  stage: { width: number; height: number };
  turningEnabled: boolean;
}) {
  const panes = Boolean(spreadSlots && spreadSlots.length === 2);
  // A flat spread centres a page alone across the spine (no fold to avoid).
  const centreLone = mobileReaderCentresLonePages({ spreadMode, panes });
  const slots = useMemo(
    () => buildMobileReaderCurlSlots({ frames, spreadMode, mode, isWide, centreLone }),
    [centreLone, frames, isWide, mode, spreadMode],
  );
  const [navigation, setNavigation] = useState<MobileReaderCurlNavigation>(() => ({
    slot: mobileReaderCurlSlotForFrame(initialFrame, spreadMode),
    token: 0,
    animated: false,
  }));
  // The frame the native pager rests on (or is turning to): the mounted window follows it.
  const [settledFrame, setSettledFrame] = useState(initialFrame);
  // The latest navigation asked for (ahead of its commit), so a tap turn can
  // hand native the very token the props will carry.
  const navigationRef = useRef(navigation);
  // Seamless paged reading: frames joined or left around the settled one (a
  // chapter before it, a placeholder replaced by its chapter). `initialFrame`
  // is read once, so the pager follows its own frame: the frame showing the
  // same pages, at its new index, without a turn. The reader only splices
  // frames while no leaf is turning.
  const [trackedFrames, setTrackedFrames] = useState({ frames, displayedPages });
  if (trackedFrames.frames !== frames || trackedFrames.displayedPages !== displayedPages) {
    // The frame showing the same pages; when they are gone (a placeholder
    // replaced by its chapter, or removed), the frame the reader asks for.
    const moved =
      mobileReaderCurlReanchorFrame({
        before: trackedFrames.frames,
        beforePages: trackedFrames.displayedPages,
        after: frames,
        afterPages: displayedPages,
        frame: settledFrame,
      }) ??
      (anchorFrame != null && trackedFrames.frames.length !== frames.length
        ? Math.max(0, Math.min(frames.length - 1, anchorFrame))
        : null);
    setTrackedFrames({ frames, displayedPages });
    if (moved != null && moved !== settledFrame) {
      const next = nextMobileReaderCurlNavigation(navigationRef.current, mobileReaderCurlSlotForFrame(moved, spreadMode), false);
      navigationRef.current = next;
      setNavigation(next);
      setSettledFrame(moved);
    }
  }
  const nativeRef = useRef<PageCurlViewHandle>(null);
  // Single pages curl as the page itself: the leaf is the settled page's box.
  const settledPage = !spreadMode ? displayedPages[frames[settledFrame]?.[0] ?? -1] : undefined;
  const settledPageBox = settledPage && pageFrameSize ? pageFrameSize(settledPage) : null;
  const pageBoxWidth = settledPageBox?.width ?? 0;
  const pageBoxHeight = settledPageBox?.height ?? 0;
  const layout = useMemo(
    () => mobileReaderCurlLayout({
      stage,
      spreadMode,
      spreadSlots,
      foldGap,
      pageBox: pageBoxWidth > 0 && pageBoxHeight > 0 ? { width: pageBoxWidth, height: pageBoxHeight } : null,
    }),
    [foldGap, pageBoxHeight, pageBoxWidth, spreadMode, spreadSlots, stage],
  );
  useImperativeHandle(pagerRef, () => ({
    goToFrame(frame, animated) {
      const step = animated && Math.abs(frame - settledFrame) === 1;
      const immediate = mobileReaderCurlTurnsImmediately({
        step,
        overlaysOnPages,
        available: pageCurlTurnAvailable,
      });
      // Same commit as the request, so the outgoing page curls without overlays.
      if (step) onTurningChange?.(true);
      const next = nextMobileReaderCurlNavigation(navigationRef.current, mobileReaderCurlSlotForFrame(frame, spreadMode), animated);
      navigationRef.current = next;
      // A tap turn starts natively at once: the reader's re-render for the
      // new page (tens of ms) no longer sits between the tap and the curl.
      if (immediate) {
        void nativeRef.current?.turn?.(next.slot, next.animated, next.token)?.catch(() => undefined);
      }
      setNavigation(next);
      setSettledFrame(frame);
    },
  }), [onTurningChange, overlaysOnPages, settledFrame, spreadMode]);

  // Each leaf's page controller view: the curl's frame (single pages), or its
  // left / right half about a middle spine (spreads: even slots left, odd right).
  const leafOffsets = useMemo(
    () => [
      { x: layout.frame.x, y: layout.frame.y },
      { x: layout.frame.x + layout.frame.width / 2, y: layout.frame.y },
    ] as const,
    [layout.frame.height, layout.frame.width, layout.frame.x, layout.frame.y],
  );
  const window = mobileReaderCurlSlotWindow({ frame: settledFrame, frameCount: frames.length, spreadMode });
  const mounted = slots.slice(window.start, window.end + 1).map((slot, offset) => ({ slot, index: window.start + offset }));
  const slotsKey = mounted.map(({ slot, index }) => `${index}:${slotKey(slot, displayedPages)}`).join("|");

  const handleSettle = useCallback(
    (slot: number) => {
      const frame = mobileReaderCurlFrameForSlot(slot, spreadMode);
      setSettledFrame(frame);
      onSettleFrame(frame);
    },
    [onSettleFrame, spreadMode],
  );

  if (!NativePageCurlView) return null;
  return (
    <NativePageCurlView
      ref={nativeRef}
      style={styles.pager}
      spine={mobileReaderCurlSpine(spreadMode, mode)}
      slotCount={slots.length}
      slotsKey={slotsKey}
      curlFrame={layout.frame}
      turningEnabled={turningEnabled}
      pageBackground={backgroundColor}
      navigationIndex={navigation.slot}
      navigationAnimated={navigation.animated}
      navigationToken={navigation.token}
      onSettle={(event) => handleSettle(event.nativeEvent.slot)}
      onEdgeDrag={(event) => onEdgeIntent(mobileReaderCurlEdgeIntent(event.nativeEvent.side, mode))}
      onTurnBegin={() => onTurningChange?.(true)}
      onTurnEnd={() => onTurningChange?.(false)}
    >
      {mounted.map(({ slot, index }) => (
        <View
          key={slotKey(slot, displayedPages)}
          nativeID={`nemu-curl:${index}`}
          collapsable={false}
          style={[styles.leaf, { width: layout.leaf.width, height: layout.leaf.height, backgroundColor }]}
        >
          <MobileReaderCurlLeafOffsetContext.Provider value={leafOffsets[spreadMode && index % 2 === 1 ? 1 : 0]}>
            {renderSlot({
              slot,
              index,
              layout,
              spreadMode,
              panes,
              centreLone,
              frames,
              mode,
              isPageReady,
              fitClip,
              pageGlide,
              displayedPages,
              pageFrameSize,
              renderImage,
              renderTextPage,
            })}
          </MobileReaderCurlLeafOffsetContext.Provider>
        </View>
      ))}
    </NativePageCurlView>
  );
}

function slotKey(slot: MobileReaderCurlSlot, displayedPages: MobileReaderPage[]): string {
  if (slot.kind === "blank") return `blank:${slot.frame}`;
  return `${displayedPages[slot.pageIndex]?.id ?? slot.pageIndex}:${slot.part}`;
}

function renderSlot({
  slot,
  index,
  layout,
  spreadMode,
  panes,
  centreLone,
  frames,
  mode,
  isPageReady,
  fitClip,
  pageGlide,
  displayedPages,
  pageFrameSize,
  renderImage,
  renderTextPage,
}: {
  slot: MobileReaderCurlSlot;
  index: number;
  layout: ReturnType<typeof mobileReaderCurlLayout>;
  spreadMode: boolean;
  /** The spread rests in two panes beside a fold (the book posture). */
  panes: boolean;
  /** Flat spread: lone pages (and a pair's first page, while the second loads) are centred. */
  centreLone: boolean;
  frames: readonly (readonly number[])[];
  mode: ReadingMode;
  isPageReady?: (pageIndex: number) => boolean;
  fitClip: boolean;
  pageGlide: boolean;
  displayedPages: MobileReaderPage[];
  pageFrameSize?: (page: MobileReaderPage) => { width: number; height: number };
  renderImage: (page: MobileReaderPage) => ReactNode;
  renderTextPage: (page: MobileReaderPage, pageIndex: number) => ReactNode;
}): ReactNode {
  if (slot.kind === "blank") return null;
  const page = displayedPages[slot.pageIndex];
  if (!page) return null;
  const content = page.imageUri ? renderImage(page) : renderTextPage(page, slot.pageIndex);
  if (!spreadMode) {
    return <View style={[layout.pageLeaf ? styles.pageLeaf : styles.single, fitClip ? styles.clip : null]}>{content}</View>;
  }
  const splitFrame = slot.part !== "whole" && panes ? pageFrameSize?.(page) : undefined;
  if (slot.part !== "whole" && splitFrame && layout.boxes.length === 2) {
    // Book posture: each leaf shows its half against the fold edge of its
    // pane (the leaves' boxes), as the slide gallery lays the halves out.
    const halves = mobileReaderSplitWideHalfRects({
      slots: [layout.boxes[0]!, layout.boxes[1]!],
      frame: splitFrame,
    });
    return (
      <MobileReaderSplitWideHalf part={slot.part} frame={splitFrame} rect={halves[slot.part === "left" ? 0 : 1]}>
        {content}
      </MobileReaderSplitWideHalf>
    );
  }
  if (slot.part !== "whole") {
    // A wide page across the spine: each leaf shows its half of the sheet.
    return (
      <View
        style={[
          styles.sheet,
          { width: layout.leaf.width * 2, height: layout.leaf.height, left: slot.part === "left" ? 0 : -layout.leaf.width },
        ]}
      >
        {content}
      </View>
    );
  }
  const left = index % 2 === 0;
  const box = layout.boxes[left ? 0 : 1] ?? layout.boxes[0]!;
  const boxStyle: StyleProp<ViewStyle> = [
    styles.box,
    { left: box.x, top: box.y, width: box.width, height: box.height },
    // Facing pages lean on the spine (the fold edge of their panes).
    { alignItems: left ? "flex-end" : "flex-start" },
  ];
  // One box type in every posture (flat ⇄ book keeps the boxes mounted and
  // gliding). Only a flat spread's pair moves its pages: the first centred
  // while the second loads.
  const spread = frames[slot.frame];
  const ready = (pageIndex: number) => {
    const candidate = displayedPages[pageIndex];
    return !candidate?.imageUri || (isPageReady?.(pageIndex) ?? true);
  };
  const state = centreLone && spread && spread.length === 2
    ? mobileReaderFlatSpreadState({ spread, mode, ready })
    : null;
  const at: 0 | 1 = left ? 0 : 1;
  const partnerIndex = state?.visual[at === 0 ? 1 : 0];
  const partner = partnerIndex == null ? undefined : displayedPages[partnerIndex];
  const widthOf = (candidate: MobileReaderPage | undefined) =>
    candidate && pageFrameSize ? pageFrameSize(candidate).width : 0;
  return (
    <MobileReaderCurlFlatPairPage
      slot={at}
      centred={state?.centredSlot === at}
      pending={state?.pendingSlot === at}
      pageWidth={state ? widthOf(page) : 0}
      partner={() =>
        partner
          ? partner.imageUri
            ? renderImage(partner)
            : renderTextPage(partner, partnerIndex!)
          : null}
      partnerWidth={widthOf(partner)}
      layout={pageGlide ? mobileReaderPageFrameLayoutTransition : undefined}
      boxStyle={boxStyle}
    >
      {content}
    </MobileReaderCurlFlatPairPage>
  );
}

const styles = StyleSheet.create({
  pager: {
    flex: 1,
    alignSelf: "stretch",
  },
  leaf: {
    position: "absolute",
    left: 0,
    top: 0,
    overflow: "hidden",
  },
  single: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10,
  },
  pageLeaf: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  clip: {
    overflow: "hidden",
  },
  sheet: {
    position: "absolute",
    top: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  box: {
    position: "absolute",
    justifyContent: "center",
    overflow: "hidden",
  },
});

// Flat spreads: a lone page centred on the stage (see mobileReaderLoneSpreadPage).
const LONE_SETTLE = { duration: MOBILE_READER_LONE_PAGE_SETTLE_MS, easing: Easing.out(Easing.cubic) };

/**
 * A page of a flat spread, moved by `shift` and shown or hidden. The first
 * render takes the values as they are (a spread that mounts complete never
 * animates); a later change glides (250 ms, ease-out): the centred page to its
 * slot, the waiting page fading in, over the same time. Hiding is immediate.
 */
export function MobileReaderLoneSpreadShift({
  shift,
  visible = true,
  style,
  children,
}: {
  shift: number;
  visible?: boolean;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  const animated = useMobileReaderLoneSpreadMotion(shift, visible);
  return <Animated.View style={[style, animated]}>{children}</Animated.View>;
}

/** The animated style behind `MobileReaderLoneSpreadShift` (first render as is; changes glide). */
function useMobileReaderLoneSpreadMotion(shift: number, visible: boolean) {
  const translateX = useSharedValue(shift);
  const opacity = useSharedValue(visible ? 1 : 0);
  useEffect(() => {
    translateX.value = withTiming(shift, LONE_SETTLE);
  }, [shift, translateX]);
  useEffect(() => {
    opacity.value = visible ? withTiming(1, LONE_SETTLE) : 0;
  }, [opacity, visible]);
  return useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateX: translateX.value }],
  }));
}

/**
 * True while `active`, and for the settle time after it turns false: the
 * curl's copy of a centred page stays mounted until it has slid out.
 */
export function useMobileReaderLoneSettling(active: boolean): boolean {
  const [held, setHeld] = useState(active);
  if (active && !held) setHeld(true);
  useEffect(() => {
    if (active || !held) return undefined;
    const timer = setTimeout(() => setHeld(false), MOBILE_READER_LONE_PAGE_SETTLE_MS + 50);
    return () => clearTimeout(timer);
  }, [active, held]);
  return active || held;
}

type SlotLayout = ComponentProps<typeof Animated.View>["layout"];

/**
 * Slide pager: one page's slot of a spread. The slot itself moves (its page
 * rests inside it, so the slot's zoom clip never cuts the page) and fades:
 * in a flat spread a pair's first page is centred while the second loads.
 * Every posture uses this one slot type, so flat ⇄ book keeps the slots
 * mounted and gliding; outside a flat spread it never moves.
 */
export function MobileReaderFlatSpreadSlot({
  slot,
  centred,
  pending,
  pageWidth,
  layout,
  style,
  children,
}: {
  slot: 0 | 1;
  /** This slot's page is shown centred on the stage. */
  centred: boolean;
  /** This slot's page waits, hidden, for its image. */
  pending: boolean;
  pageWidth: number;
  layout?: SlotLayout;
  style: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  const animated = useMobileReaderLoneSpreadMotion(
    centred ? mobileReaderLoneCentreShift(slot, pageWidth) : 0,
    !pending,
  );
  return (
    <Animated.View layout={layout} style={[style, animated]}>
      {children}
    </Animated.View>
  );
}

/**
 * Curl, flat spread: one leaf's page of a pair. Each leaf clips at the spine,
 * so while the pair's first page is centred the other leaf also shows it (a
 * copy, its other half) under the waiting page; the copy slides out across
 * the spine with the page as the pair completes, and unmounts once settled.
 */
export function MobileReaderCurlFlatPairPage({
  slot,
  centred,
  pending,
  pageWidth,
  partner,
  partnerWidth,
  boxStyle,
  layout,
  children,
}: {
  slot: 0 | 1;
  centred: boolean;
  pending: boolean;
  pageWidth: number;
  /** The facing page's content (the copy), rendered only while needed. */
  partner: () => ReactNode;
  partnerWidth: number;
  boxStyle: StyleProp<ViewStyle>;
  layout?: SlotLayout;
  children: ReactNode;
}) {
  const showCopy = useMobileReaderLoneSettling(pending);
  const partnerSlot: 0 | 1 = slot === 0 ? 1 : 0;
  const partnerShift = pending ? mobileReaderLoneCentreShift(partnerSlot, partnerWidth) : 0;
  return (
    <Animated.View layout={layout} style={boxStyle}>
      {showCopy ? (
        <MobileReaderLoneSpreadShift
          style={[StyleSheet.absoluteFill, loneStyles.copy, { alignItems: slot === 0 ? "flex-end" : "flex-start" }]}
          shift={mobileReaderLoneCopyShift(partnerSlot, partnerWidth, partnerShift)}
        >
          {partner()}
        </MobileReaderLoneSpreadShift>
      ) : null}
      <MobileReaderLoneSpreadShift
        shift={centred ? mobileReaderLoneCentreShift(slot, pageWidth) : 0}
        visible={!pending}
      >
        {children}
      </MobileReaderLoneSpreadShift>
    </Animated.View>
  );
}

const loneStyles = StyleSheet.create({
  copy: {
    justifyContent: "center",
  },
});
