import { useCallback, useImperativeHandle, useMemo, useState, type ReactNode, type Ref } from "react";
import { StyleSheet, View } from "react-native";
import { NativePageCurlView } from "../../../modules/nemu-window-layout";
import type { ReadingMode } from "@/data/schema";
import type { WindowLayoutRect } from "@/lib/mobileWindowLayout";
import {
  buildMobileReaderCurlSlots,
  mobileReaderCurlEdgeIntent,
  mobileReaderCurlFrameForSlot,
  mobileReaderCurlLayout,
  mobileReaderCurlSlotForFrame,
  mobileReaderCurlSlotWindow,
  mobileReaderCurlSpine,
  nextMobileReaderCurlNavigation,
  type MobileReaderCurlNavigation,
  type MobileReaderCurlSlot,
} from "@/lib/mobileReaderPageCurl";
import type { MobileReaderPage } from "@/sources/mobileSourcePages";

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
  pagerRef,
  renderImage,
  renderTextPage,
  spreadMode,
  spreadSlots,
  stage,
  turningEnabled,
}: {
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
  pagerRef: Ref<MobileReaderCurlPagerHandle>;
  renderImage: (page: MobileReaderPage) => ReactNode;
  renderTextPage: (page: MobileReaderPage, pageIndex: number) => ReactNode;
  spreadMode: boolean;
  spreadSlots?: readonly WindowLayoutRect[] | null;
  stage: { width: number; height: number };
  turningEnabled: boolean;
}) {
  const slots = useMemo(
    () => buildMobileReaderCurlSlots({ frames, spreadMode, mode, splitWide: !foldGap, isWide }),
    [foldGap, frames, isWide, mode, spreadMode],
  );
  const layout = useMemo(
    () => mobileReaderCurlLayout({ stage, spreadMode, spreadSlots, foldGap }),
    [foldGap, spreadMode, spreadSlots, stage],
  );
  const [navigation, setNavigation] = useState<MobileReaderCurlNavigation>(() => ({
    slot: mobileReaderCurlSlotForFrame(initialFrame, spreadMode),
    token: 0,
    animated: false,
  }));
  // The frame the native pager rests on (or is turning to): the mounted window follows it.
  const [settledFrame, setSettledFrame] = useState(initialFrame);
  useImperativeHandle(pagerRef, () => ({
    goToFrame(frame, animated) {
      // Same commit as the request, so the outgoing page curls without overlays.
      if (animated && Math.abs(frame - settledFrame) === 1) onTurningChange?.(true);
      setNavigation((current) => nextMobileReaderCurlNavigation(current, mobileReaderCurlSlotForFrame(frame, spreadMode), animated));
      setSettledFrame(frame);
    },
  }), [onTurningChange, settledFrame, spreadMode]);

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
          {renderSlot({
            slot,
            index,
            layout,
            spreadMode,
            fitClip,
            displayedPages,
            renderImage,
            renderTextPage,
          })}
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
  fitClip,
  displayedPages,
  renderImage,
  renderTextPage,
}: {
  slot: MobileReaderCurlSlot;
  index: number;
  layout: ReturnType<typeof mobileReaderCurlLayout>;
  spreadMode: boolean;
  fitClip: boolean;
  displayedPages: MobileReaderPage[];
  renderImage: (page: MobileReaderPage) => ReactNode;
  renderTextPage: (page: MobileReaderPage, pageIndex: number) => ReactNode;
}): ReactNode {
  if (slot.kind === "blank") return null;
  const page = displayedPages[slot.pageIndex];
  if (!page) return null;
  const content = page.imageUri ? renderImage(page) : renderTextPage(page, slot.pageIndex);
  if (!spreadMode) {
    return <View style={[styles.single, fitClip ? styles.clip : null]}>{content}</View>;
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
  return (
    <View
      style={[
        styles.box,
        { left: box.x, top: box.y, width: box.width, height: box.height },
        // Facing pages lean on the spine (the fold edge of their panes).
        { alignItems: left ? "flex-end" : "flex-start" },
      ]}
    >
      {content}
    </View>
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
