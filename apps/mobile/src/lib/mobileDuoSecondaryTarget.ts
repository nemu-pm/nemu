/**
 * Which secondary (dual-reader) page belongs to a primary page, and what state
 * it is in — factored out of `MobileDualReaderOverlay` so the per-page overlay
 * and the Duo bilingual side-by-side pane (`DuoBilingualSpread`) share one
 * resolution path and cannot drift apart.
 *
 * Semantics match web's `DualReadOverlay`
 * (`src/lib/plugins/builtin/dual-reader/components.tsx`): chapter mapping via
 * `mapSecondaryChapterForPrimary` (seed pair), page mapping via the per-chapter
 * drift delta, render plans (single / split / merge / missing) from the
 * aligner take precedence when they match the current secondary chapter and
 * drift, and alignment is applied only above the confidence floor.
 */
import {
  ALIGNMENT_CONFIDENCE_MIN_DEFAULT,
  clampIndex,
  mapSecondaryChapterForPrimary,
  mapSecondaryPageIndex,
} from "@nemu/core/dual-reader";
import type {
  ChapterPairSeed,
  SecondaryAlignment,
  SecondaryRenderPlan,
} from "@nemu/core/dual-reader";
import type { ChapterSummary } from "@/data/schema";
import type { MobileReaderPage } from "@/sources/mobileSourcePages";
import {
  alignmentLayoutToDestRect,
  computeAlignmentLayout,
  computeContainRect,
  type OverlayNaturalSize,
} from "@/lib/mobileDualReaderOverlayLayout";
import {
  makeSecondaryCompositeKey,
  makeSecondarySingleKey,
} from "@/lib/mobileDualReaderSecondaryImages";
import type { DualReadSecondaryImageHandle, DualReadState } from "@/lib/mobileDualReaderStore";

export type MobileDuoSecondaryChapter = {
  primaryChapter: ChapterSummary | null;
  secondaryChapterId: string | null;
  /** Chapter lists + seed are loaded, so a null mapping really means "no counterpart". */
  lookupReady: boolean;
};

export function resolveMobileDuoSecondaryChapter(input: {
  chapterId: string | null;
  primaryChapters: ChapterSummary[];
  secondaryChapters: ChapterSummary[];
  seedPair: ChapterPairSeed | null;
}): MobileDuoSecondaryChapter {
  const { chapterId, primaryChapters, secondaryChapters, seedPair } = input;
  const primaryChapter = chapterId
    ? (primaryChapters.find((c) => c.id === chapterId) ?? null)
    : null;
  const lookupReady = Boolean(primaryChapter && seedPair && secondaryChapters.length > 0);
  const secondaryChapterId = primaryChapter && seedPair && secondaryChapters.length > 0
    ? mapSecondaryChapterForPrimary({
        primaryChapter,
        primaryAll: primaryChapters,
        secondaryAll: secondaryChapters,
        seedPair,
      })
    : null;
  return { primaryChapter, secondaryChapterId, lookupReady };
}

/**
 * - `idle`: no primary page to pair (no chapter / index).
 * - `notReady`: chapter lists or the seed pair are still loading.
 * - `unavailable`: lookup is ready but this chapter has no secondary counterpart.
 * - `missing`: the aligner decided this primary page has no secondary page.
 * - `loading`: the secondary page is known; its image is not decoded yet.
 * - `ready`: `handle.image` is drawable.
 */
export type MobileDuoSecondaryStatus =
  | "idle"
  | "notReady"
  | "unavailable"
  | "missing"
  | "loading"
  | "ready";

export type MobileDuoSecondaryTarget = MobileDuoSecondaryChapter & {
  status: MobileDuoSecondaryStatus;
  mappedIndex: number | null;
  clampedIndex: number | null;
  renderPlan: SecondaryRenderPlan | null;
  alignment: SecondaryAlignment | null;
  applyAlignment: boolean;
  secondaryPages: MobileReaderPage[] | undefined;
  imageKey: string | null;
  handle: DualReadSecondaryImageHandle | undefined;
};

export type MobileDuoSecondaryStoreSlice = Pick<
  DualReadState,
  | "driftDeltaByChapter"
  | "secondaryPagesByChapter"
  | "secondaryRenderPlansByChapter"
  | "secondaryAlignmentByChapter"
  | "secondaryImageUrls"
>;

export function resolveMobileDuoSecondaryTarget(
  chapter: MobileDuoSecondaryChapter,
  input: MobileDuoSecondaryStoreSlice & {
    chapterId: string | null;
    localIndex: number | null;
  },
): MobileDuoSecondaryTarget {
  const {
    chapterId,
    localIndex,
    driftDeltaByChapter,
    secondaryPagesByChapter,
    secondaryRenderPlansByChapter,
    secondaryAlignmentByChapter,
    secondaryImageUrls,
  } = input;
  const { secondaryChapterId } = chapter;
  const driftDelta = chapterId ? (driftDeltaByChapter[chapterId] ?? 0) : 0;
  const mappedIndex = localIndex == null || !chapterId
    ? null
    : mapSecondaryPageIndex({ primaryIndex: localIndex, driftDelta });

  let renderPlan: SecondaryRenderPlan | null = null;
  let alignment: SecondaryAlignment | null = null;
  if (chapterId && localIndex != null && secondaryChapterId) {
    const plan = secondaryRenderPlansByChapter[chapterId]?.[localIndex];
    if (plan && plan.secondaryChapterId === secondaryChapterId && plan.driftDelta === driftDelta) {
      renderPlan = plan;
    }
    const entry = secondaryAlignmentByChapter[chapterId];
    if (entry && entry.secondaryChapterId === secondaryChapterId) {
      alignment = entry.byPage[localIndex] ?? null;
    }
  }

  const secondaryPages = secondaryChapterId ? secondaryPagesByChapter[secondaryChapterId] : undefined;
  const clampedIndex = secondaryPages && mappedIndex != null
    ? clampIndex(mappedIndex, secondaryPages.length)
    : null;

  let imageKey: string | null = null;
  if (renderPlan) {
    if (renderPlan.kind === "single") {
      imageKey = makeSecondarySingleKey(renderPlan.secondaryChapterId, renderPlan.secondaryIndex);
    } else if (renderPlan.kind !== "missing") {
      imageKey = makeSecondaryCompositeKey(renderPlan);
    }
  } else if (secondaryChapterId && clampedIndex != null) {
    imageKey = makeSecondarySingleKey(secondaryChapterId, clampedIndex);
  }

  const handle = imageKey ? secondaryImageUrls.get(imageKey) : undefined;
  const applyAlignment = Boolean(alignment && alignment.confidence >= ALIGNMENT_CONFIDENCE_MIN_DEFAULT);

  let status: MobileDuoSecondaryStatus;
  if (!chapterId || localIndex == null) status = "idle";
  else if (renderPlan?.kind === "missing") status = "missing";
  else if (handle?.image) status = "ready";
  else if (secondaryChapterId) status = "loading";
  else if (chapter.lookupReady) status = "unavailable";
  else status = "notReady";

  return {
    ...chapter,
    status,
    mappedIndex,
    clampedIndex,
    renderPlan,
    alignment,
    applyAlignment,
    secondaryPages,
    imageKey,
    handle,
  };
}

/** 1-based secondary page number for accessibility labels; null when unknown. */
export function mobileDuoSecondaryPageNumber(target: MobileDuoSecondaryTarget): number | null {
  const plan = target.renderPlan;
  if (plan?.kind === "single" || plan?.kind === "split") return plan.secondaryIndex + 1;
  if (plan?.kind === "merge") return plan.secondaryIndices[0] + 1;
  if (plan?.kind === "missing") return null;
  return target.clampedIndex != null ? target.clampedIndex + 1 : null;
}

/**
 * Where to draw the secondary image inside its own pane. With a confident
 * alignment the secondary is placed exactly where the overlay would put it
 * over the primary if the primary were aspect-fit in this pane — so two
 * equal-size panes line up panel for panel. Without one it is aspect-fit
 * (`contain`) and centred, like web's `object-contain` overlay.
 */
export function mobileDuoSecondaryDestRect(input: {
  container: OverlayNaturalSize;
  secondaryNatural: OverlayNaturalSize;
  primaryNatural: OverlayNaturalSize | null;
  alignment: SecondaryAlignment | null;
  applyAlignment: boolean;
}): { rect: { x: number; y: number; width: number; height: number }; aligned: boolean } {
  const { container, secondaryNatural, primaryNatural, alignment, applyAlignment } = input;
  const aligned = applyAlignment && alignment && primaryNatural
    ? computeAlignmentLayout({ container, primaryNatural, secondaryNatural, alignment })
    : null;
  if (aligned) return { rect: alignmentLayoutToDestRect(aligned), aligned: true };
  return { rect: computeContainRect({ container, natural: secondaryNatural }), aligned: false };
}
