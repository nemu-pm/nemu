/**
 * Mobile dual-reader AutoAligner — the render-plan + alignment orchestrator.
 * Native counterpart to web's `DualReadAutoAligner`
 * (`src/lib/plugins/builtin/dual-reader/components.tsx:1209-2553`).
 *
 * Web runs two effects — a render-plan effect (`:1911-2438`) that matches every
 * loaded/visible primary page against secondary dHashes and writes
 * `secondaryRenderPlansByChapter` + drift, and an alignment-queue effect
 * (`:2440-2550`) that schedules `requestAlignmentForPlan` for the resulting plans.
 * Web's model is multi-page (global page indices, loaded-page-url maps, page
 * meta, abort-on-scroll-off, stable-visible debouncing, backfill queueing).
 *
 * Mobile splits the concern (one chapter visible at a time): this component
 * processes a window of primary pages around the current page (`currentLocalIndex
 * ± AUTO_ALIGN_WINDOW`), matches each against the secondary chapter's dHashes,
 * writes render plans + drift, and schedules alignment for accepted plans via
 * the worklet align-thread bridge (`mobileDualReaderAlignThread`). This keeps
 * the overlay ready as the user pages, without web's full windowing/abort
 * machinery (the align-thread's own concurrency=2 queue provides the throttle).
 *
 * Faithful ports from web:
 * - `findBestSecondaryMatch` + `evaluateSecondaryMatch` (adaptive accept/missing)
 * - `buildRenderPlanFromMatch` / `buildMissingPlan` + the visible-page fallback
 * - `getDriftExpectedIndex` + `updateDriftDelta` for drift tracking
 * - in-flight dedup (run + alignment keys), retry cooldown on alignment
 * - dHash cache (`mobileDualReaderDhashCache`) writes; in-memory hash+sample cache
 *   (one decode per page serves both matching and alignment, since
 *   `computeHashFromBytes` returns both)
 * - debug store event/snapshot updates (gated by `overlayEnabled`)
 *
 * DEVICE-GATED: byte fetch + Skia decode + the worklet `require("@nemu/core/dual-reader")`
 * are verified on-device (T7.4). The orchestration wiring is typechecked here;
 * the pure decision functions it calls are unit-tested in
 * `mobileDualReaderRuntime.test.ts`.
 */
import { useCallback, useEffect, useRef } from "react";
import { AppState } from "react-native";
import {
  ALIGNMENT_CONFIDENCE_MIN_DEFAULT,
  getAlignmentPlanSignature,
  getDriftExpectedIndex,
  mapSecondaryChapterForPrimary,
  mapSecondaryPageIndex,
  updateDriftDelta,
} from "@nemu/core/dual-reader";
import type {
  AlignmentResult,
  LumaImage,
  MultiDhash,
  SecondaryRenderPlan,
} from "@nemu/core/dual-reader";
import { getMobileDualReaderRenderer } from "@/lib/mobileDualReaderSkiaAdapter";
import {
  ALIGNMENT_FINE_MAX_DEFAULT,
  ALIGNMENT_RETRY_MS,
  AUTO_ALIGN_CENTER_RATIO,
  AUTO_ALIGN_HISTORY_LIMIT,
  AUTO_ALIGN_WINDOW,
  buildAutoAlignCandidates,
  buildAutoAlignMatchOptions,
  buildMissingPlan,
  buildRenderPlanFromMatch,
  computeHashFromBytes,
  evaluateSecondaryMatch,
  findBestSecondaryMatch,
  requestAlignmentFromSamples,
} from "@/lib/mobileDualReaderRuntime";
import type { DualReadDebugSnapshot } from "@/lib/mobileDualReaderDebugStore";
import type { AlignThreadHandle } from "@/lib/mobileDualReaderAlignThread";
import { createMobileDualReaderAlignThread } from "@/lib/mobileDualReaderAlignThread";
import {
  MobileDualReaderDecodeCancelledError,
  isMobileDualReaderDecodeCancelledError,
  mobileDualReaderDecodeScheduler,
} from "@/lib/mobileDualReaderDecodeScheduler";
import {
  getCachedMobileDualReadHash,
  setCachedMobileDualReadHash,
} from "@/lib/mobileDualReaderDhashCache";
import {
  getMobileDualReaderLruEntry,
  setMobileDualReaderLruEntry,
} from "@/lib/mobileDualReaderMemoryCache";
import { fetchMobilePageBytes } from "@/lib/mobileDualReaderSecondaryImages";
import {
  getMobileDualReadStore,
  useMobileDualReaderStore,
} from "@/lib/mobileDualReaderStore";
import { getMobileDualReadDebugStore } from "@/lib/mobileDualReaderDebugStore";
import { useMobileDualReaderContext } from "./MobileDualReaderContext";

type HashCacheKey = {
  registryId: string;
  sourceId: string;
  mangaId: string;
  chapterId: string;
  pageIndex: number;
};

type HashAndSample = { hash: MultiDhash; sample: LumaImage };

function range(start: number, end: number): number[] {
  const out: number[] = [];
  for (let i = start; i <= end; i += 1) out.push(i);
  return out;
}

export function MobileDualReaderAutoAligner() {
  const ctx = useMobileDualReaderContext();
  const renderer = getMobileDualReaderRenderer();

  const enabled = useMobileDualReaderStore((s) => s.enabled);
  const runtimeSuspended = useMobileDualReaderStore((s) => s.runtimeSuspended);
  const seedPair = useMobileDualReaderStore((s) => s.seedPair);
  const secondarySource = useMobileDualReaderStore((s) => s.secondarySource);
  const primaryChapters = useMobileDualReaderStore((s) => s.primaryChapters);
  const secondaryChapters = useMobileDualReaderStore((s) => s.secondaryChapters);
  const secondaryPagesByChapter = useMobileDualReaderStore(
    (s) => s.secondaryPagesByChapter,
  );
  const driftDeltaByChapter = useMobileDualReaderStore((s) => s.driftDeltaByChapter);
  const setDriftDelta = useMobileDualReaderStore((s) => s.setDriftDelta);
  const setSecondaryRenderPlan = useMobileDualReaderStore(
    (s) => s.setSecondaryRenderPlan,
  );
  const setSecondaryAlignment = useMobileDualReaderStore(
    (s) => s.setSecondaryAlignment,
  );
  const setRuntimeSuspended = useMobileDualReaderStore(
    (s) => s.setRuntimeSuspended,
  );

  // In-memory caches (mirror web's refs). One decode per page yields both the
  // hash (for matching) and the sample (for alignment); both are stored together.
  const primarySampleCacheRef = useRef(new Map<string, HashAndSample>());
  const secondarySampleCacheRef = useRef(new Map<string, HashAndSample>());
  const pendingDecodeRef = useRef(new Map<string, Promise<HashAndSample>>());
  const cacheGenerationRef = useRef(0);
  const acceptedDistancesRef = useRef(new Map<string, number[]>());
  const inFlightRunRef = useRef(new Set<string>());
  const inFlightAlignRef = useRef(new Set<string>());
  const alignAttemptRef = useRef(
    new Map<string, { signature: string; timestamp: number }>(),
  );
  const lastRunRef = useRef<string | null>(null);
  const alignThreadRef = useRef<AlignThreadHandle | null>(null);

  const cancelDecodeAndAlignmentWork = useCallback(
    (clearSamples: boolean, cancelSharedDecodeScheduler = true) => {
      cacheGenerationRef.current += 1;
      pendingDecodeRef.current.clear();
      inFlightRunRef.current.clear();
      inFlightAlignRef.current.clear();
      alignAttemptRef.current.clear();
      lastRunRef.current = null;
      if (cancelSharedDecodeScheduler) {
        mobileDualReaderDecodeScheduler.cancelPending();
      }
      alignThreadRef.current?.cancelPending();
      if (clearSamples) {
        primarySampleCacheRef.current.clear();
        secondarySampleCacheRef.current.clear();
      }
    },
    [],
  );

  // Lazily create the align-thread handle on mount; dispose on unmount. The
  // worklet runtime itself is created lazily on first job (so this never loads
  // `react-native-worklets` in tests / before first use).
  useEffect(() => {
    alignThreadRef.current = createMobileDualReaderAlignThread();
    return () => {
      alignThreadRef.current?.dispose();
      alignThreadRef.current = null;
    };
  }, []);

  useEffect(() => {
    const applyAppState = (state: string) => {
      mobileDualReaderDecodeScheduler.setAppState(state);
      const suspended = state !== "active";
      setRuntimeSuspended(suspended);
      if (suspended) cancelDecodeAndAlignmentWork(true);
    };
    applyAppState(AppState.currentState);
    const subscription = AppState.addEventListener("change", applyAppState);
    return () => {
      subscription.remove();
      cancelDecodeAndAlignmentWork(true);
    };
  }, [cancelDecodeAndAlignmentWork, setRuntimeSuspended]);

  // Reset caches when the session or secondary source changes (mirror web's
  // session-reset effect at :1277-1318).
  const sessionKey = `${ctx.registryId}:${ctx.sourceId}:${ctx.mangaId}`;
  const secondaryKey = secondarySource
    ? `${secondarySource.registryId}:${secondarySource.sourceId}:${secondarySource.sourceMangaId}`
    : null;
  useEffect(() => {
    cancelDecodeAndAlignmentWork(true);
    acceptedDistancesRef.current.clear();
    alignAttemptRef.current.clear();
    if (getMobileDualReadDebugStore().getState().snapshot.overlayEnabled) {
      getMobileDualReadDebugStore().getState().pushEvent("session_reset", {
        sessionKey,
        secondaryKey,
      });
    }
    return () => {
      // A decode started by the previous session may settle after its maps were
      // cleared. Invalidate its captured generation so it cannot repopulate the
      // next manga/session's bounded cache.
      cancelDecodeAndAlignmentWork(true);
    };
  }, [cancelDecodeAndAlignmentWork, sessionKey, secondaryKey]);

  const debugOn = useCallback(
    () => getMobileDualReadDebugStore().getState().snapshot.overlayEnabled,
    [],
  );
  const pushDebugEvent = useCallback((type: string, data?: Record<string, unknown>) => {
    if (!debugOn()) return;
    getMobileDualReadDebugStore().getState().pushEvent(type, data);
  }, [debugOn]);
  const updateDebugSnapshot = useCallback(
    (partial: Partial<DualReadDebugSnapshot>) => {
      if (!debugOn()) return;
      getMobileDualReadDebugStore().getState().updateSnapshot(partial);
    },
    [debugOn],
  );

  // Decode a page once, caching both hash + sample in memory and persisting the
  // hash to the dHash cache. Dedup via pendingDecodeRef so concurrent requests
  // for the same page share one decode.
  const ensurePrimary = useCallback(
    (
      key: HashCacheKey,
      page: { imageUri?: string; headers?: Record<string, string> },
      signal?: AbortSignal,
    ): Promise<HashAndSample> => {
      const ck = `primary:${key.chapterId}:${key.pageIndex}`;
      const cached = getMobileDualReaderLruEntry(
        primarySampleCacheRef.current,
        ck,
      );
      if (cached) return Promise.resolve(cached);
      const existing = pendingDecodeRef.current.get(ck);
      if (existing) return existing;
      const cacheGeneration = cacheGenerationRef.current;
      const assertCurrent = () => {
        if (
          signal?.aborted ||
          cacheGenerationRef.current !== cacheGeneration ||
          getMobileDualReadStore().getState().runtimeSuspended
        ) {
          throw new MobileDualReaderDecodeCancelledError();
        }
      };
      const promise = mobileDualReaderDecodeScheduler
        .schedule(
          async () => {
            assertCurrent();
            const bytes = await fetchMobilePageBytes(page, { signal });
            assertCurrent();
            const result = await computeHashFromBytes({
              bytes,
              adapter: renderer,
              centerCropRatio: AUTO_ALIGN_CENTER_RATIO,
              sampleMax: ALIGNMENT_FINE_MAX_DEFAULT,
            });
            assertCurrent();
            return result;
          },
          { signal, priority: "background" },
        )
        .then((result) => {
          assertCurrent();
          setMobileDualReaderLruEntry(
            primarySampleCacheRef.current,
            ck,
            result,
          );
          void setCachedMobileDualReadHash(key, result.hash);
          return result;
        });
      pendingDecodeRef.current.set(ck, promise);
      const clearPending = () => {
        if (pendingDecodeRef.current.get(ck) === promise) {
          pendingDecodeRef.current.delete(ck);
        }
      };
      void promise.then(clearPending, clearPending);
      return promise;
    },
    [renderer],
  );

  const ensureSecondary = useCallback(
    (
      key: HashCacheKey,
      page: { imageUri?: string; headers?: Record<string, string> },
      signal?: AbortSignal,
    ): Promise<HashAndSample> => {
      const ck = `secondary:${key.chapterId}:${key.pageIndex}`;
      const cached = getMobileDualReaderLruEntry(
        secondarySampleCacheRef.current,
        ck,
      );
      if (cached) return Promise.resolve(cached);
      const existing = pendingDecodeRef.current.get(ck);
      if (existing) return existing;
      const cacheGeneration = cacheGenerationRef.current;
      const assertCurrent = () => {
        if (
          signal?.aborted ||
          cacheGenerationRef.current !== cacheGeneration ||
          getMobileDualReadStore().getState().runtimeSuspended
        ) {
          throw new MobileDualReaderDecodeCancelledError();
        }
      };
      const promise = (async () => {
        // Opportunistic cross-session hash reuse: if the dHash cache has it, we
        // still decode for the sample (alignment needs it) but skip the persist.
        const cachedHash = await getCachedMobileDualReadHash(key);
        assertCurrent();
        const result = await mobileDualReaderDecodeScheduler.schedule(
          async () => {
            assertCurrent();
            const bytes = await fetchMobilePageBytes(page, { signal });
            assertCurrent();
            const computed = await computeHashFromBytes({
              bytes,
              adapter: renderer,
              centerCropRatio: AUTO_ALIGN_CENTER_RATIO,
              sampleMax: ALIGNMENT_FINE_MAX_DEFAULT,
            });
            assertCurrent();
            return computed;
          },
          { signal, priority: "background" },
        );
        assertCurrent();
        setMobileDualReaderLruEntry(
          secondarySampleCacheRef.current,
          ck,
          result,
        );
        if (!cachedHash?.full) {
          void setCachedMobileDualReadHash(key, result.hash);
        }
        return result;
      })();
      pendingDecodeRef.current.set(ck, promise);
      const clearPending = () => {
        if (pendingDecodeRef.current.get(ck) === promise) {
          pendingDecodeRef.current.delete(ck);
        }
      };
      void promise.then(clearPending, clearPending);
      return promise;
    },
    [renderer],
  );

  const primaryChapterId = ctx.primaryChapter?.id ?? null;

  // --- Main render-plan + alignment effect (scoped to the current chapter) ---
  useEffect(() => {
    if (runtimeSuspended) return;
    if (!enabled || !seedPair || !secondarySource) return;
    if (!ctx.primaryChapter || !primaryChapterId) return;
    if (!primaryChapters.length || !secondaryChapters.length) return;
    if (ctx.currentLocalIndex == null || ctx.primaryPages.length === 0) return;

    const secondaryChapterId = mapSecondaryChapterForPrimary({
      primaryChapter: ctx.primaryChapter,
      primaryAll: primaryChapters,
      secondaryAll: secondaryChapters,
      seedPair,
    });
    if (!secondaryChapterId) return;

    const secondaryPages = secondaryPagesByChapter[secondaryChapterId];
    if (!secondaryPages || secondaryPages.length === 0) return; // prefetcher not done yet

    const driftDelta = driftDeltaByChapter[primaryChapterId] ?? 0;
    const cur = ctx.currentLocalIndex;
    const pageCount = ctx.primaryPages.length;

    // Candidate window around the current page, current first then outward.
    const candidates = buildAutoAlignCandidates({
      currentIndex: cur,
      pageCount,
    });

    const store = getMobileDualReadStore().getState();
    const currentPlan = store.secondaryRenderPlansByChapter[primaryChapterId]?.[cur];
    const currentPlanValid =
      Boolean(currentPlan) &&
      currentPlan!.driftDelta === driftDelta &&
      currentPlan!.secondaryChapterId === secondaryChapterId;

    const readyPrimaryPages = ctx.primaryPages.reduce(
      (count, page) => count + (page.imageProcessing === "pending" ? 0 : 1),
      0,
    );
    const readySecondaryPages = secondaryPages.reduce(
      (count, page) => count + (page.imageProcessing === "pending" ? 0 : 1),
      0,
    );
    const runKey = `${primaryChapterId}:${cur}:${secondaryChapterId}:${secondaryPages.length}:${driftDelta}:${readyPrimaryPages}:${readySecondaryPages}`;
    // Skip if we already ran this exact configuration and the visible page has a valid plan.
    if (lastRunRef.current === runKey && currentPlanValid) return;
    if (inFlightRunRef.current.has(runKey)) return;
    inFlightRunRef.current.add(runKey);

    let cancelled = false;
    const abortController = new AbortController();
    const runtimeGeneration = store.runtimeGeneration;
    const isRunCurrent = () => {
      const latest = getMobileDualReadStore().getState();
      return (
        !cancelled &&
        !abortController.signal.aborted &&
        !latest.runtimeSuspended &&
        latest.runtimeGeneration === runtimeGeneration
      );
    };
    pushDebugEvent("renderPlan_run", { visible: [cur], candidates: candidates.length });
    updateDebugSnapshot({
      sessionKey,
      dualReadEnabled: enabled,
      lastRenderPlanRunTs: Date.now(),
      lastRenderPlanSummary: `candidates=${candidates.length} cur=${cur}`,
    });

    const secondaryKeyBase: HashCacheKey = {
      registryId: secondarySource.registryId,
      sourceId: secondarySource.sourceId,
      mangaId: secondarySource.sourceMangaId,
      chapterId: secondaryChapterId,
      pageIndex: 0,
    };
    const primaryKeyBase: HashCacheKey = {
      registryId: ctx.registryId,
      sourceId: ctx.sourceId,
      mangaId: ctx.mangaId,
      chapterId: primaryChapterId,
      pageIndex: 0,
    };

    type AcceptedCandidate = {
      p: number;
      best: NonNullable<ReturnType<typeof findBestSecondaryMatch>>["best"];
      expectedIndex: number;
    };

    (async () => {
      try {
        const accepted: AcceptedCandidate[] = [];
        const missing: number[] = [];

        for (const p of candidates) {
          if (!isRunCurrent()) return;
          const page = ctx.primaryPages[p];
          if (!page?.imageUri || page.imageProcessing === "pending") continue;

          const expectedIndex = mapSecondaryPageIndex({ primaryIndex: p, driftDelta });
          if (!Number.isFinite(expectedIndex)) continue;

          const sStart = Math.max(0, Math.trunc(expectedIndex) - AUTO_ALIGN_WINDOW);
          const sEnd = Math.min(
            secondaryPages.length - 1,
            Math.trunc(expectedIndex) + AUTO_ALIGN_WINDOW,
          );
          const secHashes: Array<MultiDhash | undefined> = new Array(secondaryPages.length);
          await Promise.all(
            range(sStart, sEnd).map(async (i) => {
              const sp = secondaryPages[i];
              if (!sp?.imageUri || sp.imageProcessing === "pending") return;
              try {
                const { hash } = await ensureSecondary(
                  { ...secondaryKeyBase, pageIndex: i },
                  sp,
                  abortController.signal,
                );
                secHashes[i] = hash;
              } catch (error) {
                if (isMobileDualReaderDecodeCancelledError(error)) return;
                // ignore individual secondary decode failures
              }
            }),
          );
          if (!isRunCurrent()) return;
          if (secHashes.filter(Boolean).length < 2) continue;

          let primaryHash: MultiDhash;
          try {
            const result = await ensurePrimary(
              { ...primaryKeyBase, pageIndex: p },
              page,
              abortController.signal,
            );
            primaryHash = result.hash;
          } catch (error) {
            if (isMobileDualReaderDecodeCancelledError(error)) return;
            continue;
          }
          if (!isRunCurrent()) return;

          const match = findBestSecondaryMatch({
            primaryHash,
            secondaryHashes: secHashes,
            expectedIndex,
            ...buildAutoAlignMatchOptions(),
          });
          if (!match) continue;
          const best = match.best;
          const secondBestDistance = match.secondBest?.distance ?? Number.POSITIVE_INFINITY;

          const { accept, missing: isMissing } = evaluateSecondaryMatch({
            best,
            secondBestDistance,
            acceptedDistances: acceptedDistancesRef.current.get(primaryChapterId) ?? [],
          });
          if (isMissing) {
            missing.push(p);
            continue;
          }
          if (!accept) continue;
          accepted.push({ p, best, expectedIndex });
        }

        if (!isRunCurrent()) return;
        if (accepted.length === 0 && missing.length === 0) return;

        // Choose the drift source: prefer the current page's accepted candidate.
        const chosen = accepted.find((a) => a.p === cur) ?? accepted[0] ?? null;
        let nextDrift = driftDelta;
        if (chosen) {
          const driftExpectedIndex = getDriftExpectedIndex({
            expectedIndex: chosen.expectedIndex,
            match: chosen.best,
            readingMode: ctx.readingMode,
          });
          nextDrift = updateDriftDelta({
            expectedIndex: driftExpectedIndex,
            bestIndex: chosen.best.bestIndex,
            prevDriftDelta: driftDelta,
          });
        }

        const scheduleAlignment = (p: number, plan: SecondaryRenderPlan) => {
          if (!isRunCurrent()) return;
          if (plan.kind === "missing") return;
          const alignThread = alignThreadRef.current;
          if (!alignThread) return;
          const alignKey = `${primaryChapterId}:${secondaryChapterId}:${p}`;
          const state = getMobileDualReadStore().getState();
          const existing = state.secondaryAlignmentByChapter[primaryChapterId];
          const existingAlign =
            existing?.secondaryChapterId === secondaryChapterId
              ? existing.byPage[p]
              : undefined;
          if (existingAlign && existingAlign.confidence >= ALIGNMENT_CONFIDENCE_MIN_DEFAULT) {
            return;
          }
          if (inFlightAlignRef.current.has(alignKey)) return;
          const signature = getAlignmentPlanSignature(plan);
          const lastAttempt = alignAttemptRef.current.get(alignKey);
          if (
            lastAttempt &&
            lastAttempt.signature === signature &&
            Date.now() - lastAttempt.timestamp < ALIGNMENT_RETRY_MS
          ) {
            return;
          }
          inFlightAlignRef.current.add(alignKey);
          alignAttemptRef.current.set(alignKey, { signature, timestamp: Date.now() });

          pushDebugEvent("alignment_schedule", { key: alignKey, kind: plan.kind });

          void (async () => {
            try {
              const primaryPage = ctx.primaryPages[p];
              if (!primaryPage?.imageUri) return;
              const primary = await ensurePrimary(
                { ...primaryKeyBase, pageIndex: p },
                primaryPage,
                abortController.signal,
              );
              if (!isRunCurrent()) return;
              let secondarySample: LumaImage;
              let secondarySampleB: LumaImage | undefined;
              if (plan.kind === "merge") {
                const [a, b] = plan.secondaryIndices;
                const pageA = secondaryPages[a];
                const pageB = secondaryPages[b];
                if (!pageA || !pageB) return;
                const [sa, sb] = await Promise.all([
                  ensureSecondary(
                    { ...secondaryKeyBase, pageIndex: a },
                    pageA,
                    abortController.signal,
                  ),
                  ensureSecondary(
                    { ...secondaryKeyBase, pageIndex: b },
                    pageB,
                    abortController.signal,
                  ),
                ]);
                if (!isRunCurrent()) return;
                secondarySample = sa.sample;
                secondarySampleB = sb.sample;
              } else {
                const page = secondaryPages[plan.secondaryIndex];
                if (!page) return;
                const s = await ensureSecondary(
                  { ...secondaryKeyBase, pageIndex: plan.secondaryIndex },
                  page,
                  abortController.signal,
                );
                if (!isRunCurrent()) return;
                secondarySample = s.sample;
              }
              const alignment: AlignmentResult = await requestAlignmentFromSamples({
                primarySample: primary.sample,
                secondarySample,
                secondarySampleB,
                plan,
                runAlignment: alignThread.runAlignment,
              });
              if (!isRunCurrent()) return;
              // Stale guard: only commit if the plan is unchanged.
              const currentPlanNow = getMobileDualReadStore().getState()
                .secondaryRenderPlansByChapter[primaryChapterId]?.[p];
              if (
                !currentPlanNow ||
                getAlignmentPlanSignature(currentPlanNow) !== signature
              ) {
                pushDebugEvent("alignment_skip", { key: alignKey, reason: "stale_plan" });
                return;
              }
              setSecondaryAlignment(primaryChapterId, secondaryChapterId, p, alignment);
              pushDebugEvent("alignment_result", {
                key: alignKey,
                confidence: alignment.confidence,
                dx: alignment.dx,
                dy: alignment.dy,
                scale: alignment.scale,
              });
            } catch (err) {
              if (isMobileDualReaderDecodeCancelledError(err)) return;
              pushDebugEvent("alignment_error", {
                key: alignKey,
                error: err instanceof Error ? err.message : String(err),
              });
            } finally {
              inFlightAlignRef.current.delete(alignKey);
            }
          })();
        };

        if (!isRunCurrent()) return;
        for (const a of accepted) {
          const planDrift = chosen && a === chosen ? nextDrift : driftDelta;
          const plan = buildRenderPlanFromMatch({
            match: a.best,
            secondaryChapterId,
            driftDelta: planDrift,
          });
          setSecondaryRenderPlan(primaryChapterId, a.p, plan);
          scheduleAlignment(a.p, plan);
        }
        for (const m of missing) {
          const plan = buildMissingPlan({ secondaryChapterId, driftDelta });
          setSecondaryRenderPlan(primaryChapterId, m, plan);
        }

        if (!isRunCurrent()) return;
        // Safety fallback (web :2350-2367): never leave the visible page plan-less.
        const stateAfter = getMobileDualReadStore().getState();
        const existingVisible = stateAfter.secondaryRenderPlansByChapter[primaryChapterId]?.[cur];
        if (!existingVisible) {
          const fallbackPlan = buildMissingPlan({ secondaryChapterId, driftDelta });
          setSecondaryRenderPlan(primaryChapterId, cur, fallbackPlan);
        }

        if (chosen && nextDrift !== driftDelta) {
          setDriftDelta(primaryChapterId, nextDrift);
          const distances = acceptedDistancesRef.current.get(primaryChapterId) ?? [];
          const next = [...distances, chosen.best.distance];
          if (next.length > AUTO_ALIGN_HISTORY_LIMIT) next.shift();
          acceptedDistancesRef.current.set(primaryChapterId, next);
        }

        pushDebugEvent("renderPlan_apply", {
          accepted: accepted.length,
          missing: missing.length,
          chosen: chosen?.p ?? null,
          nextDrift,
        });
        updateDebugSnapshot({
          lastRenderPlanSummary: `accepted=${accepted.length} missing=${missing.length} chosen=${chosen?.p ?? "—"} drift=${nextDrift}`,
        });

        if (isRunCurrent()) lastRunRef.current = runKey;
      } catch (err) {
        if (!isMobileDualReaderDecodeCancelledError(err)) {
          console.error("[DualRead] autoAlign error", err);
        }
      } finally {
        inFlightRunRef.current.delete(runKey);
      }
    })();

    return () => {
      cancelled = true;
      abortController.abort();
      // Invalidate this component's decode results and alignment queue. The
      // overlay shares the process-wide scheduler but owns a separate signal.
      cancelDecodeAndAlignmentWork(false, false);
    };
  }, [
    runtimeSuspended,
    enabled,
    seedPair,
    secondarySource,
    primaryChapters,
    secondaryChapters,
    secondaryPagesByChapter,
    driftDeltaByChapter,
    ctx.currentLocalIndex,
    ctx.primaryPages,
    ctx.readingMode,
    ctx.primaryChapter,
    ctx.registryId,
    ctx.sourceId,
    ctx.mangaId,
    primaryChapterId,
    sessionKey,
    ensurePrimary,
    ensureSecondary,
    setDriftDelta,
    setSecondaryRenderPlan,
    setSecondaryAlignment,
    pushDebugEvent,
    updateDebugSnapshot,
    cancelDecodeAndAlignmentWork,
  ]);

  return null;
}
