import { useMemo, useState } from "react";
import {
  FlatList,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { MobileInlineErrorBanner } from "@/components/MobileInlineErrorBanner";
import {
  MobileNativeSheetScaffold,
  NemuPressable,
  radius,
  nemuFontWeight,
  useNemuTheme,
  NemuButton,
} from "@/design-system";
import { getEntryTitle, type LibraryEntry } from "@/data/schema";
import { hapticPress } from "@/lib/haptics";
import {
  formatMobileString,
  type MobileStrings,
} from "@/lib/mobileI18n";
import {
  canSaveMobileCollectionMembership,
  diffLibraryItemSelection,
  getMobileCollectionMembershipSaveResultAction,
  getMobileCollectionSelectionSessionKey,
  type MobileCollectionActionState,
} from "@/lib/mobileCollections";
import { getMobileCollectionMembershipRequestCloseAction } from "@/lib/mobileCollectionMembershipBackBehavior";
import { getMobileCollectionBookSubtitle } from "@/lib/mobileLibraryPresentation";

type MobileAddBooksSheetProps = {
  visible: boolean;
  collectionId: string;
  collectionName: string;
  entries: LibraryEntry[];
  membership: Map<string, Set<string>>;
  strings: MobileStrings;
  actionState: MobileCollectionActionState;
  saving: boolean;
  error?: string | null;
  onClose: () => void;
  onErrorDismiss?: () => void;
  onSave: (selectedLibraryItemIds: Set<string>) => Promise<boolean>;
};

export function MobileAddBooksSheet({
  visible,
  collectionId,
  membership,
  ...props
}: MobileAddBooksSheetProps) {
  const nextInitialSelected = useMemo(
    () => new Set(membership.get(collectionId) ?? []),
    [collectionId, membership]
  );
  const sessionKey = getMobileCollectionSelectionSessionKey({
    visible,
    targetId: collectionId,
  });

  return (
    <MobileAddBooksSheetContent
      key={sessionKey}
      visible={visible}
      collectionId={collectionId}
      membership={membership}
      initialSelected={nextInitialSelected}
      {...props}
    />
  );
}

function MobileAddBooksSheetContent({
  visible,
  collectionName,
  entries,
  strings,
  actionState,
  saving,
  error,
  onClose,
  onErrorDismiss,
  onSave,
  initialSelected,
}: MobileAddBooksSheetProps & {
  initialSelected: Set<string>;
}) {
  const { tokens } = useNemuTheme();
  const validLibraryItemIds = useMemo(
    () => new Set(entries.map((entry) => entry.item.libraryItemId)),
    [entries]
  );
  const [selectedIds, setSelectedIds] = useState(() => new Set(initialSelected));

  const diff = useMemo(
    () => diffLibraryItemSelection(initialSelected, selectedIds, validLibraryItemIds),
    [initialSelected, selectedIds, validLibraryItemIds]
  );
  const changeCount = diff.idsToAdd.length + diff.idsToRemove.length;
  const saveDisabled = !canSaveMobileCollectionMembership(actionState, changeCount);
  const closeDisabled = saving;
  const saveLabel = saving
    ? strings.collectionMembership.saving
    : changeCount > 0
      ? formatMobileString(strings.collectionMembership.saveWithCount, {
          count: changeCount,
        })
      : strings.common.save;

  const requestClose = () => {
    const action = getMobileCollectionMembershipRequestCloseAction({ busy: closeDisabled });
    if (action === "ignore") return;
    void hapticPress();
    onClose();
  };

  const saveSelection = async () => {
    if (saveDisabled) return;
    const saved = await onSave(selectedIds);
    if (getMobileCollectionMembershipSaveResultAction({ saved }) === "close-sheet") {
      onClose();
    }
  };

  return (
    <MobileNativeSheetScaffold
      visible={visible}
      onClose={requestClose}
      snapPoints={["90%"]}
      fillContent
      enablePanDownToClose={!closeDisabled}
      contentStyle={styles.sheet}
    >
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <Text style={[styles.title, { color: tokens.foreground }]}>
            {strings.library.addBooksTitle}
          </Text>
          <Text numberOfLines={2} style={[styles.subtitle, { color: tokens.mutedForeground }]}>
            {formatMobileString(strings.library.addBooksDescription, {
              name: collectionName,
            })}
          </Text>
        </View>
        <NemuPressable
          accessibilityRole="button"
          accessibilityLabel={strings.library.closeAddBooks}
          accessibilityState={{ disabled: closeDisabled }}
          disabled={closeDisabled}
          hapticFeedback="none"
          onPress={requestClose}
          style={[
            styles.closeButton,
            { backgroundColor: tokens.muted, opacity: closeDisabled ? 0.58 : 1 },
          ]}
        >
          <Ionicons name="close-outline" size={20} color={tokens.mutedForeground} />
        </NemuPressable>
      </View>

      <FlatList
        style={styles.scroll}
        data={entries}
        extraData={selectedIds}
        keyExtractor={(entry) => entry.item.libraryItemId}
        initialNumToRender={10}
        maxToRenderPerBatch={10}
        windowSize={7}
        removeClippedSubviews
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        ItemSeparatorComponent={() => <View style={styles.itemSeparator} />}
        renderItem={({ item: entry }) => {
          const libraryItemId = entry.item.libraryItemId;
          const selected = selectedIds.has(libraryItemId);
          const subtitle = getMobileCollectionBookSubtitle(entry, strings);
          return (
            <NemuPressable
              accessibilityLabel={formatMobileString(
                strings.library.collectionMangaAccessibility,
                {
                  title: getEntryTitle(entry),
                  sourceCountLabel: subtitle,
                },
              )}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: selected, disabled: saving }}
              disabled={saving}
              hapticFeedback="selection"
              onPress={() => {
                setSelectedIds((current) => {
                  const next = new Set(current);
                  if (next.has(libraryItemId)) {
                    next.delete(libraryItemId);
                  } else {
                    next.add(libraryItemId);
                  }
                  return next;
                });
              }}
              pressedScale={0.985}
              style={[
                styles.bookRow,
                {
                  backgroundColor: selected
                    ? `${tokens.primary}16`
                    : tokens.muted,
                  borderColor: selected ? tokens.primary : tokens.border,
                  opacity: saving ? 0.68 : 1,
                },
              ]}
            >
              <View style={styles.bookRowText}>
                <Text
                  numberOfLines={1}
                  style={[styles.bookTitle, { color: tokens.foreground }]}
                >
                  {getEntryTitle(entry)}
                </Text>
                <Text
                  numberOfLines={1}
                  style={[
                    styles.bookSubtitle,
                    { color: tokens.mutedForeground },
                  ]}
                >
                  {subtitle}
                </Text>
              </View>
              <Ionicons
                name={selected ? "checkmark-circle" : "ellipse-outline"}
                size={22}
                color={selected ? tokens.primary : tokens.mutedForeground}
              />
            </NemuPressable>
          );
        }}
        ListEmptyComponent={
          <View
            style={[
              styles.emptyState,
              { borderColor: tokens.border, backgroundColor: tokens.muted },
            ]}
          >
            <Ionicons name="library-outline" size={22} color={tokens.mutedForeground} />
            <Text style={[styles.emptyText, { color: tokens.mutedForeground }]}>
              {strings.library.addBooksEmpty}
            </Text>
          </View>
        }
        ListFooterComponent={
          error ? (
            <View style={styles.listFooter}>
              <MobileInlineErrorBanner
                title={strings.library.collectionActionFailed}
                detail={error}
                dismissLabel={strings.common.clear}
                onDismiss={onErrorDismiss ?? (() => undefined)}
                variant="embedded"
              />
            </View>
          ) : null
        }
      />

      <View style={styles.footer}>
        <NemuButton
          accessibilityLabel={strings.common.cancel}
          containerStyle={styles.footerButton}
          disabled={closeDisabled}
          hapticFeedback="none"
          label={strings.common.cancel}
          onPress={requestClose}
          variant="secondary"
        />
        <NemuButton
          accessibilityLabel={saveLabel}
          containerStyle={styles.footerButton}
          disabled={saveDisabled}
          icon="checkmark-outline"
          label={saveLabel}
          loading={saving}
          onPress={() => {
            void saveSelection();
          }}
          variant={saving || !saveDisabled ? "default" : "secondary"}
        />
      </View>
    </MobileNativeSheetScaffold>
  );
}

const styles = StyleSheet.create({
  sheet: {
    flex: 1,
    maxHeight: "100%",
    gap: 14,
    padding: 14,
  },
  header: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  headerCopy: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: 20,
    lineHeight: 25,
    fontWeight: nemuFontWeight.semibold,
  },
  subtitle: {
    marginTop: 2,
    fontSize: 12,
    lineHeight: 16,
  },
  closeButton: {
    width: 38,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.lg,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 2,
  },
  itemSeparator: {
    height: 9,
  },
  listFooter: {
    marginTop: 12,
  },
  bookRow: {
    minHeight: 64,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  bookRowText: {
    flex: 1,
    minWidth: 0,
  },
  bookTitle: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: nemuFontWeight.semibold,
  },
  bookSubtitle: {
    marginTop: 2,
    fontSize: 11,
    lineHeight: 15,
  },
  emptyState: {
    minHeight: 78,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderStyle: "dashed",
    paddingHorizontal: 13,
    paddingVertical: 12,
  },
  emptyText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 17,
  },
  footer: {
    flexDirection: "row",
    gap: 8,
  },
  footerButton: {
    flex: 1,
  },
});
