/**
 * Mobile dual-reader config sheet — lets the user pick a paired (secondary)
 * source and a seed chapter pair, then enable/disable. Native counterpart to
 * web's `DualReadConfigDialog`
 * (`src/lib/plugins/builtin/dual-reader/components.tsx:755-1090`).
 *
 * Replaces the old source-switcher sheet (which navigated via
 * `selectDualReadTarget → router.replace`). Confirming calls
 * `store.enable({secondarySource, seedPair, primaryChapters, secondaryChapters})`
 * — selection enables the overlay instead of navigating away.
 *
 * Layout: `MobileSheetScaffold` → `PageHeader` (title) → source picker
 * (`NemuListRow` rows for each candidate linked source) → chapter picker
 * (ScrollView of `NemuListRow` rows for the selected source's chapters) →
 * Enable / Disable actions. Default secondary mirrors web's
 * `pickDefaultSecondary` (different-language source preferred).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type ListRenderItem,
} from "react-native";
import type { ChapterSummary, LocalSourceLink } from "@/data/schema";
import {
  MobileSheetScaffold,
  NemuButton,
  NemuListRow,
  PageHeader,
  nemuFontWeight,
  useNemuTheme,
} from "@/design-system";
import { hapticConfirm, hapticError, hapticPress } from "@/lib/haptics";
import { formatChapterTitle } from "@/lib/formatChapter";
import { MOBILE_CHAPTER_LIST_PERFORMANCE } from "@/lib/mobileChapterRows";
import { mobileInstalledSourceMatchesLink } from "@/lib/mobileInstalledSourceKeys";
import { getMobileDualReaderSheetLayout } from "@/lib/mobileDualReaderSheetLayout";
import {
  getMobileDualReadCandidateSources,
  getMobileDualReadSourcePresentation,
  pickDefaultMobileDualReadSecondary,
} from "@/lib/mobileReaderPluginRuntime";
import { refreshMobileSourceChapters } from "@/sources/mobileSourceDetails";
import { useMobileDualReaderContext } from "./MobileDualReaderContext";
import { useMobileDualReaderStore } from "@/lib/mobileDualReaderStore";

function chapterKeyExtractor(chapter: ChapterSummary): string {
  return chapter.id;
}

export function MobileDualReaderConfigSheet() {
  const ctx = useMobileDualReaderContext();
  const { tokens } = useNemuTheme();
  const { fontScale, height, width } = useWindowDimensions();

  const configOpen = useMobileDualReaderStore((s) => s.configOpen);
  const setConfigOpen = useMobileDualReaderStore((s) => s.setConfigOpen);
  const enabled = useMobileDualReaderStore((s) => s.enabled);
  const runtimeSuspended = useMobileDualReaderStore((s) => s.runtimeSuspended);
  const secondarySource = useMobileDualReaderStore((s) => s.secondarySource);
  const seedPair = useMobileDualReaderStore((s) => s.seedPair);
  const primaryChapters = useMobileDualReaderStore((s) => s.primaryChapters);
  const storedSecondaryChapters = useMobileDualReaderStore((s) => s.secondaryChapters);
  const enable = useMobileDualReaderStore((s) => s.enable);
  const disable = useMobileDualReaderStore((s) => s.disable);
  const clearSecondaryCache = useMobileDualReaderStore((s) => s.clearSecondaryCache);

  const candidates = useMemo(
    () => getMobileDualReadCandidateSources(ctx.linkedSources, ctx.sourceLink, ctx.installedSources),
    [ctx.linkedSources, ctx.sourceLink, ctx.installedSources],
  );
  const defaultSecondary = useMemo(
    () => pickDefaultMobileDualReadSecondary(ctx.sourceLink, candidates, ctx.installedSources),
    [ctx.sourceLink, candidates, ctx.installedSources],
  );

  const [selectedSecondaryId, setSelectedSecondaryId] = useState<string | null>(null);
  const [secondaryChapters, setLocalSecondaryChapters] = useState<ChapterSummary[]>([]);
  const [selectedSecondaryChapterId, setSelectedSecondaryChapterId] = useState<string | null>(
    null,
  );
  const [loadingChapters, setLoadingChapters] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedSecondary: LocalSourceLink | null = useMemo(() => {
    if (selectedSecondaryId) {
      return candidates.find((c) => c.id === selectedSecondaryId) ?? null;
    }
    if (secondarySource) {
      return candidates.find((c) => c.id === secondarySource.id) ?? defaultSecondary ?? null;
    }
    return defaultSecondary ?? null;
  }, [selectedSecondaryId, candidates, secondarySource, defaultSecondary]);

  // Reset / seed local state when the sheet opens.
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
      setLocalSecondaryChapters(storedSecondaryChapters);
    } else {
      setLocalSecondaryChapters([]);
    }
  }, [configOpen, secondarySource, defaultSecondary, seedPair, storedSecondaryChapters]);

  // Load chapters for the selected secondary source.
  const secondaryKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!configOpen || runtimeSuspended) return;
    if (!selectedSecondary) {
      setLocalSecondaryChapters([]);
      setLoadingChapters(false);
      secondaryKeyRef.current = null;
      return;
    }
    const key = `${selectedSecondary.registryId}:${selectedSecondary.sourceId}:${selectedSecondary.sourceMangaId}`;
    if (secondaryKeyRef.current === key && secondaryChapters.length > 0) return;
    secondaryKeyRef.current = key;
    setSelectedSecondaryChapterId(null);
    setLocalSecondaryChapters([]);
    setLoadingChapters(true);
    setError(null);

    // Reuse already-loaded store chapters if this is the enabled secondary.
    if (secondarySource?.id === selectedSecondary.id && storedSecondaryChapters.length > 0) {
      setLocalSecondaryChapters(storedSecondaryChapters);
      setLoadingChapters(false);
      return;
    }

    let cancelled = false;
    let completed = false;
    void (async () => {
      try {
        const installedSource = ctx.installedSources.find((item) =>
          mobileInstalledSourceMatchesLink(item, selectedSecondary!),
        );
        if (!installedSource) {
          if (!cancelled) setError(ctx.strings.reader.dualReadDialogNoLinkedSources);
          return;
        }
        const refreshed = await refreshMobileSourceChapters(
          installedSource,
          selectedSecondary!.sourceMangaId,
          { getSourceSettings: ctx.getSourceSettings },
        );
        if (cancelled) return;
        if (refreshed.status === "ready") {
          completed = true;
          setLocalSecondaryChapters(refreshed.chapters);
          if (refreshed.chapters.length === 0) {
            setError(ctx.strings.reader.dualReadDialogNoChapters);
          }
        } else {
          setError(ctx.strings.reader.dualReadDialogChapterLoadFailed);
        }
      } catch (err) {
        if (!cancelled) {
          console.error(
            "[DualRead] Failed to load secondary chapters in config",
            err,
          );
          setError(ctx.strings.reader.dualReadDialogChapterLoadFailed);
        }
      } finally {
        if (!cancelled) setLoadingChapters(false);
      }
    })();
    return () => {
      cancelled = true;
      if (!completed && secondaryKeyRef.current === key) {
        secondaryKeyRef.current = null;
      }
    };
  }, [
    configOpen,
    runtimeSuspended,
    selectedSecondary,
    secondaryChapters.length,
    ctx.installedSources,
    ctx.getSourceSettings,
    ctx.strings,
    secondarySource,
    storedSecondaryChapters,
  ]);

  const currentPrimaryChapter = useMemo(
    () => ctx.primaryChapters.find((c) => c.id === ctx.primaryChapter?.id) ?? ctx.primaryChapter,
    [ctx.primaryChapters, ctx.primaryChapter],
  );

  const handleConfirm = useCallback(() => {
    if (!ctx.sourceLink || !selectedSecondary || !selectedSecondaryChapterId) {
      void hapticError();
      return;
    }
    if (!currentPrimaryChapter) {
      void hapticError();
      return;
    }
    const secondaryChapter = secondaryChapters.find((c) => c.id === selectedSecondaryChapterId);
    if (!secondaryChapter) {
      void hapticError();
      return;
    }
    if (!secondarySource || secondarySource.id !== selectedSecondary.id) {
      clearSecondaryCache();
    }
    enable({
      secondarySource: selectedSecondary,
      seedPair: {
        primaryId: currentPrimaryChapter.id,
        secondaryId: selectedSecondaryChapterId,
      },
      primaryChapters: ctx.primaryChapters.length > 0 ? ctx.primaryChapters : primaryChapters,
      secondaryChapters,
    });
    void hapticConfirm();
    setConfigOpen(false);
  }, [
    ctx.sourceLink,
    ctx.primaryChapters,
    selectedSecondary,
    selectedSecondaryChapterId,
    currentPrimaryChapter,
    secondaryChapters,
    secondarySource,
    clearSecondaryCache,
    enable,
    primaryChapters,
    setConfigOpen,
  ]);

  const handleDisable = useCallback(() => {
    disable();
    void hapticConfirm();
    setConfigOpen(false);
  }, [disable, setConfigOpen]);

  const close = useCallback(() => {
    void hapticPress();
    setConfigOpen(false);
  }, [setConfigOpen]);

  const onSelectSource = useCallback((link: LocalSourceLink) => {
    void hapticPress();
    setSelectedSecondaryId(link.id);
    secondaryKeyRef.current = null;
  }, []);

  const onSelectChapter = useCallback((chapter: ChapterSummary) => {
    void hapticPress();
    setSelectedSecondaryChapterId(chapter.id);
  }, []);

  const primaryChapterLabel = currentPrimaryChapter
    ? formatChapterTitle(currentPrimaryChapter, ctx.strings)
    : ctx.strings.reader.noChapter;

  const sheetLayout = getMobileDualReaderSheetLayout({
    candidateCount: candidates.length,
    chapterCount: secondaryChapters.length,
    fontScale,
    height,
    loading: loadingChapters,
    width,
  });

  const renderChapter = useCallback<ListRenderItem<ChapterSummary>>(
    ({ item: chapter }) => {
      const selected = selectedSecondaryChapterId === chapter.id;
      return (
        <NemuListRow
          title={formatChapterTitle(chapter, ctx.strings)}
          accessory={
            selected ? <Text style={{ color: tokens.primary }}>✓</Text> : undefined
          }
          onPress={() => onSelectChapter(chapter)}
          testID={`dual-read-chapter-${chapter.id}`}
        />
      );
    },
    [ctx.strings, onSelectChapter, selectedSecondaryChapterId, tokens.primary],
  );

  return (
    <MobileSheetScaffold
      visible={configOpen}
      onRequestClose={close}
      frameMaxHeight={sheetLayout.frameMaxHeight}
      contentStyle={styles.content}
    >
      <PageHeader
        leadingAccessibilityLabel={ctx.strings.reader.closePlugin}
        leadingIcon="close-outline"
        title={ctx.strings.reader.dualReadDialogTitle}
        onLeadingPress={close}
      />
      <FlatList
        style={sheetLayout.listFillsFrame ? styles.scroll : undefined}
        contentContainerStyle={styles.scrollContent}
        data={loadingChapters ? [] : secondaryChapters}
        renderItem={renderChapter}
        keyExtractor={chapterKeyExtractor}
        extraData={selectedSecondaryChapterId}
        initialNumToRender={MOBILE_CHAPTER_LIST_PERFORMANCE.initialNumToRender}
        maxToRenderPerBatch={
          MOBILE_CHAPTER_LIST_PERFORMANCE.maxToRenderPerBatch
        }
        windowSize={MOBILE_CHAPTER_LIST_PERFORMANCE.windowSize}
        removeClippedSubviews={
          sheetLayout.listFillsFrame && Platform.OS === "android"
        }
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <View>
            <Text
              style={[styles.description, { color: tokens.mutedForeground }]}
            >
              {ctx.strings.reader.dualReadDialogDescription}
            </Text>

            <Text
              style={[styles.sectionLabel, { color: tokens.mutedForeground }]}
            >
              {ctx.strings.reader.dualReadDialogSecondarySource}
            </Text>
            {candidates.length === 0 ? (
              <Text style={[styles.empty, { color: tokens.mutedForeground }]}>
                {ctx.strings.reader.dualReadDialogNoLinkedSources}
              </Text>
            ) : (
              candidates.map((link) => {
                const presentation = getMobileDualReadSourcePresentation(
                  link,
                  ctx.installedSources,
                );
                const selected = selectedSecondary?.id === link.id;
                return (
                  <NemuListRow
                    key={link.id}
                    title={presentation.name ?? link.sourceId}
                    subtitle={
                      presentation.language
                        ? presentation.language.toUpperCase()
                        : undefined
                    }
                    imageUri={presentation.icon}
                    accessory={
                      selected ? (
                        <Text style={{ color: tokens.primary }}>✓</Text>
                      ) : undefined
                    }
                    onPress={() => onSelectSource(link)}
                    testID={`dual-read-source-${link.id}`}
                  />
                );
              })
            )}

            <Text
              style={[styles.sectionLabel, { color: tokens.mutedForeground }]}
            >
              {ctx.strings.reader.dualReadDialogPrimaryChapter}
            </Text>
            <Text style={[styles.chapterLabel, { color: tokens.foreground }]}>
              {primaryChapterLabel}
            </Text>

            <Text
              style={[styles.sectionLabel, { color: tokens.mutedForeground }]}
            >
              {ctx.strings.reader.dualReadDialogSecondaryChapter}
            </Text>
          </View>
        }
        ListEmptyComponent={
          loadingChapters ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator size="small" color={tokens.primary} />
              <Text
                style={[styles.loadingText, { color: tokens.mutedForeground }]}
              >
                {ctx.strings.reader.dualReadDialogLoadingChapters}
              </Text>
            </View>
          ) : (
            <Text style={[styles.empty, { color: tokens.mutedForeground }]}>
              {error ?? ctx.strings.reader.dualReadDialogChooseChapter}
            </Text>
          )
        }
      />

      <View style={styles.actions}>
        {enabled ? (
          <NemuButton
            label={ctx.strings.reader.dualReadDialogDisable}
            variant="outline"
            onPress={handleDisable}
            containerStyle={styles.actionButton}
          />
        ) : null}
        <NemuButton
          label={ctx.strings.reader.dualReadDialogEnable}
          tone="primary"
          onPress={handleConfirm}
          disabled={!selectedSecondary || !selectedSecondaryChapterId}
          containerStyle={styles.actionButton}
        />
      </View>
    </MobileSheetScaffold>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingTop: 2,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  description: {
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 16,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: nemuFontWeight.semibold,
    marginTop: 12,
    marginBottom: 6,
    textTransform: "uppercase",
    opacity: 0.7,
  },
  chapterLabel: {
    fontSize: 15,
    marginBottom: 4,
  },
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 8,
  },
  loadingText: {
    fontSize: 14,
  },
  empty: {
    fontSize: 14,
    paddingVertical: 8,
  },
  actions: {
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  actionButton: {
    flex: 1,
  },
});
