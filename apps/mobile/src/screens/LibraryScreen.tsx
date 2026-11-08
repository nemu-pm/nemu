import { MobileQuickActionMenu, mobileNativeQuickMenuAvailable } from "@/components/MobileQuickActionMenu";
import { requestMobileAddSourceSheet } from "@/lib/mobileAddSourceSheetRequest";
import { useMobileAdaptiveLayout } from "@/lib/MobileWindowLayoutContext";
import { useStableList, useStableValue } from "@/lib/useStableList";
import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { orderMobileTitleQuickActions } from "@/lib/mobileQuickActionOrder";
import {
  AppState,
  FlatList,
  Platform,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type LayoutChangeEvent,
  type ListRenderItemInfo,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { BottomSheetTextInput } from "@expo/ui/community/bottom-sheet";
import { Stack, router, useFocusEffect } from "expo-router";
import { EmptyLibrary } from "@/components/EmptyLibrary";
import { QuickActionSheet, type QuickAction } from "@/components/QuickActionSheet";
import { MobileCollectionBooksSheet } from "@/components/MobileCollectionBooksSheet";
import { MobileCollectionMembershipSheet } from "@/components/MobileCollectionMembershipSheet";
import { MobileConfirmationSheet } from "@/components/MobileConfirmationSheet";
import {
  MobileCollectionNameNativeSheet,
  MobileCollectionsManagerNativeSheet,
  MobileLibraryTitleMenuNativeSheet,
  mobileLibraryCollectionNativeSheetsAvailable,
} from "@/components/MobileLibraryCollectionNativeSheets";
import { MobileInlineErrorBanner } from "@/components/MobileInlineErrorBanner";
import {
  getMobileLibraryTitleMenuHeaderOptions,
  MobileLibraryTitleMenuAnchor,
  mobileLibraryTitleMenuAvailable,
} from "@/components/MobileLibraryTitleMenu";
import type { MobileLibraryTitleMenuProps } from "@/components/MobileLibraryTitleMenu.types";
import { MobileLibrarySkeleton } from "@/components/MobileLibrarySkeleton";
import { MobileLaunchRevealGroup } from "@/components/MobileLaunchRevealGroup";
import type { MobileLaunchRevealGroup as MobileLaunchRevealGroupName } from "@/lib/mobileLaunchRevealPlan";
import { isMobileLaunchContentReady, markMobileLaunchContentReady } from "@/lib/mobileSplashScreen";
import { MOBILE_PERFORMANCE_MARKS, markMobilePerformance } from "@/lib/mobilePerformance";
import { useMobileToast } from "@/components/MobileToastContext";
import { renderExploreDetailBarMenu } from "@/components/explore/ExploreDetailBarMenu";
import * as DocumentPicker from "expo-document-picker";
import { File as FsFile } from "expo-file-system";
import { pushLocalArchiveVolume } from "@/sync/mobileSyncDataStore";
import { importLocalArchive } from "@/lib/localArchives/importArchive";
import { deviceArchiveFs } from "@/lib/localArchives/fileSystem";
import { useMobileDataStore } from "@/data/mobileDataContext";
import { emitMobileDataChanged, emitMobileLibraryDataChanged } from "@/data/mobileDataEvents";
import {
  useCollections,
  useInstalledSources,
  useLibraryEntries,
  useMobileLanguageSettings,
  useCompletedChapters,
  useMangaProgress,
} from "@/data/mobileHooks";
import {
  getEntryTitle,
  type InstalledSource,
  type LibraryEntry,
  type LocalCollection,
  type LocalSourceLink,
} from "@/data/schema";
import {
  createNemuNativeScreenOptions,
  GlassSurface,
  MANGA_CARD_COVER_RADIUS,
  MangaCard,
  MobileNativeSheetScaffold,
  NemuButton,
  nemuColorWithAlpha,
  NemuPressable,
  PageHeader,
  PageListScaffold,
  PageScaffold,
  radius,
  renderNemuNativeToolbarButtons,
  nemuFontWeight,
  nemuSheetMetrics,
  useMobileNativeSheetTheme,
  useNemuTheme,
  usesNemuNativeHeader,
  type MangaCardModel,
  type NemuNativeHeaderAction,
} from "@/design-system";
import {
  hapticConfirm,
  hapticError,
} from "@/lib/haptics";
import {
  formatMobileString,
  getMobileStrings,
  type MobileStrings,
} from "@/lib/mobileI18n";
import {
  describeMobileErrorDetail,
  sanitizeMobileErrorDiagnostic,
} from "@/lib/mobileSourceErrors";
import { MOBILE_MANGA_GRID_GAP, mobileLibraryGridMinItemWidth } from "@/lib/mobileAdaptiveGrid";
import {
  chunkMobileGridRows,
  getMobileGridMoveOffset,
  getMobileListOrderChange,
  mobileFoldAwareGridCellStyle,
} from "@/lib/mobileFoldAwareGrid";
import {
  makeMobileGridGlideEntering,
  MOBILE_GRID_GLIDE_WINDOW_MS,
  mobileGridGlideAppearing,
  mobileGridGlideEmptyEntering,
  mobileGridGlideEmptyExiting,
  mobileGridGlideTransition,
  mobileGridGlideVanishing,
  isMobileGridGlideWindowOpen,
  mobileStateExiting,
  openMobileGridGlideWindow,
} from "@/lib/mobilePoseLayoutAnimations";
import { MobilePaneAlignedView } from "@/lib/MobilePaneAlignedView";
import {
  buildMobileCollectionDeletedToast,
  isMobileLibraryOpenCollectionDeleted,
  leaveMobileLibraryDeletedCollection,
  resolveMobileLibraryRouteCollectionState,
} from "@/lib/mobileLibraryDeletedCollection";
import { useMobileFoldAwareGrid } from "@/lib/useMobileFoldAwareGrid";
import { MobilePoseLayoutView, MobilePoseListCell } from "@/components/MobilePoseLayoutView";
import { MobileExploreCoverPlaceholder } from "@/components/explore/MobileExploreCoverPlaceholder";
import { MobileExploreDustHost } from "@/components/explore/MobileExploreDustHost";
import { dissolveExploreTitle } from "@/components/explore/mobileExploreDissolve";
import { ExploreDissolveTarget } from "@/components/explore/ExploreDissolveTarget";
import { mobileDesignExploreFlag, useMobileDesignExplore } from "@/lib/mobileDesignExplore";
import { useMobileExploreCoverPreference } from "@/components/explore/mobileExploreCoverPreference";
import { hasMobileUserCover, mobileExploreCoverOwnerUrl, pushMobileExploreDetail } from "@/components/explore/mobileExploreCover";
import { ContentScrollMarker, ZoomSource } from "../../modules/nemu-window-layout";
import Animated from "react-native-reanimated";
import { MOBILE_MOTION } from "@/lib/mobileMotion";
import { useMobilePoseResnapFade } from "@/lib/useMobilePoseResnapFade";
import { useMobilePoseRenderProbe } from "@/lib/MobilePoseTransitionContext";
import { useMobileGridScrollAnchor } from "@/lib/useMobileGridScrollAnchor";
import { useMobilePoseScrollHold } from "@/lib/useMobilePoseScrollHold";
import { getMobileInstalledSourceSettingsKeys } from "@/lib/mobileInstalledSourceKeys";import {
  canCreateMobileCollection,
  canRenameMobileCollection,
  canSaveMobileCollectionMembership,
  canSelectMobileCollectionScope,
  canStartMobileCollectionAction,
  collectionCount,
  diffLibraryItemSelection,
  entriesForCollection,
  isMobileCollectionActionBusy,
  resolveCollectionSelection,
  type MobileCollectionActionState,
} from "@/lib/mobileCollections";
import {
  buildMobileLibraryTitleMenu,
  getMobileLibraryCollectionSelection,
  reconcileMobileLibraryCollectionSelection,
  resolveMobileLibraryTitleMenuAction,
  setMobileLibraryCollectionSelection,
  subscribeMobileLibraryCollectionSelection,
} from "@/lib/mobileLibraryTitleMenu";
import {
  getMobileCollectionsManagerSheetLayout,
  getMobileLibraryTitleMenuSheetLayout,
} from "@/lib/mobileLibrarySheetLayout";
import {
  MOBILE_LIBRARY_REFRESH_INTERVAL_MS,
  getMobileLibraryRefreshLifecycleDecision,
  hasMobileLibraryStaleSourceLinks,
  isMobileLibraryRefreshAppActive,
  findInstalledSourceForLink,
  refreshMobileLibraryLatestChapters,
} from "@/lib/mobileLibraryRefresh";
import { resolveMobileSheetHeaderMetrics } from "@/lib/mobileNativeSheet";
import {
  buildMobileLibraryCardProgress,
  buildMobileLibraryEntryProgressMaps,
  buildMobileProgressIndex,
  getMobileEntryQuickActionSource,
  getMobileLibraryEmptyState,
  getMobileLibraryCaughtUpCandidates,
  getMobileLibraryProgressInfo,
  shouldRenderMobileLibrarySkeleton,
  shouldShowMobileLibraryEmptyOnboarding,
  shouldShowMobileLibraryLoadError,
  shouldShowMobileLibraryLoadErrorBanner,
  sortMobileLibraryEntries,
  stabilizeMobileLibraryCardProgress,
  type MobileLibraryCardProgress,
  type MobileLibraryEntryProgressMaps,
} from "@/lib/mobileLibraryPresentation";
import {
  loadMobileSourceSettingsByKeys,
  mergeSourceSettingValues,
} from "@/lib/mobileSourceSettings";
import { getMobileSourceMangaHref } from "@/lib/mobileSourceRoutes";
import {
  scheduleMobileIdleTask,
  type MobileIdleTaskHandle,
} from "@/lib/mobileIdleTask";
import { useMobileSourceImageRequest } from "@/lib/useMobileSourceImageRequest";
import {
  resolveMobileEntryCoverSources,
  resolveMobileEntryDisplayCover,
} from "@/lib/mobileEntryCover";
import type { MobileSourceImageRequest } from "@/sources/mobileSourceImages";
import { makeMobileRuntimeSourceKey, normalizeInstalledSource } from "@/sources/mobileSourceRuntime";

type LibraryScreenProps = {
  collectionId?: string | null;
  mode?: "library" | "collection";
};

function toMangaCard(
  entry: LibraryEntry,
  cardProgress: MobileLibraryCardProgress | undefined,
  strings: MobileStrings,
  coverRequest: MobileSourceImageRequest | null = null,
): MangaCardModel {
  const cover = resolveMobileEntryDisplayCover(entry);
  return {
    id: entry.item.libraryItemId,
    title: getEntryTitle(entry),
    subtitle: cardProgress?.subtitle ?? strings.library.progressUnread,
    badge: cardProgress?.badge,
    cover: coverRequest?.url ?? cover,
    coverHeaders: coverRequest?.headers,
  };
}

// Memoized so a list-level state change (a sheet opening, a refresh flag)
// re-renders only the cells whose own inputs moved. Every prop is either a
// primitive or a value the screen keeps referentially stable.
/** The quick-action sheet's dismissal, before a removed title turns to dust. */
const EXPLORE_SHEET_DISMISS_MS = 380;
/** Resolves after the next frame (a commit has reached the screen). */
function afterNextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
}
/**
 * One row of the library list (or its sections above the rows). Rows that
 * mount with a newly shown collection start dipped and settle with it.
 */
function LibraryLayoutRow({
  layoutKey,
  settleOnMount,
  revealGroup,
  style,
  onLayout,
  children,
}: {
  layoutKey: string;
  /** Mounted by opening or leaving a collection: starts dipped and settles. */
  settleOnMount: boolean;
  /** Cover rows take part in the cold-launch reveal as one group. */
  revealGroup?: MobileLaunchRevealGroupName;
  style: StyleProp<ViewStyle>;
  onLayout?: (event: LayoutChangeEvent) => void;
  children: ReactNode;
}) {
  const settle = useMobilePoseResnapFade(layoutKey, { settleOnMount });
  // Leaving for another collection, the row fades as the next page settles in.
  const row = <Animated.View exiting={mobileGridGlideVanishing} style={[style, settle]} onLayout={onLayout}>{children}</Animated.View>;
  return revealGroup ? <MobileLaunchRevealGroup group={revealGroup}>{row}</MobileLaunchRevealGroup> : row;
}

const LibraryGridItem = memo(function LibraryGridItem({
  entry,
  cardProgress,
  strings,
  installedSources,
  getActions,
  onLongPress,
  placeholderWidth,
}: {
  entry: LibraryEntry;
  /** Design-explore: draws the cloth-book placeholder at this width. */
  placeholderWidth?: number;
  /** Kept per title while its card reads the same (stabilizeMobileLibraryCardProgress). */
  cardProgress?: MobileLibraryCardProgress;
  strings: MobileStrings;
  installedSources: InstalledSource[];
  /** The native long-press menu's actions for a title opening in `source`. */
  getActions: (entry: LibraryEntry, source: LocalSourceLink | undefined) => QuickAction[];
  onLongPress?: (entry: LibraryEntry) => void;
}) {
  // Design-explore: the sharper cover another source has; always null with
  // the flag off.
  const preferredCover = useMobileExploreCoverPreference(entry.item.libraryItemId);
  const cover =
    (preferredCover && !hasMobileUserCover(entry) ? preferredCover : null) ??
    resolveMobileEntryDisplayCover(entry);
  // Requested through the source that owns the cover URL (same resolution as
  // the detail header), so both share one request and one cached image.
  const installedSource = useMemo(
    () =>
      resolveMobileEntryCoverSources(entry, installedSources, {
        cover: preferredCover ? mobileExploreCoverOwnerUrl(entry, cover) : cover,
      })[0] ?? null,
    [cover, entry, installedSources, preferredCover],
  );
  const coverRequest = useMobileSourceImageRequest(installedSource, cover);
  const item = useMemo(
    () => toMangaCard(entry, cardProgress, strings, coverRequest),
    [cardProgress, coverRequest, entry, strings],
  );
  const quickActionSource = cardProgress?.quickActionSource;
  const actions = useMemo(
    () => (mobileNativeQuickMenuAvailable ? getActions(entry, quickActionSource) : undefined),
    [entry, getActions, quickActionSource],
  );
  // Keeps the card's callback identity tied to the row, not to the render.
  const handleLongPress = useCallback(() => {
    onLongPress?.(entry);
  }, [entry, onLongPress]);

  // Design-explore: the cover zooms into the title page.
  const designExplore = useMobileDesignExplore();
  const zoomId = `grid:${entry.item.libraryItemId}`;
  const exploreOpen = useCallback(() => {
    pushMobileExploreDetail(entry, item.cover ? { uri: item.cover, headers: item.coverHeaders } : null, zoomId);
  }, [entry, item.cover, item.coverHeaders, zoomId]);
  const wrapCover = useCallback(
    (cover: ReactNode) => (
      <ZoomSource zoomId={zoomId} style={styles.gridZoomSource}>
        {cover}
      </ZoomSource>
    ),
    [zoomId],
  );

  return (
    <MobileQuickActionMenu actions={actions} cornerRadius={MANGA_CARD_COVER_RADIUS}>
    <MangaCard
      item={item}
      onLongPress={!mobileNativeQuickMenuAvailable && onLongPress ? handleLongPress : undefined}
      onPress={designExplore ? exploreOpen : undefined}
      wrapCover={designExplore ? wrapCover : undefined}
      placeholder={
        designExplore && placeholderWidth ? (
          <MobileExploreCoverPlaceholder title={getEntryTitle(entry)} width={placeholderWidth} />
        ) : undefined
      }
    />
    </MobileQuickActionMenu>
  );
});

function collectionBookCountText(count: number, strings: MobileStrings): string {
  return formatMobileString(
    count === 1
      ? strings.collectionMembership.bookCountOne
      : strings.collectionMembership.bookCountOther,
    { count }
  );
}

const LIBRARY_TITLE_MENU_ALL = "library:all";
const LIBRARY_TITLE_MENU_MANAGE = "library:manage";
const LIBRARY_TITLE_MENU_COLLECTION_PREFIX = "library:collection:";

function libraryEntryKey(entry: LibraryEntry): string {
  return entry.item.libraryItemId;
}

type LibrarySheetTransitionSource =
  | "title-menu"
  | "collections-manager"
  | "create-collection"
  | "manage-collection"
  | "remove-confirmation";

type PendingLibrarySheetTransition = {
  source: LibrarySheetTransitionSource;
  run: () => void;
};

function collectionTitleMenuValue(collectionId: string | null): string {
  return collectionId
    ? `${LIBRARY_TITLE_MENU_COLLECTION_PREFIX}${collectionId}`
    : LIBRARY_TITLE_MENU_ALL;
}

function LibraryTitleMenuSheet({
  visible,
  collections,
  strings,
  selectedCollectionId,
  disabled,
  onClose,
  onDismiss,
  onSelect,
  onManage,
}: {
  visible: boolean;
  collections: LocalCollection[];
  strings: MobileStrings;
  selectedCollectionId: string | null;
  disabled: boolean;
  onClose: () => void;
  onDismiss?: () => void;
  onSelect: (collectionId: string | null) => void;
  onManage: () => void;
}) {
  const { tokens } = useMobileNativeSheetTheme();
  const { fontScale, height, width } = useWindowDimensions();
  const sheetLayout = getMobileLibraryTitleMenuSheetLayout({
    collectionCount: collections.length,
    fontScale,
    height,
    width,
    rowHeight: nemuSheetMetrics.listRowLayout
      ? nemuSheetMetrics.listRowLayout.minHeight + 8
      : undefined,
  });

  const renderRow = ({
    id,
    label,
    icon,
    selected,
    onPress,
  }: {
    id: string;
    label: string;
    icon: keyof typeof Ionicons.glyphMap;
    selected: boolean;
    onPress: () => void;
  }) => (
    <NemuPressable
      key={id}
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      hapticFeedback="selection"
      onPress={onPress}
      pressedScale={0.985}
      style={[
        styles.titleMenuSheetRow,
        nemuSheetMetrics.listRowLayout,
        {
          backgroundColor: selected
            ? nemuColorWithAlpha(tokens.primary, 0.07)
            : tokens.card,
          borderColor: selected
            ? nemuColorWithAlpha(tokens.primary, 0.33)
            : tokens.border,
        },
      ]}
    >
      <Ionicons
        name={icon}
        size={nemuSheetMetrics.rowIconSize}
        color={selected ? tokens.primary : tokens.mutedForeground}
      />
      <Text
        numberOfLines={1}
        style={[
          styles.titleMenuSheetRowText,
          nemuSheetMetrics.rowLabel,
          { color: tokens.foreground },
        ]}
      >
        {label}
      </Text>
      {selected ? (
        <Ionicons name="checkmark" size={18} color={tokens.primary} />
      ) : null}
    </NemuPressable>
  );

  return (
    <MobileNativeSheetScaffold
      visible={visible}
      onClose={onClose}
      onDismiss={onDismiss}
      snapPoints={sheetLayout.snapPoints}
      scroll={sheetLayout.scroll}
      contentStyle={styles.titleMenuSheet}
      testID="LibraryTitleMenuSheet"
    >
      {renderRow({
        id: LIBRARY_TITLE_MENU_ALL,
        label: strings.library.all,
        icon: "library-outline",
        selected: selectedCollectionId === null,
        onPress: () => onSelect(null),
      })}
      {collections.map((collection) =>
        renderRow({
          id: collectionTitleMenuValue(collection.collectionId),
          label: collection.name,
          icon: "albums-outline",
          selected: selectedCollectionId === collection.collectionId,
          onPress: () => onSelect(collection.collectionId),
        })
      )}
      <View style={[styles.titleMenuSheetDivider, { backgroundColor: tokens.border }]} />
      {renderRow({
        id: LIBRARY_TITLE_MENU_MANAGE,
        label: strings.library.manageCollections,
        icon: "folder-open-outline",
        selected: false,
        onPress: onManage,
      })}
    </MobileNativeSheetScaffold>
  );
}

function CollectionNameSheet({
  visible,
  mode,
  initialName = "",
  strings,
  saving,
  onClose,
  onDismiss,
  onSubmit,
}: {
  visible: boolean;
  mode: "create" | "rename";
  initialName?: string;
  strings: MobileStrings;
  saving: boolean;
  onClose: () => void;
  onDismiss?: () => void;
  onSubmit: (name: string) => void;
}) {
  const { tokens } = useMobileNativeSheetTheme();
  const { height, width } = useWindowDimensions();
  const landscape = width > height;
  const [name, setName] = useState(initialName);
  const wasVisibleRef = useRef(false);
  const trimmedName = name.trim();
  const actionState: MobileCollectionActionState = {
    creating: mode === "create" ? saving : false,
    renaming: mode === "rename" ? saving : false,
    savingMembership: false,
    removing: false,
  };
  const disabled =
    mode === "create"
      ? !canCreateMobileCollection(actionState, name)
      : !canRenameMobileCollection(actionState, name, initialName);
  const title =
    mode === "create" ? strings.library.newCollection : strings.library.renameCollection;
  const description =
    mode === "create"
      ? strings.library.newCollectionDescription
      : strings.library.renameDescription;
  const submitLabel = mode === "create" ? strings.common.create : strings.common.save;

  const requestClose = () => {
    if (saving) return;
    onClose();
  };

  useLayoutEffect(() => {
    if (visible && !wasVisibleRef.current) {
      // Keep one native host mounted through dismissal, but restore its local
      // draft synchronously before the next presentation paints.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setName(initialName);
    }
    wasVisibleRef.current = visible;
  }, [initialName, visible]);

  return (
    <MobileNativeSheetScaffold
      visible={visible}
      onClose={requestClose}
      onDismiss={onDismiss}
      title={title}
      subtitle={description}
      dismissLabel={strings.common.cancel}
      dismissDisabled={saving}
      showDismissButton={false}
      scroll={landscape}
      enablePanDownToClose={!saving}
      contentStyle={[
        styles.nameSheet,
        landscape ? styles.nameSheetLandscape : null,
      ]}
      testID={mode === "create" ? "NewCollectionSheet" : "RenameCollectionSheet"}
    >
      <View
        style={[
          styles.nameInputShell,
          nemuSheetMetrics.textFieldMinHeight
            ? { minHeight: nemuSheetMetrics.textFieldMinHeight }
            : null,
          { backgroundColor: tokens.muted, borderColor: tokens.border },
        ]}
      >
        <BottomSheetTextInput
          accessibilityLabel={strings.library.collectionName}
          autoCapitalize="words"
          autoFocus
          editable={!saving}
          placeholder={strings.library.collectionName}
          placeholderTextColor={tokens.mutedForeground}
          returnKeyType="done"
          selectionColor={tokens.primary}
          value={name}
          onChangeText={setName}
          onSubmitEditing={() => {
            if (disabled) return;
            onSubmit(trimmedName);
          }}
          style={[
            styles.nameInput,
            nemuSheetMetrics.textFieldText,
            { color: tokens.foreground },
          ]}
        />
      </View>

      <View style={styles.sheetActions}>
        <NemuButton
          accessibilityLabel={strings.common.cancel}
          containerStyle={styles.actionButton}
          disabled={saving}
          hapticFeedback="none"
          label={strings.common.cancel}
          onPress={requestClose}
          variant="secondary"
        />
        <NemuButton
          accessibilityLabel={submitLabel}
          containerStyle={styles.actionButton}
          disabled={disabled}
          label={submitLabel}
          loading={saving}
          onPress={() => {
            if (disabled) return;
            onSubmit(trimmedName);
          }}
          variant={saving || !disabled ? "default" : "secondary"}
        />
      </View>
    </MobileNativeSheetScaffold>
  );
}

function CollectionsManagerSheet({
  visible,
  collections,
  strings,
  membership,
  selectedCollectionId,
  actionState,
  onClose,
  onDismiss,
  onSelect,
  onCreate,
  onRename,
  onRemove,
}: {
  visible: boolean;
  collections: LocalCollection[];
  strings: MobileStrings;
  membership: Map<string, Set<string>>;
  selectedCollectionId: string | null;
  actionState: MobileCollectionActionState;
  onClose: () => void;
  onDismiss?: () => void;
  onSelect: (collectionId: string) => void;
  onCreate: () => void;
  onRename: (collection: LocalCollection) => void;
  onRemove: (collection: LocalCollection) => void;
}) {
  const { tokens } = useMobileNativeSheetTheme();
  const { fontScale, height, width } = useWindowDimensions();
  const actionBusy = isMobileCollectionActionBusy(actionState);
  const sheetLayout = getMobileCollectionsManagerSheetLayout({
    collectionCount: collections.length,
    fontScale,
    height,
    width,
    rowHeight: nemuSheetMetrics.twoLineRowLayout
      ? nemuSheetMetrics.twoLineRowLayout.minHeight + 9
      : undefined,
  });
  const headerMetrics = resolveMobileSheetHeaderMetrics(Platform.OS);

  return (
    <MobileNativeSheetScaffold
      visible={visible}
      onClose={onClose}
      onDismiss={onDismiss}
      title={strings.library.manageCollections}
      headerTrailing={
        <NemuButton
          accessibilityLabel={strings.library.createCollection}
          disabled={actionBusy}
          icon="add-outline"
          label={headerMetrics.showActionLabels ? strings.library.new : undefined}
          onPress={onCreate}
          size={headerMetrics.showActionLabels ? "sm" : "icon-sm"}
          variant="secondary"
        />
      }
      snapPoints={sheetLayout.snapPoints}
      scroll={sheetLayout.scroll}
      contentStyle={styles.managerSheet}
      testID="CollectionsManagerSheet"
    >
      {collections.length === 0 ? (
        <View
          style={[
            styles.managerEmpty,
            { backgroundColor: tokens.muted, borderColor: tokens.border },
          ]}
        >
          <Text
            style={[
              styles.managerEmptyText,
              nemuSheetMetrics.description,
              { color: tokens.mutedForeground },
            ]}
          >
            {strings.collectionMembership.noCollections}
          </Text>
        </View>
      ) : (
        <View style={styles.managerList}>
          {collections.map((collection) => {
            const count = collectionCount(collection.collectionId, membership);
            const selected = selectedCollectionId === collection.collectionId;
            const countLabel = collectionBookCountText(count, strings);
            return (
              <View
                key={collection.collectionId}
                style={[
                  styles.managerRow,
                  nemuSheetMetrics.twoLineRowLayout
                    ? { minHeight: nemuSheetMetrics.twoLineRowLayout.minHeight }
                    : null,
                  {
                    backgroundColor: selected
                      ? nemuColorWithAlpha(tokens.primary, 0.07)
                      : tokens.card,
                    borderColor: selected
                      ? nemuColorWithAlpha(tokens.primary, 0.4)
                      : tokens.border,
                    opacity: actionBusy ? 0.68 : 1,
                  },
                ]}
              >
                <NemuPressable
                  accessibilityLabel={formatMobileString(
                    strings.library.collectionChipAccessibility,
                    {
                      name: collection.name,
                      countLabel,
                    }
                  )}
                  accessibilityRole="button"
                  accessibilityState={{ selected, disabled: actionBusy }}
                  disabled={actionBusy}
                  hapticFeedback="selection"
                  onPress={() => onSelect(collection.collectionId)}
                  pressedScale={0.985}
                  containerStyle={styles.managerRowMainContainer}
                  style={[styles.managerRowMain, nemuSheetMetrics.twoLineRowLayout]}
                >
                  <Ionicons
                    name={selected ? "albums" : "albums-outline"}
                    size={nemuSheetMetrics.rowIconSize}
                    color={selected ? tokens.primary : tokens.mutedForeground}
                  />
                  <View style={styles.managerRowCopy}>
                    <Text
                      numberOfLines={1}
                      style={[
                        styles.managerRowTitle,
                        nemuSheetMetrics.twoLineRowTitle,
                        { color: tokens.foreground },
                      ]}
                    >
                      {collection.name}
                    </Text>
                    <Text
                      numberOfLines={1}
                      style={[
                        styles.managerRowMeta,
                        nemuSheetMetrics.twoLineRowSupporting,
                        { color: tokens.mutedForeground },
                      ]}
                    >
                      {countLabel}
                    </Text>
                  </View>
                  {selected ? (
                    <Ionicons name="checkmark-circle" size={20} color={tokens.primary} />
                  ) : null}
                </NemuPressable>
                <View style={styles.managerRowActions}>
                  <NemuButton
                    accessibilityLabel={formatMobileString(
                      strings.library.renameCollectionAccessibility,
                      { name: collection.name }
                    )}
                    accessibilityState={{ disabled: actionBusy }}
                    disabled={actionBusy}
                    icon="create-outline"
                    onPress={() => onRename(collection)}
                    size="icon-sm"
                    variant="secondary"
                  />
                  <NemuButton
                    accessibilityLabel={formatMobileString(
                      strings.library.removeCollectionNamed,
                      { name: collection.name }
                    )}
                    accessibilityState={{ disabled: actionBusy }}
                    disabled={actionBusy}
                    hapticFeedback="warning"
                    icon="trash-outline"
                    onPress={() => onRemove(collection)}
                    size="icon-sm"
                    variant="destructive"
                  />
                </View>
              </View>
            );
          })}
        </View>
      )}
    </MobileNativeSheetScaffold>
  );
}

// iOS presents these as SwiftUI Form sheets (native rows, checkmarks, swipe
// actions, Cancel / Save in the navigation bar); Android keeps the Material
// React Native sheets above.
const TitleMenuSheet = mobileLibraryCollectionNativeSheetsAvailable
  ? MobileLibraryTitleMenuNativeSheet
  : LibraryTitleMenuSheet;
const NameSheet = mobileLibraryCollectionNativeSheetsAvailable
  ? MobileCollectionNameNativeSheet
  : CollectionNameSheet;

export function LibraryScreen({
  collectionId = null,
  mode = "library",
}: LibraryScreenProps = {}) {
  const { verticalBarSide, width: windowWidth, height: windowHeight, hasFoldRegion } = useMobileAdaptiveLayout();
  const { scheme, tokens } = useNemuTheme();
  const usesNativeHeader = usesNemuNativeHeader;
  const store = useMobileDataStore();
  const {
    data: libraryEntries,
    loading: libraryLoading,
    error: libraryError,
    reload: reloadLibrary,
  } = useLibraryEntries();
  const installedSources = useInstalledSources({ includeLocalArchive: true });
  const progress = useMangaProgress();
  const collections = useCollections();
  const { appLanguage } = useMobileLanguageSettings();
  const strings = getMobileStrings(appLanguage);
  const routeCollectionId = collectionId?.trim() ? collectionId.trim() : null;
  const isCollectionRoute = mode === "collection";
  // The shown collection is a session store shared with the collection
  // deep-link route (`mobileLibraryTitleMenu.ts`): the title menu switches it
  // in place, so the Library root never navigates to show a collection and
  // All is always one tap away.
  const sharedSelectedCollectionId = useSyncExternalStore(
    subscribeMobileLibraryCollectionSelection,
    getMobileLibraryCollectionSelection,
    getMobileLibraryCollectionSelection,
  );
  const selectedCollectionId = isCollectionRoute
    ? routeCollectionId
    : sharedSelectedCollectionId;
  const setSelectedCollectionId = setMobileLibraryCollectionSelection;
  const [showTitleMenuSheet, setShowTitleMenuSheet] = useState(false);
  const [showCreatePanel, setShowCreatePanel] = useState(false);
  const [showManagePanel, setShowManagePanel] = useState(false);
  const [manageCollectionPresentation, setManageCollectionPresentation] =
    useState<LocalCollection | null>(null);
  const [showCollectionsManagerSheet, setShowCollectionsManagerSheet] = useState(false);
  const [showAddBooksSheet, setShowAddBooksSheet] = useState(false);
  const [addBooksPresentation, setAddBooksPresentation] =
    useState<LocalCollection | null>(null);
  const [renameTarget, setRenameTarget] = useState<LocalCollection | null>(null);
  const [removeTarget, setRemoveTarget] = useState<LocalCollection | null>(null);
  const [newCollectionName, setNewCollectionName] = useState("");
  const [savingCollection, setSavingCollection] = useState(false);
  const savingCollectionRef = useRef(false);
  const [renamingCollection, setRenamingCollection] = useState(false);
  const renamingCollectionRef = useRef(false);
  const [savingCollectionMembership, setSavingCollectionMembership] = useState(false);
  const savingCollectionMembershipRef = useRef(false);
  const [removingCollection, setRemovingCollection] = useState(false);
  const removingCollectionRef = useRef(false);
  // The pushed collection screen's own collection was just deleted: it waits
  // for the sheet to finish dismissing, then steps back (see
  // mobileLibraryDeletedCollection.ts).
  const [leavingDeletedCollection, setLeavingDeletedCollection] =
    useState<LocalCollection | null>(null);
  const [refreshingLibrary, setRefreshingLibrary] = useState(false);
  const [retryingData, setRetryingData] = useState(false);
  const [operationError, setOperationError] = useState<string | null>(null);
  const [quickActionEntry, setQuickActionEntry] = useState<LibraryEntry | null>(null);
  const [membershipSheetEntry, setMembershipSheetEntry] = useState<LibraryEntry | null>(null);
  const toast = useMobileToast();
  const pendingSheetTransitionRef = useRef<PendingLibrarySheetTransition | null>(null);
  const refreshInFlightRef = useRef(false);
  const retryDataGuardRef = useRef(false);
  const appStateRef = useRef((AppState.currentState ?? "unknown"));
  const foregroundCatchupPendingRef = useRef(false);
  // Abort flag for the background latest-chapter refresh. Its operations run
  // at `background` priority, so a tap's requests already go first on the
  // shared source runtime; flipping `aborted` (on blur) also stops the sweep
  // from queueing more work while the user is elsewhere.
  const libraryRefreshAbortRef = useRef<{ aborted: boolean }>({ aborted: false });
  const libraryFocusedRef = useRef(true);
  const gridScrollRef = useRef<FlatList<LibraryEntry[]> | null>(null);
  // The library grid adapts exactly like browse and search: columns come from
  // the list's measured width minus the scaffold's safe-area gutters (an even
  // count on regular widths), and in book posture the middle gutter sits on
  // the fold so no cover straddles it.
  const grid = useMobileFoldAwareGrid({
    // Larger covers on an iPad (mobileLibraryGridMinItemWidth).
    minItemWidth: mobileLibraryGridMinItemWidth({ width: windowWidth, height: windowHeight, hasFoldRegion }),
    getNode: () =>
      gridScrollRef.current?.getNativeScrollRef?.() as
        | { measureInWindow?: (callback: (x: number, y: number, width: number, height: number) => void) => void }
        | null
        | undefined,
  });
  const gridColumns = grid.columns;
  const gridItemWidth = grid.itemWidth;
  const gridColumnMargins = grid.columnMargins;
  // Virtualize rows so a column change keeps the list/header mounted.
  useMobilePoseRenderProbe("LibraryScreen");

  const queueAfterSheetDismiss = useCallback(
    (source: LibrarySheetTransitionSource, run: () => void) => {
      if (pendingSheetTransitionRef.current) return false;
      pendingSheetTransitionRef.current = { source, run };
      return true;
    },
    [],
  );
  const completeSheetDismiss = useCallback(
    (source: LibrarySheetTransitionSource) => {
      const pending = pendingSheetTransitionRef.current;
      if (!pending || pending.source !== source) return;
      pendingSheetTransitionRef.current = null;
      pending.run();
    },
    [],
  );

  // `library/collection/[id]` is a pushed screen of its own (a deep link): it
  // shows its collection with the stack's Back button, title and edge swipe,
  // and leaves the root's selection (the title menu's) alone. An unknown id
  // keeps the not-found state.

  // A shown collection deleted elsewhere (another device, the manager sheet)
  // falls back to All once a reload no longer has it.
  const previousCollectionsRef = useRef(collections.data);
  useEffect(() => {
    const previous = previousCollectionsRef.current;
    previousCollectionsRef.current = collections.data;
    if (isCollectionRoute) return;
    const next = reconcileMobileLibraryCollectionSelection({
      previousCollections: previous,
      collections: collections.data,
      loading: collections.loading,
      selectedCollectionId: sharedSelectedCollectionId,
    });
    if (next !== sharedSelectedCollectionId) setMobileLibraryCollectionSelection(next);
  }, [collections.data, collections.loading, isCollectionRoute, sharedSelectedCollectionId]);

  useEffect(
    () => () => {
      pendingSheetTransitionRef.current = null;
    },
    [],
  );

  const collectionSelection = useMemo(
    () => resolveCollectionSelection(collections.data, selectedCollectionId),
    [collections.data, selectedCollectionId]
  );
  const selectedCollection = collectionSelection.collection;
  const effectiveCollectionId = collectionSelection.effectiveCollectionId;
  const progressIndex = useMemo(
    () => buildMobileProgressIndex(progress.data),
    [progress.data]
  );
  const getSourceSettings = useCallback(
    async (_sourceKey: string, sourceRecord: InstalledSource) => {
      const normalized = normalizeInstalledSource(sourceRecord);
      const runtimeSourceKey = makeMobileRuntimeSourceKey(normalized);
      const saved = await loadMobileSourceSettingsByKeys(store, [
        runtimeSourceKey,
        ...getMobileInstalledSourceSettingsKeys(sourceRecord),
      ]);
      return mergeSourceSettingValues(
        sourceRecord.packageMetadata?.settings ?? [],
        saved?.values,
      );
    },
    [store],
  );
  const entryProgressMaps: MobileLibraryEntryProgressMaps = useMemo(
    () => buildMobileLibraryEntryProgressMaps(libraryEntries, progressIndex),
    [libraryEntries, progressIndex]
  );
  // A page turn moves the open title's read time on: the order (and so the
  // rows) only changes when a title actually moves.
  const sortedLibraryEntries = useStableList(
    useMemo(
      () =>
        sortMobileLibraryEntries(libraryEntries, progressIndex, entryProgressMaps),
      [entryProgressMaps, libraryEntries, progressIndex]
    )
  );
  const completedChapters = useCompletedChapters(
    useMemo(
      () => getMobileLibraryCaughtUpCandidates(libraryEntries, progressIndex, entryProgressMaps),
      [entryProgressMaps, libraryEntries, progressIndex]
    )
  );
  const cardProgress = useStableValue(
    useMemo(
      () =>
        buildMobileLibraryCardProgress(libraryEntries, progressIndex, strings, entryProgressMaps, completedChapters),
      [completedChapters, entryProgressMaps, libraryEntries, progressIndex, strings]
    ),
    stabilizeMobileLibraryCardProgress
  );
  const visibleEntries = useMemo(
    () =>
      entriesForCollection(
        sortedLibraryEntries,
        effectiveCollectionId,
        collections.membership
      ),
    [collections.membership, effectiveCollectionId, sortedLibraryEntries]
  );
  // The grid order a removal (or its Undo) starts from: each cell's old index.
  const visibleEntriesRef = useRef(visibleEntries);
  useEffect(() => {
    visibleEntriesRef.current = visibleEntries;
  }, [visibleEntries]);
  const [gridGlide, setGridGlide] = useState<{
    from: ReadonlyMap<string, number>;
    leaving: ReadonlySet<string> | null;
  } | null>(null);
  const gridGlideClearRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const endGridGlideAfterWindow = useCallback((glide: NonNullable<typeof gridGlide>) => {
    if (gridGlideClearRef.current) clearTimeout(gridGlideClearRef.current);
    gridGlideClearRef.current = setTimeout(() => {
      gridGlideClearRef.current = null;
      setGridGlide((current) => (current === glide ? null : current));
    }, MOBILE_GRID_GLIDE_WINDOW_MS);
  }, []);
  useEffect(
    () => () => {
      if (gridGlideClearRef.current) clearTimeout(gridGlideClearRef.current);
    },
    [],
  );
  /**
   * A title leaving or coming back: the others glide to their new places
   * (mobileGridGlideTransition) instead of the grid snapping. The cells take
   * the transition first (`gridGlide`, one commit ahead: a layout config
   * registers after its commit), then `prepare` runs (the dust, or a frame),
   * the glide window opens and `change` lands.
   */
  const glideLibraryGrid = useCallback(
    async (prepare: () => Promise<unknown>, change: () => Promise<void>) => {
      const glide = {
        from: new Map(
          visibleEntriesRef.current.map((entry, index) => [entry.item.libraryItemId, index] as const),
        ),
        leaving: null,
      };
      setGridGlide(glide);
      try {
        await prepare();
        openMobileGridGlideWindow();
        await change();
      } finally {
        endGridGlideAfterWindow(glide);
      }
    },
    [endGridGlideAfterWindow],
  );
  // The titles the grid draws. A change from elsewhere (a sync, reading moving
  // a title up) glides like a removal: the grid keeps the old list for one
  // commit while its cells take the transition, then lands the new one. A
  // collection switch and a change the removal above armed land at once.
  const gridScope = effectiveCollectionId ?? "";
  const [drawnGrid, setDrawnGrid] = useState({ entries: visibleEntries, scope: gridScope });
  const gridIds = (entries: readonly LibraryEntry[]) => entries.map((entry) => entry.item.libraryItemId);
  const gridOrderChange =
    drawnGrid.entries === visibleEntries || drawnGrid.scope !== gridScope || isMobileGridGlideWindowOpen()
      ? null
      : getMobileListOrderChange(gridIds(drawnGrid.entries), gridIds(visibleEntries));
  const holdDrawnGrid = gridOrderChange !== null && libraryFocusedRef.current;
  if (!holdDrawnGrid && drawnGrid.entries !== visibleEntries) {
    setDrawnGrid({ entries: visibleEntries, scope: gridScope });
  }
  const gridEntries = holdDrawnGrid ? drawnGrid.entries : visibleEntries;
  const heldOrderChangeRef = useRef(gridOrderChange);
  heldOrderChangeRef.current = gridOrderChange;
  useEffect(() => {
    if (!holdDrawnGrid || !heldOrderChangeRef.current) return;
    const glide = heldOrderChangeRef.current;
    setGridGlide(glide);
    endGridGlideAfterWindow(glide);
    const frame = requestAnimationFrame(() => {
      openMobileGridGlideWindow();
      setDrawnGrid({ entries: visibleEntries, scope: gridScope });
    });
    return () => cancelAnimationFrame(frame);
  }, [endGridGlideAfterWindow, gridScope, holdDrawnGrid, visibleEntries]);
  const gridScrollAnchor = useMobileGridScrollAnchor({
    listRef: gridScrollRef,
    columns: gridColumns,
    itemWidth: gridItemWidth,
    itemCount: visibleEntries.length,
    viewabilityUnit: "row",
  });
  // A fold shrinks the covers: a list barely taller than the viewport would
  // clamp back to the top (and stay there after unfolding). The hold keeps
  // the offset reachable through the change (useMobilePoseScrollHold).
  const poseScrollHold = useMobilePoseScrollHold();
  const gridAnchorOnScroll = gridScrollAnchor.onScroll;
  const poseScrollHoldOnScroll = poseScrollHold.onScroll;
  const libraryGridOnScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      gridAnchorOnScroll(event);
      poseScrollHoldOnScroll(event);
    },
    [gridAnchorOnScroll, poseScrollHoldOnScroll],
  );
  const gridAnchorOnContentSizeChange = gridScrollAnchor.onContentSizeChange;
  const poseScrollHoldOnContentSizeChange = poseScrollHold.onContentSizeChange;
  const libraryOnContentSizeChange = useCallback(
    (width: number, height: number) => {
      poseScrollHoldOnContentSizeChange(width, height);
      gridAnchorOnContentSizeChange();
    },
    [gridAnchorOnContentSizeChange, poseScrollHoldOnContentSizeChange],
  );
  const poseScrollHoldPadding = poseScrollHold.paddingBottom;
  const libraryContentContainerStyle = useMemo(
    () => (poseScrollHoldPadding > 0 ? { paddingBottom: poseScrollHoldPadding } : undefined),
    [poseScrollHoldPadding],
  );
  const title = selectedCollection?.name ?? strings.nav.library;
  const loading =
    libraryLoading ||
    collections.loading ||
    progress.loading ||
    installedSources.loading;
  const error =
    libraryError ??
    collections.error ??
    progress.error ??
    installedSources.error;
  const hasError = Boolean(error);
  // The launch screen holds until this first local snapshot (content, the
  // empty state or an error) is committed; see `mobileSplashScreen.ts`.
  useEffect(() => {
    if (loading || isMobileLaunchContentReady()) return;
    markMobilePerformance(MOBILE_PERFORMANCE_MARKS.bootLibraryReady, { entries: libraryEntries.length });
    markMobileLaunchContentReady();
  }, [libraryEntries.length, loading]);
  const hasAnyLibraryData = libraryEntries.length > 0;
  const hasInstalledSources = installedSources.data.length > 0;
  const showSkeleton = shouldRenderMobileLibrarySkeleton({
    loading,
    hasLibraryData: hasAnyLibraryData,
    hasError,
  });
  const showLoadError = shouldShowMobileLibraryLoadError({
    loading,
    hasLibraryData: hasAnyLibraryData,
    hasError,
  });
  const routeCollectionState = resolveMobileLibraryRouteCollectionState({
    isCollectionRoute,
    loading,
    missing: collectionSelection.missing,
    leavingDeletedCollectionId: leavingDeletedCollection?.collectionId ?? null,
    routeCollectionId,
  });
  const routeCollectionMissing = routeCollectionState === "missing";
  const showEmptyOnboarding = shouldShowMobileLibraryEmptyOnboarding({
    loading,
    hasLibraryData: hasAnyLibraryData,
    hasSelectedCollection: Boolean(selectedCollection),
    hasError,
  });
  const emptyState = useMemo(
    () =>
      getMobileLibraryEmptyState({
        error: null,
        hasInstalledSources,
        strings,
      }),
    [hasInstalledSources, strings]
  );
  // Both failure surfaces read from the same pure state: the localized body
  // copy stays readable in ja/zh and the raw exception text only ever appears
  // behind the collapsed "technical details" disclosure.
  const loadErrorDiagnostic = error
    ? (sanitizeMobileErrorDiagnostic(error) ?? error)
    : null;
  const loadErrorState = useMemo(
    () =>
      getMobileLibraryEmptyState({
        error: loadErrorDiagnostic,
        hasInstalledSources,
        strings,
      }),
    [hasInstalledSources, loadErrorDiagnostic, strings],
  );
  const showLoadErrorBanner = shouldShowMobileLibraryLoadErrorBanner({
    hasLibraryData: hasAnyLibraryData,
    hasError,
  });
  const collectionActionState: MobileCollectionActionState = {
    creating: savingCollection,
    renaming: renamingCollection,
    savingMembership: savingCollectionMembership,
    removing: removingCollection,
  };
  const collectionActionBusy = isMobileCollectionActionBusy(collectionActionState);
  const libraryRefreshDisabled =
    loading || collectionActionBusy || libraryEntries.length === 0;
  const pageLoading = loading || refreshingLibrary || retryingData;

  const getGuardedCollectionActionState = (): MobileCollectionActionState => ({
    creating: savingCollectionRef.current || savingCollection,
    renaming: renamingCollectionRef.current || renamingCollection,
    savingMembership:
      savingCollectionMembershipRef.current || savingCollectionMembership,
    removing: removingCollectionRef.current || removingCollection,
  });

  const selectCollection = (
    nextCollectionId: string | null,
    source: "title-menu" | "collections-manager" | "native-title-menu",
  ) => {
    if (
      !canSelectMobileCollectionScope({
        currentCollectionId: effectiveCollectionId,
        nextCollectionId,
        state: getGuardedCollectionActionState(),
      })
    ) {
      return;
    }
    setOperationError(null);
    const commitSelection = () => {
      setSelectedCollectionId(nextCollectionId);
      setShowTitleMenuSheet(false);
      setShowCreatePanel(false);
      setShowManagePanel(false);
      setShowCollectionsManagerSheet(false);
      setShowAddBooksSheet(false);
      setRenameTarget(null);
      setRemoveTarget(null);
      // In place: no push/replace, so Back and tab reselection stay put and
      // the title menu can always switch back to All.
      if (isCollectionRoute) router.dismissTo("/library");
    };
    // The UIKit / Compose menu has already closed itself: no sheet to wait for.
    if (source === "native-title-menu") {
      commitSelection();
      return;
    }
    if (!queueAfterSheetDismiss(source, commitSelection)) return;
    if (source === "title-menu") {
      setShowTitleMenuSheet(false);
    } else {
      setShowCollectionsManagerSheet(false);
    }
  };

  const openAddBooksSheet = useCallback(() => {
    if (collectionActionBusy) return;
    if (!selectedCollection) return;
    setOperationError(null);
    setShowTitleMenuSheet(false);
    setAddBooksPresentation(selectedCollection);
    setShowAddBooksSheet(true);
    setShowCreatePanel(false);
    setShowCollectionsManagerSheet(false);
  }, [collectionActionBusy, selectedCollection]);

  const toggleCollectionManagement = useCallback(() => {
    if (collectionActionBusy) return;
    setOperationError(null);
    setShowTitleMenuSheet(false);
    if (showManagePanel) {
      setShowManagePanel(false);
    } else {
      if (!selectedCollection) return;
      setManageCollectionPresentation(selectedCollection);
      setShowManagePanel(true);
    }
    setShowAddBooksSheet(false);
    setShowCreatePanel(false);
    setShowCollectionsManagerSheet(false);
    setRenameTarget(null);
    setRemoveTarget(null);
  }, [collectionActionBusy, selectedCollection, showManagePanel]);

  const toggleCreateCollection = useCallback(() => {
    if (collectionActionBusy) return;
    setOperationError(null);
    setShowTitleMenuSheet(false);
    setShowCreatePanel((value) => !value);
    setShowManagePanel(false);
    setShowCollectionsManagerSheet(false);
    setShowAddBooksSheet(false);
    setRenameTarget(null);
    setRemoveTarget(null);
  }, [collectionActionBusy]);

  const openCollectionsManager = useCallback(() => {
    if (collectionActionBusy) return;
    setOperationError(null);
    setShowTitleMenuSheet(false);
    setShowCollectionsManagerSheet(true);
    setShowManagePanel(false);
    setShowAddBooksSheet(false);
    setShowCreatePanel(false);
    setRenameTarget(null);
    setRemoveTarget(null);
  }, [collectionActionBusy]);

  const openCollectionRename = useCallback((collection: LocalCollection) => {
    if (collectionActionBusy) return;
    setOperationError(null);
    if (
      !queueAfterSheetDismiss("collections-manager", () => {
        setRenameTarget(collection);
      })
    ) {
      return;
    }
    setShowCollectionsManagerSheet(false);
    setShowManagePanel(false);
    setShowCreatePanel(false);
    setShowAddBooksSheet(false);
  }, [collectionActionBusy, queueAfterSheetDismiss]);

  const openCollectionRemoveConfirmation = useCallback((collection: LocalCollection) => {
    if (collectionActionBusy) return;
    setOperationError(null);
    if (
      !queueAfterSheetDismiss("collections-manager", () => {
        setRemoveTarget(collection);
      })
    ) {
      return;
    }
    setShowCollectionsManagerSheet(false);
    setShowManagePanel(false);
    setShowCreatePanel(false);
    setShowAddBooksSheet(false);
  }, [collectionActionBusy, queueAfterSheetDismiss]);

  const reportCollectionError = async (error: unknown) => {
    await hapticError();
    setOperationError(
      describeMobileErrorDetail(error, strings.library.collectionActionFailedDetail),
    );
  };

  const refreshLatestChapters = useCallback(async (
    options: { force?: boolean; interactive?: boolean } = {}
  ) => {
    const force = options.force ?? false;
    if (libraryLoading || installedSources.loading) {
      // The launch sweep fires on the first idle frame, usually before the
      // library rows have loaded; run it once they have (see below) instead
      // of skipping the launch check entirely.
      if (!options.interactive) launchRefreshPendingRef.current = true;
      return;
    }
    if (
      !isMobileLibraryRefreshAppActive((AppState.currentState ?? "unknown")) ||
      refreshInFlightRef.current ||
      libraryEntries.length === 0 ||
      !libraryFocusedRef.current ||
      (!force &&
        !hasMobileLibraryStaleSourceLinks(
          libraryEntries,
          Date.now(),
          MOBILE_LIBRARY_REFRESH_INTERVAL_MS,
          installedSources.data,
        ))
    ) {
      return;
    }

    // Give each run its own signal. Reusing and clearing the prior object on
    // foreground could revive a native request that was already cancelled
    // while the app was backgrounding.
    const refreshSignal = {
      aborted: !isMobileLibraryRefreshAppActive((AppState.currentState ?? "unknown")),
    };
    if (refreshSignal.aborted) return;
    libraryRefreshAbortRef.current = refreshSignal;
    refreshInFlightRef.current = true;
    setRefreshingLibrary(true);
    try {
      const result = await refreshMobileLibraryLatestChapters({
        entries: libraryEntries,
        force,
        installedSources: installedSources.data,
        saveSourceLink: (sourceLink) => store.saveSourceLink(sourceLink),
        getSourceSettings,
        signal: refreshSignal,
      });

      if (result.checked > 0) {
        emitMobileDataChanged("library");
        await reloadLibrary();
      }
      if (options.interactive) {
        // Refresh results are not surfaced: the per-card `+N` badge is the
        // feedback. Only a sweep where every checked source failed needs a
        // toast, because then no badge can appear at all.
        const everySourceFailed =
          result.checked > 0 &&
          result.refreshed === 0 &&
          result.failed >= result.checked;
        if (result.failed > 0 && result.refreshed === 0) {
          await hapticError();
        } else {
          await hapticConfirm();
        }
        if (everySourceFailed) {
          toast.show({
            tone: "danger",
            title: strings.feedback.libraryRefreshFailedTitle,
            detail: formatMobileString(
              strings.feedback.libraryRefreshUnavailableDetail,
              { count: result.failed },
            ),
          });
        }
      }
    } finally {
      refreshInFlightRef.current = false;
      setRefreshingLibrary(false);
      if (
        foregroundCatchupPendingRef.current &&
        AppState.currentState === "active" &&
        libraryFocusedRef.current
      ) {
        foregroundCatchupPendingRef.current = false;
        setTimeout(() => {
          void refreshLatestChapters();
        }, 0);
      }
    }
  }, [
    installedSources.data,
    installedSources.loading,
    libraryEntries,
    libraryLoading,
    getSourceSettings,
    reloadLibrary,
    store,
    strings.feedback.libraryRefreshFailedTitle,
    strings.feedback.libraryRefreshUnavailableDetail,
    toast,
  ]);

  // Blur-abort: when the user taps a manga (which navigates away and blurs
  // this screen) or otherwise leaves the library, flip the abort flag so the
  // in-flight sweep yields the shared runtime queue to the foreground screen.
  // On re-focus, clear the flag so the next sweep can proceed.
  useFocusEffect(
    useCallback(() => {
      libraryFocusedRef.current = true;
      return () => {
        libraryRefreshAbortRef.current.aborted = true;
        libraryFocusedRef.current = false;
      };
    }, []),
  );

  // The scheduler must outlive callback identity: `refreshLatestChapters`
  // re-creates on every library/source write (including the reload its own
  // sweep triggers), and re-arming the schedule on each one restarted the
  // interval and queued redundant initial sweeps.
  // Set when the launch update check found the library still loading.
  const launchRefreshPendingRef = useRef(false);
  useEffect(() => {
    if (
      !launchRefreshPendingRef.current ||
      libraryLoading ||
      installedSources.loading
    ) {
      return;
    }
    // Update checks run at `background` priority on the source runtime and
    // keep every title's chapter list cached, so opening a title from the
    // library paints at once instead of waiting on its source.
    const task = scheduleMobileIdleTask(() => {
      launchRefreshPendingRef.current = false;
      void refreshLatestChapters();
    });
    return () => task.cancel();
  }, [installedSources.loading, libraryLoading, refreshLatestChapters]);
  const refreshLatestChaptersRef = useRef(refreshLatestChapters);
  useEffect(() => {
    refreshLatestChaptersRef.current = refreshLatestChapters;
  }, [refreshLatestChapters]);

  useEffect(() => {
    let initialRefreshTask: MobileIdleTaskHandle | null = null;
    let interval: ReturnType<typeof setInterval> | null = null;
    const refreshLatestChapters = () => refreshLatestChaptersRef.current();

    const stopRefreshSchedule = () => {
      initialRefreshTask?.cancel();
      initialRefreshTask = null;
      if (interval) {
        clearInterval(interval);
        interval = null;
      }
    };

    const startRefreshSchedule = (scheduleInitial: boolean) => {
      if (
        interval ||
        !isMobileLibraryRefreshAppActive((AppState.currentState ?? "unknown"))
      ) {
        return;
      }
      // Defer only the first mounted sweep until render and any in-flight
      // gesture/transition settle. Foreground resumes use the explicit
      // catch-up decision below and therefore do not schedule a duplicate.
      if (scheduleInitial) {
        initialRefreshTask = scheduleMobileIdleTask(() => {
          initialRefreshTask = null;
          void refreshLatestChapters();
        });
      }
      interval = setInterval(() => {
        void refreshLatestChapters();
      }, MOBILE_LIBRARY_REFRESH_INTERVAL_MS);
    };

    startRefreshSchedule(true);
    const subscription = AppState.addEventListener("change", (nextAppState) => {
      const decision = getMobileLibraryRefreshLifecycleDecision({
        previous: appStateRef.current,
        next: nextAppState,
        inFlight: refreshInFlightRef.current,
      });
      if (decision.abortCurrent) {
        libraryRefreshAbortRef.current.aborted = true;
        stopRefreshSchedule();
      }
      if (decision.refreshAfterInFlight) {
        foregroundCatchupPendingRef.current = true;
      } else if (decision.refreshNow) {
        void refreshLatestChapters();
      }
      appStateRef.current = nextAppState;
      if (isMobileLibraryRefreshAppActive(nextAppState)) {
        startRefreshSchedule(false);
      }
    });

    return () => {
      stopRefreshSchedule();
      subscription.remove();
    };
  }, []);

  // iOS names collections in an alert, which has already closed by the time
  // the save settles: a create that does not go through ends the prompt
  // too (the error shows on the page) instead of leaving it armed.
  const endCreatePromptAfterFailure = () => {
    if (!mobileLibraryCollectionNativeSheetsAvailable) return;
    setShowCreatePanel(false);
    setNewCollectionName("");
  };

  /**
   * `inPlace`: created from the Manage Collections sheet, which stays open
   * and shows the new row; otherwise the sheets close and the library
   * switches to the new collection.
   */
  const createCollection = async (
    submittedName?: string,
    { inPlace = false }: { inPlace?: boolean } = {},
  ) => {
    const name = (submittedName ?? newCollectionName).trim();
    if (!canCreateMobileCollection(getGuardedCollectionActionState(), name)) {
      if (!inPlace) endCreatePromptAfterFailure();
      return;
    }
    savingCollectionRef.current = true;
    setSavingCollection(true);
    setOperationError(null);
    try {
      const collection = await collections.createCollection(name);
      if (inPlace) {
        await hapticConfirm();
        return;
      }
      if (
        !queueAfterSheetDismiss("create-collection", () => {
          setSelectedCollectionId(collection.collectionId);
          if (isCollectionRoute) router.dismissTo("/library");
        })
      ) {
        return;
      }
      setNewCollectionName("");
      setShowCreatePanel(false);
      setShowManagePanel(false);
      setShowCollectionsManagerSheet(false);
      setShowAddBooksSheet(false);
      await hapticConfirm();
    } catch (error) {
      if (!inPlace) endCreatePromptAfterFailure();
      await reportCollectionError(error);
    } finally {
      savingCollectionRef.current = false;
      setSavingCollection(false);
    }
  };

  const saveCollectionMembership = async (selectedLibraryItemIds: Set<string>) => {
    if (!selectedCollection) return false;
    const initialSelected = new Set(
      collections.membership.get(selectedCollection.collectionId) ?? []
    );
    const validLibraryItemIds = new Set(
      sortedLibraryEntries.map((entry) => entry.item.libraryItemId)
    );
    const diff = diffLibraryItemSelection(
      initialSelected,
      selectedLibraryItemIds,
      validLibraryItemIds
    );

    if (diff.idsToAdd.length === 0 && diff.idsToRemove.length === 0) return true;
    if (
      !canSaveMobileCollectionMembership(
        getGuardedCollectionActionState(),
        diff.idsToAdd.length + diff.idsToRemove.length
      )
    ) {
      return false;
    }
    savingCollectionMembershipRef.current = true;
    setSavingCollectionMembership(true);
    setOperationError(null);
    try {
      if (diff.idsToRemove.length > 0) {
        await collections.removeBooksFromCollection(
          selectedCollection.collectionId,
          diff.idsToRemove
        );
      }
      if (diff.idsToAdd.length > 0) {
        await collections.addBooksToCollection(selectedCollection.collectionId, diff.idsToAdd);
      }
      setShowManagePanel(false);
      await hapticConfirm();
      return true;
    } catch (error) {
      await reportCollectionError(error);
      return false;
    } finally {
      savingCollectionMembershipRef.current = false;
      setSavingCollectionMembership(false);
    }
  };

  const renameCollectionById = async (collection: LocalCollection, name: string) => {
    if (
      !canRenameMobileCollection(
        getGuardedCollectionActionState(),
        name,
        collection.name
      )
    ) {
      return false;
    }
    renamingCollectionRef.current = true;
    setRenamingCollection(true);
    setOperationError(null);
    try {
      const updated = await collections.renameCollection(collection.collectionId, name);
      if (!updated) return false;
      setManageCollectionPresentation((current) =>
        current?.collectionId === updated.collectionId ? updated : current,
      );
      if (effectiveCollectionId === collection.collectionId) {
        setSelectedCollectionId(updated.collectionId);
      }
      setRenameTarget(null);
      await hapticConfirm();
      return true;
    } catch (error) {
      await reportCollectionError(error);
      return false;
    } finally {
      renamingCollectionRef.current = false;
      setRenamingCollection(false);
    }
  };

  // The book picker's ✓: a staged rename (Edit Collection) first, then the
  // membership diff. A failed rename keeps the sheet open with nothing else
  // written; an unchanged selection still closes it.
  const saveCollectionBooks = async (
    collection: LocalCollection,
    selectedLibraryItemIds: Set<string>,
    renameTo: string | null,
  ) => {
    if (collection.collectionId !== selectedCollection?.collectionId) return false;
    if (renameTo !== null) {
      const renamed = await renameCollectionById(collection, renameTo);
      if (!renamed) return false;
    }
    return saveCollectionMembership(selectedLibraryItemIds);
  };

  /**
   * `collections-manager`: confirmed inside the iOS Manage Collections sheet,
   * which stays open with the row gone (the library behind falls back to
   * All when it was showing this collection).
   */
  const removeCollectionById = async (
    collection: LocalCollection,
    source: "manage-collection" | "remove-confirmation" | "collections-manager",
  ) => {
    if (!canStartMobileCollectionAction(getGuardedCollectionActionState())) return;
    removingCollectionRef.current = true;
    setRemovingCollection(true);
    setOperationError(null);
    try {
      await collections.removeCollection(collection.collectionId);
      if (
        isMobileLibraryOpenCollectionDeleted({
          isCollectionRoute,
          routeCollectionId,
          deletedCollectionId: collection.collectionId,
        })
      ) {
        // This screen shows the deleted collection: once the sheet is gone,
        // step back to whatever pushed it and confirm there. The sheets stay
        // mounted meanwhile (`leaving-deleted`), so their dismissal fires.
        setLeavingDeletedCollection(collection);
        const leave = () => {
          leaveMobileLibraryDeletedCollection(router);
          toast.show(buildMobileCollectionDeletedToast(strings, collection.name));
        };
        if (!queueAfterSheetDismiss(source, leave)) leave();
        setShowManagePanel(false);
        setShowCollectionsManagerSheet(false);
        setShowAddBooksSheet(false);
        setRenameTarget(null);
        setRemoveTarget(null);
        await hapticConfirm();
        return;
      }
      if (source === "collections-manager") {
        if (effectiveCollectionId === collection.collectionId) setSelectedCollectionId(null);
        await hapticConfirm();
        return;
      }
      if (
        !queueAfterSheetDismiss(source, () => {
          if (effectiveCollectionId !== collection.collectionId) return;
          setSelectedCollectionId(null);
          if (isCollectionRoute) router.dismissTo("/library");
        })
      ) {
        return;
      }
      setShowManagePanel(false);
      setShowCollectionsManagerSheet(false);
      setShowAddBooksSheet(false);
      setRenameTarget(null);
      setRemoveTarget(null);
      await hapticConfirm();
    } catch (error) {
      await reportCollectionError(error);
    } finally {
      removingCollectionRef.current = false;
      setRemovingCollection(false);
    }
  };

  const retryLibraryData = async () => {
    if (retryDataGuardRef.current) return;

    retryDataGuardRef.current = true;
    setRetryingData(true);
    try {
      await Promise.all([
        reloadLibrary(),
        collections.reload(),
        progress.reload(),
        installedSources.reload(),
      ]);
      await hapticConfirm();
    } catch {
      await hapticError();
    } finally {
      retryDataGuardRef.current = false;
      setRetryingData(false);
    }
  };
  // The navigation title is the collection switcher (iOS: UIKit title menu
  // with the system chevron, like Files; Android: Material title dropdown).
  // Without it (a binary built before the native module) the toolbar keeps
  // the switcher button that opens the title-menu sheet.
  const titleMenuSections = useMemo(
    () =>
      buildMobileLibraryTitleMenu({
        collections: collections.data,
        membership: collections.membership,
        libraryCount: libraryEntries.length,
        selectedCollectionId: effectiveCollectionId,
        labels: {
          all: strings.library.all,
          editCollection: strings.library.titleMenuEditCollection,
          newCollection: strings.library.titleMenuNewCollection,
          manageCollections: strings.library.titleMenuManageCollections,
          bookCount: (count) => collectionBookCountText(count, strings),
        },
        disabled: collectionActionBusy,
      }),
    [
      collectionActionBusy,
      collections.data,
      collections.membership,
      effectiveCollectionId,
      libraryEntries.length,
      strings,
    ],
  );
  const handleTitleMenuAction = (id: string) => {
    const action = resolveMobileLibraryTitleMenuAction(id);
    if (!action || collectionActionBusy) return;
    switch (action.type) {
      case "select":
        selectCollection(action.collectionId, "native-title-menu");
        return;
      case "edit-current":
        if (!showManagePanel) toggleCollectionManagement();
        return;
      case "create":
        if (!showCreatePanel) toggleCreateCollection();
        return;
      case "manage":
        openCollectionsManager();
        return;
    }
  };
  const titleMenu: MobileLibraryTitleMenuProps | null =
    mobileLibraryTitleMenuAvailable && !isCollectionRoute
      ? {
          title,
          sections: titleMenuSections,
          accessibilityHint: strings.library.titleMenuHint,
          tokens,
          scheme,
          onAction: handleTitleMenuAction,
        }
      : null;
  const titleMenuAnchor = titleMenu ? <MobileLibraryTitleMenuAnchor {...titleMenu} /> : null;
  const nativeHeaderOptions = (
    screenTitle: string,
  ) => createNemuNativeScreenOptions(tokens, screenTitle);
  // The Library root's header: on Android the title becomes the dropdown.
  const titleMenuHeaderOptions = (screenTitle: string) => ({
    ...nativeHeaderOptions(screenTitle),
    ...(titleMenu
      ? getMobileLibraryTitleMenuHeaderOptions({ ...titleMenu, title: screenTitle })
      : {}),
  });
  const collectionSwitcherAction: NemuNativeHeaderAction = {
    // Fallback switcher (no native title menu). Not an ellipsis: HIG
    // reserves it for the system overflow menu (which the vertical bar adds).
    icon: "rectangle.stack",
    label: strings.collectionMembership.title,
    hint: strings.library.manageCollectionsHint,
    disabled: collectionActionBusy,
    onPress: () => setShowTitleMenuSheet(true),
  };
  // Library-level collection actions. Shared with the empty-library state so
  // collections stay manageable before the first title is added.
  const importComics = useCallback(async () => {
    try {
      const picked = await DocumentPicker.getDocumentAsync({
        copyToCacheDirectory: true,
        multiple: false,
        type: ["application/zip", "application/x-cbz", "application/vnd.comicbook+zip", "application/octet-stream"],
      });
      if (picked.canceled) return;
      const asset = picked.assets?.[0];
      if (!asset?.uri) return;
      try {
        const result = await importLocalArchive({
          uri: asset.uri,
          fileName: asset.name,
          fs: deviceArchiveFs,
          store,
          now: Date.now(),
          newId: () => `work-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
        });
        if (result.kind === "created") void pushLocalArchiveVolume(store, result.volume);
        emitMobileLibraryDataChanged();
        toast.show({
          id: "comic-import",
          tone: "success",
          title: formatMobileString(
            result.kind === "created" ? strings.library.importComicsDone : strings.library.importComicsRelinked,
            { title: result.volume.title },
          ),
        });
      } finally {
        // The picker's cache copy is no longer needed; the book lives in documents.
        try {
          new FsFile(asset.uri).delete();
        } catch {
          // already gone
        }
      }
    } catch {
      toast.show({ id: "comic-import", tone: "danger", title: strings.library.importComicsFailed });
    }
  }, [store, strings, toast]);
  // The Library toolbar's "+" is a menu: import a CBZ/ZIP, or start a collection.
  const libraryAddMenuActions: NemuNativeHeaderAction[] = [
    {
      icon: "square.and.arrow.down",
      label: strings.library.importComics,
      hint: strings.library.importComicsHint,
      disabled: collectionActionBusy,
      onPress: () => void importComics(),
    },
    {
      icon: "folder.badge.plus",
      // Opens a name prompt, so the label ends in an ellipsis like the import entry.
      label: `${strings.library.createCollection}…`,
      hint: strings.library.createCollectionHint,
      disabled: collectionActionBusy,
      onPress: toggleCreateCollection,
    },
  ];
  const libraryHeaderActions: NemuNativeHeaderAction[] = [
    ...(Platform.OS === "ios" ? [] : [libraryAddMenuActions[1]!]),
    ...(titleMenu ? [] : [collectionSwitcherAction]),
  ];
  // A shown collection adds books from the toolbar; editing it lives in the
  // title menu ("Edit Collection…"), next to switching back to All.
  const collectionHeaderActions: NemuNativeHeaderAction[] = [
    {
      icon: "plus",
      label: strings.library.addBooksAction,
      hint: strings.library.addBooksHint,
      disabled: collectionActionBusy,
      onPress: openAddBooksSheet,
    },
    ...(titleMenu
      ? []
      : [
          collectionSwitcherAction,
          {
            icon: "folder.badge.gearshape" as const,
            label: strings.library.manageCollection,
            hint: strings.library.manageCollectionHint,
            disabled: collectionActionBusy,
            onPress: toggleCollectionManagement,
          },
        ]),
  ];
  const nativeHeaderActions: NemuNativeHeaderAction[] = selectedCollection
    ? collectionHeaderActions
    : libraryHeaderActions;
  const handleQuickActionMarkAllRead = useCallback(
    async (entry: LibraryEntry) => {
      const now = Date.now();
      let acked = 0;
      try {
        for (const link of entry.sources) {
          if (!link.latestChapter) continue;
          const latest = link.latestChapter.chapterNumber;
          const ack = link.updateAckChapter?.chapterNumber;
          if (latest == null || (ack != null && ack >= latest)) continue;
          await store.saveSourceLink({
            ...link,
            updateAckChapter: link.latestChapter,
            updateAckChapterSortKey: link.latestChapterSortKey,
            updateAckAt: now,
            updatedAt: now,
          });
          acked += 1;
        }
      } catch {
        toast.show({
          tone: "danger",
          title: strings.mangaDetail.actionFailedDetail,
        });
        return;
      }
      if (acked > 0) {
        emitMobileDataChanged("library");
        await hapticConfirm();
      }
      toast.show({
        tone: "success",
        title: strings.feedback.markedAllRead,
      });
    },
    [store, strings, toast],
  );

  const handleQuickActionRemove = useCallback(
    async (entry: LibraryEntry) => {
      try {
        await glideLibraryGrid(
          // Design-explore: once the sheet has slid away, the title's cover
          // turns to dust where it stands; the covers after it then glide
          // into the gap behind the drifting dust.
          () =>
            mobileDesignExploreFlag
              ? dissolveExploreTitle(entry.item.libraryItemId, EXPLORE_SHEET_DISMISS_MS)
              : afterNextFrame(),
          async () => {
            await store.removeLibraryItem(entry.item.libraryItemId);
            emitMobileLibraryDataChanged({ collectionsChanged: true });
          },
        );
      } catch {
        toast.show({
          tone: "danger",
          title: strings.mangaDetail.actionFailedDetail,
        });
        return;
      }
      toast.show({
        tone: "info",
        title: strings.feedback.removedFromLibrary,
        detail: strings.feedback.removedFromLibraryHint,
        action: {
          label: strings.feedback.undo,
          onPress: () => {
            glideLibraryGrid(afterNextFrame, async () => {
              await store.restoreLibraryItem(entry.item.libraryItemId);
              emitMobileLibraryDataChanged({ collectionsChanged: true });
            }).catch(() =>
              toast.show({
                tone: "danger",
                title: strings.mangaDetail.actionFailedDetail,
              }),
            );
          },
        },
      });
    },
    [glideLibraryGrid, store, strings, toast],
  );

  const openEntryInSource = useCallback(
    (entry: LibraryEntry, link: LocalSourceLink | undefined) => {
      if (!link) return;
      router.push(
        getMobileSourceMangaHref({
          registryId: link.registryId,
          sourceId: link.sourceId,
          mangaId: link.sourceMangaId,
          mangaTitle: getEntryTitle(entry),
        }),
      );
    },
    [],
  );

  const quickActionLink = useMemo(
    () =>
      quickActionEntry
        ? (getMobileEntryQuickActionSource(quickActionEntry, progressIndex) ??
          null)
        : null,
    [progressIndex, quickActionEntry],
  );
  const quickActionSource = useMemo(
    () =>
      quickActionLink
        ? findInstalledSourceForLink(installedSources.data, quickActionLink)
        : null,
    [installedSources.data, quickActionLink],
  );
  const quickActionCover = quickActionEntry
    ? resolveMobileEntryDisplayCover(quickActionEntry)
    : null;
  const quickActionCoverSource = useMemo(
    () =>
      quickActionEntry
        ? (resolveMobileEntryCoverSources(
            quickActionEntry,
            installedSources.data,
            { cover: quickActionCover },
          )[0] ?? null)
        : null,
    [installedSources.data, quickActionCover, quickActionEntry],
  );
  const quickActionCoverRequest = useMobileSourceImageRequest(
    quickActionCoverSource,
    quickActionCover,
  );
  const quickActionSubtitle = useMemo(() => {
    if (!quickActionEntry) return undefined;
    const progress = getMobileLibraryProgressInfo(
      quickActionEntry,
      progressIndex,
      strings,
      undefined,
      completedChapters,
    ).subtitle;
    const sourceName =
      quickActionSource?.name ?? quickActionLink?.sourceId ?? null;
    return [sourceName, progress].filter(Boolean).join(" · ");
  }, [
    completedChapters,
    progressIndex,
    quickActionEntry,
    quickActionLink,
    quickActionSource,
    strings,
  ]);

  const getEntryActions = useCallback((entry: LibraryEntry, link: LocalSourceLink | undefined): QuickAction[] => {
    const actionSource = link ? findInstalledSourceForLink(installedSources.data, link) : null;
    const actions: QuickAction[] = [
      {
        id: "markAllRead",
        label: strings.feedback.quickMenuMarkAllRead,
        icon: "checkmark-done-outline",
        onPress: () => {
          setQuickActionEntry(null);
          void handleQuickActionMarkAllRead(entry);
        },
      },
      {
        id: "addToCollection",
        label: strings.feedback.quickMenuAddToCollection,
        icon: "albums-outline",
        onPress: () => {
          setQuickActionEntry(null);
          setMembershipSheetEntry(entry);
        },
      },
    ];
    if (link) {
      actions.push({
        id: "openInSource",
        label: formatMobileString(strings.feedback.quickMenuOpenInSource, {
          source: actionSource?.name ?? link.sourceId,
        }),
        icon: "open-outline",
        onPress: () => {
          setQuickActionEntry(null);
          openEntryInSource(entry, link);
        },
      });
    }
    actions.push({
      id: "remove",
      label: strings.mangaDetail.removeFromLibrary,
      icon: "trash-outline",
      destructive: true,
      onPress: () => {
        setQuickActionEntry(null);
        void handleQuickActionRemove(entry);
      },
    });
    return mobileDesignExploreFlag ? orderMobileTitleQuickActions(actions) : actions;
  }, [installedSources.data, strings, handleQuickActionMarkAllRead, handleQuickActionRemove, openEntryInSource]);
  const quickActions = useMemo(
    () => (quickActionEntry ? getEntryActions(quickActionEntry, quickActionLink ?? undefined) : []),
    [quickActionEntry, quickActionLink, getEntryActions],
  );

  // The card's own NemuPressable already fires the long-press haptic; a
  // second manual pulse here made every long press buzz twice.
  const handleGridItemLongPress = useCallback((entry: LibraryEntry) => {
    setQuickActionEntry(entry);
  }, []);
  // Design-explore: the grid with the cover zoom, dust dissolve and cover
  // placeholders.
  const designExplore = useMobileDesignExplore();
  // Opening or leaving a collection swaps the page in one commit: the
  // sections and rows are keyed by the collection, so the new ones mount in
  // their places already dipped (no frame at full
  // opacity first) and fade in. A layout animation here moved the rows twice
  // and aborted Reanimated's layout-animation proxy. Rows the list brings in
  // later, while scrolling, appear as usual.
  const collectionLayoutKey = effectiveCollectionId ?? "";
  const [seenCollectionLayoutKey, setSeenCollectionLayoutKey] = useState(collectionLayoutKey);
  const [enteringCollectionLayoutKey, setEnteringCollectionLayoutKey] = useState<string | null>(null);
  if (seenCollectionLayoutKey !== collectionLayoutKey) {
    setSeenCollectionLayoutKey(collectionLayoutKey);
    setEnteringCollectionLayoutKey(collectionLayoutKey);
    // A collection's empty state fades in as the rows it replaces leave, and
    // out as the next one's rows settle. Up before this commit mounts it.
    openMobileGridGlideWindow();
  }
  useEffect(() => {
    if (enteringCollectionLayoutKey === null) return;
    const timer = setTimeout(() => setEnteringCollectionLayoutKey(null), MOBILE_MOTION.fadeInMs);
    return () => clearTimeout(timer);
  }, [enteringCollectionLayoutKey]);
  const collectionSettleOnMount = enteringCollectionLayoutKey === collectionLayoutKey;
  // Rows are keyed by their place, not by the titles in them: a removal
  // keeps every row mounted (a content key re-keyed and remounted each row
  // after the removed title, so the whole rest of the grid snapped and
  // reloaded its covers). Cells inside a row keep their title's key.
  const collectionRowKey = useCallback(
    (_row: LibraryEntry[], rowIndex: number) => `${collectionLayoutKey}|${rowIndex}`,
    [collectionLayoutKey],
  );
  // Rows' height and gap (row 0's measured height): how far a cell that
  // changes rows travels.
  const [gridRowPitch, setGridRowPitch] = useState(0);
  const onFirstGridRowLayout = useCallback((event: LayoutChangeEvent) => {
    const pitch = Math.round(event.nativeEvent.layout.height + MOBILE_MANGA_GRID_GAP);
    setGridRowPitch((current) => (current === pitch ? current : pitch));
  }, []);
  const renderLibraryGridItem = useCallback(
    ({ item: entry, index }: { item: LibraryEntry; index: number }) => {
      // A title leaving or coming back (glideLibraryGrid): a cell that keeps
      // its row slides on its layout transition; one that changes rows
      // mounts in the new row and slides in from its old place; a title put
      // back fades into its slot.
      const glideFromIndex = gridGlide?.from.get(entry.item.libraryItemId);
      const glideOffset =
        glideFromIndex === undefined || gridRowPitch <= 0
          ? null
          : getMobileGridMoveOffset(
              { columns: gridColumns, itemWidth: gridItemWidth, columnMargins: gridColumnMargins },
              glideFromIndex,
              index,
              gridRowPitch,
            );
      const glideProps = gridGlide
        ? {
            layout: mobileGridGlideTransition,
            entering:
              glideFromIndex === undefined
                ? mobileGridGlideAppearing
                : glideOffset
                  ? makeMobileGridGlideEntering(glideOffset)
                  : undefined,
            exiting: gridGlide.leaving?.has(entry.item.libraryItemId) ? mobileGridGlideVanishing : undefined,
          }
        : null;
      return (
      // The fixed width keeps a partly filled last row aligned with the rows
      // above it instead of letting `flex: 1` stretch its cells; the per-column
      // margin carries the fold gutter in book posture. Folding at the same
      // column count glides each cell to its new column (pose settle spring).
      <MobilePoseLayoutView
        key={libraryEntryKey(entry)}
        {...glideProps}
        style={[
          styles.gridItem,
          mobileFoldAwareGridCellStyle(
            { columns: gridColumns, itemWidth: gridItemWidth, columnMargins: gridColumnMargins },
            index,
          ),
        ]}
        contentSize={gridItemWidth}
      >
        {designExplore ? (
          // The grid cell turns to dust too when its title is removed.
          <ExploreDissolveTarget id={entry.item.libraryItemId}>
            <LibraryGridItem
              entry={entry}
              cardProgress={cardProgress.get(entry.item.libraryItemId)}
              strings={strings}
              installedSources={installedSources.data}
              getActions={getEntryActions}
              onLongPress={handleGridItemLongPress}
              placeholderWidth={gridItemWidth}
            />
          </ExploreDissolveTarget>
        ) : (
          <LibraryGridItem
            entry={entry}
            cardProgress={cardProgress.get(entry.item.libraryItemId)}
            strings={strings}
            installedSources={installedSources.data}
            getActions={getEntryActions}
            onLongPress={handleGridItemLongPress}
          />
        )}
      </MobilePoseLayoutView>
      );
    },
    [
      cardProgress,
      designExplore,
      getEntryActions,
      gridColumnMargins,
      gridColumns,
      gridGlide,
      gridItemWidth,
      gridRowPitch,
      handleGridItemLongPress,
      installedSources.data,
      strings,
    ],
  );
  const libraryRows = useMemo(
    () => chunkMobileGridRows(gridEntries, gridColumns),
    [gridEntries, gridColumns],
  );
  const renderLibraryRow = useCallback(
    ({ item: row, index: rowIndex }: ListRenderItemInfo<LibraryEntry[]>) => (
      <LibraryLayoutRow
        layoutKey={collectionLayoutKey}
        settleOnMount={collectionSettleOnMount}
        revealGroup="titles"
        style={[styles.libraryRow, styles.gridRow]}
        onLayout={rowIndex === 0 ? onFirstGridRowLayout : undefined}
      >
        {row.map((entry, column) => renderLibraryGridItem({ item: entry, index: rowIndex * gridColumns + column }))}
      </LibraryLayoutRow>
    ),
    [gridColumns, renderLibraryGridItem, collectionLayoutKey, collectionSettleOnMount, onFirstGridRowLayout],
  );
  // A literal here is a new object on every render, so the cell bail-out
  // never fired; the memoized value only changes when a cell input does.
  const libraryGridExtraData = useMemo(
    () => ({
      cardProgress,
      getEntryActions,
      installedSources: installedSources.data,
      strings,
    }),
    [cardProgress, getEntryActions, installedSources.data, strings],
  );

  // Collection management sheets. Rendered by the empty-library state too, so
  // creating/managing collections stays reachable before the first title is
  // added (the header's + and … used to vanish with an empty library).
  const librarySheets = (
    <>
      <TitleMenuSheet
        visible={!showSkeleton && showTitleMenuSheet}
        collections={collections.data}
        strings={strings}
        selectedCollectionId={effectiveCollectionId}
        disabled={collectionActionBusy}
        onClose={() => setShowTitleMenuSheet(false)}
        onDismiss={() => completeSheetDismiss("title-menu")}
        onSelect={(collectionId) => {
          selectCollection(collectionId, "title-menu");
        }}
        onManage={() => {
          if (collectionActionBusy) return;
          if (
            !queueAfterSheetDismiss("title-menu", () => {
              openCollectionsManager();
            })
          ) {
            return;
          }
          setShowTitleMenuSheet(false);
        }}
      />
      <QuickActionSheet
        visible={quickActionEntry !== null}
        variant="cover"
        title={quickActionEntry ? getEntryTitle(quickActionEntry) : ""}
        subtitle={quickActionSubtitle}
        image={
          quickActionCoverRequest?.url ?? quickActionCover ?? undefined
        }
        imageHeaders={quickActionCoverRequest?.headers}
        actions={quickActions}
        testID="MangaQuickActionSheet"
        onClose={() => setQuickActionEntry(null)}
        onDismiss={() => setQuickActionEntry(null)}
      />
      {membershipSheetEntry ? (
        <MobileCollectionMembershipSheet
          visible
          libraryItemId={membershipSheetEntry.item.libraryItemId}
          title={getEntryTitle(membershipSheetEntry)}
          onClose={() => setMembershipSheetEntry(null)}
        />
      ) : null}
      <NameSheet
        visible={!showSkeleton && showCreatePanel}
        mode="create"
        strings={strings}
        saving={savingCollection}
        onClose={() => {
          setShowCreatePanel(false);
          setNewCollectionName("");
        }}
        onDismiss={() => completeSheetDismiss("create-collection")}
        onSubmit={(name) => {
          setNewCollectionName(name);
          void createCollection(name);
        }}
      />
      {mobileLibraryCollectionNativeSheetsAvailable ? (
        // iOS asks for names and confirmations in alerts over the sheet, so
        // these commit in place and the manager stays open.
        <MobileCollectionsManagerNativeSheet
          visible={!showSkeleton && showCollectionsManagerSheet}
          collections={collections.data}
          strings={strings}
          membership={collections.membership}
          selectedCollectionId={effectiveCollectionId}
          actionState={collectionActionState}
          onClose={() => setShowCollectionsManagerSheet(false)}
          onDismiss={() => completeSheetDismiss("collections-manager")}
          onSelect={(collectionId) =>
            selectCollection(collectionId, "collections-manager")
          }
          onCreate={(name) => {
            void createCollection(name, { inPlace: true });
          }}
          onRename={(collection, name) => {
            void renameCollectionById(collection, name);
          }}
          onRemove={(collection) => {
            void removeCollectionById(collection, "collections-manager");
          }}
        />
      ) : (
        <CollectionsManagerSheet
          visible={!showSkeleton && showCollectionsManagerSheet}
          collections={collections.data}
          strings={strings}
          membership={collections.membership}
          selectedCollectionId={effectiveCollectionId}
          actionState={collectionActionState}
          onClose={() => setShowCollectionsManagerSheet(false)}
          onDismiss={() => completeSheetDismiss("collections-manager")}
          onSelect={(collectionId) =>
            selectCollection(collectionId, "collections-manager")
          }
          onCreate={() => {
            if (collectionActionBusy) return;
            if (
              !queueAfterSheetDismiss("collections-manager", () => {
                setNewCollectionName("");
                setShowCreatePanel(true);
              })
            ) {
              return;
            }
            setShowCollectionsManagerSheet(false);
          }}
          onRename={openCollectionRename}
          onRemove={openCollectionRemoveConfirmation}
        />
      )}
      <NameSheet
        visible={!showSkeleton && renameTarget !== null}
        mode="rename"
        initialName={renameTarget?.name ?? ""}
        strings={strings}
        saving={renamingCollection}
        onClose={() => setRenameTarget(null)}
        onSubmit={(name) => {
          if (!renameTarget) return;
          void renameCollectionById(renameTarget, name);
        }}
      />
      {manageCollectionPresentation ? (
        <MobileCollectionBooksSheet
          visible={
            !showSkeleton &&
            showManagePanel &&
            Boolean(manageCollectionPresentation)
          }
          mode="edit"
          collection={manageCollectionPresentation}
          entries={sortedLibraryEntries}
          membership={collections.membership}
          installedSources={installedSources.data}
          strings={strings}
          actionState={collectionActionState}
          saving={savingCollectionMembership || renamingCollection}
          error={operationError}
          onErrorDismiss={() => setOperationError(null)}
          onClose={() => setShowManagePanel(false)}
          onDismiss={() => {
            completeSheetDismiss("manage-collection");
            setManageCollectionPresentation(null);
          }}
          onSave={(selected, renameTo) =>
            saveCollectionBooks(manageCollectionPresentation, selected, renameTo)
          }
          onRemove={() => {
            void removeCollectionById(manageCollectionPresentation, "manage-collection");
          }}
          testID="ManageCollectionSheet"
        />
      ) : null}
      <MobileConfirmationSheet
        visible={!showSkeleton && removeTarget !== null}
        title={strings.library.removeCollection}
        description={strings.library.removeCollectionConfirm}
        subject={removeTarget?.name}
        cancelLabel={strings.common.cancel}
        confirmLabel={strings.common.remove}
        confirmAccessibilityLabel={
          removeTarget
            ? formatMobileString(strings.library.removeCollectionNamed, {
                name: removeTarget.name,
              })
            : strings.common.remove
        }
        destructive
        loading={removingCollection}
        onDismiss={() => completeSheetDismiss("remove-confirmation")}
        onCancel={() => {
          if (removingCollection) return;
          setRemoveTarget(null);
        }}
        onConfirm={() => {
          if (!removeTarget) return;
          void removeCollectionById(removeTarget, "remove-confirmation");
        }}
      />
    </>
  );

  if (showLoadError) {
    return (
      <>
      {usesNativeHeader ? (
        <Stack.Screen options={nativeHeaderOptions(strings.nav.library)} />
      ) : null}
      <PageScaffold nativeHeader={usesNativeHeader}>
        {usesNativeHeader ? null : (
          <PageHeader
            title={strings.nav.library}
            loading={retryingData}
            leadingIcon={isCollectionRoute ? "chevron-back-outline" : undefined}
            onLeadingPress={isCollectionRoute ? () => router.back() : undefined}
          />
        )}
        {/* The nemu hero lays itself out per pane (EmptyLibrary). */}
        <EmptyLibrary
          title={loadErrorState.title}
          description={loadErrorState.description}
          diagnostic={loadErrorState.diagnostic}
          diagnosticDetailsLabel={strings.errorBoundary.detailsLabel}
          actionLabel={strings.common.retry}
          actionDisabled={retryingData}
          actionLoading={retryingData}
          onActionPress={() => {
            void retryLibraryData();
          }}
        />
      </PageScaffold>
      </>
    );
  }

  if (routeCollectionState === "leaving-deleted") {
    // Blank while the sheet dismisses and the stack steps back; never the
    // not-found state for a collection the user just deleted here.
    return (
      <>
      {usesNativeHeader ? (
        <Stack.Screen options={nativeHeaderOptions(leavingDeletedCollection?.name ?? "")} />
      ) : null}
      <PageScaffold nativeHeader={usesNativeHeader}>
        {usesNativeHeader ? null : (
          <PageHeader
            title={leavingDeletedCollection?.name ?? ""}
            leadingIcon="chevron-back-outline"
            onLeadingPress={() => router.back()}
          />
        )}
      </PageScaffold>
      {librarySheets}
      </>
    );
  }

  if (routeCollectionMissing) {
    return (
      <>
      {usesNativeHeader ? (
        <Stack.Screen options={nativeHeaderOptions(strings.library.collectionNotFoundTitle)} />
      ) : null}
      <PageScaffold nativeHeader={usesNativeHeader}>
        {usesNativeHeader ? null : (
          <PageHeader
            title={strings.library.collectionNotFoundTitle}
            leadingIcon="chevron-back-outline"
            onLeadingPress={() => router.back()}
          />
        )}
        {/* The nemu hero lays itself out per pane (EmptyLibrary). */}
        <EmptyLibrary
          title={strings.library.collectionNotFoundTitle}
          description={strings.library.collectionNotFoundDescription}
          actionLabel={strings.nav.library}
          onActionPress={() => router.dismissTo("/library")}
        />
      </PageScaffold>
      </>
    );
  }

  return (
    <>
    {designExplore ? <MobileExploreDustHost /> : null}
    {usesNativeHeader ? (
      <>
        <Stack.Screen options={titleMenuHeaderOptions(title)} />
        {nativeHeaderActions.length || (Platform.OS === "ios" && !selectedCollection) ? (
          <Stack.Toolbar placement="right">
            {Platform.OS === "ios" && !selectedCollection
              ? renderExploreDetailBarMenu(libraryAddMenuActions, strings.library.createCollection, "plus")
              : null}
            {renderNemuNativeToolbarButtons(nativeHeaderActions)}
          </Stack.Toolbar>
        ) : null}
        {titleMenuAnchor}
      </>
    ) : null}
    <PageListScaffold
      // Keep one list (including its rich header) through column changes.
      listRef={gridScrollRef}
      // An empty Library is this same list with the hero as its empty
      // component: exactly as tall as the viewport, so it only rubber-bands.
      fillViewport={showEmptyOnboarding}
      data={showSkeleton ? [] : libraryRows}
      keyExtractor={collectionRowKey}
      renderItem={renderLibraryRow}
      // Every row glides to its new y when the sections above it change
      // height on a fold or an unfold (pose settle spring): unfolding grows
      // the covers and the Continue Reading card, and the rows dropped 38 pt
      // in one frame under the unanimated header.
      CellRendererComponent={MobilePoseListCell}
      extraData={libraryGridExtraData}
      nativeHeader={usesNativeHeader}
      onLayout={grid.onLayout}
      // Keeps the first visible cover at the top across a column/cell-size
      // change (display switch, rotation, folding).
      onViewableItemsChanged={gridScrollAnchor.onViewableItemsChanged}
      viewabilityConfig={gridScrollAnchor.viewabilityConfig}
      onScrollToIndexFailed={gridScrollAnchor.onScrollToIndexFailed}
      onScroll={libraryGridOnScroll}
      // The handler only tracks the adjusted top inset for the anchor
      // restore, so it does not need a frame-rate feed.
      scrollEventThrottle={100}
      onContentSizeChange={libraryOnContentSizeChange}
      contentContainerStyle={libraryContentContainerStyle}
      onRefresh={() => {
        void refreshLatestChapters({ force: true, interactive: true });
      }}
      refreshDisabled={libraryRefreshDisabled}
      refreshLabel={strings.library.refreshLibrary}
      refreshing={refreshingLibrary}
      initialNumToRender={Math.ceil(18 / gridColumns)}
      maxToRenderPerBatch={Math.ceil(18 / gridColumns)}
      updateCellsBatchingPeriod={32}
      windowSize={7}
      ListHeaderComponent={
        <>
          {usesNativeHeader ? null : (
            <PageHeader
              title={title}
              loading={pageLoading}
              leadingIcon={isCollectionRoute ? "chevron-back-outline" : undefined}
              onLeadingPress={isCollectionRoute ? () => router.back() : undefined}
              actions={
                selectedCollection
                  ? [
                      {
                        icon: "add-outline",
                        label: strings.library.addBooksAction,
                        hint: strings.library.addBooksHint,
                        disabled: collectionActionBusy,
                        loading: savingCollectionMembership,
                        onPress: openAddBooksSheet,
                      },
                      {
                        icon: "options-outline",
                        label: strings.library.manageCollection,
                        hint: strings.library.manageCollectionHint,
                        disabled: collectionActionBusy,
                        onPress: toggleCollectionManagement,
                      },
                    ]
                  : [
                      {
                        icon: "add-outline",
                        label: strings.library.createCollection,
                        hint: strings.library.createCollectionHint,
                        disabled: collectionActionBusy,
                        loading: savingCollection,
                        onPress: toggleCreateCollection,
                      },
                    ]
              }
            />
          )}

          <View style={styles.stack}>
            {showSkeleton ? (
              <Animated.View exiting={mobileStateExiting}>
                <MobileLibrarySkeleton
                  accessibilityLabel={strings.library.loading}
                />
              </Animated.View>
            ) : null}

            {showLoadErrorBanner ? (
              <MobileInlineErrorBanner
                title={loadErrorState.title}
                detail={
                  loadErrorState.diagnostic
                    ? `${loadErrorState.description}\n${loadErrorState.diagnostic}`
                    : loadErrorState.description
                }
                actionLabel={strings.common.retry}
                actionDisabled={retryingData}
                actionLoading={retryingData}
                onActionPress={() => {
                  void retryLibraryData();
                }}
              />
            ) : null}

            {!showSkeleton && operationError ? (
              <MobileInlineErrorBanner
                title={strings.library.collectionActionFailed}
                detail={operationError}
                dismissLabel={strings.common.clear}
                onDismiss={() => setOperationError(null)}
              />
            ) : null}

            {addBooksPresentation ? (
              <MobileCollectionBooksSheet
                visible={!showSkeleton && showAddBooksSheet}
                mode="add"
                collection={addBooksPresentation}
                entries={sortedLibraryEntries}
                membership={collections.membership}
                installedSources={installedSources.data}
                strings={strings}
                actionState={collectionActionState}
                saving={savingCollectionMembership}
                error={operationError}
                onClose={() => setShowAddBooksSheet(false)}
                onDismiss={() => setAddBooksPresentation(null)}
                onErrorDismiss={() => setOperationError(null)}
                onSave={(selected) =>
                  saveCollectionBooks(addBooksPresentation, selected, null)
                }
                testID="AddBooksSheet"
              />
            ) : null}

            {designExplore && !showSkeleton ? (
              // The list is UIKit's content scroll view (tab bar). Not for
              // the top edge beside a vertical bar: there the page's own
              // band backs the bar's title, as on every other page.
              <ContentScrollMarker generation={gridColumns} topEdge={verticalBarSide === null} />
            ) : null}
          </View>
        </>
      }
      // Removing the last title (glideLibraryGrid) or switching collection:
      // the empty state fades in instead of appearing whole in one frame; an
      // Undo or the next collection fades it out. Any other time (launch) it
      // appears and leaves at once.
      ListEmptyComponent={
        !showSkeleton && selectedCollection ? (
          <Animated.View entering={mobileGridGlideEmptyEntering} exiting={mobileGridGlideEmptyExiting}>
          <MobilePaneAlignedView>
          <GlassSurface contentStyle={styles.inlineEmpty}>
            {/* Decorative: VoiceOver otherwise stops on the icon font's glyph. */}
            <Ionicons
              name="albums-outline"
              size={22}
              color={tokens.mutedForeground}
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
            />
            <Text style={[styles.inlineEmptyText, { color: tokens.mutedForeground }]}>
              {strings.library.collectionEmpty}
            </Text>
            <NemuButton
              accessibilityLabel={strings.library.addBooksAction}
              disabled={collectionActionBusy}
              icon="add-outline"
              label={strings.library.addBooksAction}
              onPress={openAddBooksSheet}
              variant={collectionActionBusy ? "secondary" : "default"}
            />
          </GlassSurface>
          </MobilePaneAlignedView>
          </Animated.View>
        ) : showEmptyOnboarding ? (
          // The nemu hero lays itself out per pane (EmptyLibrary), centred in
          // the room the list leaves below its header.
          <Animated.View
            style={styles.emptyHero}
            entering={mobileGridGlideEmptyEntering}
            exiting={mobileGridGlideEmptyExiting}
          >
            {designExplore && hasInstalledSources ? (
              // Design-explore: the first screen a new reader sees points at
              // Browse, where series are found.
              <EmptyLibrary
                fill
                title={strings.library.empty}
                description={strings.library.emptyDescription}
                actionLabel={strings.designExplore.libraryEmptyBrowse}
                actionIcon="compass-outline"
                onActionPress={() => router.navigate("/browse")}
              />
            ) : (
              <EmptyLibrary
                fill
                title={emptyState.title}
                description={emptyState.description}
                actionLabel={emptyState.actionLabel}
                actionIcon={emptyState.actionRoute === "/browse" ? "add-outline" : undefined}
                onActionPress={() => {
                  // Add Source opens Browse's Add Sources sheet, not just the tab.
                  if (emptyState.actionRoute === "/browse") requestMobileAddSourceSheet();
                  router.navigate(emptyState.actionRoute);
                }}
              />
            )}
          </Animated.View>
        ) : null
      }
    />
    {librarySheets}
    </>
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: 16,
  },
  emptyHero: {
    flex: 1,
  },
  titleMenuSheet: {
    gap: 8,
  },
  titleMenuSheetRow: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
  },
  titleMenuSheetRowText: {
    flex: 1,
    minWidth: 0,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: nemuFontWeight.semibold,
  },
  titleMenuSheetDivider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: 3,
  },
  nameSheet: {
    gap: 14,
  },
  nameSheetLandscape: {
    gap: 4,
  },
  managerSheet: {
    gap: 14,
  },
  nameInputShell: {
    minHeight: 46,
    justifyContent: "center",
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
  },
  nameInput: {
    minHeight: 44,
    fontSize: 15,
    lineHeight: 19,
  },
  sheetActions: {
    flexDirection: "row",
    gap: 10,
  },
  actionButton: {
    flex: 1,
  },
  managerEmpty: {
    minHeight: 64,
    justifyContent: "center",
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderStyle: "dashed",
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  managerEmptyText: {
    fontSize: 13,
    lineHeight: 18,
  },
  managerList: {
    gap: 9,
  },
  managerRow: {
    minHeight: 68,
    flexDirection: "row",
    alignItems: "center",
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    paddingLeft: 12,
    paddingRight: 9,
  },
  managerRowMainContainer: {
    flex: 1,
    minWidth: 0,
  },
  managerRowMain: {
    width: "100%",
    minHeight: 66,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  managerRowCopy: {
    flex: 1,
    minWidth: 0,
  },
  managerRowTitle: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: nemuFontWeight.semibold,
  },
  managerRowMeta: {
    marginTop: 2,
    fontSize: 12,
    lineHeight: 16,
  },
  managerRowActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingLeft: 8,
  },
  // Column spacing is each cell's `marginLeft` (mobileFoldAwareGridCellStyle).
  libraryRow: {
    flexDirection: "row",
  },
  gridRow: {
    marginBottom: MOBILE_MANGA_GRID_GAP,
  },
  // The Grid cover's zoom source spans the cell; the cover keeps its ratio inside.
  gridZoomSource: {
    alignSelf: "stretch",
  },
  // `width` is supplied per render from the adaptive column width.
  gridItem: {
    minWidth: 0,
  },
  inlineEmpty: {
    minHeight: 78,
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 12,
    padding: 16,
  },
  inlineEmptyText: {
    flex: 1,
    minWidth: 180,
    fontSize: 13,
    lineHeight: 18,
  },
});
