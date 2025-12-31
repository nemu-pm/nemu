import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { motion, useSpring } from 'motion/react';
import { useTranslation } from 'react-i18next';
import type { ReaderPluginContext } from '../../types';
import { usePluginCtx } from '../../context';
import { useStores } from '@/data/context';
import type { LocalSourceLink } from '@/data/schema';
import type { SourceInfo } from '@/stores/settings';
import { sortSourcesByOrder } from '@/hooks/use-sorted-sources';
import { formatChapterTitle } from '@/lib/format-chapter';
import { SourceSelector } from '@/components/source-selector';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogHeader,
  ResponsiveDialogFooter,
  ResponsiveDialogTitle,
  ResponsiveDialogDescription,
} from '@/components/ui/responsive-dialog';
import { HugeiconsIcon } from '@hugeicons/react';
import { Copy02Icon } from '@hugeicons/core-free-icons';
import { mapSecondaryChapterForPrimary, resolveSecondaryChapterSelection } from '@/lib/dual-reader/chapters';
import {
  buildSecondaryRenderPlan,
  buildMissingRenderPlan,
  clampIndex,
  getDriftExpectedIndex,
  mapSecondaryPageIndex,
  shouldApplySiblingSplitPlan,
  shouldMarkMissing,
} from '@/lib/dual-reader/pages';
import type { MultiDhash, SecondaryMatch } from '@/lib/dual-reader/hash';
import { findBestSecondaryMatch, updateDriftDelta } from '@/lib/dual-reader/hash';
import { isDualReadDebugEnabled } from '@/lib/dual-reader/debug';
import type { SecondaryRenderPlan } from '@/lib/dual-reader/types';
import { buildAlignmentQueue, getAlignmentPlanSignature } from '@/lib/dual-reader/alignment-scheduler';
import { buildAlignmentOptions } from '@/lib/dual-reader/alignment-options';
import { useDualReadStore, type DualReadFabPosition, type DualReadSide } from './store';
import { useDualReadPluginSettingsStore } from './settings';
import { useDualReadDebugStore, type DualReadDebugSnapshot } from './debug-store';
import type { Chapter, Page } from '@/lib/sources/types';
import {
  clearDualReadWorkerCache,
  computeDualReadAlignmentInWorker,
  computeDualReadHashInWorker,
  getDualReadWorkerPendingCount,
  getDualReadWorkerPendingStats,
} from './dhash-worker-client';
import { getCachedDualReadHash, setCachedDualReadHash, type DualReadHashCacheKey } from './dhash-cache';
import { ALIGNMENT_CONFIDENCE_MIN_DEFAULT, ALIGNMENT_FINE_MAX_DEFAULT } from '@/lib/dual-reader/alignment-constants';

const HOLD_DELAY_MS = 220;
const DRAG_THRESHOLD_PX = 6;
const FAB_SIZE = 48;
const FAB_MARGIN = 12;
const AUTO_ALIGN_WINDOW = 4;
const AUTO_ALIGN_BASE_THRESHOLD = 40;
const AUTO_ALIGN_SOFT_THRESHOLD = 72;
const AUTO_ALIGN_ADAPTIVE_DELTA = 25;
const AUTO_ALIGN_MIN_GAP = 6;
const AUTO_ALIGN_VARIANT_PENALTY = 20;
const AUTO_ALIGN_FULL_THRESHOLD = 20;
const AUTO_ALIGN_DEVIATION_BIAS = 1;
const AUTO_ALIGN_HISTORY_LIMIT = 12;
const AUTO_ALIGN_CENTER_RATIO = 0.7;
const AUTO_ALIGN_SPLIT_MARGIN = 8;
const AUTO_ALIGN_SPLIT_PENALTY = 4;
const AUTO_ALIGN_MERGE_PENALTY = 6;
const AUTO_ALIGN_PRIMARY_SPREAD_THRESHOLD = 24;
const AUTO_ALIGN_SECONDARY_SPREAD_THRESHOLD = 24;
const AUTO_ALIGN_MISSING_DISTANCE = 45;
const AUTO_ALIGN_MISSING_GAP = 10;
const ALIGNMENT_RETRY_MS = 2000;
const ALIGNMENT_MAX_CONCURRENCY = 2;
const ALIGNMENT_VISIBLE_DEBOUNCE_MS = 300;

const loadingSecondaryChapters = new Set<string>();
const loadingSecondaryImages = new Set<string>();

export function resetDualReadLoaders() {
  loadingSecondaryChapters.clear();
  loadingSecondaryImages.clear();
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return Math.round((sorted[mid - 1]! + sorted[mid]!) / 2);
  }
  return sorted[mid]!;
}

type AlignmentLayout = {
  left: number;
  top: number;
  width: number;
  height: number;
  translateX: number;
  translateY: number;
  scale: number;
  clipPath: string;
};

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function DualReadDebugOverlay({ ctx }: { ctx: ReaderPluginContext }) {
  const debugOverlay = useDualReadPluginSettingsStore((s) => s.settings.debugOverlay);
  const setPluginSettings = useDualReadPluginSettingsStore((s) => s.setSettings);
  const snapshot = useDualReadDebugStore((s) => s.snapshot);
  const events = useDualReadDebugStore((s) => s.events);
  const clear = useDualReadDebugStore((s) => s.clear);
  const [collapsed, setCollapsed] = useState(false);
  const [topOffsetPx, setTopOffsetPx] = useState<number>(80);
  const secondaryRenderPlansByChapter = useDualReadStore((s) => s.secondaryRenderPlansByChapter);
  const driftDeltaByChapter = useDualReadStore((s) => s.driftDeltaByChapter);
  const seedPair = useDualReadStore((s) => s.seedPair);
  const primaryChapters = useDualReadStore((s) => s.primaryChapters);
  const secondaryChapters = useDualReadStore((s) => s.secondaryChapters);
  const canRender = debugOverlay && typeof document !== 'undefined';

  useEffect(() => {
    useDualReadDebugStore.getState().setOverlayEnabled(debugOverlay);
    if (!debugOverlay) {
      useDualReadDebugStore.getState().clear();
    }
  }, [debugOverlay]);

  useEffect(() => {
    if (!debugOverlay) return;
    useDualReadDebugStore.getState().updateSnapshot({
      sessionKey: useDualReadStore.getState().sessionKey,
      dualReadEnabled: useDualReadStore.getState().enabled,
      visiblePageIndices: ctx.visiblePageIndices.length > 0 ? ctx.visiblePageIndices : [ctx.currentPageIndex],
    });
  }, [debugOverlay, ctx.currentPageIndex, ctx.visiblePageIndices]);

  const formatTs = (ts: number | null) => {
    if (!ts) return '—';
    try {
      return new Date(ts).toLocaleTimeString();
    } catch {
      return String(ts);
    }
  };

  const visible =
    snapshot.visiblePageIndices.length > 0
      ? snapshot.visiblePageIndices
      : ctx.visiblePageIndices.length > 0
        ? ctx.visiblePageIndices
        : [ctx.currentPageIndex];

  const planStatus = useMemo(() => {
    if (!debugOverlay) return '';
    const parts: string[] = [];
    for (const pageIndex of visible) {
      const meta = ctx.getPageMeta(pageIndex);
      if (!meta || meta.kind !== 'page' || meta.localIndex == null || !meta.chapterId) {
        parts.push(`${pageIndex}:—`);
        continue;
      }
      const plan = secondaryRenderPlansByChapter[meta.chapterId]?.[meta.localIndex];
      if (!plan) {
        parts.push(`${pageIndex}:none`);
        continue;
      }
      const drift = driftDeltaByChapter[meta.chapterId] ?? 0;
      const driftStale = plan.kind === 'missing' ? false : plan.driftDelta !== drift;
      let chapterStale = false;
      if (seedPair) {
        const primaryChapter = primaryChapters.find((c) => c.id === meta.chapterId);
        const expectedSecondaryChapterId =
          primaryChapter && secondaryChapters.length > 0
            ? mapSecondaryChapterForPrimary({
                primaryChapter,
                primaryAll: primaryChapters,
                secondaryAll: secondaryChapters,
                seedPair,
              })
            : null;
        chapterStale = Boolean(expectedSecondaryChapterId && plan.secondaryChapterId !== expectedSecondaryChapterId);
      }
      const flags = `${driftStale ? 'd' : ''}${chapterStale ? 'c' : ''}`;
      parts.push(`${pageIndex}:${plan.kind}${flags ? `(${flags})` : ''}`);
    }
    return parts.join(' · ');
  }, [
    visible,
    ctx,
    secondaryRenderPlansByChapter,
    driftDeltaByChapter,
    seedPair,
    primaryChapters,
    secondaryChapters,
  ]);

  useLayoutEffect(() => {
    if (!debugOverlay) return;
    if (typeof document === 'undefined') return;
    const el = document.querySelector('.reader-ui-panel[data-position="top"]') as HTMLElement | null;

    const update = () => {
      if (!el) {
        setTopOffsetPx(80);
        return;
      }
      const rect = el.getBoundingClientRect();
      // Place below navbar, with a small gap. Clamp to keep it in viewport.
      const next = Math.max(0, Math.round(rect.bottom + 8));
      setTopOffsetPx(next);
    };

    update();

    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined' && el) {
      ro = new ResizeObserver(update);
      ro.observe(el);
    }
    window.addEventListener('resize', update);
    window.visualViewport?.addEventListener('resize', update);
    window.visualViewport?.addEventListener('scroll', update);
    return () => {
      ro?.disconnect();
      window.removeEventListener('resize', update);
      window.visualViewport?.removeEventListener('resize', update);
      window.visualViewport?.removeEventListener('scroll', update);
    };
  }, [debugOverlay]);

  if (!canRender) return null;

  return createPortal(
    <div className="fixed left-2 right-2 z-[99999] pointer-events-none" style={{ top: topOffsetPx }}>
      <div
        className="pointer-events-auto rounded-xl border border-white/10 bg-black/80 text-white shadow-lg backdrop-blur"
        style={{ touchAction: 'pan-y', WebkitUserSelect: 'none' }}
      >
        <div className="flex items-center justify-between gap-2 px-3 py-2">
          <div className="min-w-0">
            <div className="text-[12px] font-semibold leading-tight">Dual Read Debug</div>
            <div className="text-[11px] leading-tight text-white/70">
              session={snapshot.sessionKey ?? '—'} · dualRead={snapshot.dualReadEnabled ? 'on' : 'off'}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="rounded-md px-2 py-1 text-[11px] font-medium text-white/80 hover:bg-white/10"
              onClick={() => setCollapsed((v) => !v)}
            >
              {collapsed ? 'Expand' : 'Minimize'}
            </button>
            <button
              type="button"
              className="rounded-md px-2 py-1 text-[11px] font-medium text-white/80 hover:bg-white/10"
              onClick={() => clear()}
            >
              Clear
            </button>
            <button
              type="button"
              className="rounded-md px-2 py-1 text-[11px] font-medium text-white/80 hover:bg-white/10"
              onClick={() => setPluginSettings({ debugOverlay: false })}
            >
              Hide
            </button>
          </div>
        </div>

        {!collapsed && (
          <div className="px-3 pb-3">
            <div className="mb-2 grid grid-cols-2 gap-2 text-[11px] leading-tight">
              <div className="rounded-lg bg-white/5 px-2 py-1">
                <div className="text-white/70">Visible</div>
                <div className="font-mono">{visible.join(', ')}</div>
                <div className="mt-0.5 font-mono text-[10px] text-white/60 break-words">{planStatus}</div>
              </div>
              <div className="rounded-lg bg-white/5 px-2 py-1">
                <div className="text-white/70">Stable</div>
                <div className="font-mono">
                  {snapshot.stableVisiblePageIndices.length ? snapshot.stableVisiblePageIndices.join(', ') : '—'}
                </div>
              </div>
              <div className="rounded-lg bg-white/5 px-2 py-1">
                <div className="text-white/70">Render plan</div>
                <div className="font-mono">
                  {formatTs(snapshot.lastRenderPlanRunTs)}
                  {snapshot.lastRenderPlanSummary ? ` · ${snapshot.lastRenderPlanSummary}` : ''}
                </div>
              </div>
              <div className="rounded-lg bg-white/5 px-2 py-1">
                <div className="text-white/70">Alignment queue</div>
                <div className="font-mono">
                  {formatTs(snapshot.lastAlignmentQueueTs)} · total={snapshot.alignmentQueueTotal} · stable=
                  {snapshot.alignmentQueueStable} · backfill={snapshot.alignmentQueueBackfill}
                </div>
              </div>
              <div className="rounded-lg bg-white/5 px-2 py-1">
                <div className="text-white/70">In-flight</div>
                <div className="font-mono">
                  pending={snapshot.alignmentPending} · controllers={snapshot.alignmentControllers} · slots=
                  {snapshot.alignmentQueueAvailableSlots}
                </div>
              </div>
              <div className="rounded-lg bg-white/5 px-2 py-1">
                <div className="text-white/70">Run queue (preview)</div>
                <div className="font-mono">
                  {snapshot.alignmentRunQueue.length ? snapshot.alignmentRunQueue.join(', ') : '—'}
                </div>
              </div>
            </div>

            <div className="rounded-lg bg-white/5 px-2 py-2">
              <div className="mb-1 text-[11px] font-semibold text-white/80">Events</div>
              <div className="max-h-[35vh] overflow-auto pr-1">
                <div className="space-y-1">
                  {events
                    .slice()
                    .reverse()
                    .map((e, idx) => (
                      <div key={`${e.ts}:${idx}`} className="text-[11px] leading-tight text-white/80">
                        <span className="font-mono text-white/60">{formatTs(e.ts)}</span>{' '}
                        <span className="font-mono text-white">{e.type}</span>
                        {e.data ? <span className="font-mono text-white/60"> · {safeJson(e.data)}</span> : null}
                      </div>
                    ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}

function computeFitScale(containerW: number, containerH: number, naturalW: number, naturalH: number): number {
  if (containerW <= 0 || containerH <= 0 || naturalW <= 0 || naturalH <= 0) return 1;
  return Math.min(containerW / naturalW, containerH / naturalH);
}

function computeRenderBounds(
  containerW: number,
  containerH: number,
  naturalW: number,
  naturalH: number
): { left: number; top: number; width: number; height: number } {
  const safeW = Math.max(1, containerW);
  const safeH = Math.max(1, containerH);
  const imgW = Math.max(1, naturalW);
  const imgH = Math.max(1, naturalH);
  const imageAspect = imgW / imgH;
  const containerAspect = safeW / safeH;
  let renderWidth: number;
  let renderHeight: number;
  if (imageAspect > containerAspect) {
    renderWidth = safeW;
    renderHeight = safeW / imageAspect;
  } else {
    renderHeight = safeH;
    renderWidth = safeH * imageAspect;
  }
  const renderLeft = (safeW - renderWidth) / 2;
  const renderTop = (safeH - renderHeight) / 2;
  return { left: renderLeft, top: renderTop, width: renderWidth, height: renderHeight };
}

function computeAlignmentDownsampleScale(width: number, height: number, maxSize: number): number {
  const w = Math.max(1, Math.trunc(width));
  const h = Math.max(1, Math.trunc(height));
  const maxDim = Math.max(w, h);
  if (maxDim <= maxSize) return 1;
  return maxSize / maxDim;
}

function getSourceInfo(availableSources: SourceInfo[], link: LocalSourceLink): SourceInfo | undefined {
  return availableSources.find((s) => s.registryId === link.registryId && s.id === link.sourceId);
}

function makeSourceKey(link: LocalSourceLink): string {
  return `${link.registryId}:${link.sourceId}:${link.sourceMangaId}`;
}

function pickDefaultSecondary(
  primary: LocalSourceLink | null,
  candidates: LocalSourceLink[],
  availableSources: SourceInfo[]
): LocalSourceLink | null {
  if (!primary || candidates.length === 0) return null;
  const primaryInfo = getSourceInfo(availableSources, primary);
  const primaryLangs = new Set(primaryInfo?.languages ?? []);
  if (primaryLangs.size > 0) {
    const diffLang = candidates.find((c) => {
      const info = getSourceInfo(availableSources, c);
      const langs = info?.languages ?? [];
      return langs.length > 0 && !langs.some((l) => primaryLangs.has(l));
    });
    if (diffLang) return diffLang;
  }
  return candidates[0] ?? null;
}

function useLinkedSources(ctx: ReaderPluginContext) {
  const { useLibraryStore, useSettingsStore } = useStores();
  const entries = useLibraryStore((s) => s.entries);
  const availableSources = useSettingsStore((s) => s.availableSources);

  const entry = useMemo(() => {
    return entries.find((e) =>
      e.sources.some(
        (s) =>
          s.registryId === ctx.registryId &&
          s.sourceId === ctx.sourceId &&
          s.sourceMangaId === ctx.mangaId
      )
    );
  }, [entries, ctx.registryId, ctx.sourceId, ctx.mangaId]);

  const sortedSources = useMemo(() => {
    if (!entry) return [];
    return sortSourcesByOrder(entry.sources, entry.item.sourceOrder);
  }, [entry]);

  const primaryLink = useMemo(() => {
    if (!sortedSources.length) return null;
    return (
      sortedSources.find(
        (s) =>
          s.registryId === ctx.registryId &&
          s.sourceId === ctx.sourceId &&
          s.sourceMangaId === ctx.mangaId
      ) ?? sortedSources[0]!
    );
  }, [sortedSources, ctx.registryId, ctx.sourceId, ctx.mangaId]);

  const candidates = useMemo(() => {
    if (!primaryLink) return [];
    // Filter out primary source and any other links to the same source (same registryId + sourceId)
    return sortedSources.filter(
      (s) =>
        s.id !== primaryLink.id &&
        !(s.registryId === primaryLink.registryId && s.sourceId === primaryLink.sourceId)
    );
  }, [sortedSources, primaryLink]);

  return { entry, primaryLink, candidates, availableSources };
}

function SourceLabel({ link, info }: { link: LocalSourceLink; info?: SourceInfo }) {
  const lang = info?.languages?.[0]?.toUpperCase();
  return (
    <span className="flex items-center gap-2 min-w-0">
      {info?.icon && <img src={info.icon} alt="" className="size-4 rounded-sm object-cover" />}
      <span className="text-xs font-medium truncate max-w-[120px]">
        {info?.name ?? link.sourceId}
      </span>
      {lang && (
        <Badge variant="secondary" className="text-[10px] px-1.5 py-0.5">
          {lang}
        </Badge>
      )}
    </span>
  );
}

async function ensureSecondaryPages(
  getSource: (registryId: string, sourceId: string) => Promise<any>,
  secondarySource: LocalSourceLink,
  chapterId: string
): Promise<Page[] | null> {
  const state = useDualReadStore.getState();
  const existing = state.secondaryPagesByChapter[chapterId];
  if (existing) return existing;

  if (loadingSecondaryChapters.has(chapterId)) return null;
  loadingSecondaryChapters.add(chapterId);
  try {
    const source = await getSource(secondarySource.registryId, secondarySource.sourceId);
    if (!source) return null;
    const pages = await source.getPages(secondarySource.sourceMangaId, chapterId);
    useDualReadStore.getState().setSecondaryPages(chapterId, pages);
    return pages;
  } catch (err) {
    console.error('[DualRead] Failed to load secondary pages', err);
    return null;
  } finally {
    loadingSecondaryChapters.delete(chapterId);
  }
}

async function ensureSecondaryImage(
  getSource: (registryId: string, sourceId: string) => Promise<any>,
  secondarySource: LocalSourceLink,
  chapterId: string,
  pageIndex: number
) {
  const initialState = useDualReadStore.getState();
  const existingPages = initialState.secondaryPagesByChapter[chapterId];
  const pages =
    existingPages ?? (await ensureSecondaryPages(getSource, secondarySource, chapterId));
  if (!pages || pages.length === 0) return;

  const clampedIndex = clampIndex(pageIndex, pages.length);
  const key = `${chapterId}:${clampedIndex}`;

  const latestState = useDualReadStore.getState();
  if (latestState.secondaryImageUrls.has(key)) return;
  if (loadingSecondaryImages.has(key)) return;

  loadingSecondaryImages.add(key);
  try {
    const page = pages[clampedIndex];
    if (!page) return;
    const blob = await page.getImage();
    const url = URL.createObjectURL(blob);
    useDualReadStore.getState().setSecondaryImageUrl(key, url);
  } catch (err) {
    console.error('[DualRead] Failed to load secondary image', err);
  } finally {
    loadingSecondaryImages.delete(key);
  }
}

async function decodeImageBlob(blob: Blob): Promise<{ image: CanvasImageSource; width: number; height: number; close?: () => void }> {
  if (typeof createImageBitmap === 'function') {
    const bitmap = await createImageBitmap(blob);
    return { image: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() };
  }
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    const loaded = new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('Failed to load image'));
    });
    img.src = url;
    if ('decode' in img) {
      try {
        await img.decode();
      } catch {
        await loaded;
      }
    } else {
      await loaded;
    }
    return { image: img, width: img.naturalWidth || img.width, height: img.naturalHeight || img.height };
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function canvasToBlob(canvas: HTMLCanvasElement, type = 'image/jpeg', quality = 0.92): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Failed to encode image'));
    }, type, quality);
  });
}

async function renderSplitBlob(blob: Blob, side: 'left' | 'right'): Promise<Blob> {
  const decoded = await decodeImageBlob(blob);
  const leftWidth = Math.floor(decoded.width / 2);
  const rightWidth = Math.max(1, decoded.width - leftWidth);
  const cropWidth = side === 'left' ? leftWidth : rightWidth;
  const sx = side === 'left' ? 0 : decoded.width - cropWidth;
  const canvas = document.createElement('canvas');
  canvas.width = cropWidth;
  canvas.height = decoded.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Failed to create canvas context');
  ctx.drawImage(decoded.image, sx, 0, cropWidth, decoded.height, 0, 0, cropWidth, decoded.height);
  decoded.close?.();
  return canvasToBlob(canvas);
}

async function renderMergeBlob(
  leftBlob: Blob,
  rightBlob: Blob,
  order: 'normal' | 'swap'
): Promise<Blob> {
  const leftDecoded = await decodeImageBlob(leftBlob);
  const rightDecoded = await decodeImageBlob(rightBlob);
  const left = order === 'normal' ? leftDecoded : rightDecoded;
  const right = order === 'normal' ? rightDecoded : leftDecoded;
  const targetHeight = Math.max(left.height, right.height);
  const leftScale = targetHeight / left.height;
  const rightScale = targetHeight / right.height;
  const leftWidth = Math.max(1, Math.round(left.width * leftScale));
  const rightWidth = Math.max(1, Math.round(right.width * rightScale));
  const canvas = document.createElement('canvas');
  canvas.width = leftWidth + rightWidth;
  canvas.height = targetHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Failed to create canvas context');
  ctx.drawImage(left.image, 0, 0, leftWidth, targetHeight);
  ctx.drawImage(right.image, leftWidth, 0, rightWidth, targetHeight);
  leftDecoded.close?.();
  rightDecoded.close?.();
  return canvasToBlob(canvas);
}

function makeCompositeKey(plan: SecondaryRenderPlan): string {
  if (plan.kind === 'split') {
    return `split:${plan.secondaryChapterId}:${plan.secondaryIndex}:${plan.side}`;
  }
  if (plan.kind === 'merge') {
    return `merge:${plan.secondaryChapterId}:${plan.secondaryIndices[0]}:${plan.secondaryIndices[1]}:${plan.order}`;
  }
  // Should be unreachable: composites are only split/merge.
  return `invalid:${plan.secondaryChapterId}`;
}

async function ensureSecondaryCompositeImage(
  getSource: (registryId: string, sourceId: string) => Promise<any>,
  secondarySource: LocalSourceLink,
  plan: SecondaryRenderPlan
) {
  if (plan.kind === 'single' || plan.kind === 'missing') return;
  const state = useDualReadStore.getState();
  const key = makeCompositeKey(plan);
  if (state.secondaryImageUrls.has(key)) return;
  if (loadingSecondaryImages.has(key)) return;

  loadingSecondaryImages.add(key);
  try {
    const pages =
      state.secondaryPagesByChapter[plan.secondaryChapterId] ??
      (await ensureSecondaryPages(getSource, secondarySource, plan.secondaryChapterId));
    if (!pages || pages.length === 0) return;

    if (plan.kind === 'split') {
      const page = pages[plan.secondaryIndex];
      if (!page) return;
      const blob = await page.getImage();
      const outBlob = await renderSplitBlob(blob, plan.side);
      const url = URL.createObjectURL(outBlob);
      useDualReadStore.getState().setSecondaryImageUrl(key, url);
      return;
    }

    const [aIndex, bIndex] = plan.secondaryIndices;
    const pageA = pages[aIndex];
    const pageB = pages[bIndex];
    if (!pageA || !pageB) return;
    const [blobA, blobB] = await Promise.all([pageA.getImage(), pageB.getImage()]);
    const outBlob = await renderMergeBlob(blobA, blobB, plan.order);
    const url = URL.createObjectURL(outBlob);
    useDualReadStore.getState().setSecondaryImageUrl(key, url);
  } catch (err) {
    console.error('[DualRead] Failed to build secondary composite image', err);
  } finally {
    loadingSecondaryImages.delete(key);
  }
}

export function DualReadPopoverContent() {
  const ctx = usePluginCtx();
  const { t } = useTranslation();
  const tr = useCallback((key: string, options?: Record<string, unknown>) => {
    return t(`plugin.dualRead.${key}`, options);
  }, [t]);
  const enabled = useDualReadStore((s) => s.enabled);
  const activeSide = useDualReadStore((s) => s.activeSide);
  const seedPair = useDualReadStore((s) => s.seedPair);
  const primaryChapters = useDualReadStore((s) => s.primaryChapters);
  const secondaryChapters = useDualReadStore((s) => s.secondaryChapters);
  const secondarySource = useDualReadStore((s) => s.secondarySource);
  const setActiveSide = useDualReadStore((s) => s.setActiveSide);
  const setPopoverOpen = useDualReadStore((s) => s.setPopoverOpen);
  const setConfigOpen = useDualReadStore((s) => s.setConfigOpen);

  const { primaryLink, candidates, availableSources } = useLinkedSources(ctx);

  const primaryInfo = useMemo(() => (primaryLink ? getSourceInfo(availableSources, primaryLink) : undefined), [
    availableSources,
    primaryLink,
  ]);
  const secondaryInfo = useMemo(
    () => (secondarySource ? getSourceInfo(availableSources, secondarySource) : undefined),
    [availableSources, secondarySource]
  );

  const primaryChapter = useMemo(
    () => primaryChapters.find((c) => c.id === ctx.chapterId),
    [primaryChapters, ctx.chapterId]
  );
  const secondaryChapterId = useMemo(() => {
    if (!primaryChapter || !secondaryChapters.length || !seedPair) return null;
    return mapSecondaryChapterForPrimary({
      primaryChapter,
      primaryAll: primaryChapters,
      secondaryAll: secondaryChapters,
      seedPair,
    });
  }, [primaryChapter, primaryChapters, secondaryChapters, seedPair]);
  const secondaryChapter = useMemo(
    () => secondaryChapters.find((c) => c.id === secondaryChapterId),
    [secondaryChapters, secondaryChapterId]
  );
  const statusReady = Boolean(primaryChapter && seedPair && secondaryChapters.length > 0);

  const handleConfig = useCallback(() => {
    setPopoverOpen(false);
    setConfigOpen(true);
  }, [setPopoverOpen, setConfigOpen]);

  if (!primaryLink) {
    return <div className="min-w-[220px] text-xs reader-ui-text-secondary">{tr('popover.noLinkedSources')}</div>;
  }

  if (!enabled) {
    return (
      <div className="min-w-[240px] space-y-2">
        <div className="text-xs reader-ui-text-secondary">{tr('popover.linkSecondary')}</div>
        <Button size="sm" onClick={handleConfig} disabled={candidates.length === 0}>
          {tr('popover.actionLabel')}
        </Button>
      </div>
    );
  }

  return (
    <div className="min-w-[260px] space-y-3">
      <Tabs
        value={activeSide}
        onValueChange={(value) => setActiveSide(value as DualReadSide)}
      >
        <TabsList className="reader-ui-tabs-list w-full">
          <TabsTrigger value="primary" className="reader-ui-tab flex-1">
            {primaryLink && <SourceLabel link={primaryLink} info={primaryInfo} />}
          </TabsTrigger>
          <TabsTrigger value="secondary" className="reader-ui-tab flex-1">
            {secondarySource ? (
              <SourceLabel link={secondarySource} info={secondaryInfo} />
            ) : (
              <span className="text-xs font-medium">{tr('popover.secondaryLabel')}</span>
            )}
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="flex items-center justify-between gap-2">
        <Button size="sm" variant="secondary" onClick={handleConfig}>
          {tr('popover.actionLabel')}
        </Button>
        <div className="text-xs reader-ui-text-muted">
          {primaryChapter ? formatChapterTitle(primaryChapter) : tr('popover.chapterLabel')}
        </div>
      </div>

      <div className="text-xs reader-ui-text-secondary">
        {statusReady ? (
          secondaryChapter ? (
            <span>
              {tr('popover.chapterPair', {
                primary: primaryChapter ? formatChapterTitle(primaryChapter) : '-',
                secondary: formatChapterTitle(secondaryChapter),
              })}
            </span>
          ) : (
            <span className="text-amber-500">{tr('popover.unpaired')}</span>
          )
        ) : (
          <span>{tr('popover.loadingPairing')}</span>
        )}
      </div>
    </div>
  );
}

function DualReadConfigDialog({ ctx }: { ctx: ReaderPluginContext }) {
  const { t } = useTranslation();
  const tr = useCallback((key: string, options?: Record<string, unknown>) => {
    return t(`plugin.dualRead.${key}`, options);
  }, [t]);

  const { useSettingsStore } = useStores();
  const getSource = useSettingsStore((s) => s.getSource);

  const configOpen = useDualReadStore((s) => s.configOpen);
  const setConfigOpen = useDualReadStore((s) => s.setConfigOpen);
  const enabled = useDualReadStore((s) => s.enabled);
  const secondarySource = useDualReadStore((s) => s.secondarySource);
  const seedPair = useDualReadStore((s) => s.seedPair);
  const primaryChapters = useDualReadStore((s) => s.primaryChapters);
  const storedSecondaryChapters = useDualReadStore((s) => s.secondaryChapters);
  const setPrimaryChapters = useDualReadStore((s) => s.setPrimaryChapters);
  const enable = useDualReadStore((s) => s.enable);
  const disable = useDualReadStore((s) => s.disable);
  const clearSecondaryCache = useDualReadStore((s) => s.clearSecondaryCache);

  const { primaryLink, candidates, availableSources } = useLinkedSources(ctx);

  const [selectedSecondaryId, setSelectedSecondaryId] = useState<string | null>(null);
  const [selectedSecondaryChapterId, setSelectedSecondaryChapterId] = useState<string | null>(null);
  const [secondaryChapters, setSecondaryChapters] = useState<Chapter[]>([]);
  const [loadingPrimary, setLoadingPrimary] = useState(false);
  const [loadingSecondary, setLoadingSecondary] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const defaultSecondary = useMemo(
    () => pickDefaultSecondary(primaryLink, candidates, availableSources),
    [primaryLink, candidates, availableSources]
  );

  const selectedSecondary = useMemo(() => {
    if (selectedSecondaryId) {
      return candidates.find((c) => c.id === selectedSecondaryId) ?? defaultSecondary ?? null;
    }
    if (secondarySource) {
      return candidates.find((c) => c.id === secondarySource.id) ?? defaultSecondary ?? null;
    }
    return defaultSecondary ?? null;
  }, [selectedSecondaryId, candidates, defaultSecondary, secondarySource]);

  const selectedSecondaryIndex = useMemo(() => {
    if (!selectedSecondary) return 0;
    const idx = candidates.findIndex((c) => c.id === selectedSecondary.id);
    return idx >= 0 ? idx : 0;
  }, [candidates, selectedSecondary]);

  const currentPrimaryChapter = useMemo(
    () => primaryChapters.find((c) => c.id === ctx.chapterId),
    [primaryChapters, ctx.chapterId]
  );

  const secondaryChapterLabelById = useMemo(() => {
    const map = new Map<string, string>();
    for (const chapter of secondaryChapters) {
      map.set(chapter.id, formatChapterTitle(chapter));
    }
    return map;
  }, [secondaryChapters]);

  const openStateRef = useRef(false);
  useEffect(() => {
    if (!configOpen) {
      openStateRef.current = false;
      // Reset refs when dialog closes so next open reloads chapters
      secondaryKeyRef.current = null;
      return;
    }
    if (openStateRef.current) return;
    openStateRef.current = true;
    setError(null);
    setSelectedSecondaryId(secondarySource?.id ?? defaultSecondary?.id ?? null);
    setSelectedSecondaryChapterId(seedPair?.secondaryId ?? null);
    if (secondarySource && storedSecondaryChapters.length > 0) {
      setSecondaryChapters(storedSecondaryChapters);
    } else {
      setSecondaryChapters([]);
    }
  }, [configOpen, secondarySource, defaultSecondary, seedPair, storedSecondaryChapters]);

  const primaryKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!configOpen || !primaryLink) return;
    const key = makeSourceKey(primaryLink);
    if (primaryKeyRef.current === key && primaryChapters.length > 0) return;
    let cancelled = false;
    primaryKeyRef.current = key;
    setLoadingPrimary(true);
    setError(null);
    (async () => {
      try {
        const source = await getSource(primaryLink.registryId, primaryLink.sourceId);
        if (!source) throw new Error('Primary source unavailable');
        const chapters = await source.getChapters(primaryLink.sourceMangaId);
        if (!cancelled) setPrimaryChapters(chapters);
      } catch (_err) {
        if (!cancelled) setError(tr('errors.primaryUnavailable'));
      } finally {
        if (!cancelled) setLoadingPrimary(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [configOpen, primaryLink, getSource, primaryChapters.length, setPrimaryChapters, tr]);

  const secondaryKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!configOpen) return;
    if (!selectedSecondary) {
      setSecondaryChapters([]);
      setLoadingSecondary(false);
      return;
    }
    const key = makeSourceKey(selectedSecondary);
    if (secondaryKeyRef.current === key) {
      // Already loading/loaded for this source
      return;
    }
    secondaryKeyRef.current = key;
    setSelectedSecondaryChapterId(null);
    setSecondaryChapters([]);
    setLoadingSecondary(true);
    setError(null);

    if (secondarySource?.id === selectedSecondary.id && storedSecondaryChapters.length > 0) {
      setSecondaryChapters(storedSecondaryChapters);
      setLoadingSecondary(false);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const source = await getSource(selectedSecondary.registryId, selectedSecondary.sourceId);
        if (!source) throw new Error('Secondary source unavailable');
        const chapters = await source.getChapters(selectedSecondary.sourceMangaId);
        if (!cancelled) setSecondaryChapters(chapters);
      } catch (_err) {
        if (!cancelled) setError(tr('errors.secondaryUnavailable'));
      } finally {
        if (!cancelled) setLoadingSecondary(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    configOpen,
    selectedSecondary,
    secondarySource,
    storedSecondaryChapters,
    getSource,
    tr,
  ]);

  useEffect(() => {
    if (!configOpen) return;
    if (!primaryChapters.length || !secondaryChapters.length) return;
    const nextSelection = resolveSecondaryChapterSelection({
      selectedId: selectedSecondaryChapterId,
      primaryChapter: currentPrimaryChapter,
      primaryAll: primaryChapters,
      secondaryAll: secondaryChapters,
      seedPair: seedPair ?? undefined,
    });
    if (nextSelection !== selectedSecondaryChapterId) {
      setSelectedSecondaryChapterId(nextSelection);
    }
  }, [
    configOpen,
    primaryChapters,
    secondaryChapters,
    currentPrimaryChapter,
    seedPair,
    selectedSecondaryChapterId,
  ]);

  const isSecondaryChapterValid = useMemo(() => {
    if (!selectedSecondaryChapterId) return false;
    return secondaryChapters.some((chapter) => chapter.id === selectedSecondaryChapterId);
  }, [secondaryChapters, selectedSecondaryChapterId]);

  const handleConfirm = useCallback(() => {
    if (!primaryLink || !selectedSecondary || !selectedSecondaryChapterId) return;
    if (!isSecondaryChapterValid) return;
    if (!currentPrimaryChapter) return;
    if (!secondarySource || secondarySource.id !== selectedSecondary.id) {
      clearSecondaryCache();
    }
    enable({
      secondarySource: selectedSecondary,
      seedPair: { primaryId: ctx.chapterId, secondaryId: selectedSecondaryChapterId },
      primaryChapters,
      secondaryChapters,
    });
    setConfigOpen(false);
  }, [
    primaryLink,
    selectedSecondary,
    selectedSecondaryChapterId,
    isSecondaryChapterValid,
    currentPrimaryChapter,
    secondarySource,
    clearSecondaryCache,
    enable,
    primaryChapters,
    secondaryChapters,
    ctx.chapterId,
    setConfigOpen,
  ]);

  const handleDisable = useCallback(() => {
    disable();
    setConfigOpen(false);
  }, [disable, setConfigOpen]);

  const handleClose = useCallback(() => {
    setConfigOpen(false);
  }, [setConfigOpen]);

  if (!primaryLink || candidates.length === 0) {
    return (
      <ResponsiveDialog open={configOpen} onOpenChange={setConfigOpen}>
        <ResponsiveDialogContent className="sm:max-w-md" showCloseButton={false}>
          <ResponsiveDialogHeader>
            <ResponsiveDialogTitle>{tr('dialog.title')}</ResponsiveDialogTitle>
          </ResponsiveDialogHeader>
          <div className="space-y-3">
            <div className="text-sm">{tr('dialog.noLinkedSources')}</div>
            <div className="flex justify-end">
              <Button variant="secondary" size="sm" onClick={handleClose}>
                {tr('dialog.close')}
              </Button>
            </div>
          </div>
        </ResponsiveDialogContent>
      </ResponsiveDialog>
    );
  }

  return (
    <ResponsiveDialog open={configOpen} onOpenChange={setConfigOpen}>
      <ResponsiveDialogContent className="sm:max-w-md" showCloseButton={false}>
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>{tr('dialog.title')}</ResponsiveDialogTitle>
          <ResponsiveDialogDescription>{tr('dialog.description')}</ResponsiveDialogDescription>
        </ResponsiveDialogHeader>

        <div className="space-y-4 min-w-0">
          <div className="space-y-2 min-w-0">
            <div className="text-xs text-muted-foreground">{tr('dialog.secondarySource')}</div>
            <div className="overflow-hidden min-w-0">
              <SourceSelector
                sources={candidates}
                selectedIndex={selectedSecondaryIndex}
                onSelect={(idx) => {
                  const next = candidates[idx];
                  if (!next) return;
                  setSelectedSecondaryId(next.id);
                }}
                getSourceInfo={(link) => getSourceInfo(availableSources, link)}
                getChapterCount={(link) => {
                  const info = getSourceInfo(availableSources, link);
                  const lang = info?.languages?.[0];
                  return lang ? lang.toUpperCase() : undefined;
                }}
                hasUpdate={() => false}
              />
            </div>
          </div>

          <div className="space-y-2">
            <div className="text-xs text-muted-foreground">{tr('dialog.primaryChapter')}</div>
            <div className="text-sm">
              {loadingPrimary
                ? tr('dialog.loadingPrimary')
                : currentPrimaryChapter
                  ? formatChapterTitle(currentPrimaryChapter)
                  : '-'}
            </div>
          </div>

          <div className="space-y-2">
            <div className="text-xs text-muted-foreground">{tr('dialog.secondaryChapter')}</div>
            {loadingSecondary ? (
              <div className="flex items-center gap-2 text-sm">
                <Spinner className="size-4" />
                {tr('dialog.loadingChapters')}
              </div>
            ) : (
              <Select
                value={selectedSecondaryChapterId ?? ''}
                onValueChange={(value) => setSelectedSecondaryChapterId(value)}
                itemToStringLabel={(value) => secondaryChapterLabelById.get(String(value)) ?? String(value)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={tr('dialog.chooseChapter')} />
                </SelectTrigger>
                <SelectContent>
                  {secondaryChapters.map((chapter) => (
                    <SelectItem key={chapter.id} value={chapter.id}>
                      {formatChapterTitle(chapter)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {error && <div className="text-xs text-red-500">{error}</div>}
        </div>

        <ResponsiveDialogFooter>
          {enabled && (
            <Button variant="outline" size="sm" onClick={handleDisable}>
              {tr('dialog.disable')}
            </Button>
          )}
          <Button variant="secondary" size="sm" onClick={handleClose}>
            {tr('dialog.cancel')}
          </Button>
          <Button
            size="sm"
            onClick={handleConfirm}
            disabled={
              !selectedSecondary ||
              !isSecondaryChapterValid ||
              !currentPrimaryChapter ||
              loadingPrimary ||
              loadingSecondary
            }
          >
            {enabled ? tr('dialog.save') : tr('dialog.enable')}
          </Button>
        </ResponsiveDialogFooter>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}

function DualReadSessionManager({ ctx }: { ctx: ReaderPluginContext }) {
  const enabled = useDualReadStore((s) => s.enabled);
  const secondarySource = useDualReadStore((s) => s.secondarySource);
  const seedPair = useDualReadStore((s) => s.seedPair);
  const primaryChapters = useDualReadStore((s) => s.primaryChapters);
  const secondaryChapters = useDualReadStore((s) => s.secondaryChapters);
  const setPrimaryChapters = useDualReadStore((s) => s.setPrimaryChapters);
  const setSecondaryChapters = useDualReadStore((s) => s.setSecondaryChapters);
  const clearSecondaryCache = useDualReadStore((s) => s.clearSecondaryCache);
  const disable = useDualReadStore((s) => s.disable);
  const configOpen = useDualReadStore((s) => s.configOpen);
  const setConfigOpen = useDualReadStore((s) => s.setConfigOpen);

  const { useSettingsStore } = useStores();
  const getSource = useSettingsStore((s) => s.getSource);

  const { primaryLink, candidates } = useLinkedSources(ctx);

  const secondaryKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    if (!primaryLink) {
      disable();
      return;
    }
    if (primaryChapters.length > 0) return;
    let cancelled = false;
    (async () => {
      try {
        const source = await getSource(ctx.registryId, ctx.sourceId);
        if (!source) {
          if (!cancelled) disable();
          return;
        }
        const chapters = await source.getChapters(ctx.mangaId);
        if (!cancelled) setPrimaryChapters(chapters);
      } catch (err) {
        console.error('[DualRead] Failed to load primary chapters', err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    enabled,
    primaryLink,
    primaryChapters.length,
    getSource,
    ctx.registryId,
    ctx.sourceId,
    ctx.mangaId,
    setPrimaryChapters,
    disable,
  ]);

  useEffect(() => {
    if (!enabled || !secondarySource) return;
    if (!candidates.some((link) => link.id === secondarySource.id)) {
      disable();
      return;
    }
    const key = makeSourceKey(secondarySource);
    if (secondaryKeyRef.current && secondaryKeyRef.current !== key) {
      clearSecondaryCache();
      setSecondaryChapters([]);
    }
    secondaryKeyRef.current = key;
    if (secondaryChapters.length > 0) return;
    let cancelled = false;
    (async () => {
      try {
        const source = await getSource(secondarySource.registryId, secondarySource.sourceId);
        if (!source) {
          if (!cancelled) disable();
          return;
        }
        const chapters = await source.getChapters(secondarySource.sourceMangaId);
        if (!cancelled) setSecondaryChapters(chapters);
      } catch (err) {
        console.error('[DualRead] Failed to load secondary chapters', err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    enabled,
    secondarySource,
    secondaryChapters.length,
    getSource,
    clearSecondaryCache,
    setSecondaryChapters,
    disable,
    candidates,
  ]);

  useEffect(() => {
    if (!enabled || !secondarySource || !seedPair) return;
    if (secondaryChapters.length === 0) return;
    const hasSeed = secondaryChapters.some((chapter) => chapter.id === seedPair.secondaryId);
    if (!hasSeed && !configOpen) {
      setConfigOpen(true);
    }
  }, [enabled, secondarySource, seedPair, secondaryChapters, configOpen, setConfigOpen]);

  return null;
}

function DualReadAutoAligner({ ctx }: { ctx: ReaderPluginContext }) {
  const enabled = useDualReadStore((s) => s.enabled);
  const seedPair = useDualReadStore((s) => s.seedPair);
  const driftDeltaByChapter = useDualReadStore((s) => s.driftDeltaByChapter);
  const primaryChapters = useDualReadStore((s) => s.primaryChapters);
  const secondaryChapters = useDualReadStore((s) => s.secondaryChapters);
  const secondarySource = useDualReadStore((s) => s.secondarySource);
  const secondaryPagesByChapter = useDualReadStore((s) => s.secondaryPagesByChapter);
  const secondaryRenderPlansByChapter = useDualReadStore((s) => s.secondaryRenderPlansByChapter);
  const secondaryAlignmentByChapter = useDualReadStore((s) => s.secondaryAlignmentByChapter);
  const setDriftDelta = useDualReadStore((s) => s.setDriftDelta);
  const setSecondaryRenderPlan = useDualReadStore((s) => s.setSecondaryRenderPlan);
  const setSecondaryAlignment = useDualReadStore((s) => s.setSecondaryAlignment);
  const sessionKey = useDualReadStore((s) => s.sessionKey);

  const { useSettingsStore } = useStores();
  const getSource = useSettingsStore((s) => s.getSource);

  const primaryHashCacheRef = useRef(new Map<string, MultiDhash>());
  const secondaryHashCacheRef = useRef(new Map<string, MultiDhash>());
  const pendingPrimaryRef = useRef(new Map<string, Promise<MultiDhash>>());
  const pendingSecondaryRef = useRef(new Map<string, Promise<MultiDhash>>());
  const acceptedDistancesRef = useRef(new Map<string, number[]>());
  const lastRunRef = useRef<string | null>(null);
  const lastSkipRef = useRef<string | null>(null);
  const alignmentQueueLogRef = useRef<string | null>(null);
  const inFlightRef = useRef(new Set<string>());
  const sampleCacheRef = useRef(new Set<string>());
  const pendingAlignmentRef = useRef(new Set<string>());
  const alignmentAbortRef = useRef(new Map<string, AbortController>());
  const alignmentKeyToGlobalIndexRef = useRef(new Map<string, number>());
  const alignmentAttemptRef = useRef(new Map<string, { signature: string; timestamp: number; count: number }>());
  const [alignmentQueueTick, setAlignmentQueueTick] = useState(0);
  const [stableVisiblePageIndices, setStableVisiblePageIndices] = useState<number[]>([]);
  const visibleDebounceTimersRef = useRef(new Map<number, ReturnType<typeof setTimeout>>());
  const rawVisibleSetRef = useRef(new Set<number>());
  const stableVisibleSetRef = useRef(new Set<number>());
  const secondaryKey = secondarySource ? makeSourceKey(secondarySource) : null;

  const logDebug = useCallback((label: string, data?: Record<string, unknown>) => {
    if (!isDualReadDebugEnabled()) return;
    console.debug(`[DualRead] autoAlign ${label}`, data ?? {});
  }, []);

  const debugOverlayEnabled = useCallback(() => {
    return useDualReadPluginSettingsStore.getState().settings.debugOverlay;
  }, []);

  const pushDebugEvent = useCallback(
    (type: string, data?: Record<string, unknown>) => {
      if (!debugOverlayEnabled()) return;
      useDualReadDebugStore.getState().pushEvent(type, data);
    },
    [debugOverlayEnabled]
  );

  const updateDebugSnapshot = useCallback(
    (partial: Partial<DualReadDebugSnapshot>) => {
      if (!debugOverlayEnabled()) return;
      useDualReadDebugStore.getState().updateSnapshot(partial);
    },
    [debugOverlayEnabled]
  );

  const bumpAlignmentQueue = useCallback(() => {
    setAlignmentQueueTick((value) => value + 1);
  }, []);

  useEffect(() => {
    primaryHashCacheRef.current.clear();
    secondaryHashCacheRef.current.clear();
    pendingPrimaryRef.current.clear();
    pendingSecondaryRef.current.clear();
    acceptedDistancesRef.current.clear();
    lastRunRef.current = null;
    inFlightRef.current.clear();
    sampleCacheRef.current.clear();
    pendingAlignmentRef.current.clear();
    alignmentAttemptRef.current.clear();
    alignmentAbortRef.current.forEach((controller) => controller.abort());
    alignmentAbortRef.current.clear();
    alignmentKeyToGlobalIndexRef.current.clear();
    visibleDebounceTimersRef.current.forEach((id) => clearTimeout(id));
    visibleDebounceTimersRef.current.clear();
    rawVisibleSetRef.current.clear();
    stableVisibleSetRef.current.clear();
    setStableVisiblePageIndices([]);
    clearDualReadWorkerCache();

    // Reset debug snapshot on new session / secondary source change.
    if (debugOverlayEnabled()) {
      useDualReadDebugStore.getState().updateSnapshot({
        sessionKey,
        dualReadEnabled: useDualReadStore.getState().enabled,
        visiblePageIndices: [],
        stableVisiblePageIndices: [],
        lastRenderPlanRunTs: null,
        lastRenderPlanSummary: null,
        lastAlignmentQueueTs: null,
        alignmentQueueTotal: 0,
        alignmentQueueStable: 0,
        alignmentQueueBackfill: 0,
        alignmentQueueAvailableSlots: 0,
        alignmentPending: 0,
        alignmentControllers: 0,
        alignmentRunQueue: [],
      });
      useDualReadDebugStore.getState().pushEvent('session_reset', { sessionKey, secondaryKey });
    }
  }, [sessionKey, secondaryKey]);

  useEffect(() => {
    if (!enabled) {
      visibleDebounceTimersRef.current.forEach((id) => clearTimeout(id));
      visibleDebounceTimersRef.current.clear();
      rawVisibleSetRef.current.clear();
      stableVisibleSetRef.current.clear();
      setStableVisiblePageIndices([]);
      return;
    }

    const rawVisible = ctx.visiblePageIndices.length > 0 ? ctx.visiblePageIndices : [ctx.currentPageIndex];
    const rawSet = new Set(rawVisible);
    rawVisibleSetRef.current = rawSet;

    // Cancel timers and evict stable pages that are no longer visible.
    let changed = false;
    visibleDebounceTimersRef.current.forEach((timerId, pageIndex) => {
      if (rawSet.has(pageIndex)) return;
      clearTimeout(timerId);
      visibleDebounceTimersRef.current.delete(pageIndex);
    });
    stableVisibleSetRef.current.forEach((pageIndex) => {
      if (rawSet.has(pageIndex)) return;
      stableVisibleSetRef.current.delete(pageIndex);
      changed = true;
    });

    // Debounce: only mark a page as stable-visible after it stays visible for N ms.
    for (const pageIndex of rawSet) {
      if (stableVisibleSetRef.current.has(pageIndex)) continue;
      if (visibleDebounceTimersRef.current.has(pageIndex)) continue;
      const timerId = setTimeout(() => {
        visibleDebounceTimersRef.current.delete(pageIndex);
        if (!rawVisibleSetRef.current.has(pageIndex)) return;
        if (stableVisibleSetRef.current.has(pageIndex)) return;
        stableVisibleSetRef.current.add(pageIndex);
        setStableVisiblePageIndices(Array.from(stableVisibleSetRef.current).sort((a, b) => a - b));
      }, ALIGNMENT_VISIBLE_DEBOUNCE_MS);
      visibleDebounceTimersRef.current.set(pageIndex, timerId);
    }

    if (changed) {
      setStableVisiblePageIndices(Array.from(stableVisibleSetRef.current).sort((a, b) => a - b));
    }

    // Abort in-flight alignment work for pages that are no longer visible.
    // This prevents the worker queue from spending time on off-screen pages while the user scrolls.
    const aborted: Array<{ key: string; globalIndex: number }> = [];
    alignmentKeyToGlobalIndexRef.current.forEach((globalIndex, alignmentKey) => {
      if (rawSet.has(globalIndex)) return;
      const controller = alignmentAbortRef.current.get(alignmentKey);
      if (!controller) return;
      if (controller.signal.aborted) return;
      controller.abort();
      aborted.push({ key: alignmentKey, globalIndex });
    });

    if (aborted.length > 0) {
      pushDebugEvent('alignment_abort', { count: aborted.length, sample: aborted.slice(0, 6) });
    }

    updateDebugSnapshot({
      sessionKey,
      dualReadEnabled: enabled,
      visiblePageIndices: rawVisible,
      stableVisiblePageIndices: Array.from(stableVisibleSetRef.current).sort((a, b) => a - b),
      alignmentPending: pendingAlignmentRef.current.size,
      alignmentControllers: alignmentAbortRef.current.size,
    });
  }, [enabled, ctx.currentPageIndex, ctx.visiblePageIndices]);

  const hashKeyToString = useCallback((key: DualReadHashCacheKey) => {
    return `${key.registryId}:${key.sourceId}:${key.mangaId}:${key.chapterId}:${key.pageIndex}`;
  }, []);

  const getPrimaryHash = useCallback(
    async (key: DualReadHashCacheKey, url: string) => {
      const cacheKey = `primary:${hashKeyToString(key)}`;
      const cache = primaryHashCacheRef.current;
      const pending = pendingPrimaryRef.current;
      if (cache.has(cacheKey)) return cache.get(cacheKey)!;
      if (pending.has(cacheKey)) return pending.get(cacheKey)!;

      const promise = (async () => {
        const cached = await getCachedDualReadHash(key);
        if (cached?.full) {
          cache.set(cacheKey, cached);
          pending.delete(cacheKey);
          return cached;
        }
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Failed to fetch image (${response.status})`);
        const blob = await response.blob();
        const hash = await computeDualReadHashInWorker({
          image: blob,
          mode: 'primary',
          centerCropRatio: AUTO_ALIGN_CENTER_RATIO,
          cacheId: cacheKey,
          sampleMax: ALIGNMENT_FINE_MAX_DEFAULT,
        });
        cache.set(cacheKey, hash);
        pending.delete(cacheKey);
        sampleCacheRef.current.add(cacheKey);
        setCachedDualReadHash(key, hash).catch(() => {});
        return hash;
      })();

      pending.set(cacheKey, promise);
      try {
        return await promise;
      } catch (err) {
        pending.delete(cacheKey);
        throw err;
      }
    },
    [hashKeyToString]
  );

  const getSecondaryHash = useCallback(
    async (key: DualReadHashCacheKey, page: Page) => {
      const cacheKey = `secondary:${hashKeyToString(key)}`;
      const cache = secondaryHashCacheRef.current;
      const pending = pendingSecondaryRef.current;
      if (cache.has(cacheKey)) return cache.get(cacheKey)!;
      if (pending.has(cacheKey)) return pending.get(cacheKey)!;

      const promise = (async () => {
        const cached = await getCachedDualReadHash(key);
        if (cached?.full) {
          cache.set(cacheKey, cached);
          pending.delete(cacheKey);
          return cached;
        }
        const blob = await page.getImage();
        const hash = await computeDualReadHashInWorker({
          image: blob,
          mode: 'secondary',
          centerCropRatio: AUTO_ALIGN_CENTER_RATIO,
          cacheId: cacheKey,
          sampleMax: ALIGNMENT_FINE_MAX_DEFAULT,
        });
        cache.set(cacheKey, hash);
        pending.delete(cacheKey);
        sampleCacheRef.current.add(cacheKey);
        setCachedDualReadHash(key, hash).catch(() => {});
        return hash;
      })();

      pending.set(cacheKey, promise);
      try {
        return await promise;
      } catch (err) {
        pending.delete(cacheKey);
        throw err;
      }
    },
    [hashKeyToString]
  );

  const ensurePrimarySample = useCallback(
    async (key: DualReadHashCacheKey, url: string) => {
      const cacheKey = `primary:${hashKeyToString(key)}`;
      if (sampleCacheRef.current.has(cacheKey)) return cacheKey;
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Failed to fetch image (${response.status})`);
      const blob = await response.blob();
      const hash = await computeDualReadHashInWorker({
        image: blob,
        mode: 'primary',
        centerCropRatio: AUTO_ALIGN_CENTER_RATIO,
        cacheId: cacheKey,
        sampleMax: ALIGNMENT_FINE_MAX_DEFAULT,
      });
      primaryHashCacheRef.current.set(cacheKey, hash);
      sampleCacheRef.current.add(cacheKey);
      setCachedDualReadHash(key, hash).catch(() => {});
      return cacheKey;
    },
    [hashKeyToString]
  );

  const ensureSecondarySample = useCallback(
    async (key: DualReadHashCacheKey, page: Page) => {
      const cacheKey = `secondary:${hashKeyToString(key)}`;
      if (sampleCacheRef.current.has(cacheKey)) return cacheKey;
      const blob = await page.getImage();
      const hash = await computeDualReadHashInWorker({
        image: blob,
        mode: 'secondary',
        centerCropRatio: AUTO_ALIGN_CENTER_RATIO,
        cacheId: cacheKey,
        sampleMax: ALIGNMENT_FINE_MAX_DEFAULT,
      });
      secondaryHashCacheRef.current.set(cacheKey, hash);
      sampleCacheRef.current.add(cacheKey);
      setCachedDualReadHash(key, hash).catch(() => {});
      return cacheKey;
    },
    [hashKeyToString]
  );

  const requestAlignmentForPlan = useCallback(
    (input: {
      chapterId: string;
      pageIndex: number;
      globalIndex?: number;
      primaryUrl: string | null | undefined;
      renderPlan: SecondaryRenderPlan;
      secondaryChapterId: string;
      trigger: 'auto_match' | 'backfill';
      pagesByChapter?: Map<string, Page[]>;
    }) => {
      if (!secondarySource) return;
      const nowMs = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
      const traceStart = nowMs();
      const primaryUrl = input.primaryUrl ?? null;
      const renderPlan = input.renderPlan;
      if (!primaryUrl) {
        logDebug('alignment_skip', {
          chapterId: input.chapterId,
          pageIndex: input.pageIndex,
          secondaryChapterId: input.secondaryChapterId,
          reason: 'primary_url_missing',
          trigger: input.trigger,
        });
        pushDebugEvent('alignment_skip', {
          chapterId: input.chapterId,
          pageIndex: input.pageIndex,
          secondaryChapterId: input.secondaryChapterId,
          reason: 'primary_url_missing',
          trigger: input.trigger,
          globalIndex: input.globalIndex,
        });
        return;
      }
      if (renderPlan.kind === 'missing') {
        logDebug('alignment_skip', {
          chapterId: input.chapterId,
          pageIndex: input.pageIndex,
          secondaryChapterId: input.secondaryChapterId,
          reason: 'missing_plan',
          trigger: input.trigger,
        });
        pushDebugEvent('alignment_skip', {
          chapterId: input.chapterId,
          pageIndex: input.pageIndex,
          secondaryChapterId: input.secondaryChapterId,
          reason: 'missing_plan',
          trigger: input.trigger,
          globalIndex: input.globalIndex,
        });
        return;
      }

      const alignmentKey = `${input.chapterId}:${input.secondaryChapterId}:${input.pageIndex}`;
      pushDebugEvent('alignment_schedule', {
        key: alignmentKey,
        trigger: input.trigger,
        kind: renderPlan.kind,
        globalIndex: input.globalIndex,
      });
      const state = useDualReadStore.getState();
      const existingEntry = state.secondaryAlignmentByChapter[input.chapterId];
      const existingAlignment =
        existingEntry?.secondaryChapterId === input.secondaryChapterId
          ? existingEntry.byPage[input.pageIndex]
          : undefined;
      if (existingAlignment && existingAlignment.confidence >= ALIGNMENT_CONFIDENCE_MIN_DEFAULT) {
        logDebug('alignment_cached', {
          chapterId: input.chapterId,
          pageIndex: input.pageIndex,
          secondaryChapterId: input.secondaryChapterId,
          confidence: existingAlignment.confidence,
        });
        pushDebugEvent('alignment_cached', {
          key: alignmentKey,
          confidence: existingAlignment.confidence,
          globalIndex: input.globalIndex,
        });
        return;
      }

      const signature = getAlignmentPlanSignature(renderPlan);
      const lastAttempt = alignmentAttemptRef.current.get(alignmentKey);
      if (
        lastAttempt &&
        lastAttempt.signature === signature &&
        Date.now() - lastAttempt.timestamp < ALIGNMENT_RETRY_MS
      ) {
        logDebug('alignment_skip', {
          chapterId: input.chapterId,
          pageIndex: input.pageIndex,
          secondaryChapterId: input.secondaryChapterId,
          reason: 'retry_cooldown',
          trigger: input.trigger,
          ageMs: Date.now() - lastAttempt.timestamp,
          count: lastAttempt.count,
        });
        pushDebugEvent('alignment_skip', {
          key: alignmentKey,
          reason: 'retry_cooldown',
          trigger: input.trigger,
          globalIndex: input.globalIndex,
          ageMs: Date.now() - lastAttempt.timestamp,
          count: lastAttempt.count,
        });
        return;
      }

      if (pendingAlignmentRef.current.has(alignmentKey)) return;
      pendingAlignmentRef.current.add(alignmentKey);
      alignmentAttemptRef.current.set(alignmentKey, {
        signature,
        timestamp: Date.now(),
        count: (lastAttempt?.count ?? 0) + 1,
      });

      const controller = new AbortController();
      alignmentAbortRef.current.set(alignmentKey, controller);
      if (typeof input.globalIndex === 'number' && Number.isFinite(input.globalIndex)) {
        alignmentKeyToGlobalIndexRef.current.set(alignmentKey, input.globalIndex);
      }

      (async () => {
        let primarySampleMs = 0;
        let secondarySampleMs = 0;
        let alignmentMs = 0;
        try {
          const pendingStats = getDualReadWorkerPendingStats();
          logDebug('alignment_start', {
            chapterId: input.chapterId,
            pageIndex: input.pageIndex,
            secondaryChapterId: input.secondaryChapterId,
            kind: renderPlan.kind,
            trigger: input.trigger,
            pendingWorker: pendingStats.total,
            pendingWorkerHash: pendingStats.hash,
            pendingWorkerAlign: pendingStats.align,
            pendingAlignment: pendingAlignmentRef.current.size,
          });
          pushDebugEvent('alignment_start', {
            key: alignmentKey,
            trigger: input.trigger,
            kind: renderPlan.kind,
            globalIndex: input.globalIndex,
            pendingWorker: pendingStats.total,
            pendingAlignment: pendingAlignmentRef.current.size,
          });

          const pages =
            input.pagesByChapter?.get(input.secondaryChapterId) ??
            secondaryPagesByChapter[input.secondaryChapterId] ??
            (await ensureSecondaryPages(getSource, secondarySource, input.secondaryChapterId));
          if (!pages || pages.length === 0) {
            logDebug('alignment_skip', {
              chapterId: input.chapterId,
              pageIndex: input.pageIndex,
              secondaryChapterId: input.secondaryChapterId,
              reason: 'secondary_pages_missing',
              trigger: input.trigger,
            });
            pushDebugEvent('alignment_skip', {
              key: alignmentKey,
              reason: 'secondary_pages_missing',
              trigger: input.trigger,
              globalIndex: input.globalIndex,
            });
            return;
          }

          const primaryKey: DualReadHashCacheKey = {
            registryId: ctx.registryId,
            sourceId: ctx.sourceId,
            mangaId: ctx.mangaId,
            chapterId: input.chapterId,
            pageIndex: input.pageIndex,
          };
          const primarySampleStart = nowMs();
          const primaryCacheId = await ensurePrimarySample(primaryKey, primaryUrl);
          primarySampleMs = nowMs() - primarySampleStart;

          let plan:
            | { kind: 'single'; secondaryId: string }
            | { kind: 'split'; secondaryId: string; side: 'left' | 'right' }
            | { kind: 'merge'; secondaryIds: [string, string]; order: 'normal' | 'swap' };

          const secondarySampleStart = nowMs();
          if (renderPlan.kind === 'merge') {
            const [indexA, indexB] = renderPlan.secondaryIndices;
            const pageA = pages[indexA];
            const pageB = pages[indexB];
            if (!pageA || !pageB) {
              logDebug('alignment_skip', {
                chapterId: input.chapterId,
                pageIndex: input.pageIndex,
                secondaryChapterId: input.secondaryChapterId,
                reason: 'secondary_page_missing',
                trigger: input.trigger,
                indices: [indexA, indexB],
              });
              return;
            }
            const cacheKeyA: DualReadHashCacheKey = {
              registryId: secondarySource.registryId,
              sourceId: secondarySource.sourceId,
              mangaId: secondarySource.sourceMangaId,
              chapterId: input.secondaryChapterId,
              pageIndex: indexA,
            };
            const cacheKeyB: DualReadHashCacheKey = {
              registryId: secondarySource.registryId,
              sourceId: secondarySource.sourceId,
              mangaId: secondarySource.sourceMangaId,
              chapterId: input.secondaryChapterId,
              pageIndex: indexB,
            };
            const [secondaryIdA, secondaryIdB] = await Promise.all([
              ensureSecondarySample(cacheKeyA, pageA),
              ensureSecondarySample(cacheKeyB, pageB),
            ]);
            plan = { kind: 'merge', secondaryIds: [secondaryIdA, secondaryIdB], order: renderPlan.order };
          } else {
            const index = renderPlan.secondaryIndex;
            const page = pages[index];
            if (!page) {
              logDebug('alignment_skip', {
                chapterId: input.chapterId,
                pageIndex: input.pageIndex,
                secondaryChapterId: input.secondaryChapterId,
                reason: 'secondary_page_missing',
                trigger: input.trigger,
                index,
              });
              return;
            }
            const cacheKey: DualReadHashCacheKey = {
              registryId: secondarySource.registryId,
              sourceId: secondarySource.sourceId,
              mangaId: secondarySource.sourceMangaId,
              chapterId: input.secondaryChapterId,
              pageIndex: index,
            };
            const secondaryId = await ensureSecondarySample(cacheKey, page);
            if (renderPlan.kind === 'split') {
              plan = { kind: 'split', secondaryId, side: renderPlan.side };
            } else {
              plan = { kind: 'single', secondaryId };
            }
          }
          secondarySampleMs = nowMs() - secondarySampleStart;

          const alignmentStart = nowMs();
          const alignment = await computeDualReadAlignmentInWorker({
            primaryId: primaryCacheId,
            plan,
            options: buildAlignmentOptions(),
            timeoutMs: 2000,
            signal: controller.signal,
          });
          alignmentMs = nowMs() - alignmentStart;
          if (controller.signal.aborted) {
            logDebug('alignment_skip', {
              chapterId: input.chapterId,
              pageIndex: input.pageIndex,
              secondaryChapterId: input.secondaryChapterId,
              reason: 'aborted',
              trigger: input.trigger,
              elapsedMs: nowMs() - traceStart,
            });
            pushDebugEvent('alignment_skip', {
              key: alignmentKey,
              reason: 'aborted',
              trigger: input.trigger,
              globalIndex: input.globalIndex,
            });
            return;
          }

          // Only commit alignment if the render plan is still present and unchanged.
          // This prevents stale jobs from writing results after the plan was cleared (disable / seed change)
          // or replaced (rematch / drift update).
          const currentPlan =
            useDualReadStore.getState().secondaryRenderPlansByChapter[input.chapterId]?.[input.pageIndex];
          if (!currentPlan) {
            logDebug('alignment_skip', {
              chapterId: input.chapterId,
              pageIndex: input.pageIndex,
              secondaryChapterId: input.secondaryChapterId,
              reason: 'stale_plan_missing',
              trigger: input.trigger,
              signature,
              elapsedMs: nowMs() - traceStart,
            });
            pushDebugEvent('alignment_skip', {
              key: alignmentKey,
              reason: 'stale_plan_missing',
              trigger: input.trigger,
              globalIndex: input.globalIndex,
            });
            return;
          }
          const currentSignature = getAlignmentPlanSignature(currentPlan);
          if (currentSignature !== signature) {
            logDebug('alignment_skip', {
              chapterId: input.chapterId,
              pageIndex: input.pageIndex,
              secondaryChapterId: input.secondaryChapterId,
              reason: 'stale_plan',
              trigger: input.trigger,
              currentSignature,
              signature,
              elapsedMs: nowMs() - traceStart,
            });
            pushDebugEvent('alignment_skip', {
              key: alignmentKey,
              reason: 'stale_plan',
              trigger: input.trigger,
              globalIndex: input.globalIndex,
            });
            return;
          }

          setSecondaryAlignment(input.chapterId, input.secondaryChapterId, input.pageIndex, alignment);
          logDebug('alignment_result', {
            chapterId: input.chapterId,
            pageIndex: input.pageIndex,
            secondaryChapterId: input.secondaryChapterId,
            alignment,
            trigger: input.trigger,
            primarySampleMs: Math.round(primarySampleMs),
            secondarySampleMs: Math.round(secondarySampleMs),
            alignmentMs: Math.round(alignmentMs),
            elapsedMs: Math.round(nowMs() - traceStart),
            pendingWorker: getDualReadWorkerPendingCount(),
          });
          pushDebugEvent('alignment_result', {
            key: alignmentKey,
            trigger: input.trigger,
            globalIndex: input.globalIndex,
            confidence: alignment.confidence,
            dx: alignment.dx,
            dy: alignment.dy,
            scale: alignment.scale,
            elapsedMs: Math.round(nowMs() - traceStart),
          });
        } catch (err) {
          const pendingStats = getDualReadWorkerPendingStats();
          logDebug('alignment_error', {
            chapterId: input.chapterId,
            pageIndex: input.pageIndex,
            secondaryChapterId: input.secondaryChapterId,
            error: err instanceof Error ? err.message : String(err),
            trigger: input.trigger,
            elapsedMs: Math.round(nowMs() - traceStart),
            pendingWorker: pendingStats.total,
            pendingWorkerHash: pendingStats.hash,
            pendingWorkerAlign: pendingStats.align,
            primarySampleMs: Math.round(primarySampleMs),
            secondarySampleMs: Math.round(secondarySampleMs),
            alignmentMs: Math.round(alignmentMs),
          });
          pushDebugEvent('alignment_error', {
            key: alignmentKey,
            trigger: input.trigger,
            globalIndex: input.globalIndex,
            error: err instanceof Error ? err.message : String(err),
          });
        } finally {
          pendingAlignmentRef.current.delete(alignmentKey);
          alignmentAbortRef.current.get(alignmentKey)?.abort();
          alignmentAbortRef.current.delete(alignmentKey);
          alignmentKeyToGlobalIndexRef.current.delete(alignmentKey);
          bumpAlignmentQueue();
        }
      })();
    },
    [
      secondarySource,
      secondaryPagesByChapter,
      ctx.registryId,
      ctx.sourceId,
      ctx.mangaId,
      ensurePrimarySample,
      ensureSecondarySample,
      getSource,
      logDebug,
      bumpAlignmentQueue,
      setSecondaryAlignment,
    ]
  );

  useEffect(() => {
    const debugEnabled = isDualReadDebugEnabled();
    const logSkip = (reason: string, data?: Record<string, unknown>) => {
      if (!debugEnabled) return;
      const key = `${reason}:${data?.pageIndex ?? ''}:${data?.chapterId ?? ''}`;
      if (lastSkipRef.current === key) return;
      lastSkipRef.current = key;
      console.debug('[DualRead] autoAlign skip', { reason, ...data });
    };

    if (!enabled || !seedPair || !secondarySource) {
      logSkip('disabled', {
        enabled,
        seedPair: Boolean(seedPair),
        secondarySource: Boolean(secondarySource),
      });
      return;
    }
    if (!primaryChapters.length || !secondaryChapters.length) {
      logSkip('chapters_not_ready', {
        primaryCount: primaryChapters.length,
        secondaryCount: secondaryChapters.length,
      });
      return;
    }

    const visibleIndices =
      ctx.visiblePageIndices.length > 0 ? ctx.visiblePageIndices : [ctx.currentPageIndex];
    const loadedIndices = Array.from(ctx.getLoadedPageUrls().keys()).sort((a, b) => a - b);
    // Always include the currently visible pages as candidates.
    // Otherwise, if `loadedIndices` is non-empty but missing some visible pages (can happen in scrolling/eviction),
    // we may never compute render plans for what the user is actually looking at (spinner forever).
    const candidateIndices =
      loadedIndices.length > 0
        ? Array.from(new Set([...visibleIndices, ...loadedIndices])).sort((a, b) => a - b)
        : visibleIndices;
    const pageCandidates = candidateIndices
      .map((index) => ({ index, meta: ctx.getPageMeta(index) }))
      .filter(
        (entry) => entry.meta?.kind === 'page' && entry.meta.localIndex != null && entry.meta.chapterId
      );
    if (pageCandidates.length === 0) {
      logSkip('page_meta_unavailable', { pageIndex: ctx.currentPageIndex, visibleIndices, candidateIndices });
      return;
    }

    // Prefer matching for (stable) visible pages first to avoid starvation when many pages are loaded.
    const stableSet =
      stableVisibleSetRef.current.size > 0 ? stableVisibleSetRef.current : new Set<number>();
    const visibleSet = new Set(visibleIndices);
    const prioritizedCandidates = [...pageCandidates].sort((a, b) => {
      const aRank = stableSet.has(a.index) ? 0 : visibleSet.has(a.index) ? 1 : 2;
      const bRank = stableSet.has(b.index) ? 0 : visibleSet.has(b.index) ? 1 : 2;
      if (aRank !== bRank) return aRank - bRank;
      return a.index - b.index;
    });

    const candidates = prioritizedCandidates
      .map((entry) => {
        const meta = entry.meta!;
        const chapterId = meta.chapterId!;
        const primaryChapter = primaryChapters.find((c) => c.id === chapterId);
        if (!primaryChapter) {
          logSkip('primary_chapter_missing', { chapterId, pageIndex: entry.index });
          return null;
        }
        const secondaryChapterId = mapSecondaryChapterForPrimary({
          primaryChapter,
          primaryAll: primaryChapters,
          secondaryAll: secondaryChapters,
          seedPair,
        });
        if (!secondaryChapterId) {
          logSkip('secondary_chapter_missing', { chapterId, pageIndex: entry.index });
          return null;
        }
        const primaryUrl = ctx.getPageImageUrl(entry.index);
        if (!primaryUrl) {
          logSkip('primary_url_missing', { pageIndex: entry.index });
          return null;
        }
        const driftDelta = driftDeltaByChapter[chapterId] ?? 0;
        const expectedIndex = mapSecondaryPageIndex({
          primaryIndex: meta.localIndex!,
          driftDelta,
        });
        if (!Number.isFinite(expectedIndex)) {
          logSkip('expected_index_invalid', { expectedIndex, pageIndex: entry.index });
          return null;
        }
        return {
          pageIndex: entry.index,
          meta,
          primaryUrl,
          expectedIndex,
          driftDelta,
          secondaryChapterId,
        };
      })
      .filter(Boolean) as Array<{
      pageIndex: number;
      meta: NonNullable<ReturnType<ReaderPluginContext['getPageMeta']>>;
      primaryUrl: string;
      expectedIndex: number;
      driftDelta: number;
      secondaryChapterId: string;
    }>;

    if (candidates.length === 0) {
      logSkip('no_candidates', { visibleIndices });
      return;
    }

    const pagesReadyKey = candidates
      .map((c) => `${c.secondaryChapterId}:${secondaryPagesByChapter[c.secondaryChapterId]?.length ?? 0}`)
      .join('|');
    const expectedKey = candidates.map((c) => `${c.pageIndex}:${Math.trunc(c.expectedIndex)}`).join('|');
    const runKey = `${expectedKey}:${pagesReadyKey}`;

    // If any visible pages are missing a valid render plan, always allow a re-run,
    // even if the (expectedKey/pagesReadyKey) signature hasn't changed.
    // Otherwise we can get stuck with `none` plans (FAB spinner forever) after navigating back.
    const visibleNeedsPlan = (() => {
      for (const pageIndex of visibleIndices) {
        const meta = ctx.getPageMeta(pageIndex);
        if (!meta || meta.kind !== 'page' || meta.localIndex == null || !meta.chapterId) continue;
        const plan = secondaryRenderPlansByChapter[meta.chapterId]?.[meta.localIndex];
        if (!plan) return true;
        const drift = driftDeltaByChapter[meta.chapterId] ?? 0;
        if (plan.driftDelta !== drift) return true;
        const primaryChapter = primaryChapters.find((c) => c.id === meta.chapterId);
        if (!primaryChapter) continue;
        const expectedSecondaryChapterId = mapSecondaryChapterForPrimary({
          primaryChapter,
          primaryAll: primaryChapters,
          secondaryAll: secondaryChapters,
          seedPair,
        });
        if (expectedSecondaryChapterId && plan.secondaryChapterId !== expectedSecondaryChapterId) return true;
      }
      return false;
    })();

    if (lastRunRef.current === runKey && !visibleNeedsPlan) return;
    if (inFlightRef.current.has(runKey)) return;
    inFlightRef.current.add(runKey);
    lastSkipRef.current = null;
    pushDebugEvent('renderPlan_run', {
      visible: visibleIndices,
      loadedCount: loadedIndices.length,
      candidateCount: candidates.length,
    });
    updateDebugSnapshot({
      lastRenderPlanRunTs: Date.now(),
      lastRenderPlanSummary: `candidates=${candidates.length} loaded=${loadedIndices.length} needsPlan=${visibleNeedsPlan ? 'y' : 'n'}`,
    });

    let cancelled = false;
    (async () => {
      try {
        const pagesByChapter = new Map<string, Page[]>();
        const hashesByChapter = new Map<string, Array<MultiDhash | undefined>>();
        const acceptedCandidates: Array<{
          candidate: (typeof candidates)[number];
          best: SecondaryMatch;
          secondBestDistance: number;
          adaptiveThreshold: number;
        }> = [];
        const missingCandidates: Array<{
          candidate: (typeof candidates)[number];
          best: SecondaryMatch;
          secondBestDistance: number;
        }> = [];
        const candidateBestByKey = new Map<
          string,
          { best: SecondaryMatch; secondaryChapterId: string; missing: boolean }
        >();

        for (const candidate of candidates) {
          let pages = pagesByChapter.get(candidate.secondaryChapterId);
          if (!pages) {
            pages =
              secondaryPagesByChapter[candidate.secondaryChapterId] ??
              (await ensureSecondaryPages(getSource, secondarySource, candidate.secondaryChapterId));
            if (!pages || pages.length === 0) {
              logSkip('secondary_pages_missing', { chapterId: candidate.secondaryChapterId });
              continue;
            }
            pagesByChapter.set(candidate.secondaryChapterId, pages);
          }
          if (cancelled) return;

          const start = Math.max(0, Math.trunc(candidate.expectedIndex) - AUTO_ALIGN_WINDOW);
          const end = Math.min(pages.length - 1, Math.trunc(candidate.expectedIndex) + AUTO_ALIGN_WINDOW);
          logDebug('attempt', {
            chapterId: candidate.meta.chapterId,
            pageIndex: candidate.meta.localIndex,
            expectedIndex: candidate.expectedIndex,
            window: [start, end],
            driftDelta: candidate.driftDelta,
          });

          let secondaryHashes = hashesByChapter.get(candidate.secondaryChapterId);
          if (!secondaryHashes) {
            secondaryHashes = new Array(pages.length);
            hashesByChapter.set(candidate.secondaryChapterId, secondaryHashes);
          }

          const hashTasks: Array<Promise<void>> = [];
          for (let i = start; i <= end; i++) {
            if (secondaryHashes[i]) continue;
            const page = pages[i];
            if (!page) continue;
            const cacheKey: DualReadHashCacheKey = {
              registryId: secondarySource.registryId,
              sourceId: secondarySource.sourceId,
              mangaId: secondarySource.sourceMangaId,
              chapterId: candidate.secondaryChapterId,
              pageIndex: i,
            };
            hashTasks.push(
              getSecondaryHash(cacheKey, page)
                .then((hash) => {
                  secondaryHashes![i] = hash;
                })
                .catch(() => {})
            );
          }
          await Promise.all(hashTasks);
          if (cancelled) return;

          const available = secondaryHashes.filter(Boolean).length;
          if (available < 2) {
            logSkip('insufficient_candidates', { available, start, end });
            continue;
          }

          const primaryCacheKey: DualReadHashCacheKey = {
            registryId: ctx.registryId,
            sourceId: ctx.sourceId,
            mangaId: ctx.mangaId,
            chapterId: candidate.meta.chapterId!,
            pageIndex: candidate.meta.localIndex!,
          };
          const primaryHash = await getPrimaryHash(primaryCacheKey, candidate.primaryUrl);
          if (cancelled) return;

          const match = findBestSecondaryMatch({
            primaryHash,
            secondaryHashes,
            expectedIndex: candidate.expectedIndex,
            windowSize: AUTO_ALIGN_WINDOW,
            deviationBias: AUTO_ALIGN_DEVIATION_BIAS,
            variantPenalty: AUTO_ALIGN_VARIANT_PENALTY,
            fullThreshold: AUTO_ALIGN_FULL_THRESHOLD,
            splitMargin: AUTO_ALIGN_SPLIT_MARGIN,
            splitPenalty: AUTO_ALIGN_SPLIT_PENALTY,
            mergePenalty: AUTO_ALIGN_MERGE_PENALTY,
            primarySpreadThreshold: AUTO_ALIGN_PRIMARY_SPREAD_THRESHOLD,
            secondarySpreadThreshold: AUTO_ALIGN_SECONDARY_SPREAD_THRESHOLD,
          });
          if (!match) {
            logSkip('no_best_match', { expectedIndex: candidate.expectedIndex, pageIndex: candidate.pageIndex });
            continue;
          }
          const best = match.best;
          const secondBestDistance = match.secondBest?.distance ?? Number.POSITIVE_INFINITY;
          const missing = shouldMarkMissing({
            bestDistance: best.distance,
            secondBestDistance,
            missingDistance: AUTO_ALIGN_MISSING_DISTANCE,
            missingGap: AUTO_ALIGN_MISSING_GAP,
          });
          candidateBestByKey.set(`${candidate.meta.chapterId}:${candidate.meta.localIndex}`, {
            best,
            secondaryChapterId: candidate.secondaryChapterId,
            missing,
          });

          const acceptedDistances = acceptedDistancesRef.current.get(candidate.meta.chapterId!) ?? [];
          const recentMedian = acceptedDistances.length > 0 ? median(acceptedDistances) : null;
          const adaptiveThreshold =
            recentMedian === null
              ? AUTO_ALIGN_BASE_THRESHOLD
              : Math.max(AUTO_ALIGN_BASE_THRESHOLD, recentMedian + AUTO_ALIGN_ADAPTIVE_DELTA);
          let accept = best.distance <= adaptiveThreshold;
          if (!accept && best.distance <= AUTO_ALIGN_SOFT_THRESHOLD) {
            const gapOk = secondBestDistance - best.distance >= AUTO_ALIGN_MIN_GAP;
            const medianOk = recentMedian === null ? true : best.distance <= recentMedian + AUTO_ALIGN_ADAPTIVE_DELTA;
            accept = gapOk && medianOk;
          }

          logDebug('candidate', {
            pageIndex: candidate.meta.localIndex,
            expectedIndex: candidate.expectedIndex,
            kind: best.kind,
            bestIndex: best.bestIndex,
            bestDistance: best.distance,
            accept,
          });

          // Missing is a distinct state: if we are confident this page is missing,
          // record it even if the match wouldn't pass "accept" thresholds.
          if (missing) {
            missingCandidates.push({ candidate, best, secondBestDistance });
            logSkip('missing', {
              expectedIndex: candidate.expectedIndex,
              bestIndex: best.bestIndex,
              bestDistance: best.distance,
              secondBestDistance,
              missingDistance: AUTO_ALIGN_MISSING_DISTANCE,
              missingGap: AUTO_ALIGN_MISSING_GAP,
              pageIndex: candidate.pageIndex,
              kind: best.kind,
            });
            continue;
          }

          if (!accept) {
            logSkip('reject', {
              expectedIndex: candidate.expectedIndex,
              bestIndex: best.bestIndex,
              bestDistance: best.distance,
              secondBestDistance,
              adaptiveThreshold,
              softThreshold: AUTO_ALIGN_SOFT_THRESHOLD,
              minGap: AUTO_ALIGN_MIN_GAP,
              pageIndex: candidate.pageIndex,
              kind: best.kind,
            });
            continue;
          }

          acceptedCandidates.push({ candidate, best, secondBestDistance, adaptiveThreshold });
        }

        if (acceptedCandidates.length === 0 && missingCandidates.length === 0) return;

        const sortCandidates = (entries: typeof acceptedCandidates) => {
          return [...entries].sort((a, b) => {
            if (a.best.score !== b.best.score) {
              return a.best.score - b.best.score;
            }
            if (a.best.distance !== b.best.distance) {
              return a.best.distance - b.best.distance;
            }
            return b.candidate.pageIndex - a.candidate.pageIndex;
          });
        };

        const sortedAccepted = sortCandidates(acceptedCandidates);
        const visibleSet = new Set(visibleIndices);
        const stableSet = stableVisibleSetRef.current.size > 0 ? stableVisibleSetRef.current : visibleSet;
        const chosen =
          sortedAccepted.find((entry) => stableSet.has(entry.candidate.pageIndex)) ??
          sortedAccepted.find((entry) => visibleSet.has(entry.candidate.pageIndex)) ??
          sortedAccepted[0] ??
          null;
        let nextDrift = chosen?.candidate.driftDelta ?? 0;
        if (chosen) {
          const { candidate, best } = chosen;
          const driftExpectedIndex = getDriftExpectedIndex({
            expectedIndex: candidate.expectedIndex,
            match: best,
            readingMode: ctx.readingMode,
          });
          nextDrift = updateDriftDelta({
            expectedIndex: driftExpectedIndex,
            bestIndex: best.bestIndex,
            prevDriftDelta: candidate.driftDelta,
          });
        }

        const applyRenderPlan = (
          target: (typeof acceptedCandidates)[number],
          match: SecondaryMatch,
          driftDelta: number
        ) => {
          const renderPlan = buildSecondaryRenderPlan({
            match,
            secondaryChapterId: target.candidate.secondaryChapterId,
            driftDelta,
          });
          setSecondaryRenderPlan(target.candidate.meta.chapterId!, target.candidate.meta.localIndex!, renderPlan);

          if (match.kind !== 'split') return;

          const isRtl = ctx.readingMode === 'rtl';
          const siblingDelta = isRtl ? (match.side === 'right' ? 1 : -1) : match.side === 'left' ? 1 : -1;
          const siblingPageIndex = target.candidate.pageIndex + siblingDelta;
          const siblingMeta = ctx.getPageMeta(siblingPageIndex);
          if (
            siblingMeta?.kind === 'page' &&
            siblingMeta.chapterId === target.candidate.meta.chapterId &&
            siblingMeta.localIndex === target.candidate.meta.localIndex! + siblingDelta
          ) {
            const siblingKey = `${siblingMeta.chapterId}:${siblingMeta.localIndex}`;
            const siblingEntry = candidateBestByKey.get(siblingKey);
            const sameSecondaryChapter =
              siblingEntry?.secondaryChapterId === target.candidate.secondaryChapterId;
            if (
              siblingEntry &&
              !siblingEntry.missing &&
              shouldApplySiblingSplitPlan({
                match,
                sibling: siblingEntry.best,
                sameSecondaryChapter: Boolean(sameSecondaryChapter),
              })
            ) {
              const siblingPlan = buildSecondaryRenderPlan({
                match: siblingEntry.best,
                secondaryChapterId: target.candidate.secondaryChapterId,
                driftDelta,
              });
              setSecondaryRenderPlan(target.candidate.meta.chapterId!, siblingMeta.localIndex!, siblingPlan);
              logDebug('sibling', {
                chapterId: target.candidate.meta.chapterId,
                pageIndex: target.candidate.meta.localIndex,
                siblingIndex: siblingMeta.localIndex,
                secondaryIndex: match.index,
                side: match.side,
              });
            }
          }
        };

        for (const entry of acceptedCandidates) {
          const planDrift = chosen && entry === chosen ? nextDrift : entry.candidate.driftDelta;
          applyRenderPlan(entry, entry.best, planDrift);
        }

        for (const entry of missingCandidates) {
          const missingPlan = buildMissingRenderPlan({
            secondaryChapterId: entry.candidate.secondaryChapterId,
            driftDelta: entry.candidate.driftDelta,
          });
          setSecondaryRenderPlan(entry.candidate.meta.chapterId!, entry.candidate.meta.localIndex!, missingPlan);
        }

        // Safety fallback: never leave visible pages with `none` plans.
        // If we couldn't accept a match (or compute one), mark them as missing so the UI doesn't spin forever.
        const visibleSetForFallback = new Set(visibleIndices);
        const stateAfter = useDualReadStore.getState();
        const driftNowByChapter = stateAfter.driftDeltaByChapter;
        for (const c of candidates) {
          if (!visibleSetForFallback.has(c.pageIndex)) continue;
          const chapterId = c.meta.chapterId!;
          const localIndex = c.meta.localIndex!;
          const existing = stateAfter.secondaryRenderPlansByChapter[chapterId]?.[localIndex];
          if (existing) continue;
          const driftDelta = driftNowByChapter[chapterId] ?? c.driftDelta ?? 0;
          const missingPlan = buildMissingRenderPlan({
            secondaryChapterId: c.secondaryChapterId,
            driftDelta,
          });
          setSecondaryRenderPlan(chapterId, localIndex, missingPlan);
        }

        if (chosen && nextDrift !== chosen.candidate.driftDelta) {
          setDriftDelta(chosen.candidate.meta.chapterId!, nextDrift);
        }

        if (chosen) {
          const acceptedDistances = acceptedDistancesRef.current.get(chosen.candidate.meta.chapterId!) ?? [];
          const nextDistances = acceptedDistances.length > 0 ? [...acceptedDistances] : [];
          nextDistances.push(chosen.best.distance);
          if (nextDistances.length > AUTO_ALIGN_HISTORY_LIMIT) nextDistances.shift();
          acceptedDistancesRef.current.set(chosen.candidate.meta.chapterId!, nextDistances);
        }

        if (chosen) {
          logDebug('accept', {
            chapterId: chosen.candidate.meta.chapterId,
            pageIndex: chosen.candidate.meta.localIndex,
            expectedIndex: chosen.candidate.expectedIndex,
            bestIndex: chosen.best.bestIndex,
            bestDistance: chosen.best.distance,
            kind: chosen.best.kind,
            nextDrift,
          });
        }

        pushDebugEvent('renderPlan_apply', {
          accepted: acceptedCandidates.length,
          missing: missingCandidates.length,
          chosenGlobalPage: chosen?.candidate.pageIndex ?? null,
          chosenLocalPage: chosen?.candidate.meta.localIndex ?? null,
          nextDrift,
        });
        updateDebugSnapshot({
          lastRenderPlanSummary: `accepted=${acceptedCandidates.length} missing=${missingCandidates.length} chosen=${chosen ? chosen.candidate.pageIndex : '—'} drift=${nextDrift}`,
        });
      } catch (err) {
        logDebug('error', { error: err instanceof Error ? err.message : String(err) });
      } finally {
        inFlightRef.current.delete(runKey);
        if (!cancelled) lastRunRef.current = runKey;
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    enabled,
    seedPair,
    secondarySource,
    primaryChapters,
    secondaryChapters,
    secondaryPagesByChapter,
    driftDeltaByChapter,
    ctx.currentPageIndex,
    ctx.visiblePageIndices,
    ctx.getLoadedPageUrls,
    ctx.getPageMeta,
    ctx.getPageImageUrl,
    ctx.registryId,
    ctx.sourceId,
    ctx.mangaId,
    getSource,
    getPrimaryHash,
    getSecondaryHash,
    ensurePrimarySample,
    logDebug,
    requestAlignmentForPlan,
    setDriftDelta,
    setSecondaryRenderPlan,
  ]);

  useEffect(() => {
    if (!enabled || !seedPair || !secondarySource) return;
    if (!primaryChapters.length || !secondaryChapters.length) return;

    const visibleIndices =
      ctx.visiblePageIndices.length > 0 ? ctx.visiblePageIndices : [ctx.currentPageIndex];
    const loadedIndices = Array.from(ctx.getLoadedPageUrls().keys());
    const rawVisibleSet = new Set(visibleIndices);
    const stableVisibleSet = new Set(stableVisiblePageIndices);
    // If nothing is stable-visible yet (e.g. fast scrolling), don't start background alignment work.
    // This keeps the worker available for the pages the user actually stops on.
    if (stableVisiblePageIndices.length === 0) {
      updateDebugSnapshot({
        sessionKey,
        dualReadEnabled: enabled,
        visiblePageIndices: visibleIndices,
        stableVisiblePageIndices: [],
        lastAlignmentQueueTs: Date.now(),
        alignmentQueueTotal: 0,
        alignmentQueueStable: 0,
        alignmentQueueBackfill: 0,
        alignmentQueueAvailableSlots: ALIGNMENT_MAX_CONCURRENCY - pendingAlignmentRef.current.size,
        alignmentPending: pendingAlignmentRef.current.size,
        alignmentControllers: alignmentAbortRef.current.size,
      });
      if (debugOverlayEnabled()) {
        useDualReadDebugStore.getState().setAlignmentQueuePreview([]);
      }
      return;
    }

    const queue = buildAlignmentQueue({
      visiblePageIndices: visibleIndices,
      loadedPageIndices: loadedIndices,
      getPageMeta: ctx.getPageMeta,
      getPageImageUrl: ctx.getPageImageUrl,
      renderPlansByChapter: secondaryRenderPlansByChapter,
      alignmentByChapter: secondaryAlignmentByChapter,
      driftDeltaByChapter,
    });
    // Prioritize stable-visible pages first, then allow off-screen backfill.
    const stableQueue = queue.filter((entry) => stableVisibleSet.has(entry.globalIndex));
    const backfillQueue = queue.filter((entry) => !rawVisibleSet.has(entry.globalIndex));

    let available = ALIGNMENT_MAX_CONCURRENCY - pendingAlignmentRef.current.size;
    if (isDualReadDebugEnabled()) {
      const queueKey = `${queue.length}:${loadedIndices.length}:${visibleIndices.join(',')}:${pendingAlignmentRef.current.size}`;
      if (alignmentQueueLogRef.current !== queueKey) {
        alignmentQueueLogRef.current = queueKey;
        logDebug('alignment_queue', {
          size: queue.length,
          loadedCount: loadedIndices.length,
          visibleCount: visibleIndices.length,
          stableVisibleCount: stableVisiblePageIndices.length,
          available,
          pendingAlignment: pendingAlignmentRef.current.size,
        });
      }
    }

    updateDebugSnapshot({
      sessionKey,
      dualReadEnabled: enabled,
      visiblePageIndices: visibleIndices,
      stableVisiblePageIndices,
      lastAlignmentQueueTs: Date.now(),
      alignmentQueueTotal: queue.length,
      alignmentQueueStable: stableQueue.length,
      alignmentQueueBackfill: backfillQueue.length,
      alignmentQueueAvailableSlots: available,
      alignmentPending: pendingAlignmentRef.current.size,
      alignmentControllers: alignmentAbortRef.current.size,
    });

    if (available <= 0) return;
    const runQueue = [...stableQueue, ...backfillQueue];
    if (debugOverlayEnabled()) {
      useDualReadDebugStore.getState().setAlignmentQueuePreview(runQueue.map((e) => e.globalIndex));
    }
    for (const entry of runQueue) {
      if (available <= 0) break;
      requestAlignmentForPlan({
        chapterId: entry.chapterId,
        pageIndex: entry.localIndex,
        globalIndex: entry.globalIndex,
        primaryUrl: entry.primaryUrl,
        renderPlan: entry.renderPlan,
        secondaryChapterId: entry.secondaryChapterId,
        trigger: 'backfill',
      });
      available -= 1;
    }
  }, [
    enabled,
    seedPair,
    secondarySource,
    primaryChapters,
    secondaryChapters,
    secondaryRenderPlansByChapter,
    secondaryAlignmentByChapter,
    driftDeltaByChapter,
    alignmentQueueTick,
    stableVisiblePageIndices,
    ctx.currentPageIndex,
    ctx.visiblePageIndices,
    ctx.getLoadedPageUrls,
    ctx.getPageMeta,
    ctx.getPageImageUrl,
    logDebug,
    requestAlignmentForPlan,
  ]);

  return null;
}

function DualReadSecondaryPrefetcher({ ctx }: { ctx: ReaderPluginContext }) {
  const enabled = useDualReadStore((s) => s.enabled);
  const seedPair = useDualReadStore((s) => s.seedPair);
  const driftDeltaByChapter = useDualReadStore((s) => s.driftDeltaByChapter);
  const primaryChapters = useDualReadStore((s) => s.primaryChapters);
  const secondaryChapters = useDualReadStore((s) => s.secondaryChapters);
  const secondarySource = useDualReadStore((s) => s.secondarySource);
  const secondaryPagesByChapter = useDualReadStore((s) => s.secondaryPagesByChapter);
  const secondaryRenderPlansByChapter = useDualReadStore((s) => s.secondaryRenderPlansByChapter);
  const sessionKey = useDualReadStore((s) => s.sessionKey);

  const { useSettingsStore } = useStores();
  const getSource = useSettingsStore((s) => s.getSource);

  const secondaryKey = secondarySource ? makeSourceKey(secondarySource) : null;
  const requestedKeysRef = useRef(new Set<string>());
  const loadedPageCount = ctx.getLoadedPageUrls().size;

  useEffect(() => {
    requestedKeysRef.current.clear();
  }, [sessionKey, secondaryKey]);

  useEffect(() => {
    if (!enabled || !seedPair || !secondarySource) return;
    if (!primaryChapters.length || !secondaryChapters.length) return;

    const loaded = ctx.getLoadedPageUrls();
    if (loaded.size === 0) return;

    const primaryById = new Map(primaryChapters.map((chapter) => [chapter.id, chapter]));
    const secondaryByPrimaryId = new Map<string, string | null>();

    const getSecondaryChapterId = (primaryChapterId: string) => {
      if (secondaryByPrimaryId.has(primaryChapterId)) {
        return secondaryByPrimaryId.get(primaryChapterId) ?? null;
      }
      const primaryChapter = primaryById.get(primaryChapterId);
      if (!primaryChapter) {
        secondaryByPrimaryId.set(primaryChapterId, null);
        return null;
      }
      const mapped = mapSecondaryChapterForPrimary({
        primaryChapter,
        primaryAll: primaryChapters,
        secondaryAll: secondaryChapters,
        seedPair,
      });
      secondaryByPrimaryId.set(primaryChapterId, mapped);
      return mapped;
    };

    for (const pageIndex of loaded.keys()) {
      const meta = ctx.getPageMeta(pageIndex);
      if (!meta || meta.kind !== 'page' || meta.localIndex == null || !meta.chapterId) continue;

      const secondaryChapterId = getSecondaryChapterId(meta.chapterId);
      if (!secondaryChapterId) continue;

      const driftDelta = driftDeltaByChapter[meta.chapterId] ?? 0;
      const plan = secondaryRenderPlansByChapter[meta.chapterId]?.[meta.localIndex];
      if (plan && plan.secondaryChapterId === secondaryChapterId) {
        if (plan.driftDelta === driftDelta) {
          if (plan.kind === 'missing') continue;
          if (plan.kind === 'merge') {
            for (const index of plan.secondaryIndices) {
              const requestKey = `${secondaryChapterId}:${index}`;
              if (requestedKeysRef.current.has(requestKey)) continue;
              requestedKeysRef.current.add(requestKey);
              void ensureSecondaryImage(getSource, secondarySource, secondaryChapterId, index);
            }
            continue;
          }
          const requestKey = `${secondaryChapterId}:${plan.secondaryIndex}`;
          if (requestedKeysRef.current.has(requestKey)) continue;
          requestedKeysRef.current.add(requestKey);
          void ensureSecondaryImage(getSource, secondarySource, secondaryChapterId, plan.secondaryIndex);
          continue;
        }
      }

      const mappedIndex = mapSecondaryPageIndex({
        primaryIndex: meta.localIndex,
        driftDelta,
      });

      if (!Number.isFinite(mappedIndex)) continue;
      const rawIndex = Math.max(0, Math.trunc(mappedIndex));
      const pages = secondaryPagesByChapter[secondaryChapterId];
      const targetIndex = pages ? clampIndex(rawIndex, pages.length) : rawIndex;
      const requestKey = `${secondaryChapterId}:${targetIndex}`;
      if (requestedKeysRef.current.has(requestKey)) continue;
      requestedKeysRef.current.add(requestKey);
      void ensureSecondaryImage(getSource, secondarySource, secondaryChapterId, targetIndex);
    }
  }, [
    enabled,
    seedPair,
    secondarySource,
    primaryChapters,
    secondaryChapters,
    secondaryPagesByChapter,
    secondaryRenderPlansByChapter,
    driftDeltaByChapter,
    ctx.getLoadedPageUrls,
    ctx.getPageMeta,
    loadedPageCount,
    getSource,
  ]);

  return null;
}

export function DualReadFab({ ctx }: { ctx: ReaderPluginContext }) {
  const { t } = useTranslation();
  const tr = useCallback((key: string) => t(`plugin.dualRead.${key}`), [t]);
  const enabled = useDualReadStore((s) => s.enabled);
  const activeSide = useDualReadStore((s) => s.activeSide);
  const fabPosition = useDualReadStore((s) => s.fabPosition);
  const setFabPosition = useDualReadStore((s) => s.setFabPosition);
  const setPeekActive = useDualReadStore((s) => s.setPeekActive);
  const setActiveSide = useDualReadStore((s) => s.setActiveSide);
  const seedPair = useDualReadStore((s) => s.seedPair);
  const primaryChapters = useDualReadStore((s) => s.primaryChapters);
  const secondaryChapters = useDualReadStore((s) => s.secondaryChapters);
  const secondaryRenderPlansByChapter = useDualReadStore((s) => s.secondaryRenderPlansByChapter);
  const driftDeltaByChapter = useDualReadStore((s) => s.driftDeltaByChapter);

  const [dragPos, setDragPos] = useState<DualReadFabPosition | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isPressing, setIsPressing] = useState(false);
  const [isHolding, setIsHolding] = useState(false);
  const holdTimerRef = useRef<number | null>(null);
  const isDraggingRef = useRef(false);
  const holdActiveRef = useRef(false);
  // If the user starts moving *after* hold has activated, treat it as a "hold+drag" intent
  // (commit the side switch) rather than "drag to reposition the FAB".
  const holdDragCommitRef = useRef(false);
  const pointerStartRef = useRef<{ x: number; y: number; startX: number; startY: number } | null>(null);

  // Compute loading state: visible pages without valid render plans
  const isLoading = useMemo(() => {
    if (!enabled || !seedPair || !primaryChapters.length || !secondaryChapters.length) return false;
    const visibleIndices = ctx.visiblePageIndices.length > 0 ? ctx.visiblePageIndices : [ctx.currentPageIndex];
    const primaryById = new Map(primaryChapters.map((c) => [c.id, c]));
    for (const pageIndex of visibleIndices) {
      const meta = ctx.getPageMeta(pageIndex);
      if (!meta || meta.kind !== 'page' || meta.localIndex == null || !meta.chapterId) continue;
      const primaryChapter = primaryById.get(meta.chapterId);
      if (!primaryChapter) continue;
      const secondaryChapterId = mapSecondaryChapterForPrimary({
        primaryChapter,
        primaryAll: primaryChapters,
        secondaryAll: secondaryChapters,
        seedPair,
      });
      if (!secondaryChapterId) continue;
      const plan = secondaryRenderPlansByChapter[meta.chapterId]?.[meta.localIndex];
      if (!plan) return true; // No plan yet
      if (plan.secondaryChapterId !== secondaryChapterId) return true; // Plan is stale
      if (plan.kind === 'missing') continue; // Missing is a valid terminal state (no alignment to schedule)
      const driftDelta = driftDeltaByChapter[meta.chapterId] ?? 0;
      if (plan.driftDelta !== driftDelta) return true; // Plan needs refresh
    }
    return false;
  }, [
    enabled,
    seedPair,
    primaryChapters,
    secondaryChapters,
    secondaryRenderPlansByChapter,
    driftDeltaByChapter,
    ctx.visiblePageIndices,
    ctx.currentPageIndex,
    ctx.getPageMeta,
  ]);

  // Compute valid initial position synchronously to avoid springs starting at -100
  const getValidInitialPosition = useCallback((): { x: number; y: number } => {
    if (fabPosition) return { x: fabPosition.x, y: fabPosition.y };
    if (typeof window === 'undefined') return { x: 0, y: 0 };
    const width = window.innerWidth;
    const height = window.visualViewport?.height ?? window.innerHeight;
    return {
      x: width - FAB_SIZE - FAB_MARGIN,
      y: Math.max(FAB_MARGIN, Math.round(height * 0.4)),
    };
  }, [fabPosition]);

  // Spring-based scale for smooth animations that complete naturally
  // Higher stiffness + lower damping = more bounce
  const scale = useSpring(1, { stiffness: 500, damping: 15 });
  const initialPos = getValidInitialPosition();
  const x = useSpring(initialPos.x, { stiffness: 300, damping: 30 });
  const y = useSpring(initialPos.y, { stiffness: 300, damping: 30 });
  
  // Track last known position to detect when we need to jump vs animate
  const lastPosRef = useRef<{ x: number; y: number } | null>(null);
  // Track if springs have been properly initialized (needs state to trigger re-render)
  const [springsInitialized, setSpringsInitialized] = useState(false);

  const clampPosition = useCallback((pos: DualReadFabPosition): DualReadFabPosition => {
    if (typeof window === 'undefined') return pos;
    const width = window.innerWidth;
    const height = window.visualViewport?.height ?? window.innerHeight;
    const maxY = Math.max(FAB_MARGIN, height - FAB_MARGIN - FAB_SIZE);
    const y = Math.max(FAB_MARGIN, Math.min(maxY, pos.y));
    const x = pos.side === 'left' ? FAB_MARGIN : Math.max(FAB_MARGIN, width - FAB_MARGIN - FAB_SIZE);
    return { x, y, side: pos.side };
  }, []);

  const ensureValidPosition = useCallback(() => {
    if (typeof window === 'undefined') return;
    if (!fabPosition) {
      const width = window.innerWidth;
      const height = window.visualViewport?.height ?? window.innerHeight;
      const pos: DualReadFabPosition = {
        x: width - FAB_SIZE - FAB_MARGIN,
        y: Math.max(FAB_MARGIN, Math.round(height * 0.4)),
        side: 'right',
      };
      setFabPosition(pos);
      return;
    }

    const clamped = clampPosition(fabPosition);
    if (clamped.x !== fabPosition.x || clamped.y !== fabPosition.y || clamped.side !== fabPosition.side) {
      setFabPosition(clamped);
    }
  }, [fabPosition, clampPosition, setFabPosition]);

  // On enable/mount, ensure persisted FAB position is within the current viewport before first paint.
  useLayoutEffect(() => {
    ensureValidPosition();
  }, [ensureValidPosition]);

  const snapToEdge = useCallback(
    (pos: { x: number; y: number }): DualReadFabPosition => {
      if (typeof window === 'undefined') return { x: pos.x, y: pos.y, side: 'right' };
      const width = window.innerWidth;
      const side: DualReadFabPosition['side'] = pos.x + FAB_SIZE / 2 < width / 2 ? 'left' : 'right';
      return clampPosition({ x: pos.x, y: pos.y, side });
    },
    [clampPosition]
  );

  const clearHoldTimer = useCallback(() => {
    if (holdTimerRef.current) {
      window.clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
  }, []);

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.stopPropagation();
      setIsPressing(true);
      setIsHolding(false);
      isDraggingRef.current = false;
      holdActiveRef.current = false;
      holdDragCommitRef.current = false;
      pointerStartRef.current = {
        x: event.clientX,
        y: event.clientY,
        startX: (dragPos ?? fabPosition)?.x ?? 0,
        startY: (dragPos ?? fabPosition)?.y ?? 0,
      };

      // Animate press scale - more dramatic
      scale.set(0.82);

      clearHoldTimer();
      holdTimerRef.current = window.setTimeout(() => {
        holdActiveRef.current = true;
        setIsHolding(true);
        setPeekActive(true);
        // Additional compression for hold
        scale.set(0.78);
      }, HOLD_DELAY_MS);

      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [fabPosition, dragPos, setPeekActive, clearHoldTimer, scale]
  );

  const handlePointerMove = useCallback((event: React.PointerEvent<HTMLButtonElement>) => {
    if (!pointerStartRef.current) return;
    const dx = event.clientX - pointerStartRef.current.x;
    const dy = event.clientY - pointerStartRef.current.y;

    // If hold is already active, preserve the hold intent even if the user starts moving.
    // Moving during hold commits the side switch on release.
    if (holdActiveRef.current) {
      if (Math.hypot(dx, dy) > DRAG_THRESHOLD_PX) {
        holdDragCommitRef.current = true;
      }
      return;
    }

    if (!isDraggingRef.current && Math.hypot(dx, dy) > DRAG_THRESHOLD_PX) {
      isDraggingRef.current = true;
      setIsDragging(true);
      setIsPressing(false);
      clearHoldTimer();
      // Lift up for drag
      scale.set(1.12);
    }
    if (!isDraggingRef.current) return;
    // Directly set position during drag for responsiveness
    x.jump(pointerStartRef.current.startX + dx);
    y.jump(pointerStartRef.current.startY + dy);
    setDragPos({
      x: pointerStartRef.current.startX + dx,
      y: pointerStartRef.current.startY + dy,
      side: 'right',
    });
  }, [clearHoldTimer, setPeekActive, scale, x, y]);

  const handlePointerUp = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      if (!pointerStartRef.current) return;
      event.preventDefault();
      event.stopPropagation();
      clearHoldTimer();

      // Animate scale back to rest - spring will complete naturally
      scale.set(1);

      if (isDraggingRef.current && dragPos) {
        const snapped = snapToEdge({ x: dragPos.x, y: dragPos.y });
        // Animate snap with spring
        x.set(snapped.x);
        y.set(snapped.y);
        lastPosRef.current = { x: snapped.x, y: snapped.y };
        setFabPosition(snapped);
        setDragPos(null);
      } else if (holdActiveRef.current) {
        const commitSwitch = holdDragCommitRef.current;
        holdActiveRef.current = false;
        holdDragCommitRef.current = false;
        setIsHolding(false);
        setPeekActive(false);
        if (enabled && commitSwitch) {
          const nextSide = activeSide === 'primary' ? 'secondary' : 'primary';
          setActiveSide(nextSide);
        }
      } else if (enabled) {
        const nextSide = activeSide === 'primary' ? 'secondary' : 'primary';
        setActiveSide(nextSide);
      }

      isDraggingRef.current = false;
      pointerStartRef.current = null;
      setIsDragging(false);
      setIsPressing(false);
      try {
        event.currentTarget.releasePointerCapture(event.pointerId);
      } catch {
        // ignore
      }
    },
    [
      clearHoldTimer,
      dragPos,
      enabled,
      activeSide,
      setActiveSide,
      setFabPosition,
      setPeekActive,
      snapToEdge,
      scale,
      x,
      y,
    ]
  );

  const handlePointerCancel = useCallback(() => {
    clearHoldTimer();
    scale.set(1);
    if (holdActiveRef.current) setPeekActive(false);
    holdActiveRef.current = false;
    holdDragCommitRef.current = false;
    isDraggingRef.current = false;
    pointerStartRef.current = null;
    setDragPos(null);
    setIsDragging(false);
    setIsPressing(false);
    setIsHolding(false);
  }, [clearHoldTimer, setPeekActive, scale]);

  useEffect(() => {
    if (!fabPosition) return;
    const handleResize = () => {
      setFabPosition(clampPosition(fabPosition));
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [fabPosition, clampPosition, setFabPosition]);

  // Sync spring position when fabPosition changes (not during drag)
  // Use useLayoutEffect to update springs BEFORE paint, preventing visible jump
  useLayoutEffect(() => {
    if (!fabPosition || isDragging) return;
    
    const lastPos = lastPosRef.current;
    // Jump immediately if this is first position or position changed significantly (e.g. window resize snap)
    const shouldJump = !lastPos || 
      Math.abs(lastPos.x - fabPosition.x) > 100 || 
      Math.abs(lastPos.y - fabPosition.y) > 100;
    
    if (shouldJump) {
      x.jump(fabPosition.x);
      y.jump(fabPosition.y);
    } else {
      x.set(fabPosition.x);
      y.set(fabPosition.y);
    }
    lastPosRef.current = { x: fabPosition.x, y: fabPosition.y };
    if (!springsInitialized) setSpringsInitialized(true);
  }, [fabPosition, isDragging, x, y, springsInitialized]);

  // Don't render until springs are initialized to prevent flying from wrong position
  if (!enabled || !fabPosition || !springsInitialized) return null;

  const isSecondary = activeSide === 'secondary';

  return createPortal(
    <motion.button
      type="button"
      className="fixed z-[9] size-14 flex items-center justify-center dual-read-fab select-none"
      data-secondary={isSecondary}
      data-pressed={isPressing || isHolding}
      data-holding={isHolding}
      data-loading={isLoading}
      style={{
        left: x,
        top: y,
        scale,
        WebkitTouchCallout: 'none',
        WebkitUserSelect: 'none',
        touchAction: 'manipulation',
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      aria-label={tr('fab.label')}
    >
      {/* Icon */}
      {isLoading ? (
        <Spinner className="relative z-10 size-[20px] reader-ui-text-primary pointer-events-none" />
      ) : (
        <HugeiconsIcon
          icon={Copy02Icon}
          className="relative z-10 size-[22px] reader-ui-text-primary pointer-events-none"
        />
      )}
    </motion.button>,
    document.body
  );
}

export function DualReadReaderOverlay({ ctx }: { ctx: ReaderPluginContext }) {
  const enabled = useDualReadStore((s) => s.enabled);
  return (
    <>
      <DualReadSessionManager ctx={ctx} />
      <DualReadSecondaryPrefetcher ctx={ctx} />
      <DualReadAutoAligner ctx={ctx} />
      <DualReadConfigDialog ctx={ctx} />
      <DualReadDebugOverlay ctx={ctx} />
      {enabled && <DualReadFab ctx={ctx} />}
    </>
  );
}

export function DualReadOverlay({ pageIndex, ctx }: { pageIndex: number; ctx: ReaderPluginContext }) {
  const { t } = useTranslation();
  const tr = useCallback((key: string, options?: Record<string, unknown>) => {
    return t(`plugin.dualRead.${key}`, options);
  }, [t]);
  const overlayImageRef = useRef<HTMLImageElement | null>(null);
  const overlayContainerRef = useRef<HTMLDivElement | null>(null);
  const [alignmentLayout, setAlignmentLayout] = useState<AlignmentLayout | null>(null);
  const enabled = useDualReadStore((s) => s.enabled);
  const activeSide = useDualReadStore((s) => s.activeSide);
  const peekActive = useDualReadStore((s) => s.peekActive);
  const seedPair = useDualReadStore((s) => s.seedPair);
  const driftDeltaByChapter = useDualReadStore((s) => s.driftDeltaByChapter);
  const primaryChapters = useDualReadStore((s) => s.primaryChapters);
  const secondaryChapters = useDualReadStore((s) => s.secondaryChapters);
  const secondarySource = useDualReadStore((s) => s.secondarySource);
  const secondaryPagesByChapter = useDualReadStore((s) => s.secondaryPagesByChapter);
  const secondaryImageUrls = useDualReadStore((s) => s.secondaryImageUrls);
  const secondaryRenderPlansByChapter = useDualReadStore((s) => s.secondaryRenderPlansByChapter);
  const secondaryAlignmentByChapter = useDualReadStore((s) => s.secondaryAlignmentByChapter);

  const { useSettingsStore } = useStores();
  const getSource = useSettingsStore((s) => s.getSource);

  const effectiveSide = peekActive ? (activeSide === 'primary' ? 'secondary' : 'primary') : activeSide;
  const showSecondary = enabled && effectiveSide === 'secondary';

  const meta = ctx.getPageMeta(pageIndex);
  const globalIndex = ctx.visiblePageIndices[0] ?? ctx.currentPageIndex;
  const isGlobal = pageIndex === globalIndex;

  const primaryChapter = useMemo(() => {
    if (!meta || meta.kind !== 'page') return null;
    return primaryChapters.find((c) => c.id === meta.chapterId);
  }, [meta, primaryChapters]);

  const secondaryChapterId = useMemo(() => {
    if (!primaryChapter || !seedPair || secondaryChapters.length === 0) return null;
    return mapSecondaryChapterForPrimary({
      primaryChapter,
      primaryAll: primaryChapters,
      secondaryAll: secondaryChapters,
      seedPair,
    });
  }, [primaryChapter, primaryChapters, secondaryChapters, seedPair]);

  const mappedIndex = useMemo(() => {
    if (!meta || meta.kind !== 'page' || meta.localIndex == null) return null;
    const driftDelta = meta.chapterId ? driftDeltaByChapter[meta.chapterId] ?? 0 : 0;
    return mapSecondaryPageIndex({
      primaryIndex: meta.localIndex,
      driftDelta,
    });
  }, [meta, driftDeltaByChapter]);

  const renderPlan = useMemo(() => {
    if (!meta || meta.kind !== 'page' || meta.localIndex == null || !meta.chapterId) return null;
    if (!secondaryChapterId) return null;
    const plan = secondaryRenderPlansByChapter[meta.chapterId]?.[meta.localIndex];
    if (!plan) return null;
    if (plan.secondaryChapterId !== secondaryChapterId) return null;
    const driftDelta = driftDeltaByChapter[meta.chapterId] ?? 0;
    if (plan.driftDelta !== driftDelta) return null;
    return plan;
  }, [meta, secondaryChapterId, secondaryRenderPlansByChapter, driftDeltaByChapter]);

  const alignment = useMemo(() => {
    if (!meta || meta.kind !== 'page' || !meta.chapterId || meta.localIndex == null) return null;
    if (!secondaryChapterId) return null;
    const entry = secondaryAlignmentByChapter[meta.chapterId];
    if (!entry || entry.secondaryChapterId !== secondaryChapterId) return null;
    return entry.byPage[meta.localIndex] ?? null;
  }, [meta, secondaryChapterId, secondaryAlignmentByChapter]);

  const secondaryPages = secondaryChapterId ? secondaryPagesByChapter[secondaryChapterId] : undefined;
  const clampedIndex = secondaryPages && mappedIndex != null ? clampIndex(mappedIndex, secondaryPages.length) : null;
  const imageKey = useMemo(() => {
    if (renderPlan) {
      if (renderPlan.kind === 'missing') return null;
      if (renderPlan.kind === 'single') {
        return `${renderPlan.secondaryChapterId}:${renderPlan.secondaryIndex}`;
      }
      if (renderPlan.kind === 'split') {
        return `split:${renderPlan.secondaryChapterId}:${renderPlan.secondaryIndex}:${renderPlan.side}`;
      }
      return `merge:${renderPlan.secondaryChapterId}:${renderPlan.secondaryIndices[0]}:${renderPlan.secondaryIndices[1]}:${renderPlan.order}`;
    }
    return secondaryChapterId && clampedIndex != null ? `${secondaryChapterId}:${clampedIndex}` : null;
  }, [renderPlan, secondaryChapterId, clampedIndex]);
  const imageUrl = imageKey ? secondaryImageUrls.get(imageKey) : undefined;
  const isMissing = renderPlan?.kind === 'missing';
  const lookupReady = Boolean(primaryChapter && seedPair && secondaryChapters.length > 0);
  const applyAlignment = alignment && alignment.confidence >= ALIGNMENT_CONFIDENCE_MIN_DEFAULT;
  const getPrimaryImage = useCallback(() => {
    if (typeof document === 'undefined') return null;
    const container = overlayContainerRef.current;
    const root = container?.parentElement?.parentElement;
    if (root) {
      return root.querySelector(`img[data-reader-page-index=\"${pageIndex}\"]`) as HTMLImageElement | null;
    }
    return document.querySelector(`img[data-reader-page-index=\"${pageIndex}\"]`) as HTMLImageElement | null;
  }, [pageIndex]);

  const updateAlignmentLayout = useCallback(() => {
    if (!applyAlignment || !alignment) {
      setAlignmentLayout(null);
      return;
    }
    const container = overlayContainerRef.current;
    const overlayImg = overlayImageRef.current;
    const primaryImg = getPrimaryImage();
    if (!container || !overlayImg || !primaryImg) {
      return;
    }
    if (!primaryImg.naturalWidth || !primaryImg.naturalHeight) {
      return;
    }
    if (!overlayImg.naturalWidth || !overlayImg.naturalHeight) {
      return;
    }

    // IMPORTANT: use layout (untransformed) size, not getBoundingClientRect().
    // The reader can apply CSS transforms for zoom (Swiper Zoom / react-zoom-pan-pinch),
    // and getBoundingClientRect() reflects the *transformed* visual box. Our absolute
    // positioning is in the element's *layout* coordinate space, so mixing these causes
    // scale-dependent misalignment under zoom.
    const containerW = container.clientWidth;
    const containerH = container.clientHeight;
    if (containerW <= 0 || containerH <= 0) {
      return;
    }
    const primaryRender = computeRenderBounds(
      containerW,
      containerH,
      primaryImg.naturalWidth,
      primaryImg.naturalHeight
    );
    const frameLeft = primaryRender.left;
    const frameTop = primaryRender.top;
    const frameW = primaryRender.width;
    const frameH = primaryRender.height;
    if (frameW <= 0 || frameH <= 0) {
      return;
    }

    const primaryDisplayW = primaryRender.width;
    const primaryDisplayH = primaryRender.height;
    const primaryScale = primaryDisplayW / Math.max(1, primaryImg.naturalWidth);

    const secondaryScale = computeFitScale(frameW, frameH, overlayImg.naturalWidth, overlayImg.naturalHeight);
    if (!Number.isFinite(secondaryScale) || secondaryScale === 0) {
      return;
    }

    const primaryDownsample = computeAlignmentDownsampleScale(
      primaryImg.naturalWidth,
      primaryImg.naturalHeight,
      ALIGNMENT_FINE_MAX_DEFAULT
    );
    const secondaryDownsample = computeAlignmentDownsampleScale(
      overlayImg.naturalWidth,
      overlayImg.naturalHeight,
      ALIGNMENT_FINE_MAX_DEFAULT
    );

    const secondaryDisplayW = overlayImg.naturalWidth * secondaryScale;
    const secondaryDisplayH = overlayImg.naturalHeight * secondaryScale;

    const secondaryLeft = frameLeft + (frameW - secondaryDisplayW) / 2;
    const secondaryTop = frameTop + (frameH - secondaryDisplayH) / 2;
    const baseTranslateX = (secondaryDisplayW - primaryDisplayW) / 2;
    const baseTranslateY = (secondaryDisplayH - primaryDisplayH) / 2;
    const translateBasisW = primaryDisplayW;
    const translateBasisH = primaryDisplayH;
    const alignTranslateX = alignment.dx * translateBasisW;
    const alignTranslateY = alignment.dy * translateBasisH;
    const alignmentScale = alignment.scale * (secondaryDownsample / primaryDownsample);
    const scale = alignmentScale * (primaryScale / secondaryScale);
    if (!Number.isFinite(scale) || !Number.isFinite(secondaryDisplayW) || !Number.isFinite(secondaryDisplayH)) {
      return;
    }

    const clipPath = 'none';

    setAlignmentLayout({
      left: secondaryLeft,
      top: secondaryTop,
      width: secondaryDisplayW,
      height: secondaryDisplayH,
      translateX: baseTranslateX + alignTranslateX,
      translateY: baseTranslateY + alignTranslateY,
      scale,
      clipPath,
    });
  }, [applyAlignment, alignment, getPrimaryImage]);

  useEffect(() => {
    setAlignmentLayout(null);
    updateAlignmentLayout();
  }, [updateAlignmentLayout, imageUrl]);

  useEffect(() => {
    if (!applyAlignment || !alignment) return;
    updateAlignmentLayout();
  }, [applyAlignment, alignment, imageUrl, updateAlignmentLayout]);

  useEffect(() => {
    if (!applyAlignment || !alignment) return;
    const container = overlayContainerRef.current;
    if (!container || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => {
      updateAlignmentLayout();
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [applyAlignment, alignment, updateAlignmentLayout]);

  useEffect(() => {
    if (!applyAlignment || !alignment) return;
    const primaryImg = getPrimaryImage();
    if (!primaryImg) return;
    const handleLoad = () => {
      updateAlignmentLayout();
    };
    if (primaryImg.complete) handleLoad();
    primaryImg.addEventListener('load', handleLoad);
    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(() => {
        updateAlignmentLayout();
      });
      observer.observe(primaryImg);
    }
    return () => {
      primaryImg.removeEventListener('load', handleLoad);
      observer?.disconnect();
    };
  }, [applyAlignment, alignment, getPrimaryImage, updateAlignmentLayout]);

  const alignmentStyle = useMemo(() => {
    if (!applyAlignment || !alignmentLayout) return undefined;
    return {
      position: 'absolute',
      left: alignmentLayout.left,
      top: alignmentLayout.top,
      width: alignmentLayout.width,
      height: alignmentLayout.height,
      clipPath: alignmentLayout.clipPath,
      transform: `translate(${alignmentLayout.translateX.toFixed(2)}px, ${alignmentLayout.translateY.toFixed(
        2
      )}px) scale(${alignmentLayout.scale.toFixed(4)})`,
      transformOrigin: 'top left',
    } satisfies CSSProperties;
  }, [applyAlignment, alignmentLayout]);
  const useAlignedLayout = Boolean(alignmentStyle);

  const handleOverlayLoad = useCallback(() => {
    updateAlignmentLayout();
  }, [updateAlignmentLayout]);

  useEffect(() => {
    if (!showSecondary || !secondarySource || !secondaryChapterId) return;
    if (renderPlan) {
      if (renderPlan.kind === 'missing') return;
      if (renderPlan.kind === 'single') {
        void ensureSecondaryImage(getSource, secondarySource, secondaryChapterId, renderPlan.secondaryIndex);
      } else {
        void ensureSecondaryCompositeImage(getSource, secondarySource, renderPlan);
      }
      return;
    }
    if (mappedIndex == null) return;
    void ensureSecondaryImage(getSource, secondarySource, secondaryChapterId, mappedIndex);
  }, [showSecondary, secondarySource, secondaryChapterId, renderPlan, mappedIndex, getSource]);

  if (!enabled && !isGlobal) return null;

  return (
    <>
      {showSecondary && meta?.kind === 'page' && (
        <>
          {secondaryChapterId ? (
            isMissing ? null : imageUrl ? (
              <div
                ref={overlayContainerRef}
                className="relative flex w-full h-full items-center justify-center overflow-hidden select-none"
                style={{ WebkitTouchCallout: 'none', WebkitUserSelect: 'none' }}
              >
                {useAlignedLayout ? (
                  <div style={alignmentStyle}>
                    <img
                      ref={overlayImageRef}
                      src={imageUrl}
                      alt=""
                      className="block w-full h-full pointer-events-none"
                      draggable={false}
                      onLoad={handleOverlayLoad}
                      onContextMenu={(e) => e.preventDefault()}
                    />
                  </div>
                ) : (
                  <img
                    ref={overlayImageRef}
                    src={imageUrl}
                    alt=""
                    className={
                      ctx.readingMode === 'scrolling'
                        ? 'block w-full h-auto object-contain pointer-events-none'
                        : 'h-full w-full object-contain pointer-events-none'
                    }
                    draggable={false}
                    onLoad={handleOverlayLoad}
                    onContextMenu={(e) => e.preventDefault()}
                  />
                )}
              </div>
            ) : (
              <div className="flex w-full h-full items-center justify-center bg-black/60 pointer-events-none select-none">
                <Spinner className="size-6 text-white" />
              </div>
            )
          ) : lookupReady ? (
            isGlobal && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="rounded-2xl bg-black/70 px-4 py-3 text-white text-sm text-center max-w-[260px]">
                  <div>{tr('overlay.unavailableTitle')}</div>
                  <div className="mt-2 text-xs text-white/80">{tr('overlay.unavailableHint')}</div>
                </div>
              </div>
            )
          ) : (
            <div className="flex w-full h-full items-center justify-center bg-black/60 pointer-events-none">
              <Spinner className="size-6 text-white" />
            </div>
          )}
        </>
      )}
    </>
  );
}
