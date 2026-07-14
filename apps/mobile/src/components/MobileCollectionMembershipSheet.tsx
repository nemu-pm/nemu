import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
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
import { useCollections, useMobileLanguageSettings } from "@/data/mobileHooks";
import type { LocalCollection } from "@/data/schema";
import { hapticConfirm, hapticError, hapticPress } from "@/lib/haptics";
import {
  formatMobileString,
  getMobileStrings,
  type MobileStrings,
} from "@/lib/mobileI18n";
import {
  collectionCount,
  collectionSelectionForLibraryItem,
  canRenameMobileCollection,
  canRetryMobileCollectionMembershipLoadError,
  canSaveMobileCollectionMembership,
  canStartMobileCollectionAction,
  diffCollectionSelection,
  toggleCollectionSelection,
  type MobileCollectionActionState,
} from "@/lib/mobileCollections";
import { getMobileCollectionMembershipRequestCloseAction } from "@/lib/mobileCollectionMembershipBackBehavior";

type MobileCollectionsState = ReturnType<typeof useCollections>;

type MobileCollectionMembershipSheetProps = {
  visible: boolean;
  libraryItemId: string;
  title?: string;
  onClose: () => void;
};

function collectionBookCountText(count: number, strings: MobileStrings): string {
  return formatMobileString(
    count === 1
      ? strings.collectionMembership.bookCountOne
      : strings.collectionMembership.bookCountOther,
    { count }
  );
}

function collectionSubtitle(title: string | undefined, strings: MobileStrings): string {
  return title
    ? formatMobileString(strings.collectionMembership.subtitleForTitle, { title })
    : strings.collectionMembership.subtitle;
}

function CollectionRow({
  collection,
  count,
  selected,
  disabled,
  strings,
  onToggle,
  onRename,
  onRemove,
}: {
  collection: LocalCollection;
  count: number;
  selected: boolean;
  disabled: boolean;
  strings: MobileStrings;
  onToggle: () => void;
  onRename: () => void;
  onRemove: () => void;
}) {
  const { tokens } = useNemuTheme();
  const countLabel = collectionBookCountText(count, strings);

  return (
    <View
      style={[
        styles.collectionRow,
        {
          backgroundColor: selected ? `${tokens.primary}16` : tokens.muted,
          borderColor: selected ? tokens.primary : tokens.border,
          opacity: disabled ? 0.68 : 1,
        },
      ]}
    >
      <NemuPressable
        accessibilityRole="checkbox"
        accessibilityLabel={formatMobileString(
          strings.collectionMembership.collectionRowAccessibility,
          {
            name: collection.name,
            countLabel,
          }
        )}
        accessibilityState={{ checked: selected, disabled }}
        disabled={disabled}
        hapticFeedback="selection"
        onPress={onToggle}
        pressedScale={0.985}
        style={styles.collectionToggle}
      >
        <View style={[styles.collectionIcon, { backgroundColor: tokens.card }]}>
          <Ionicons
            name={selected ? "albums" : "albums-outline"}
            size={19}
            color={selected ? tokens.primary : tokens.mutedForeground}
          />
        </View>
        <View style={styles.collectionText}>
          <Text numberOfLines={1} style={[styles.collectionName, { color: tokens.foreground }]}>
            {collection.name}
          </Text>
          <Text numberOfLines={1} style={[styles.collectionMeta, { color: tokens.mutedForeground }]}>
            {countLabel}
          </Text>
        </View>
        <Ionicons
          name={selected ? "checkmark-circle" : "ellipse-outline"}
          size={22}
          color={selected ? tokens.primary : tokens.mutedForeground}
        />
      </NemuPressable>
      <View style={styles.collectionActions}>
        <NemuPressable
          accessibilityRole="button"
          accessibilityLabel={formatMobileString(
            strings.library.renameCollectionAccessibility,
            { name: collection.name }
          )}
          accessibilityState={{ disabled }}
          disabled={disabled}
          onPress={onRename}
          pressedScale={0.94}
          style={[styles.collectionActionButton, { backgroundColor: tokens.card }]}
        >
          <Ionicons name="create-outline" size={16} color={tokens.mutedForeground} />
        </NemuPressable>
        <NemuPressable
          accessibilityRole="button"
          accessibilityLabel={formatMobileString(
            strings.library.removeCollectionNamed,
            { name: collection.name }
          )}
          accessibilityState={{ disabled }}
          disabled={disabled}
          onPress={onRemove}
          pressedScale={0.94}
          style={[styles.collectionActionButton, { backgroundColor: tokens.card }]}
        >
          <Ionicons name="trash-outline" size={16} color={tokens.danger} />
        </NemuPressable>
      </View>
    </View>
  );
}

function LoadingCollectionMembershipSheet({
  visible,
  title,
  onClose,
}: Pick<MobileCollectionMembershipSheetProps, "visible" | "title" | "onClose">) {
  const { tokens } = useNemuTheme();
  const { appLanguage } = useMobileLanguageSettings();
  const strings = getMobileStrings(appLanguage);

  return (
    <MobileNativeSheetScaffold
      visible={visible}
      onClose={onClose}
      snapPoints={["32%"]}
      contentStyle={styles.loadingSheet}
      testID="MobileCollectionMembershipSheetLoading"
    >
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <Text style={[styles.title, { color: tokens.foreground }]}>
            {strings.collectionMembership.title}
          </Text>
          <Text numberOfLines={1} style={[styles.subtitle, { color: tokens.mutedForeground }]}>
            {collectionSubtitle(title, strings)}
          </Text>
        </View>
        <NemuPressable
          accessibilityRole="button"
          accessibilityLabel={strings.collectionMembership.close}
          onPress={onClose}
          style={[styles.closeButton, { backgroundColor: tokens.muted }]}
        >
          <Ionicons name="close-outline" size={20} color={tokens.mutedForeground} />
        </NemuPressable>
      </View>
      <View style={styles.loadingBody}>
        <ActivityIndicator size="small" color={tokens.primary} />
        <Text style={[styles.loadingText, { color: tokens.mutedForeground }]}>
          {strings.collectionMembership.loading}
        </Text>
      </View>
    </MobileNativeSheetScaffold>
  );
}

function CollectionMembershipContent({
  visible,
  libraryItemId,
  title,
  collections,
  onClose,
}: MobileCollectionMembershipSheetProps & {
  collections: MobileCollectionsState;
}) {
  const { tokens } = useNemuTheme();
  const { appLanguage } = useMobileLanguageSettings();
  const strings = getMobileStrings(appLanguage);
  const nextInitialSelected = useMemo(
    () =>
      collectionSelectionForLibraryItem(
        collections.data,
        collections.membership,
        libraryItemId
      ),
    [collections.data, collections.membership, libraryItemId]
  );
  const [initialSelected, setInitialSelected] = useState(() => nextInitialSelected);
  const [selected, setSelected] = useState(() => new Set(nextInitialSelected));
  const [newCollectionName, setNewCollectionName] = useState("");
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [renameTarget, setRenameTarget] = useState<LocalCollection | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<LocalCollection | null>(null);
  const [removing, setRemoving] = useState(false);
  const [retryingCollections, setRetryingCollections] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [dismissedCollectionError, setDismissedCollectionError] = useState<string | null>(null);
  const wasVisibleRef = useRef(false);
  const visibleLibraryItemIdRef = useRef<string | null>(null);

  useEffect(() => {
    const itemChanged = visibleLibraryItemIdRef.current !== libraryItemId;
    if (visible && (!wasVisibleRef.current || itemChanged)) {
      setInitialSelected(nextInitialSelected);
      setSelected(new Set(nextInitialSelected));
      setNewCollectionName("");
      setRenameTarget(null);
      setRenameDraft("");
      setRemoveTarget(null);
      setRetryingCollections(false);
      setLocalError(null);
      setDismissedCollectionError(null);
    }
    wasVisibleRef.current = visible;
    visibleLibraryItemIdRef.current = visible ? libraryItemId : null;
  }, [libraryItemId, nextInitialSelected, visible]);

  const validCollectionIds = useMemo(
    () => new Set(collections.data.map((collection) => collection.collectionId)),
    [collections.data]
  );
  const diff = useMemo(
    () => diffCollectionSelection(initialSelected, selected, validCollectionIds),
    [initialSelected, selected, validCollectionIds]
  );
  const changeCount = diff.idsToAdd.length + diff.idsToRemove.length;
  const actionState: MobileCollectionActionState = {
    creating,
    loadingCollections: retryingCollections,
    renaming,
    savingMembership: saving,
    removing,
  };
  const busy = creating || saving || renaming || removing || retryingCollections;
  const canCreate = !busy && newCollectionName.trim().length > 0;
  const renameDisabled = !renameTarget || !canRenameMobileCollection(
    actionState,
    renameDraft,
    renameTarget.name
  );
  const removeDisabled = !removeTarget || !canStartMobileCollectionAction(actionState);
  const collectionError =
    collections.error && collections.error !== dismissedCollectionError
      ? collections.error
      : null;
  const activeError = localError ?? collectionError;
  const canRetryCollectionError = canRetryMobileCollectionMembershipLoadError({
    hasError: Boolean(collectionError),
    state: actionState,
  });
  const saveDisabled = !canSaveMobileCollectionMembership(
    actionState,
    changeCount,
  );
  const saveLabel = saving
    ? strings.collectionMembership.saving
    : changeCount
      ? formatMobileString(strings.collectionMembership.saveWithCount, {
          count: changeCount,
        })
      : strings.common.save;
  const requestClose = () => {
    const action = getMobileCollectionMembershipRequestCloseAction({ busy });
    if (action === "ignore") return;
    void hapticPress();
    onClose();
  };

  const toggleCollection = (collectionId: string) => {
    setLocalError(null);
    setDismissedCollectionError(null);
    setSelected((current) => toggleCollectionSelection(current, collectionId));
  };

  const retryCollections = async () => {
    if (!canRetryCollectionError) return;

    setRetryingCollections(true);
    setLocalError(null);
    setDismissedCollectionError(null);
    try {
      await collections.reload();
      await hapticConfirm();
    } catch {
      await hapticError();
    } finally {
      setRetryingCollections(false);
    }
  };

  const createCollection = async () => {
    const name = newCollectionName.trim();
    if (!name || busy) return;
    setCreating(true);
    setLocalError(null);
    setDismissedCollectionError(null);
    try {
      const collection = await collections.createCollection(name);
      setSelected((current) => new Set(current).add(collection.collectionId));
      setNewCollectionName("");
      await hapticConfirm();
    } catch (nextError) {
      setLocalError(nextError instanceof Error ? nextError.message : String(nextError));
      await hapticError();
    } finally {
      setCreating(false);
    }
  };

  const openRenameCollection = (collection: LocalCollection) => {
    if (busy) return;
    setLocalError(null);
    setDismissedCollectionError(null);
    setRemoveTarget(null);
    setRenameTarget(collection);
    setRenameDraft(collection.name);
  };

  const renameCollection = async () => {
    if (!renameTarget || renameDisabled) return;
    setRenaming(true);
    setLocalError(null);
    setDismissedCollectionError(null);
    try {
      const renamed = await collections.renameCollection(
        renameTarget.collectionId,
        renameDraft.trim()
      );
      if (renamed) {
        setRenameTarget(null);
        setRenameDraft("");
        await hapticConfirm();
      }
    } catch (nextError) {
      setLocalError(nextError instanceof Error ? nextError.message : String(nextError));
      await hapticError();
    } finally {
      setRenaming(false);
    }
  };

  const confirmRemoveCollection = (collection: LocalCollection) => {
    if (busy) return;
    setLocalError(null);
    setDismissedCollectionError(null);
    setRenameTarget(null);
    setRenameDraft("");
    setRemoveTarget(collection);
  };

  const removeCollection = async () => {
    if (!removeTarget || removeDisabled) return;
    setRemoving(true);
    setLocalError(null);
    setDismissedCollectionError(null);
    try {
      const collectionId = removeTarget.collectionId;
      await collections.removeCollection(collectionId);
      setSelected((current) => {
        const next = new Set(current);
        next.delete(collectionId);
        return next;
      });
      setInitialSelected((current) => {
        const next = new Set(current);
        next.delete(collectionId);
        return next;
      });
      setRemoveTarget(null);
      await hapticConfirm();
    } catch (nextError) {
      setLocalError(nextError instanceof Error ? nextError.message : String(nextError));
      await hapticError();
    } finally {
      setRemoving(false);
    }
  };

  const saveMembership = async () => {
    if (saveDisabled) return;
    setSaving(true);
    setLocalError(null);
    setDismissedCollectionError(null);
    try {
      await Promise.all([
        ...diff.idsToAdd.map((collectionId) =>
          collections.addBooksToCollection(collectionId, [libraryItemId])
        ),
        ...diff.idsToRemove.map((collectionId) =>
          collections.removeBooksFromCollection(collectionId, [libraryItemId])
        ),
      ]);
      await hapticConfirm();
      onClose();
    } catch (nextError) {
      setLocalError(nextError instanceof Error ? nextError.message : String(nextError));
      await hapticError();
    } finally {
      setSaving(false);
    }
  };

  return (
    <MobileNativeSheetScaffold
      visible={visible}
      onClose={requestClose}
      snapPoints={collections.data.length > 2 ? ["82%"] : ["58%"]}
      scroll
      enablePanDownToClose={!busy}
      contentStyle={styles.sheet}
      testID="MobileCollectionMembershipSheet"
    >
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <Text style={[styles.title, { color: tokens.foreground }]}>
            {strings.collectionMembership.title}
          </Text>
          <Text numberOfLines={1} style={[styles.subtitle, { color: tokens.mutedForeground }]}>
            {collectionSubtitle(title, strings)}
          </Text>
        </View>
        <NemuPressable
          accessibilityRole="button"
          accessibilityLabel={strings.collectionMembership.close}
          accessibilityState={{ disabled: busy }}
          disabled={busy}
          hapticFeedback="none"
          onPress={requestClose}
          style={[
            styles.closeButton,
            { backgroundColor: tokens.muted, opacity: busy ? 0.58 : 1 },
          ]}
        >
          <Ionicons name="close-outline" size={20} color={tokens.mutedForeground} />
        </NemuPressable>
      </View>

      <View style={styles.scrollContent}>
        <View style={styles.list}>
          {collections.data.length ? (
            collections.data.map((collection) => (
              <CollectionRow
                key={collection.collectionId}
                collection={collection}
                count={collectionCount(collection.collectionId, collections.membership)}
                selected={selected.has(collection.collectionId)}
                disabled={busy}
                strings={strings}
                onToggle={() => toggleCollection(collection.collectionId)}
                onRename={() => openRenameCollection(collection)}
                onRemove={() => confirmRemoveCollection(collection)}
              />
            ))
          ) : (
            <View
              style={[
                styles.emptyState,
                { borderColor: tokens.border, backgroundColor: tokens.muted },
              ]}
            >
              <Ionicons name="albums-outline" size={22} color={tokens.mutedForeground} />
              <Text style={[styles.emptyText, { color: tokens.mutedForeground }]}>
                {strings.collectionMembership.noCollections}
              </Text>
            </View>
          )}
        </View>

        {renameTarget ? (
          <View style={[styles.managePanel, { backgroundColor: tokens.muted }]}>
            <View style={styles.createHeader}>
              <Ionicons name="create-outline" size={20} color={tokens.primary} />
              <View style={styles.createCopy}>
                <Text style={[styles.createTitle, { color: tokens.foreground }]}>
                  {strings.library.renameCollection}
                </Text>
                <Text style={[styles.createSubtitle, { color: tokens.mutedForeground }]}>
                  {strings.library.renameDescription}
                </Text>
              </View>
            </View>
            <TextInput
              accessibilityLabel={strings.library.collectionName}
              accessibilityState={{ disabled: busy }}
              autoCapitalize="words"
              editable={!busy}
              onChangeText={setRenameDraft}
              onSubmitEditing={() => {
                void renameCollection();
              }}
              placeholder={strings.library.collectionName}
              placeholderTextColor={tokens.mutedForeground}
              returnKeyType="done"
              selectionColor={tokens.primary}
              style={[
                styles.input,
                {
                  backgroundColor: tokens.card,
                  color: tokens.foreground,
                  opacity: busy ? 0.68 : 1,
                },
              ]}
              value={renameDraft}
            />
            <View style={styles.inlineActions}>
              <NemuButton
                accessibilityLabel={strings.common.cancel}
                containerStyle={styles.inlineButton}
                disabled={busy}
                hapticFeedback="none"
                label={strings.common.cancel}
                onPress={() => {
                  setRenameTarget(null);
                  setRenameDraft("");
                }}
                variant="secondary"
              />
              <NemuButton
                accessibilityLabel={strings.common.save}
                containerStyle={styles.inlineButton}
                disabled={renameDisabled}
                label={strings.common.save}
                loading={renaming}
                onPress={() => {
                  void renameCollection();
                }}
                variant={renaming || !renameDisabled ? "default" : "secondary"}
              />
            </View>
          </View>
        ) : null}

        {removeTarget ? (
          <View style={[styles.managePanel, { backgroundColor: tokens.muted }]}>
            <View style={styles.createHeader}>
              <Ionicons name="trash-outline" size={20} color={tokens.danger} />
              <View style={styles.createCopy}>
                <Text style={[styles.createTitle, { color: tokens.foreground }]}>
                  {strings.library.removeCollection}
                </Text>
                <Text style={[styles.createSubtitle, { color: tokens.mutedForeground }]}>
                  {strings.library.removeCollectionConfirm}
                </Text>
              </View>
            </View>
            <View style={styles.inlineActions}>
              <NemuButton
                accessibilityLabel={strings.common.cancel}
                containerStyle={styles.inlineButton}
                disabled={removing}
                hapticFeedback="none"
                label={strings.common.cancel}
                onPress={() => setRemoveTarget(null)}
                variant="secondary"
              />
              <NemuButton
                accessibilityLabel={formatMobileString(
                  strings.library.removeCollectionNamed,
                  { name: removeTarget.name }
                )}
                containerStyle={styles.inlineButton}
                disabled={removeDisabled}
                hapticFeedback="warning"
                label={strings.common.remove}
                loading={removing}
                onPress={() => {
                  void removeCollection();
                }}
                variant="destructive"
              />
            </View>
          </View>
        ) : null}

        <View style={[styles.createPanel, { backgroundColor: tokens.muted }]}>
          <View style={styles.createHeader}>
            <Ionicons name="add-circle-outline" size={20} color={tokens.primary} />
            <View style={styles.createCopy}>
              <Text style={[styles.createTitle, { color: tokens.foreground }]}>
                {strings.collectionMembership.newCollection}
              </Text>
              <Text style={[styles.createSubtitle, { color: tokens.mutedForeground }]}>
                {strings.collectionMembership.newCollectionDescription}
              </Text>
            </View>
          </View>
          <TextInput
            accessibilityLabel={strings.collectionMembership.collectionName}
            accessibilityState={{ disabled: busy }}
            autoCapitalize="words"
            editable={!busy}
            onChangeText={setNewCollectionName}
            onSubmitEditing={() => {
              void createCollection();
            }}
            placeholder={strings.collectionMembership.collectionName}
            placeholderTextColor={tokens.mutedForeground}
            returnKeyType="done"
            selectionColor={tokens.primary}
            style={[
              styles.input,
              {
                backgroundColor: tokens.card,
                color: tokens.foreground,
                opacity: busy ? 0.68 : 1,
              },
            ]}
            value={newCollectionName}
          />
          <NemuButton
            accessibilityLabel={strings.collectionMembership.createCollection}
            containerStyle={styles.createButton}
            disabled={!canCreate}
            icon="add-outline"
            label={strings.common.create}
            loading={creating}
            onPress={() => {
              void createCollection();
            }}
            style={styles.stretchedButton}
            variant={creating || canCreate ? "default" : "secondary"}
          />
        </View>

        {activeError ? (
          <MobileInlineErrorBanner
            title={strings.library.collectionActionFailed}
            detail={activeError}
            actionLabel={collectionError ? strings.common.retry : undefined}
            actionDisabled={!canRetryCollectionError}
            actionLoading={retryingCollections}
            dismissLabel={strings.common.clear}
            onActionPress={collectionError ? () => {
              void retryCollections();
            } : undefined}
            onDismiss={() => {
              if (localError) {
                setLocalError(null);
                return;
              }
              if (collections.error) {
                setDismissedCollectionError(collections.error);
              }
            }}
            variant="embedded"
          />
        ) : null}
      </View>

      <View style={styles.footer}>
        <NemuButton
          accessibilityLabel={strings.common.cancel}
          containerStyle={styles.footerButton}
          disabled={busy}
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
            void saveMembership();
          }}
          variant={saving || !saveDisabled ? "default" : "secondary"}
        />
      </View>
    </MobileNativeSheetScaffold>
  );
}

export function MobileCollectionMembershipSheet({
  visible,
  libraryItemId,
  title,
  onClose,
}: MobileCollectionMembershipSheetProps) {
  const collections = useCollections();

  if (collections.loading) {
    return (
      <LoadingCollectionMembershipSheet
        visible={visible}
        title={title}
        onClose={onClose}
      />
    );
  }

  return (
    <CollectionMembershipContent
      visible={visible}
      libraryItemId={libraryItemId}
      title={title}
      collections={collections}
      onClose={onClose}
    />
  );
}

const styles = StyleSheet.create({
  sheet: {
    gap: 14,
    paddingHorizontal: 16,
    paddingTop: 4,
  },
  loadingSheet: {
    gap: 14,
    paddingHorizontal: 16,
    paddingTop: 4,
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
  loadingBody: {
    minHeight: 92,
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
  },
  loadingText: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: nemuFontWeight.medium,
  },
  scrollContent: {
    gap: 12,
    paddingBottom: 2,
  },
  list: {
    gap: 9,
  },
  collectionRow: {
    minHeight: 64,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  collectionToggle: {
    minHeight: 44,
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  collectionIcon: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
  },
  collectionText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  collectionName: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: nemuFontWeight.semibold,
  },
  collectionMeta: {
    fontSize: 11,
    lineHeight: 15,
  },
  collectionActions: {
    flexDirection: "row",
    gap: 6,
  },
  collectionActionButton: {
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
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
  createPanel: {
    gap: 11,
    borderRadius: radius.lg,
    padding: 12,
  },
  managePanel: {
    gap: 11,
    borderRadius: radius.lg,
    padding: 12,
  },
  createHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },
  createCopy: {
    flex: 1,
    minWidth: 0,
  },
  createTitle: {
    fontSize: 13,
    lineHeight: 17,
    fontWeight: nemuFontWeight.semibold,
  },
  createSubtitle: {
    marginTop: 2,
    fontSize: 11,
    lineHeight: 15,
  },
  input: {
    height: 44,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    fontSize: 14,
    lineHeight: 18,
  },
  createButton: {
    alignSelf: "stretch",
  },
  stretchedButton: {
    width: "100%",
  },
  inlineActions: {
    flexDirection: "row",
    gap: 8,
  },
  inlineButton: {
    flex: 1,
  },
  footer: {
    flexDirection: "row",
    gap: 8,
  },
  footerButton: {
    flex: 1,
  },
});
