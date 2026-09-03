import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  AppState,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
  type ListRenderItemInfo,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { BottomSheetTextInput } from "@expo/ui/community/bottom-sheet";
import { Stack, router, useFocusEffect } from "expo-router";
import { EmptyLibrary } from "@/components/EmptyLibrary";
import { MangaQuickActionSheet, type MangaQuickAction } from "@/components/MangaQuickActionSheet";
import { MobileAddBooksSheet } from "@/components/MobileAddBooksSheet";
import { MobileCollectionMembershipSheet } from "@/components/MobileCollectionMembershipSheet";
import { MobileConfirmationSheet } from "@/components/MobileConfirmationSheet";
import { MobileInlineErrorBanner } from "@/components/MobileInlineErrorBanner";
import { MobileLibrarySkeleton } from "@/components/MobileLibrarySkeleton";
import { useMobileToast } from "@/components/MobileToastContext";
import { useMobileDataStore } from "@/data/mobileDataContext";
import { emitMobileDataChanged, emitMobileLibraryDataChanged } from "@/data/mobileDataEvents";
import {
  useCollections,
  useInstalledSources,
  useLibraryEntries,
  useMobileLanguageSettings,
  useMangaProgress,
} from "@/data/mobileHooks";
import {
  getEntryCover,
  getEntryTitle,
  type InstalledSource,
  type LibraryEntry,
  type LocalCollection,
  type LocalSourceLink,
} from "@/data/schema";
import {
  createNemuNativeScreenOptions,
  GlassSurface,
  MangaCard,
  MobileNativeSheetScaffold,
  NemuButton,
  NemuPressable,
  PageHeader,
  PageListScaffold,
  PageScaffold,
  radius,
  renderNemuNativeToolbarButtons,
  nemuFontWeight,
  useNemuTheme,
  usesNemuNativeHeader,
  type MangaCardModel,
  type NemuNativeHeaderAction,
} from "@/design-system";
import {
  hapticConfirm,
  hapticError,
  hapticSelection,
} from "@/lib/haptics";
import {
  formatMobileString,
  getMobileStrings,
  type MobileStrings,
} from "@/lib/mobileI18n";
import { describeMobileErrorDetail } from "@/lib/mobileSourceErrors";
import {
  getMobileInstalledSourceSettingsKeys,
  mobileInstalledSourceMatchesLink,
} from "@/lib/mobileInstalledSourceKeys";import {
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
  getMobileCollectionsManagerSheetLayout,
  getMobileLibraryTitleMenuSheetLayout,
  getMobileManageCollectionSheetLayout,
} from "@/lib/mobileLibrarySheetLayout";
import {
  MOBILE_LIBRARY_REFRESH_INTERVAL_MS,
  getMobileLibraryRefreshLifecycleDecision,
  hasMobileLibraryStaleSourceLinks,
  isMobileLibraryRefreshAppActive,
  refreshMobileLibraryLatestChapters,
} from "@/lib/mobileLibraryRefresh";
import { resolveMobileSheetHeaderMetrics } from "@/lib/mobileNativeSheet";
import {
  buildMobileEntryProgressMap,
  buildMobileProgressIndex,
  getMobileEntryMostRecentSource,
  getMobileCollectionBookSubtitle,
  getMobileLibraryEmptyState,
  getMobileLibraryProgressInfo,
  shouldRenderMobileLibrarySkeleton,
  shouldShowMobileLibraryEmptyOnboarding,
  shouldShowMobileLibraryLoadError,
  sortMobileLibraryEntries,
  type MobileLibraryProgressIndex,
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
import type { MobileSourceImageRequest } from "@/sources/mobileSourceImages";
import { makeMobileRuntimeSourceKey, normalizeInstalledSource } from "@/sources/mobileSourceRuntime";

type LibraryScreenProps = {
  collectionId?: string | null;
  mode?: "library" | "collection";
};

function toMangaCard(
  entry: LibraryEntry,
  progressIndex: MobileLibraryProgressIndex,
  strings: MobileStrings,
  coverRequest: MobileSourceImageRequest | null = null,
): MangaCardModel {
  const progressInfo = getMobileLibraryProgressInfo(entry, progressIndex, strings);
  const cover = getEntryCover(entry);
  return {
    id: entry.item.libraryItemId,
    title: getEntryTitle(entry),
    subtitle: progressInfo.subtitle,
    badge: progressInfo.badge,
    cover: coverRequest?.url ?? cover,
    coverHeaders: coverRequest?.headers,
  };
}

function findInstalledSourceForLink(
  sources: InstalledSource[],
  sourceLink: LocalSourceLink | null | undefined,
): InstalledSource | null {
  if (!sourceLink) return null;
  return (
    sources.find((source) =>
      mobileInstalledSourceMatchesLink(source, sourceLink)
    ) ?? null
  );
}

function selectLibraryCoverSource(
  entry: LibraryEntry,
  progressIndex: MobileLibraryProgressIndex,
): LocalSourceLink | undefined {
  const progress = buildMobileEntryProgressMap(entry, progressIndex);
  return getMobileEntryMostRecentSource(entry, progress) ?? entry.sources[0];
}

function LibraryGridItem({
  entry,
  progressIndex,
  strings,
  installedSources,
  onLongPress,
}: {
  entry: LibraryEntry;
  progressIndex: MobileLibraryProgressIndex;
  strings: MobileStrings;
  installedSources: InstalledSource[];
  onLongPress?: () => void;
}) {
  const cover = getEntryCover(entry);
  const sourceLink = useMemo(
    () => selectLibraryCoverSource(entry, progressIndex),
    [entry, progressIndex],
  );
  const installedSource = useMemo(
    () => findInstalledSourceForLink(installedSources, sourceLink),
    [installedSources, sourceLink],
  );
  const coverRequest = useMobileSourceImageRequest(installedSource, cover);
  const item = useMemo(
    () => toMangaCard(entry, progressIndex, strings, coverRequest),
    [coverRequest, entry, progressIndex, strings],
  );

  return <MangaCard item={item} onLongPress={onLongPress} />;
}

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
const LIBRARY_GRID_COLUMNS = 3;

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
  const { tokens } = useNemuTheme();
  const { fontScale, height, width } = useWindowDimensions();
  const sheetLayout = getMobileLibraryTitleMenuSheetLayout({
    collectionCount: collections.length,
    fontScale,
    height,
    width,
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
        {
          backgroundColor: selected ? `${tokens.primary}12` : tokens.card,
          borderColor: selected ? `${tokens.primary}55` : tokens.border,
        },
      ]}
    >
      <Ionicons
        name={icon}
        size={20}
        color={selected ? tokens.primary : tokens.mutedForeground}
      />
      <Text
        numberOfLines={1}
        style={[styles.titleMenuSheetRowText, { color: tokens.foreground }]}
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
  const { tokens } = useNemuTheme();
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
          style={[styles.nameInput, { color: tokens.foreground }]}
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
  const { tokens } = useNemuTheme();
  const { fontScale, height, width } = useWindowDimensions();
  const actionBusy = isMobileCollectionActionBusy(actionState);
  const sheetLayout = getMobileCollectionsManagerSheetLayout({
    collectionCount: collections.length,
    fontScale,
    height,
    width,
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
          <Text style={[styles.managerEmptyText, { color: tokens.mutedForeground }]}>
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
                  {
                    backgroundColor: selected ? `${tokens.primary}12` : tokens.card,
                    borderColor: selected ? `${tokens.primary}66` : tokens.border,
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
                  style={styles.managerRowMain}
                >
                  <Ionicons
                    name={selected ? "albums" : "albums-outline"}
                    size={20}
                    color={selected ? tokens.primary : tokens.mutedForeground}
                  />
                  <View style={styles.managerRowCopy}>
                    <Text
                      numberOfLines={1}
                      style={[styles.managerRowTitle, { color: tokens.foreground }]}
                    >
                      {collection.name}
                    </Text>
                    <Text
                      numberOfLines={1}
                      style={[styles.managerRowMeta, { color: tokens.mutedForeground }]}
                    >
                      {countLabel}
                    </Text>
                  </View>
                  {selected ? (
                    <Ionicons name="checkmark-circle" size={20} color={tokens.primary} />
                  ) : null}
                </NemuPressable>
                <View style={styles.managerRowActions}>
                  <NemuPressable
                    accessibilityLabel={formatMobileString(
                      strings.library.renameCollectionAccessibility,
                      { name: collection.name }
                    )}
                    accessibilityRole="button"
                    accessibilityState={{ disabled: actionBusy }}
                    disabled={actionBusy}
                    onPress={() => onRename(collection)}
                    pressedScale={0.94}
                    style={[styles.managerIconButton, { backgroundColor: tokens.muted }]}
                  >
                    <Ionicons name="create-outline" size={16} color={tokens.mutedForeground} />
                  </NemuPressable>
                  <NemuPressable
                    accessibilityLabel={formatMobileString(
                      strings.library.removeCollectionNamed,
                      { name: collection.name }
                    )}
                    accessibilityRole="button"
                    accessibilityState={{ disabled: actionBusy }}
                    disabled={actionBusy}
                    hapticFeedback="warning"
                    onPress={() => onRemove(collection)}
                    pressedScale={0.94}
                    style={[styles.managerIconButton, { backgroundColor: tokens.muted }]}
                  >
                    <Ionicons name="trash-outline" size={16} color={tokens.danger} />
                  </NemuPressable>
                </View>
              </View>
            );
          })}
        </View>
      )}
    </MobileNativeSheetScaffold>
  );
}

function ManageCollectionPanel({
  collection,
  strings,
  entries,
  membership,
  removeArmed,
  renaming,
  savingMembership,
  removing,
  onRenameCollection,
  onSaveMembership,
  onCancelMembership,
  onRemoveCollection,
  onCancelRemove,
}: {
  collection: LocalCollection;
  strings: MobileStrings;
  entries: LibraryEntry[];
  membership: Map<string, Set<string>>;
  removeArmed: boolean;
  renaming: boolean;
  savingMembership: boolean;
  removing: boolean;
  onRenameCollection: (name: string) => Promise<boolean>;
  onSaveMembership: (selectedLibraryItemIds: Set<string>) => Promise<boolean>;
  onCancelMembership: () => void;
  onRemoveCollection: () => void;
  onCancelRemove: () => void;
}) {
  const { tokens } = useNemuTheme();
  const [editingName, setEditingName] = useState(false);
  const [draftName, setDraftName] = useState(collection.name);
  const initialMemberIds = useMemo(
    () => new Set(membership.get(collection.collectionId) ?? []),
    [collection.collectionId, membership]
  );
  const validLibraryItemIds = useMemo(
    () => new Set(entries.map((entry) => entry.item.libraryItemId)),
    [entries]
  );
  const [selectedIds, setSelectedIds] = useState(initialMemberIds);
  const trimmedDraftName = draftName.trim();
  const actionState: MobileCollectionActionState = {
    creating: false,
    renaming,
    savingMembership,
    removing,
  };
  const collectionActionBusy = isMobileCollectionActionBusy(actionState);
  const renameDisabled = !canRenameMobileCollection(
    actionState,
    draftName,
    collection.name
  );
  const membershipDiff = useMemo(
    () => diffLibraryItemSelection(initialMemberIds, selectedIds, validLibraryItemIds),
    [initialMemberIds, selectedIds, validLibraryItemIds]
  );
  const membershipChangeCount =
    membershipDiff.idsToAdd.length + membershipDiff.idsToRemove.length;
  const membershipSaveDisabled = !canSaveMobileCollectionMembership(
    actionState,
    membershipChangeCount
  );

  useEffect(() => {
    setSelectedIds(initialMemberIds);
  }, [initialMemberIds]);

  const cancelRename = () => {
    setDraftName(collection.name);
    setEditingName(false);
  };

  const saveRename = async () => {
    if (renameDisabled) return;
    const renamed = await onRenameCollection(trimmedDraftName);
    if (renamed) {
      setDraftName(trimmedDraftName);
      setEditingName(false);
    }
  };

  return (
    <GlassSurface style={styles.panelShell} contentStyle={styles.panel}>
      <View style={styles.panelHeader}>
        <Ionicons name="albums-outline" size={20} color={tokens.primary} />
        <View style={styles.panelTitleWrap}>
          <Text numberOfLines={1} style={[styles.panelTitle, { color: tokens.foreground }]}>
            {editingName ? strings.library.renameCollection : collection.name}
          </Text>
          <Text style={[styles.panelSubtitle, { color: tokens.mutedForeground }]}>
            {editingName
              ? strings.library.renameDescription
              : strings.library.updateMembershipDescription}
          </Text>
        </View>
        {!editingName ? (
          <NemuPressable
            accessibilityRole="button"
            accessibilityLabel={formatMobileString(
              strings.library.renameCollectionAccessibility,
              { name: collection.name }
            )}
            accessibilityState={{ disabled: collectionActionBusy }}
            disabled={collectionActionBusy}
            onPress={() => {
              setDraftName(collection.name);
              setEditingName(true);
            }}
            pressedScale={0.94}
            style={[
              styles.headerIconButton,
              { backgroundColor: tokens.muted, opacity: collectionActionBusy ? 0.72 : 1 },
            ]}
          >
            <Ionicons name="create-outline" size={17} color={tokens.mutedForeground} />
          </NemuPressable>
        ) : null}
      </View>

      {editingName ? (
        <View style={styles.renameEditor}>
          <TextInput
            accessibilityLabel={strings.library.collectionName}
            accessibilityState={{ disabled: collectionActionBusy }}
            autoCapitalize="words"
            autoFocus
            editable={!collectionActionBusy}
            placeholder={strings.library.collectionName}
            placeholderTextColor={tokens.mutedForeground}
            returnKeyType="done"
            selectionColor={tokens.primary}
            value={draftName}
            onChangeText={setDraftName}
            onSubmitEditing={() => {
              void saveRename();
            }}
            style={[
              styles.panelInput,
              {
                backgroundColor: tokens.muted,
                color: tokens.foreground,
                opacity: collectionActionBusy ? 0.72 : 1,
              },
            ]}
          />
          <View style={styles.panelActions}>
            <NemuButton
              accessibilityLabel={strings.common.cancel}
              containerStyle={styles.actionButton}
              disabled={collectionActionBusy}
              hapticFeedback="none"
              label={strings.common.cancel}
              onPress={cancelRename}
              variant="secondary"
            />
            <NemuButton
              accessibilityLabel={strings.common.save}
              containerStyle={styles.actionButton}
              disabled={renameDisabled}
              label={strings.common.save}
              loading={renaming}
              onPress={() => {
                void saveRename();
              }}
              variant={renaming || !renameDisabled ? "default" : "secondary"}
            />
          </View>
        </View>
      ) : null}

      <View style={styles.bookList}>
        {entries.map((entry) => {
          const member = selectedIds.has(entry.item.libraryItemId);
          const subtitle = getMobileCollectionBookSubtitle(entry, strings);
          return (
            <NemuPressable
              key={entry.item.libraryItemId}
              accessibilityLabel={formatMobileString(
                strings.library.collectionMangaAccessibility,
                {
                  title: getEntryTitle(entry),
                  sourceCountLabel: subtitle,
                }
              )}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: member, disabled: collectionActionBusy }}
              disabled={collectionActionBusy}
              hapticFeedback="selection"
              onPress={() => {
                setSelectedIds((current) => {
                  const next = new Set(current);
                  if (next.has(entry.item.libraryItemId)) {
                    next.delete(entry.item.libraryItemId);
                  } else {
                    next.add(entry.item.libraryItemId);
                  }
                  return next;
                });
              }}
              style={[
                styles.bookRow,
                {
                  backgroundColor: member ? `${tokens.primary}16` : tokens.muted,
                  borderColor: member ? tokens.primary : tokens.border,
                  opacity: collectionActionBusy ? 0.68 : 1,
                },
              ]}
              pressedScale={0.985}
            >
              <View style={styles.bookRowText}>
                <Text numberOfLines={1} style={[styles.bookTitle, { color: tokens.foreground }]}>
                  {getEntryTitle(entry)}
                </Text>
                <Text numberOfLines={1} style={[styles.bookSubtitle, { color: tokens.mutedForeground }]}>
                  {subtitle}
                </Text>
              </View>
              <Ionicons
                name={member ? "checkmark-circle" : "add-circle-outline"}
                size={21}
                color={member ? tokens.primary : tokens.mutedForeground}
              />
            </NemuPressable>
          );
        })}
      </View>

      <View style={styles.panelActions}>
        <NemuButton
          accessibilityLabel={strings.common.cancel}
          containerStyle={styles.actionButton}
          disabled={collectionActionBusy}
          hapticFeedback="none"
          label={strings.common.cancel}
          onPress={onCancelMembership}
          variant="secondary"
        />
        <NemuButton
          accessibilityLabel={strings.common.save}
          containerStyle={styles.actionButton}
          disabled={membershipSaveDisabled}
          label={
            membershipChangeCount > 0
              ? formatMobileString(strings.collectionMembership.saveWithCount, {
                  count: membershipChangeCount,
                })
              : strings.common.save
          }
          loading={savingMembership}
          onPress={() => {
            void (async () => {
              const saved = await onSaveMembership(selectedIds);
              if (saved) {
                setSelectedIds(new Set(selectedIds));
              }
            })();
          }}
          variant={savingMembership || !membershipSaveDisabled ? "default" : "secondary"}
        />
      </View>

      <View style={styles.removeBlock}>
        {removeArmed ? (
          <>
            <Text style={[styles.removeText, { color: tokens.mutedForeground }]}>
              {strings.library.removeCollectionConfirm}
            </Text>
            <View style={styles.panelActions}>
              <NemuButton
                accessibilityLabel={strings.common.cancel}
                containerStyle={styles.actionButton}
                disabled={removing}
                hapticFeedback="none"
                label={strings.common.cancel}
                onPress={onCancelRemove}
                variant="secondary"
              />
              <NemuButton
                accessibilityLabel={formatMobileString(
                  strings.library.removeCollectionNamed,
                  { name: collection.name }
                )}
                containerStyle={styles.actionButton}
                disabled={collectionActionBusy}
                hapticFeedback="warning"
                label={strings.common.remove}
                loading={removing}
                onPress={onRemoveCollection}
                variant="destructive"
              />
            </View>
          </>
        ) : (
          <NemuButton
            accessibilityLabel={formatMobileString(
              strings.library.removeCollectionNamed,
              { name: collection.name }
            )}
            disabled={collectionActionBusy}
            icon="trash-outline"
            label={strings.library.removeCollection}
            onPress={onRemoveCollection}
            style={styles.stretchedButton}
            variant="destructive"
          />
        )}
      </View>
    </GlassSurface>
  );
}

export function LibraryScreen({
  collectionId = null,
  mode = "library",
}: LibraryScreenProps = {}) {
  const { tokens } = useNemuTheme();
  const { fontScale, height, width } = useWindowDimensions();
  const usesNativeHeader = usesNemuNativeHeader;
  const store = useMobileDataStore();
  const {
    data: libraryEntries,
    loading: libraryLoading,
    error: libraryError,
    reload: reloadLibrary,
  } = useLibraryEntries();
  const installedSources = useInstalledSources();
  const progress = useMangaProgress();
  const collections = useCollections();
  const { appLanguage } = useMobileLanguageSettings();
  const strings = getMobileStrings(appLanguage);
  const routeCollectionId = collectionId?.trim() ? collectionId.trim() : null;
  const isCollectionRoute = mode === "collection";
  const [selectedCollectionId, setSelectedCollectionId] = useState<
    string | null
  >(routeCollectionId);
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
  const [refreshingLibrary, setRefreshingLibrary] = useState(false);
  const [retryingData, setRetryingData] = useState(false);
  const [removeArmed, setRemoveArmed] = useState(false);
  const [operationError, setOperationError] = useState<string | null>(null);
  const [quickActionEntry, setQuickActionEntry] = useState<LibraryEntry | null>(null);
  const [membershipSheetEntry, setMembershipSheetEntry] = useState<LibraryEntry | null>(null);
  const toast = useMobileToast();
  const pendingSheetTransitionRef = useRef<PendingLibrarySheetTransition | null>(null);
  const refreshInFlightRef = useRef(false);
  const retryDataGuardRef = useRef(false);
  const appStateRef = useRef(AppState.currentState);
  const foregroundCatchupPendingRef = useRef(false);
  // Abort flag for the background latest-chapter refresh. The refresh
  // serializes through the same `aidokuRuntimeQueue` as interactive source
  // taps, so a long library sweep would otherwise freeze every source tap
  // until the whole library is checked. Flipping `aborted` between chunks
  // lets a tap (which navigates away and blurs this screen) preempt the
  // remaining work.
  const libraryRefreshAbortRef = useRef<{ aborted: boolean }>({ aborted: false });
  const libraryFocusedRef = useRef(true);

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

  useEffect(() => {
    pendingSheetTransitionRef.current = null;
    if (!isCollectionRoute) return;
    setSelectedCollectionId(routeCollectionId);
    setShowTitleMenuSheet(false);
    setShowCreatePanel(false);
    setShowManagePanel(false);
    setShowCollectionsManagerSheet(false);
    setShowAddBooksSheet(false);
    setAddBooksPresentation(null);
    setRenameTarget(null);
    setRemoveTarget(null);
    setRemoveArmed(false);
  }, [isCollectionRoute, routeCollectionId]);

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
  const sortedLibraryEntries = useMemo(
    () => sortMobileLibraryEntries(libraryEntries, progressIndex),
    [libraryEntries, progressIndex]
  );
  const manageCollectionSheetLayout = getMobileManageCollectionSheetLayout({
    collectionCount: sortedLibraryEntries.length,
    fontScale,
    height,
    width,
  });
  const visibleEntries = useMemo(
    () =>
      entriesForCollection(
        sortedLibraryEntries,
        effectiveCollectionId,
        collections.membership
      ),
    [collections.membership, effectiveCollectionId, sortedLibraryEntries]
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
  const routeCollectionMissing =
    isCollectionRoute && !loading && collectionSelection.missing;
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
    source: "title-menu" | "collections-manager",
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
      setRemoveArmed(false);

      if (!isCollectionRoute) return;
      if (nextCollectionId) {
        router.replace({
          pathname: "/library/collection/[id]",
          params: { id: nextCollectionId },
        });
      } else {
        router.replace("/library");
      }
    };
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
    setRemoveArmed(false);
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
    setRemoveArmed(false);
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
    setRemoveArmed(false);
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
    setRemoveArmed(false);
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
    setRemoveArmed(false);
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
    if (
      !isMobileLibraryRefreshAppActive(AppState.currentState) ||
      refreshInFlightRef.current ||
      libraryLoading ||
      installedSources.loading ||
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
      aborted: !isMobileLibraryRefreshAppActive(AppState.currentState),
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
            // The count string is authored to trail a summary line, so drop
            // its leading separator when it stands alone as the detail.
            detail: formatMobileString(
              strings.feedback.libraryRefreshUnavailableSuffix,
              { count: result.failed },
            ).replace(/^\s*·\s*/, ""),
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
    strings.feedback.libraryRefreshUnavailableSuffix,
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
        !isMobileLibraryRefreshAppActive(AppState.currentState)
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

  const createCollection = async (submittedName?: string) => {
    const name = (submittedName ?? newCollectionName).trim();
    if (!canCreateMobileCollection(getGuardedCollectionActionState(), name)) return;
    savingCollectionRef.current = true;
    setSavingCollection(true);
    setOperationError(null);
    try {
      const collection = await collections.createCollection(name);
      if (
        !queueAfterSheetDismiss("create-collection", () => {
          if (isCollectionRoute) {
            router.replace({
              pathname: "/library/collection/[id]",
              params: { id: collection.collectionId },
            });
          } else {
            setSelectedCollectionId(collection.collectionId);
          }
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
      setRemoveArmed(false);
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

  const renameCollection = async (name: string) => {
    if (!selectedCollection) return false;
    return renameCollectionById(selectedCollection, name);
  };

  const removeCollectionById = async (
    collection: LocalCollection,
    source: "manage-collection" | "remove-confirmation",
  ) => {
    if (!canStartMobileCollectionAction(getGuardedCollectionActionState())) return;
    removingCollectionRef.current = true;
    setRemovingCollection(true);
    setOperationError(null);
    try {
      await collections.removeCollection(collection.collectionId);
      if (
        !queueAfterSheetDismiss(source, () => {
          if (
            isCollectionRoute &&
            effectiveCollectionId === collection.collectionId
          ) {
            router.replace("/library");
          } else if (effectiveCollectionId === collection.collectionId) {
            setSelectedCollectionId(null);
          }
        })
      ) {
        return;
      }
      setShowManagePanel(false);
      setShowCollectionsManagerSheet(false);
      setShowAddBooksSheet(false);
      setRenameTarget(null);
      setRemoveTarget(null);
      setRemoveArmed(false);
      await hapticConfirm();
    } catch (error) {
      await reportCollectionError(error);
    } finally {
      removingCollectionRef.current = false;
      setRemovingCollection(false);
    }
  };

  const removeCollection = async () => {
    if (!selectedCollection) return;
    if (!removeArmed) {
      setOperationError(null);
      setRemoveArmed(true);
      return;
    }
    await removeCollectionById(selectedCollection, "manage-collection");
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
  const nativeHeaderOptions = (
    screenTitle: string,
  ) => createNemuNativeScreenOptions(tokens, screenTitle);
  const nativeHeaderActions: NemuNativeHeaderAction[] = selectedCollection
    ? [
        {
          icon: "plus",
          label: strings.library.addBooksAction,
          hint: strings.library.addBooksHint,
          disabled: collectionActionBusy,
          onPress: openAddBooksSheet,
        },
        {
          icon: "ellipsis.circle",
          label: strings.library.manageCollection,
          hint: strings.library.manageCollectionHint,
          disabled: collectionActionBusy,
          onPress: toggleCollectionManagement,
        },
      ]
    : [
        {
          icon: "plus",
          label: strings.library.createCollection,
          hint: strings.library.createCollectionHint,
          disabled: collectionActionBusy,
          onPress: toggleCreateCollection,
        },
        {
          icon: "ellipsis.circle",
          label: `${strings.nav.library} menu`,
          hint: strings.library.manageCollectionsHint,
          disabled: collectionActionBusy,
          onPress: () => setShowTitleMenuSheet(true),
        },
      ];
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
        await store.removeLibraryItem(entry.item.libraryItemId);
        emitMobileLibraryDataChanged({ collectionsChanged: true });
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
            store
              .restoreLibraryItem(entry.item.libraryItemId)
              .then(() => emitMobileLibraryDataChanged({ collectionsChanged: true }))
              .catch(() =>
                toast.show({
                  tone: "danger",
                  title: strings.mangaDetail.actionFailedDetail,
                }),
              );
          },
        },
      });
    },
    [store, strings, toast],
  );

  const openEntryInSource = useCallback(
    (entry: LibraryEntry) => {
      const link =
        selectLibraryCoverSource(entry, progressIndex) ?? entry.sources[0];
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
    [progressIndex],
  );

  const quickActionLink = useMemo(
    () =>
      quickActionEntry
        ? (selectLibraryCoverSource(quickActionEntry, progressIndex) ??
          quickActionEntry.sources[0])
        : null,
    [progressIndex, quickActionEntry],
  );
  const quickActionSource = useMemo(
    () => findInstalledSourceForLink(installedSources.data, quickActionLink),
    [installedSources.data, quickActionLink],
  );
  const quickActionCoverRequest = useMobileSourceImageRequest(
    quickActionSource,
    quickActionEntry ? getEntryCover(quickActionEntry) : null,
  );
  const quickActionSubtitle = useMemo(() => {
    if (!quickActionEntry) return undefined;
    const progress = getMobileLibraryProgressInfo(
      quickActionEntry,
      progressIndex,
      strings,
    ).subtitle;
    const sourceName =
      quickActionSource?.name ?? quickActionLink?.sourceId ?? null;
    return [sourceName, progress].filter(Boolean).join(" · ");
  }, [
    progressIndex,
    quickActionEntry,
    quickActionLink,
    quickActionSource,
    strings,
  ]);

  const quickActions = useMemo<MangaQuickAction[]>(() => {
    const entry = quickActionEntry;
    if (!entry) return [];
    const link = quickActionLink;
    const actions: MangaQuickAction[] = [
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
          source: quickActionSource?.name ?? link.sourceId,
        }),
        icon: "open-outline",
        onPress: () => {
          setQuickActionEntry(null);
          openEntryInSource(entry);
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
    return actions;
  }, [
    quickActionEntry,
    quickActionLink,
    quickActionSource,
    strings,
    handleQuickActionMarkAllRead,
    handleQuickActionRemove,
    openEntryInSource,
  ]);

  const renderLibraryGridItem = ({
    item: entry,
  }: ListRenderItemInfo<LibraryEntry>) => (
    <View style={styles.gridItem}>
      <LibraryGridItem
        entry={entry}
        progressIndex={progressIndex}
        strings={strings}
        installedSources={installedSources.data}
        onLongPress={() => {
          void hapticSelection();
          setQuickActionEntry(entry);
        }}
      />
    </View>
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
        <EmptyLibrary
          title={strings.library.unavailable}
          description={error ?? strings.library.emptyDescription}
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
        <EmptyLibrary
          title={strings.library.collectionNotFoundTitle}
          description={strings.library.collectionNotFoundDescription}
          actionLabel={strings.nav.library}
          onActionPress={() => router.replace("/library")}
        />
      </PageScaffold>
      </>
    );
  }

  if (showEmptyOnboarding) {
    return (
      <>
      {usesNativeHeader ? (
        <Stack.Screen options={nativeHeaderOptions(strings.nav.library)} />
      ) : null}
      <PageScaffold nativeHeader={usesNativeHeader}>
        <EmptyLibrary
          title={emptyState.title}
          description={emptyState.description}
          actionLabel={emptyState.actionLabel}
          actionIcon={emptyState.actionRoute === "/browse" ? "add-outline" : undefined}
          onActionPress={() => router.navigate(emptyState.actionRoute)}
        />
      </PageScaffold>
      </>
    );
  }

  return (
    <>
    {usesNativeHeader ? (
      <>
        <Stack.Screen options={nativeHeaderOptions(title)} />
        {nativeHeaderActions.length ? (
          <Stack.Toolbar placement="right" tintColor={tokens.primary}>
            {renderNemuNativeToolbarButtons(nativeHeaderActions, tokens.primary)}
          </Stack.Toolbar>
        ) : null}
      </>
    ) : null}
    <PageListScaffold
      data={showSkeleton ? [] : visibleEntries}
      keyExtractor={(entry) => entry.item.libraryItemId}
      numColumns={LIBRARY_GRID_COLUMNS}
      columnWrapperStyle={styles.gridRow}
      renderItem={renderLibraryGridItem}
      extraData={{
        installedSources: installedSources.data,
        progressIndex,
        strings,
      }}
      nativeHeader={usesNativeHeader}
      onRefresh={() => {
        void refreshLatestChapters({ force: true, interactive: true });
      }}
      refreshDisabled={libraryRefreshDisabled}
      refreshing={refreshingLibrary}
      initialNumToRender={18}
      maxToRenderPerBatch={18}
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
              <MobileLibrarySkeleton
                accessibilityLabel={strings.library.loading}
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
              <MobileAddBooksSheet
                visible={!showSkeleton && showAddBooksSheet}
                collectionId={addBooksPresentation.collectionId}
                collectionName={addBooksPresentation.name}
                entries={sortedLibraryEntries}
                membership={collections.membership}
                strings={strings}
                actionState={collectionActionState}
                saving={savingCollectionMembership}
                error={operationError}
                onClose={() => setShowAddBooksSheet(false)}
                onDismiss={() => setAddBooksPresentation(null)}
                onErrorDismiss={() => setOperationError(null)}
                onSave={saveCollectionMembership}
              />
            ) : null}
          </View>
        </>
      }
      ListEmptyComponent={
        !showSkeleton && selectedCollection ? (
          <GlassSurface contentStyle={styles.inlineEmpty}>
            <Ionicons name="albums-outline" size={22} color={tokens.mutedForeground} />
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
        ) : null
      }
    />
    <LibraryTitleMenuSheet
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
    <MangaQuickActionSheet
      visible={quickActionEntry !== null}
      title={quickActionEntry ? getEntryTitle(quickActionEntry) : ""}
      subtitle={quickActionSubtitle}
      cover={
        quickActionCoverRequest?.url ??
        (quickActionEntry ? getEntryCover(quickActionEntry) : undefined)
      }
      coverHeaders={quickActionCoverRequest?.headers}
      actions={quickActions}
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
    <CollectionNameSheet
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
    <CollectionNameSheet
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
    <MobileNativeSheetScaffold
      visible={
        !showSkeleton &&
        showManagePanel &&
        Boolean(manageCollectionPresentation)
      }
      onClose={() => {
        setShowManagePanel(false);
        setRemoveArmed(false);
      }}
      onDismiss={() => {
        completeSheetDismiss("manage-collection");
        setManageCollectionPresentation(null);
      }}
      snapPoints={manageCollectionSheetLayout.snapPoints}
      scroll={manageCollectionSheetLayout.scroll}
      testID="ManageCollectionSheet"
    >
      {manageCollectionPresentation ? (
        <ManageCollectionPanel
          collection={manageCollectionPresentation}
          strings={strings}
          entries={sortedLibraryEntries}
          membership={collections.membership}
          removeArmed={removeArmed}
          renaming={renamingCollection}
          savingMembership={savingCollectionMembership}
          removing={removingCollection}
          onRenameCollection={renameCollection}
          onSaveMembership={saveCollectionMembership}
          onCancelMembership={() => {
            setShowManagePanel(false);
            setRemoveArmed(false);
          }}
          onRemoveCollection={() => {
            void removeCollection();
          }}
          onCancelRemove={() => setRemoveArmed(false)}
        />
      ) : null}
    </MobileNativeSheetScaffold>
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
}

const styles = StyleSheet.create({
  stack: {
    gap: 16,
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
  managerIconButton: {
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
  },
  gridRow: {
    gap: 12,
    marginBottom: 12,
  },
  gridItem: {
    flex: 1,
    maxWidth: "31.5%",
  },
  panelShell: {
    borderRadius: radius.xl,
  },
  panel: {
    gap: 13,
    padding: 14,
  },
  panelHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  panelTitleWrap: {
    flex: 1,
    minWidth: 0,
  },
  headerIconButton: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
  },
  panelTitle: {
    fontSize: 15,
    lineHeight: 19,
    fontWeight: nemuFontWeight.semibold,
  },
  panelSubtitle: {
    marginTop: 2,
    fontSize: 12,
    lineHeight: 17,
  },
  panelInput: {
    height: 46,
    borderRadius: radius.lg,
    paddingHorizontal: 12,
    fontSize: 15,
    lineHeight: 19,
  },
  renameEditor: {
    gap: 9,
  },
  panelActions: {
    flexDirection: "row",
    gap: 8,
  },
  bookList: {
    gap: 8,
  },
  bookRow: {
    minHeight: 58,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
  },
  bookRowText: {
    flex: 1,
    minWidth: 0,
  },
  bookTitle: {
    fontSize: 13,
    lineHeight: 17,
    fontWeight: nemuFontWeight.medium,
  },
  bookSubtitle: {
    marginTop: 2,
    fontSize: 11,
    lineHeight: 14,
  },
  removeBlock: {
    gap: 9,
  },
  removeText: {
    fontSize: 12,
    lineHeight: 17,
  },
  stretchedButton: {
    width: "100%",
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
