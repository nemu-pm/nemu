/**
 * Mobile dual-reader SessionManager — loads primary + secondary chapter lists
 * and validates the seed pairing. Native counterpart to web's
 * `DualReadSessionManager`
 * (`src/lib/plugins/builtin/dual-reader/components.tsx:1100-1207`).
 *
 * Differences from web:
 * - Web re-fetches primary chapters via `source.getChapters()`; mobile reuses
 *   the chapters ReaderScreen already loaded (`ctx.primaryChapters`), avoiding a
 *   duplicate source round-trip.
 * - Web resolves a source runtime via `getSource(registryId, sourceId)`;
 *   mobile resolves an `InstalledSource` from `ctx.installedSources` via
 *   `mobileInstalledSourceMatchesLink`, then `refreshMobileSourceChapters`.
 * - Seed-invalid → open config (same as web).
 *
 * Renders nothing (effects only).
 */
import { useEffect, useRef } from "react";
import type { LocalSourceLink } from "@/data/schema";
import { mobileInstalledSourceMatchesLink } from "@/lib/mobileInstalledSourceKeys";
import { refreshMobileSourceChapters } from "@/sources/mobileSourceDetails";
import { useMobileDualReaderContext } from "./MobileDualReaderContext";
import { useMobileDualReaderStore } from "@/lib/mobileDualReaderStore";

/** Linked sources other than the primary (the dual-reader candidate set). */
function getDualReadCandidateLinks(
  linkedSources: LocalSourceLink[],
  primary: LocalSourceLink | null,
): LocalSourceLink[] {
  if (!primary) return linkedSources;
  return linkedSources.filter((link) => link.id !== primary.id);
}

export function MobileDualReaderSessionManager() {
  const ctx = useMobileDualReaderContext();
  const enabled = useMobileDualReaderStore((s) => s.enabled);
  const runtimeSuspended = useMobileDualReaderStore((s) => s.runtimeSuspended);
  const secondarySource = useMobileDualReaderStore((s) => s.secondarySource);
  const seedPair = useMobileDualReaderStore((s) => s.seedPair);
  const primaryChapters = useMobileDualReaderStore((s) => s.primaryChapters);
  const secondaryChapters = useMobileDualReaderStore((s) => s.secondaryChapters);
  const configOpen = useMobileDualReaderStore((s) => s.configOpen);

  const setPrimaryChapters = useMobileDualReaderStore((s) => s.setPrimaryChapters);
  const setSecondaryChapters = useMobileDualReaderStore((s) => s.setSecondaryChapters);
  const clearSecondaryCache = useMobileDualReaderStore((s) => s.clearSecondaryCache);
  const disable = useMobileDualReaderStore((s) => s.disable);
  const setConfigOpen = useMobileDualReaderStore((s) => s.setConfigOpen);

  const secondaryKeyRef = useRef<string | null>(null);

  // Seed primary chapters from ReaderScreen (no duplicate source round-trip).
  useEffect(() => {
    if (!enabled || runtimeSuspended) return;
    if (!ctx.sourceLink) {
      disable();
      return;
    }
    if (primaryChapters.length === 0 && ctx.primaryChapters.length > 0) {
      setPrimaryChapters(ctx.primaryChapters);
    }
  }, [
    enabled,
    runtimeSuspended,
    ctx.sourceLink,
    ctx.primaryChapters,
    primaryChapters.length,
    setPrimaryChapters,
    disable,
  ]);

  // Load secondary chapters when a secondary source is selected.
  useEffect(() => {
    if (!enabled || runtimeSuspended || !secondarySource) return;
    const candidates = getDualReadCandidateLinks(ctx.linkedSources, ctx.sourceLink);
    if (!candidates.some((link) => link.id === secondarySource.id)) {
      disable();
      return;
    }
    const key = `${secondarySource.registryId}:${secondarySource.sourceId}:${secondarySource.sourceMangaId}`;
    if (secondaryKeyRef.current && secondaryKeyRef.current !== key) {
      clearSecondaryCache();
      setSecondaryChapters([]);
    }
    secondaryKeyRef.current = key;
    if (secondaryChapters.length > 0) return;

    let cancelled = false;
    void (async () => {
      try {
        const installedSource = ctx.installedSources.find((item) =>
          mobileInstalledSourceMatchesLink(item, secondarySource!),
        );
        if (!installedSource) {
          if (!cancelled) disable();
          return;
        }
        const refreshed = await refreshMobileSourceChapters(
          installedSource,
          secondarySource!.sourceMangaId,
          { getSourceSettings: ctx.getSourceSettings },
        );
        if (cancelled) return;
        if (refreshed.status === "ready") {
          setSecondaryChapters(refreshed.chapters);
        } else {
          // Blocked (Cloudflare / unavailable): surface the config so the user
          // can pick a different source or retry.
          setConfigOpen(true);
        }
      } catch (err) {
        if (!cancelled) {
          console.error("[DualRead] Failed to load secondary chapters", err);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    enabled,
    runtimeSuspended,
    secondarySource,
    secondaryChapters.length,
    ctx.installedSources,
    ctx.linkedSources,
    ctx.sourceLink,
    ctx.getSourceSettings,
    clearSecondaryCache,
    setSecondaryChapters,
    setConfigOpen,
    disable,
  ]);

  // Seed validity: if the seed's secondary chapter isn't in the loaded list,
  // open the config so the user can re-pair.
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
