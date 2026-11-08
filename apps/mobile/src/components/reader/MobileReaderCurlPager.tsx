import {
  useCallback,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode,
  type Ref,
} from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import Animated from "react-native-reanimated";
import { mobileReaderPageFrameLayoutTransition } from "@/lib/mobileReaderMotionAnimations";
import {
  NativePageCurlView,
  NativePageSlideView,
  NativePagePushView,
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
  mobileReaderCurlSettleIsCurrent,
  mobileReaderCurlSlotForFrame,
  mobileReaderCurlSlotWindow,
  mobileReaderCurlSpine,
  mobileReaderCurlTurnsImmediately,
  mobileReaderSlotBackgrounds,
  nextMobileReaderCurlNavigation,
  type MobileReaderCurlNavigation,
  type MobileReaderCurlSlot,
  type MobileReaderPageTurnTransition,
} from "@/lib/mobileReaderPageCurl";
import { mobileReaderSplitWideHalfRects } from "@/lib/mobileReaderSpreads";
import { mobileReaderCentresLonePages } from "@/lib/mobileReaderLoneSpreadPage";
import type { MobileReaderSpreadHalf } from "@/lib/mobileReaderPageLoading";
import type { MobileReaderPage } from "@/sources/mobileSourcePages";
import { MobileReaderSplitWideHalf } from "./MobileReaderSplitWideHalf";
import { MobileReaderCurlLeafOffsetContext } from "./mobileReaderCurlLeafOffset";
import { MobileReaderSpreadHalfContext } from "./MobileReaderPageSpinner";

export type MobileReaderCurlPagerHandle = {
  /** Visual frame (the slide pager's scroll index); one frame away curls, further jumps. */
  goToFrame(frame: number, animated: boolean): void;
};

/**
 * Paged reading with a native page turn over the gallery's visual frames: the
 * curl (翻页 › 卷页, `NemuPageCurlView`) or Books' slide (`NemuPageSlideView`,
 * a spread sliding as one sheet like a single page). Both take the same slots.
 * It only replaces the list's scrolling: the frames, the spread table, tap
 * zones, chrome and progress all stay the gallery's and the reader's.
 */
export function MobileReaderCurlPager({
  anchorFrame,
  backgroundColor,
  displayedPages,
  fitClip,
  foldGap,
  frames,
  initialFrame,
  isWide,
  mode,
  onEdgeIntent,
  onSettleFrame,
  onTurningChange,
  overlaysOnPages = false,
  pageBackgroundFor,
  pageFrameSize,
  pageGlide = false,
  pagerRef,
  renderImage,
  renderTextPage,
  spreadMode,
  spreadSlots,
  stage,
  transition = "curl",
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
  mode: ReadingMode;
  onEdgeIntent: (intent: "next" | "previous") => void;
  onSettleFrame: (frame: number) => void;
  /** A leaf is turning (overlays wait for the settled page). */
  onTurningChange?: (turning: boolean) => void;
  /**
   * "Match Page": each page's own background (its border colour, or the one
   * on screen while it is measured). Every leaf and sheet is painted with its
   * page's colour, so the background turns with its page; single pages curl
   * on stage-sized leaves (their margins are their own colour).
   */
  pageBackgroundFor?: ((page: MobileReaderPage) => string) | null;
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
  transition?: MobileReaderPageTurnTransition;
  turningEnabled: boolean;
}) {
  // Slide and Push both turn whole-stage sheets.
  const slide = transition === "slide" || transition === "push";
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
  // Every leaf is the whole stage, the page centred on its page background
  // (each page's own under "Match Page"): the bands beside a letterboxed page
  // turn with it, and a zoomed page reaches past its box over that background.
  // A leaf the page's own box left those bands still beside the turn (a seam)
  // and cut a zoomed page off at its box (bars outside it).
  const layout = useMemo(
    () => mobileReaderCurlLayout({ stage, spreadMode, spreadSlots, foldGap, pageBox: null }),
    [foldGap, spreadMode, spreadSlots, stage],
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
  const slotBackgrounds = useMemo(
    () => mobileReaderSlotBackgrounds({ mounted, frames, displayedPages, pageBackgroundFor }),
    // `slotsKey` names the mounted slots and their pages.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [slotsKey, frames, displayedPages, pageBackgroundFor],
  );

  const handleSettle = useCallback(
    (slot: number, event: { gesture?: boolean; token?: number }) => {
      // A superseded request's slot counts frames that have since moved.
      if (!mobileReaderCurlSettleIsCurrent(event, navigationRef.current.token)) return;
      const frame = mobileReaderCurlFrameForSlot(slot, spreadMode);
      setSettledFrame(frame);
      onSettleFrame(frame);
    },
    [onSettleFrame, spreadMode],
  );

  const NativePager =
    transition === "push" ? NativePagePushView : slide ? NativePageSlideView : NativePageCurlView;
  if (!NativePager) return null;
  return (
    <NativePager
      ref={nativeRef}
      style={styles.pager}
      spine={mobileReaderCurlSpine(spreadMode, mode)}
      rtl={mode === "rtl"}
      slotCount={slots.length}
      slotsKey={slotsKey}
      curlFrame={layout.frame}
      turningEnabled={turningEnabled}
      pageBackground={backgroundColor}
      slotBackgrounds={slotBackgrounds ?? undefined}
      navigationIndex={navigation.slot}
      navigationAnimated={navigation.animated}
      navigationToken={navigation.token}
      onSettle={(event) => handleSettle(event.nativeEvent.slot, event.nativeEvent)}
      onEdgeDrag={(event) => onEdgeIntent(mobileReaderCurlEdgeIntent(event.nativeEvent.side, mode))}
      onTurnBegin={() => onTurningChange?.(true)}
      onTurnEnd={() => onTurningChange?.(false)}
    >
      {mounted.map(({ slot, index }) => (
        <View
          key={slotKey(slot, displayedPages)}
          nativeID={`nemu-curl:${index}`}
          collapsable={false}
          style={[styles.leaf, {
            width: layout.leaf.width,
            height: layout.leaf.height,
            backgroundColor: slotBackgrounds?.[index] ?? backgroundColor,
          }]}
        >
          <MobileReaderCurlLeafOffsetContext.Provider value={leafOffsets[spreadMode && index % 2 === 1 ? 1 : 0]}>
            {renderSlot({
              slot,
              index,
              layout,
              spreadMode,
              panes,
              frames,
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
    </NativePager>
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
  frames,
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
  frames: readonly (readonly number[])[];
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
  // gliding). A page of a pair shows its own state in its own half.
  return (
    <MobileReaderFlatSpreadSlot
      half={frames[slot.frame]?.length === 2 ? { side: left ? "left" : "right", width: box.width } : null}
      layout={pageGlide ? mobileReaderPageFrameLayoutTransition : undefined}
      style={boxStyle}
    >
      {content}
    </MobileReaderFlatSpreadSlot>
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

type SlotLayout = ComponentProps<typeof Animated.View>["layout"];

/**
 * One page's slot of a spread, in the slide pager and the curl. Every posture
 * uses this one slot type, so flat ⇄ book keeps the slots mounted and
 * gliding. The slot itself never moves or hides: its page shows its own state
 * (`MobileReaderPageFrame`: the background and spinner while it waits, on
 * `half`, then its image fading in), whatever its partner is doing.
 */
export function MobileReaderFlatSpreadSlot({
  half,
  layout,
  style,
  children,
}: {
  /** This page's half of a facing pair; null for a page alone. */
  half: MobileReaderSpreadHalf | null;
  layout?: SlotLayout;
  style: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  return (
    <Animated.View layout={layout} style={style}>
      <MobileReaderSpreadHalfContext.Provider value={half}>{children}</MobileReaderSpreadHalfContext.Provider>
    </Animated.View>
  );
}
