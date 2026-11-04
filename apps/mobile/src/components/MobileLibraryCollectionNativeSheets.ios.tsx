import { useEffect, useRef, useState } from "react";
import { StyleSheet, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Button as SwiftButton,
  ContextMenu as SwiftContextMenu,
  Host as SwiftHost,
  HStack as SwiftHStack,
  ProgressView as SwiftProgressView,
  Section as SwiftSection,
  SwipeActions as SwiftSwipeActions,
  Text as SwiftText,
} from "@expo/ui/swift-ui";
import {
  accessibilityHidden,
  disabled as swiftDisabled,
  foregroundStyle,
  listRowBackground,
  opacity,
  tint,
} from "@expo/ui/swift-ui/modifiers";
import type { LocalCollection } from "@/data/schema";
import { useNemuTheme } from "@/design-system";
import { collectionCount, isMobileCollectionActionBusy } from "@/lib/mobileCollections";
import { formatMobileString, type MobileStrings } from "@/lib/mobileI18n";
import { getMobileCollectionListNativeDetents } from "@/lib/mobileLibrarySheetLayout";
import { MobileNativeFormSheet } from "./MobileNativeFormSheet";
import {
  NativeCheckRow,
  NativeDestructiveDialog,
  NativeNameAlert,
} from "./MobileNativeFormSheetParts.ios";
import { nativeGroupedRowColors } from "./MobileNativeFormSheetColors";
import type {
  MobileCollectionNameNativeSheetProps,
  MobileCollectionsManagerNativeSheetProps,
  MobileLibraryTitleMenuNativeSheetProps,
} from "./MobileLibraryCollectionNativeSheets.types";

export const mobileLibraryCollectionNativeSheetsAvailable = true;

function bookCountText(count: number, strings: MobileStrings): string {
  return formatMobileString(
    count === 1 ? strings.collectionMembership.bookCountOne : strings.collectionMembership.bookCountOther,
    { count },
  );
}

/** The library title's scope picker: All + each collection as checkmark rows. */
export function MobileLibraryTitleMenuNativeSheet({
  visible,
  collections,
  strings,
  selectedCollectionId,
  disabled,
  onClose,
  onDismiss,
  onSelect,
  onManage,
}: MobileLibraryTitleMenuNativeSheetProps) {
  const { tokens } = useNemuTheme();
  return (
    <MobileNativeFormSheet
      visible={visible}
      onClose={onClose}
      onDismiss={onDismiss}
      title={strings.nav.library}
      detents={["medium", "large"]}
      closeAccessibilityLabel={strings.common.done}
      testID="LibraryTitleMenuSheet"
      formKey={collections.map((collection) => collection.collectionId).join("|")}
    >
      <SwiftSection>
        <NativeCheckRow
          title={strings.library.all}
          systemImage="books.vertical"
          selected={selectedCollectionId === null}
          disabled={disabled}
          tintColor={tokens.primary}
                        textColor={tokens.foreground}
                        detailColor={tokens.mutedForeground}
          onPress={() => onSelect(null)}
        />
        {collections.map((collection) => (
          <NativeCheckRow
            key={collection.collectionId}
            title={collection.name}
            systemImage="rectangle.stack"
            selectedSystemImage="rectangle.stack.fill"
            selected={selectedCollectionId === collection.collectionId}
            disabled={disabled}
            tintColor={tokens.primary}
                        textColor={tokens.foreground}
                        detailColor={tokens.mutedForeground}
            onPress={() => onSelect(collection.collectionId)}
          />
        ))}
      </SwiftSection>
      <SwiftSection>
        <SwiftButton label={strings.library.manageCollections} systemImage="folder" onPress={onManage} />
      </SwiftSection>
    </MobileNativeFormSheet>
  );
}

/**
 * Create / rename a collection: a system alert with one name field — how
 * Photos names a new album and renames one (Files' "New Folder" and Notes'
 * "New Folder" read the same). Create waits for a name, Rename for a
 * different one; the keyboard comes up with the alert. Nothing else on
 * screen moves: no sheet, no extra chrome to pad.
 */
export function MobileCollectionNameNativeSheet({
  visible,
  mode,
  initialName = "",
  strings,
  onClose,
  onDismiss,
  onSubmit: submit,
}: MobileCollectionNameNativeSheetProps) {
  const { scheme, tokens } = useNemuTheme();
  // The alert closes itself on either button; `open` follows that, so it
  // does not come back while `visible` waits for the save to finish.
  const [open, setOpen] = useState(visible);
  const [visibleSeen, setVisibleSeen] = useState(visible);
  if (visible !== visibleSeen) {
    setVisibleSeen(visible);
    if (visible) setOpen(true);
  }
  // The caller's "sheet finished dismissing" hook (queued follow-ups such as
  // showing the new collection): an alert is gone once `visible` drops.
  const wasVisibleRef = useRef(visible);
  useEffect(() => {
    if (wasVisibleRef.current && !visible) onDismiss?.();
    wasVisibleRef.current = visible;
  }, [onDismiss, visible]);
  const creating = mode === "create";

  return (
    <View
      pointerEvents="none"
      style={styles.alertHost}
      testID={creating ? "NewCollectionSheet" : "RenameCollectionSheet"}
    >
      <SwiftHost colorScheme={scheme} seedColor={tokens.primary} style={StyleSheet.absoluteFill}>
        <NativeNameAlert
          presented={visible && open}
          title={creating ? strings.library.newCollection : strings.library.renameCollection}
          message={creating ? strings.library.newCollectionDescription : strings.library.renameDescription}
          placeholder={strings.library.collectionName}
          initialValue={initialName}
          confirmLabel={creating ? strings.common.create : strings.common.save}
          cancelLabel={strings.common.cancel}
          requireChange={!creating}
          onConfirm={(name) => {
            setOpen(false);
            submit(name);
          }}
          onCancel={() => {
            setOpen(false);
            onClose();
          }}
        >
          <SwiftText modifiers={[tint(tokens.primary), opacity(0), accessibilityHidden(true)]}> </SwiftText>
        </NativeNameAlert>
      </SwiftHost>
    </View>
  );
}

/**
 * Every collection on the grouped background: "New Collection…" heads the
 * same group (Music's "Add to Playlist", Photos' "Add to Album"), then one
 * compact row per collection — its name, the book count trailing (Mail's
 * mailbox list) and a checkmark on the one showing. Tap a row to open it;
 * swipe or touch and hold to rename or remove. Naming, renaming and the
 * removal confirmation are alerts over the sheet, so it stays open and the
 * list updates in place.
 */
export function MobileCollectionsManagerNativeSheet({
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
}: MobileCollectionsManagerNativeSheetProps) {
  const { tokens } = useNemuTheme();
  const { fontScale, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const busy = isMobileCollectionActionBusy(actionState);
  const [creatingName, setCreatingName] = useState(false);
  const [renameTarget, setRenameTarget] = useState<LocalCollection | null>(null);
  const [removeTarget, setRemoveTarget] = useState<LocalCollection | null>(null);
  const colors = nativeGroupedRowColors;
  const rowBackground = listRowBackground(colors.rowBackground);

  return (
    <MobileNativeFormSheet
      visible={visible}
      onClose={onClose}
      onDismiss={onDismiss}
      title={strings.library.manageCollections}
      detents={getMobileCollectionListNativeDetents({
        collectionCount: collections.length,
        fontScale,
        height,
        topInset: insets.top,
      })}
      background="grouped"
      interactiveDismissDisabled={busy}
      closeAccessibilityLabel={strings.common.done}
      testID="CollectionsManagerSheet"
      formKey={collections.map((collection) => collection.collectionId).join("|")}
      wrapForm={(form) => (
        <NativeNameAlert
          presented={creatingName}
          title={strings.library.newCollection}
          message={strings.library.newCollectionDescription}
          placeholder={strings.library.collectionName}
          confirmLabel={strings.common.create}
          cancelLabel={strings.common.cancel}
          onConfirm={(name) => {
            setCreatingName(false);
            onCreate(name);
          }}
          onCancel={() => setCreatingName(false)}
        >
          <NativeNameAlert
            presented={renameTarget !== null}
            title={strings.library.renameCollection}
            message={strings.library.renameDescription}
            placeholder={strings.library.collectionName}
            initialValue={renameTarget?.name ?? ""}
            confirmLabel={strings.common.save}
            cancelLabel={strings.common.cancel}
            requireChange
            onConfirm={(name) => {
              const target = renameTarget;
              setRenameTarget(null);
              if (target) onRename(target, name);
            }}
            onCancel={() => setRenameTarget(null)}
          >
            <NativeDestructiveDialog
              presented={removeTarget !== null}
              title={formatMobileString(strings.library.removeCollectionNamed, {
                name: removeTarget?.name ?? "",
              })}
              message={strings.library.removeCollectionConfirm}
              confirmLabel={strings.common.remove}
              cancelLabel={strings.common.cancel}
              onConfirm={() => {
                const target = removeTarget;
                setRemoveTarget(null);
                if (target) onRemove(target);
              }}
              onCancel={() => setRemoveTarget(null)}
            >
              {form}
            </NativeDestructiveDialog>
          </NativeNameAlert>
        </NativeNameAlert>
      )}
    >
      <SwiftSection
        footer={
          <SwiftText>
            {collections.length
              ? strings.collectionMembership.manageRowsFooter
              : strings.collectionMembership.noCollectionsYet}
          </SwiftText>
        }
      >
        {actionState.creating ? (
          <SwiftHStack spacing={10} modifiers={[rowBackground]}>
            <SwiftProgressView />
            <SwiftText modifiers={[foregroundStyle(colors.detail)]}>
              {strings.library.newCollection}
            </SwiftText>
          </SwiftHStack>
        ) : (
          <SwiftButton
            label={strings.collectionMembership.newCollectionAction}
            systemImage="plus"
            onPress={() => setCreatingName(true)}
            modifiers={[rowBackground, ...(busy ? [swiftDisabled(true)] : [])]}
          />
        )}
        {collections.map((collection) => {
          const count = collectionCount(collection.collectionId, membership);
          const countLabel = bookCountText(count, strings);
          return (
            <SwiftSwipeActions key={collection.collectionId}>
              <SwiftContextMenu>
                <SwiftContextMenu.Trigger>
                  <NativeCheckRow
                    title={collection.name}
                    value={String(count)}
                    systemImage="rectangle.stack"
                    selectedSystemImage="rectangle.stack.fill"
                    selected={selectedCollectionId === collection.collectionId}
                    disabled={busy}
                    tintColor={tokens.primary}
                    textColor={colors.text}
                    detailColor={colors.detail}
                    rowBackground={colors.rowBackground}
                    accessibilityLabel={formatMobileString(strings.library.collectionChipAccessibility, {
                      name: collection.name,
                      countLabel,
                    })}
                    onPress={() => onSelect(collection.collectionId)}
                  />
                </SwiftContextMenu.Trigger>
                <SwiftContextMenu.Items>
                  <SwiftButton
                    label={strings.collectionMembership.renameAction}
                    systemImage="pencil"
                    onPress={() => setRenameTarget(collection)}
                  />
                  <SwiftButton
                    label={strings.library.removeCollection}
                    systemImage="trash"
                    role="destructive"
                    onPress={() => setRemoveTarget(collection)}
                    modifiers={[tint(tokens.danger)]}
                  />
                </SwiftContextMenu.Items>
              </SwiftContextMenu>
              {/*
                No destructive role here: SwiftUI animates a destructive swipe
                action's row away at once, before the confirmation, and the
                Form's row count then disagrees with its data (a
                UICollectionView batch-update crash). The red tint marks it.
              */}
              <SwiftSwipeActions.Actions edge="trailing" allowsFullSwipe={false}>
                <SwiftButton
                  label={strings.common.remove}
                  systemImage="trash"
                  onPress={() => setRemoveTarget(collection)}
                  modifiers={[tint(tokens.danger)]}
                />
                <SwiftButton
                  label={strings.collectionMembership.renameAction}
                  systemImage="pencil"
                  onPress={() => setRenameTarget(collection)}
                  modifiers={[tint(tokens.primary)]}
                />
              </SwiftSwipeActions.Actions>
            </SwiftSwipeActions>
          );
        })}
      </SwiftSection>
    </MobileNativeFormSheet>
  );
}

const styles = StyleSheet.create({
  alertHost: {
    position: "absolute",
    left: 0,
    top: 0,
    width: 1,
    height: 1,
  },
});
