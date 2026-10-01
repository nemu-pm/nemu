import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  FlatList,
  Platform,
  StyleSheet,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { MobileInlineErrorBanner } from "@/components/MobileInlineErrorBanner";
import {
  MobileCachedImage,
  MobileNativeSheetScaffold,
  NemuNativeSearchField,
  NemuNativeSheetHeaderAction,
  NemuPressable,
  NemuText,
  nemuColorWithAlpha,
  nemuFontWeight,
  nemuMaxFontSizeMultiplier,
  useNemuTheme,
  type NemuTokens,
} from "@/design-system";
import {
  getEntryTitle,
  type InstalledSource,
  type LibraryEntry,
  type LocalCollection,
} from "@/data/schema";
import { hapticPress } from "@/lib/haptics";
import { formatMobileString, type MobileStrings } from "@/lib/mobileI18n";
import {
  diffLibraryItemSelection,
  getMobileCollectionSelectionSessionKey,
  type MobileCollectionActionState,
} from "@/lib/mobileCollections";
import {
  filterMobileCollectionBookEntries,
  getMobileCollectionBooksSheetLayout,
  planMobileCollectionBooksSave,
  shouldShowMobileCollectionBooksSearch,
} from "@/lib/mobileCollectionBooks";
import { getMobileCollectionBookSubtitle } from "@/lib/mobileLibraryPresentation";
import {
  resolveMobileEntryCoverSources,
  resolveMobileEntryDisplayCover,
} from "@/lib/mobileEntryCover";
import { useMobileSourceImageRequest } from "@/lib/useMobileSourceImageRequest";

export type MobileCollectionBooksSheetMode = "add" | "edit";

type MobileCollectionBooksSheetProps = {
  visible: boolean;
  /**
   * `add`: the collection toolbar's +, books only. `edit`: the title menu's
   * "Edit Collection…", which adds the name field and Remove Collection.
   */
  mode: MobileCollectionBooksSheetMode;
  collection: LocalCollection;
  entries: LibraryEntry[];
  membership: Map<string, Set<string>>;
  installedSources: InstalledSource[];
  strings: MobileStrings;
  actionState: MobileCollectionActionState;
  /** A save (rename and/or membership) is in flight. */
  saving: boolean;
  error?: string | null;
  onErrorDismiss?: () => void;
  onClose: () => void;
  onDismiss?: () => void;
  /** Commits the staged rename (when not null) and selection; true closes the sheet. */
  onSave: (selectedLibraryItemIds: Set<string>, renameTo: string | null) => Promise<boolean>;
  /** Edit only: runs after the person confirms the removal alert. */
  onRemove?: () => void;
  testID?: string;
};

/**
 * Pick the books in a collection — the shape of Photos' "Add to Album" and
 * Music's "Add to Playlist": the close X and a prominent ✓ in the sheet's
 * bar (no footer buttons), a live selected count, a search field once the
 * library is long, then plain rows (cover, title, author / sources) with a
 * trailing selection circle and inset separators instead of bordered cards.
 * Edit Collection adds the name as an editable field at the top (saved with
 * the ✓) and Remove Collection at the bottom behind a confirmation alert.
 */
export function MobileCollectionBooksSheet({
  visible,
  collection,
  membership,
  ...props
}: MobileCollectionBooksSheetProps) {
  const initialSelected = useMemo(
    () => new Set(membership.get(collection.collectionId) ?? []),
    [collection.collectionId, membership],
  );
  return (
    <MobileCollectionBooksSheetContent
      key={getMobileCollectionSelectionSessionKey({
        visible,
        targetId: collection.collectionId,
      })}
      visible={visible}
      collection={collection}
      membership={membership}
      initialSelected={initialSelected}
      {...props}
    />
  );
}

function MobileCollectionBooksSheetContent({
  visible,
  mode,
  collection,
  entries,
  installedSources,
  strings,
  actionState,
  saving,
  error,
  onErrorDismiss,
  onClose,
  onDismiss,
  onSave,
  onRemove,
  testID,
  initialSelected,
}: MobileCollectionBooksSheetProps & { initialSelected: Set<string> }) {
  const { tokens } = useNemuTheme();
  const { fontScale, height, width } = useWindowDimensions();
  const editing = mode === "edit";
  const [selectedIds, setSelectedIds] = useState(() => new Set(initialSelected));
  const [draftName, setDraftName] = useState(collection.name);
  const [query, setQuery] = useState("");
  const wasVisibleRef = useRef(false);
  const closeRequestedRef = useRef(false);

  useEffect(() => {
    if (visible && !wasVisibleRef.current) {
      // Reopening the retained native host starts a fresh edit session: the
      // staged state follows that visibility transition, not every refresh.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelectedIds(new Set(initialSelected));
      setDraftName(collection.name);
      setQuery("");
      closeRequestedRef.current = false;
    }
    wasVisibleRef.current = visible;
  }, [collection.name, initialSelected, visible]);

  const validLibraryItemIds = useMemo(
    () => new Set(entries.map((entry) => entry.item.libraryItemId)),
    [entries],
  );
  const diff = useMemo(
    () => diffLibraryItemSelection(initialSelected, selectedIds, validLibraryItemIds),
    [initialSelected, selectedIds, validLibraryItemIds],
  );
  const plan = planMobileCollectionBooksSave({
    actionState,
    allowRename: editing,
    initialName: collection.name,
    draftName,
    membershipChangeCount: diff.idsToAdd.length + diff.idsToRemove.length,
  });
  const selectedCount = useMemo(
    () => [...selectedIds].filter((id) => validLibraryItemIds.has(id)).length,
    [selectedIds, validLibraryItemIds],
  );
  const visibleEntries = useMemo(
    () => filterMobileCollectionBookEntries(entries, query),
    [entries, query],
  );
  const showSearch = shouldShowMobileCollectionBooksSearch(entries.length);
  const layout = getMobileCollectionBooksSheetLayout({
    entryCount: entries.length,
    allowRename: editing,
    fontScale,
    height,
    width,
  });
  const locked = saving || actionState.removing;

  const close = () => {
    if (locked || closeRequestedRef.current) return;
    closeRequestedRef.current = true;
    void hapticPress();
    onClose();
  };

  const save = async () => {
    if (!plan.canSave) return;
    const saved = await onSave(selectedIds, plan.renameTo);
    if (saved) {
      closeRequestedRef.current = true;
      onClose();
    }
  };

  const toggle = useCallback((libraryItemId: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(libraryItemId)) next.delete(libraryItemId);
      else next.add(libraryItemId);
      return next;
    });
  }, []);

  const confirmRemove = () => {
    if (!onRemove || locked) return;
    Alert.alert(
      formatMobileString(strings.library.removeCollectionNamed, { name: collection.name }),
      strings.library.removeCollectionConfirm,
      [
        { text: strings.common.cancel, style: "cancel" },
        { text: strings.common.remove, style: "destructive", onPress: onRemove },
      ],
    );
  };

  const countLabel = formatMobileString(
    selectedCount === 1
      ? strings.library.collectionBooksSelectedOne
      : strings.library.collectionBooksSelectedOther,
    { count: selectedCount },
  );
  const saveLabel =
    plan.saveMembership && !plan.renameTo
      ? formatMobileString(strings.collectionMembership.saveWithCount, {
          count: diff.idsToAdd.length + diff.idsToRemove.length,
        })
      : strings.common.save;

  const header = (
    <View style={styles.listHeader}>
      {editing ? (
        <View style={styles.group}>
          <SectionLabel tokens={tokens} label={strings.library.collectionNameSection} />
          <View style={[styles.fieldRow, { backgroundColor: tokens.muted }]}>
            <TextInput
              accessibilityLabel={strings.library.collectionName}
              autoCapitalize="words"
              clearButtonMode="while-editing"
              editable={!locked}
              maxFontSizeMultiplier={nemuMaxFontSizeMultiplier}
              onChangeText={setDraftName}
              onSubmitEditing={() => {
                void save();
              }}
              placeholder={strings.library.collectionName}
              placeholderTextColor={tokens.mutedForeground}
              returnKeyType="done"
              selectionColor={tokens.primary}
              style={[styles.fieldInput, { color: tokens.foreground }]}
              testID="CollectionBooksNameField"
              value={draftName}
            />
            <Ionicons
              accessibilityElementsHidden
              importantForAccessibility="no"
              name="pencil"
              size={16}
              color={tokens.mutedForeground}
            />
          </View>
        </View>
      ) : null}
      {showSearch ? (
        <NemuNativeSearchField
          accessibilityLabel={strings.library.searchLibraryBooks}
          clearAccessibilityLabel={strings.library.clearLibrarySearch}
          onChangeText={setQuery}
          placeholder={strings.library.searchLibraryBooks}
          testID="CollectionBooksSearchField"
          value={query}
        />
      ) : null}
      {entries.length ? (
        <View style={styles.sectionHeader}>
          <SectionLabel tokens={tokens} label={strings.library.collectionBooksSection} />
          <NemuText
            accessibilityLiveRegion="polite"
            numberOfLines={1}
            style={[
              styles.sectionCount,
              { color: selectedCount > 0 ? tokens.primary : tokens.mutedForeground },
            ]}
          >
            {countLabel}
          </NemuText>
        </View>
      ) : null}
    </View>
  );

  const footer = (
    <View style={styles.listFooter}>
      {error ? (
        <MobileInlineErrorBanner
          title={strings.library.collectionActionFailed}
          detail={error}
          dismissLabel={strings.common.clear}
          onDismiss={onErrorDismiss ?? (() => undefined)}
          variant="embedded"
        />
      ) : null}
      {editing && onRemove ? (
        <NemuPressable
          accessibilityLabel={formatMobileString(strings.library.removeCollectionNamed, {
            name: collection.name,
          })}
          accessibilityRole="button"
          accessibilityState={{ disabled: locked }}
          disabled={locked}
          hapticFeedback="warning"
          onPress={confirmRemove}
          pressHighlight
          style={[styles.removeRow, { backgroundColor: tokens.muted, opacity: locked ? 0.5 : 1 }]}
          testID="CollectionBooksRemoveAction"
        >
          <Ionicons name="trash-outline" size={19} color={tokens.danger} />
          <NemuText
            numberOfLines={1}
            style={[styles.removeLabel, { color: tokens.danger }]}
          >
            {strings.library.removeCollection}
          </NemuText>
        </NemuPressable>
      ) : null}
    </View>
  );

  const empty = (
    <View style={styles.empty}>
      <Ionicons
        name={entries.length ? "search-outline" : "library-outline"}
        size={22}
        color={tokens.mutedForeground}
      />
      <NemuText
          style={[styles.emptyText, { color: tokens.mutedForeground }]}
      >
        {entries.length
          ? formatMobileString(strings.library.collectionBooksNoMatches, { query: query.trim() })
          : strings.library.addBooksEmpty}
      </NemuText>
    </View>
  );

  return (
    <MobileNativeSheetScaffold
      visible={visible}
      onClose={() => {
        // Swipe-down / system dismissal: the scaffold already blocks it while
        // anything is staged (see enablePanDownToClose).
        if (closeRequestedRef.current) return;
        closeRequestedRef.current = true;
        onClose();
      }}
      onDismiss={onDismiss}
      title={editing ? strings.library.editCollectionTitle : strings.library.addBooksTitle}
      headerLeading={
        <NemuNativeSheetHeaderAction
          accessibilityLabel={strings.common.cancel}
          androidIcon="close-outline"
          iosSystemImage="xmark"
          disabled={locked}
          onPress={close}
        />
      }
      headerTrailing={
        <NemuNativeSheetHeaderAction
          accessibilityLabel={saveLabel}
          androidIcon="checkmark"
          iosSystemImage="checkmark"
          prominent
          disabled={!plan.canSave}
          onPress={() => {
            void save();
          }}
        />
      }
      snapPoints={layout.snapPoints}
      fillContent
      enablePanDownToClose={!locked && !plan.dirty}
      contentStyle={styles.sheet}
      testID={testID}
    >
      <FlatList
        // Android: inside a native sheet, hand the drag to the sheet at the top.
        nestedScrollEnabled
        style={styles.list}
        data={visibleEntries}
        extraData={selectedIds}
        keyExtractor={(entry) => entry.item.libraryItemId}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        initialNumToRender={12}
        maxToRenderPerBatch={12}
        windowSize={7}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={header}
        ListFooterComponent={footer}
        ListEmptyComponent={empty}
        renderItem={({ item, index }) => (
          <CollectionBookRow
            entry={item}
            selected={selectedIds.has(item.item.libraryItemId)}
            first={index === 0}
            last={index === visibleEntries.length - 1}
            disabled={locked}
            installedSources={installedSources}
            strings={strings}
            tokens={tokens}
            onToggle={toggle}
          />
        )}
      />
    </MobileNativeSheetScaffold>
  );
}

function SectionLabel({ tokens, label }: { tokens: NemuTokens; label: string }) {
  return (
    <NemuText
      accessibilityRole="header"
      numberOfLines={1}
      style={[styles.sectionLabel, { color: tokens.mutedForeground }]}
    >
      {label}
    </NemuText>
  );
}

const COVER_WIDTH = 36;
const COVER_HEIGHT = 50;

/**
 * One book: a small cover (requested exactly like the library grid's, so it
 * is the same cached image), title and author / sources, and the trailing
 * selection circle. Rows sit in one rounded group with separators inset to
 * the text, like an inset-grouped table.
 */
const CollectionBookRow = memo(function CollectionBookRow({
  entry,
  selected,
  first,
  last,
  disabled,
  installedSources,
  strings,
  tokens,
  onToggle,
}: {
  entry: LibraryEntry;
  selected: boolean;
  first: boolean;
  last: boolean;
  disabled: boolean;
  installedSources: InstalledSource[];
  strings: MobileStrings;
  tokens: NemuTokens;
  onToggle: (libraryItemId: string) => void;
}) {
  const libraryItemId = entry.item.libraryItemId;
  const title = getEntryTitle(entry);
  const subtitle = getMobileCollectionBookSubtitle(entry, strings);
  const cover = resolveMobileEntryDisplayCover(entry);
  const coverSource = useMemo(
    () => resolveMobileEntryCoverSources(entry, installedSources, { cover })[0] ?? null,
    [cover, entry, installedSources],
  );
  const coverRequest = useMobileSourceImageRequest(coverSource, cover);
  const coverUri = coverRequest?.url ?? cover;
  const placeholder = (
    <View style={[styles.coverPlaceholder, { backgroundColor: nemuColorWithAlpha(tokens.primary, 0.16) }]}>
      <Ionicons name="book-outline" size={16} color={tokens.mutedForeground} />
    </View>
  );

  return (
    <View
      style={[
        styles.rowGroup,
        { backgroundColor: tokens.muted },
        first && styles.rowGroupFirst,
        last && styles.rowGroupLast,
      ]}
    >
      <NemuPressable
        accessibilityLabel={formatMobileString(strings.library.collectionMangaAccessibility, {
          title,
          sourceCountLabel: subtitle,
        })}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: selected, disabled }}
        disabled={disabled}
        hapticFeedback="selection"
        onPress={() => onToggle(libraryItemId)}
        pressHighlight
        style={[styles.row, disabled && styles.rowDisabled]}
        testID={`CollectionBookRow-${libraryItemId}`}
      >
        <View style={[styles.cover, { borderColor: tokens.coverBorder }]}>
          {coverUri ? (
            <MobileCachedImage
              fallback={placeholder}
              uriOwnership="source"
              source={{ uri: coverUri, headers: coverRequest?.headers }}
              style={styles.coverImage}
            />
          ) : (
            placeholder
          )}
        </View>
        <View style={styles.rowText}>
          <NemuText
            numberOfLines={1}
            style={[styles.rowTitle, { color: tokens.foreground }]}
          >
            {title}
          </NemuText>
          <NemuText
            numberOfLines={1}
            style={[styles.rowSubtitle, { color: tokens.mutedForeground }]}
          >
            {subtitle}
          </NemuText>
        </View>
        <Ionicons
          accessibilityElementsHidden
          importantForAccessibility="no"
          name={selected ? "checkmark-circle" : "ellipse-outline"}
          size={24}
          color={selected ? tokens.primary : nemuColorWithAlpha(tokens.mutedForeground, 0.7)}
        />
      </NemuPressable>
      {last ? null : (
        <View
          style={[styles.separator, { backgroundColor: tokens.border }]}
        />
      )}
    </View>
  );
});

const ROW_PADDING = 14;
const GROUP_RADIUS = Platform.OS === "ios" ? 22 : 16;

const styles = StyleSheet.create({
  sheet: {
    flex: 1,
    minHeight: 0,
  },
  list: {
    flex: 1,
    minHeight: 0,
  },
  listContent: {
    paddingBottom: 12,
  },
  listHeader: {
    gap: 14,
    paddingBottom: 8,
  },
  group: {
    gap: 6,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: 12,
    marginTop: 2,
  },
  sectionLabel: {
    paddingHorizontal: ROW_PADDING,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: nemuFontWeight.semibold,
    letterSpacing: 0,
  },
  sectionCount: {
    flexShrink: 1,
    paddingHorizontal: ROW_PADDING,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: nemuFontWeight.medium,
    fontVariant: ["tabular-nums"],
    letterSpacing: 0,
  },
  fieldRow: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: GROUP_RADIUS,
    paddingLeft: ROW_PADDING + 2,
    paddingRight: ROW_PADDING + 2,
  },
  fieldInput: {
    flex: 1,
    minHeight: 48,
    paddingVertical: 12,
    fontSize: 17,
    letterSpacing: 0,
  },
  rowGroup: {
    overflow: "hidden",
  },
  rowGroupFirst: {
    borderTopLeftRadius: GROUP_RADIUS,
    borderTopRightRadius: GROUP_RADIUS,
  },
  rowGroupLast: {
    borderBottomLeftRadius: GROUP_RADIUS,
    borderBottomRightRadius: GROUP_RADIUS,
  },
  row: {
    minHeight: 66,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: ROW_PADDING,
    paddingVertical: 8,
  },
  rowDisabled: {
    opacity: 0.56,
  },
  cover: {
    width: COVER_WIDTH,
    height: COVER_HEIGHT,
    borderRadius: 5,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  coverImage: {
    width: "100%",
    height: "100%",
  },
  coverPlaceholder: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  rowText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  rowTitle: {
    fontSize: 16,
    lineHeight: 21,
    fontWeight: nemuFontWeight.medium,
    letterSpacing: 0,
  },
  rowSubtitle: {
    fontSize: 13,
    lineHeight: 18,
    letterSpacing: 0,
  },
  separator: {
    position: "absolute",
    right: 0,
    bottom: 0,
    left: ROW_PADDING + COVER_WIDTH + 12,
    height: StyleSheet.hairlineWidth,
  },
  listFooter: {
    gap: 14,
    paddingTop: 18,
  },
  removeRow: {
    minHeight: 50,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: GROUP_RADIUS,
    paddingHorizontal: ROW_PADDING + 2,
  },
  removeLabel: {
    flex: 1,
    fontSize: 17,
    lineHeight: 22,
    letterSpacing: 0,
  },
  empty: {
    minHeight: 96,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 24,
  },
  emptyText: {
    textAlign: "center",
    fontSize: 15,
    lineHeight: 21,
    letterSpacing: 0,
  },
});
