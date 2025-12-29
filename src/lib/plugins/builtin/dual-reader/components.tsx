import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
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
import { useDualReadStore, type DualReadFabPosition, type DualReadSide } from './store';
import type { Chapter, Page } from '@/lib/sources/types';
import { computeDualReadHashInWorker } from './dhash-worker-client';
import { getCachedDualReadHash, setCachedDualReadHash, type DualReadHashCacheKey } from './dhash-cache';

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
    return sortedSources.filter((s) => s.id !== primaryLink.id);
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
      return;
    }
    const key = makeSourceKey(selectedSecondary);
    if (secondaryKeyRef.current === key) {
      if (
        secondarySource?.id === selectedSecondary.id &&
        storedSecondaryChapters.length > 0 &&
        secondaryChapters.length === 0
      ) {
        setSecondaryChapters(storedSecondaryChapters);
      }
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
    secondaryChapters.length,
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

        <div className="space-y-4">
          <div className="space-y-2">
            <div className="text-xs text-muted-foreground">{tr('dialog.secondarySource')}</div>
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
  const setDriftDelta = useDualReadStore((s) => s.setDriftDelta);
  const setSecondaryRenderPlan = useDualReadStore((s) => s.setSecondaryRenderPlan);
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
  const inFlightRef = useRef(new Set<string>());
  const secondaryKey = secondarySource ? makeSourceKey(secondarySource) : null;

  useEffect(() => {
    primaryHashCacheRef.current.clear();
    secondaryHashCacheRef.current.clear();
    pendingPrimaryRef.current.clear();
    pendingSecondaryRef.current.clear();
    acceptedDistancesRef.current.clear();
    lastRunRef.current = null;
    inFlightRef.current.clear();
  }, [sessionKey, secondaryKey]);

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
        });
        cache.set(cacheKey, hash);
        pending.delete(cacheKey);
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
        });
        cache.set(cacheKey, hash);
        pending.delete(cacheKey);
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

  useEffect(() => {
    const debugEnabled = isDualReadDebugEnabled();
    const logSkip = (reason: string, data?: Record<string, unknown>) => {
      if (!debugEnabled) return;
      const key = `${reason}:${data?.pageIndex ?? ''}:${data?.chapterId ?? ''}`;
      if (lastSkipRef.current === key) return;
      lastSkipRef.current = key;
      console.debug('[DualRead] autoAlign skip', { reason, ...data });
    };
    const logDebug = (label: string, data?: Record<string, unknown>) => {
      if (!debugEnabled) return;
      console.debug(`[DualRead] autoAlign ${label}`, data ?? {});
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
    const pageCandidates = visibleIndices
      .map((index) => ({ index, meta: ctx.getPageMeta(index) }))
      .filter(
        (entry) => entry.meta?.kind === 'page' && entry.meta.localIndex != null && entry.meta.chapterId
      );
    if (pageCandidates.length === 0) {
      logSkip('page_meta_unavailable', { pageIndex: ctx.currentPageIndex, visibleIndices });
      return;
    }

    const candidates = pageCandidates
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
    if (lastRunRef.current === runKey) return;
    if (inFlightRef.current.has(runKey)) return;
    inFlightRef.current.add(runKey);
    lastSkipRef.current = null;

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
        const chosen = sortedAccepted[0] ?? null;
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
    ctx.getPageMeta,
    ctx.getPageImageUrl,
    getSource,
    getPrimaryHash,
    getSecondaryHash,
    setDriftDelta,
    setSecondaryRenderPlan,
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

export function DualReadFab() {
  const { t } = useTranslation();
  const tr = useCallback((key: string) => t(`plugin.dualRead.${key}`), [t]);
  const enabled = useDualReadStore((s) => s.enabled);
  const activeSide = useDualReadStore((s) => s.activeSide);
  const fabPosition = useDualReadStore((s) => s.fabPosition);
  const setFabPosition = useDualReadStore((s) => s.setFabPosition);
  const setPeekActive = useDualReadStore((s) => s.setPeekActive);
  const setActiveSide = useDualReadStore((s) => s.setActiveSide);

  const [dragPos, setDragPos] = useState<DualReadFabPosition | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isPressing, setIsPressing] = useState(false);
  const [isHolding, setIsHolding] = useState(false);
  const holdTimerRef = useRef<number | null>(null);
  const isDraggingRef = useRef(false);
  const holdActiveRef = useRef(false);
  const pointerStartRef = useRef<{ x: number; y: number; startX: number; startY: number } | null>(null);

  const ensureDefaultPosition = useCallback(() => {
    if (fabPosition || typeof window === 'undefined') return;
    const width = window.innerWidth;
    const height = window.visualViewport?.height ?? window.innerHeight;
    const pos: DualReadFabPosition = {
      x: width - FAB_SIZE - FAB_MARGIN,
      y: Math.max(FAB_MARGIN, Math.round(height * 0.4)),
      side: 'right',
    };
    setFabPosition(pos);
  }, [fabPosition, setFabPosition]);

  useEffect(() => {
    ensureDefaultPosition();
  }, [ensureDefaultPosition]);

  const clampPosition = useCallback((pos: DualReadFabPosition): DualReadFabPosition => {
    if (typeof window === 'undefined') return pos;
    const width = window.innerWidth;
    const height = window.visualViewport?.height ?? window.innerHeight;
    const maxY = Math.max(FAB_MARGIN, height - FAB_MARGIN - FAB_SIZE);
    const y = Math.max(FAB_MARGIN, Math.min(maxY, pos.y));
    const x = pos.side === 'left' ? FAB_MARGIN : Math.max(FAB_MARGIN, width - FAB_MARGIN - FAB_SIZE);
    return { x, y, side: pos.side };
  }, []);

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
      pointerStartRef.current = {
        x: event.clientX,
        y: event.clientY,
        startX: (dragPos ?? fabPosition)?.x ?? 0,
        startY: (dragPos ?? fabPosition)?.y ?? 0,
      };

      clearHoldTimer();
      holdTimerRef.current = window.setTimeout(() => {
        holdActiveRef.current = true;
        setIsHolding(true);
        setPeekActive(true);
      }, HOLD_DELAY_MS);

      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [fabPosition, dragPos, setPeekActive, clearHoldTimer]
  );

  const handlePointerMove = useCallback((event: React.PointerEvent<HTMLButtonElement>) => {
    if (!pointerStartRef.current) return;
    const dx = event.clientX - pointerStartRef.current.x;
    const dy = event.clientY - pointerStartRef.current.y;
    if (!isDraggingRef.current && Math.hypot(dx, dy) > DRAG_THRESHOLD_PX) {
      isDraggingRef.current = true;
      setIsDragging(true);
      setIsPressing(false);
      clearHoldTimer();
      if (holdActiveRef.current) {
        holdActiveRef.current = false;
        setIsHolding(false);
        setPeekActive(false);
      }
    }
    if (!isDraggingRef.current) return;
    setDragPos({
      x: pointerStartRef.current.startX + dx,
      y: pointerStartRef.current.startY + dy,
      side: 'right',
    });
  }, [clearHoldTimer, setPeekActive]);

  const handlePointerUp = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      if (!pointerStartRef.current) return;
      event.preventDefault();
      event.stopPropagation();
      clearHoldTimer();

      if (isDraggingRef.current && dragPos) {
        const snapped = snapToEdge({ x: dragPos.x, y: dragPos.y });
        setFabPosition(snapped);
        setDragPos(null);
      } else if (holdActiveRef.current) {
        holdActiveRef.current = false;
        setIsHolding(false);
        setPeekActive(false);
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
    ]
  );

  const handlePointerCancel = useCallback(() => {
    clearHoldTimer();
    if (holdActiveRef.current) setPeekActive(false);
    holdActiveRef.current = false;
    isDraggingRef.current = false;
    pointerStartRef.current = null;
    setDragPos(null);
    setIsDragging(false);
    setIsPressing(false);
    setIsHolding(false);
  }, [clearHoldTimer, setPeekActive]);

  useEffect(() => {
    if (!fabPosition) return;
    const handleResize = () => {
      setFabPosition(clampPosition(fabPosition));
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [fabPosition, clampPosition, setFabPosition]);

  if (!enabled || !fabPosition) return null;

  const displayPos = dragPos ?? fabPosition;
  const scaleClass = isHolding ? 'scale-[0.92]' : isPressing ? 'scale-[0.96]' : '';
  const motionClass = isDragging
    ? 'transition-none'
    : 'transition-[left,top,transform,box-shadow,background-color] duration-200 ease-out';

  return (
    createPortal(
      <button
        type="button"
        className={`fixed z-[70] size-12 !rounded-full reader-settings-popup shadow-lg flex items-center justify-center reader-ui-text-primary ${motionClass} ${scaleClass}`}
        style={{ left: displayPos.x, top: displayPos.y }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        aria-label={tr('fab.label')}
      >
        <span
          className={`pointer-events-none absolute inset-0 rounded-full border border-black/10 dark:border-white/15 transition-opacity duration-200 ${
            isPressing || isHolding ? 'opacity-100' : 'opacity-0'
          }`}
        />
        <span
          className={`pointer-events-none absolute inset-0 rounded-full bg-black/5 dark:bg-white/10 transition-all duration-300 ${
            isHolding ? 'opacity-100 scale-110' : 'opacity-0 scale-95'
          }`}
        />
        <HugeiconsIcon icon={Copy02Icon} className="size-5" />
      </button>,
      document.body
    )
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
      {enabled && <DualReadFab />}
    </>
  );
}

export function DualReadOverlay({ pageIndex, ctx }: { pageIndex: number; ctx: ReaderPluginContext }) {
  const { t } = useTranslation();
  const tr = useCallback((key: string, options?: Record<string, unknown>) => {
    return t(`plugin.dualRead.${key}`, options);
  }, [t]);
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
              <img
                src={imageUrl}
                alt=""
                className={
                  ctx.readingMode === 'scrolling'
                    ? 'block w-full h-auto object-contain pointer-events-none'
                    : 'h-full w-full object-contain pointer-events-none'
                }
              />
            ) : (
              <div className="flex w-full h-full items-center justify-center bg-black/60 pointer-events-none">
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
