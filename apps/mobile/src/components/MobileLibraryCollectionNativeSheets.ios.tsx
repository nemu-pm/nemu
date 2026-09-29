import { useEffect, useRef, useState } from "react";
import { useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Button as SwiftButton,
  ContextMenu as SwiftContextMenu,
  Section as SwiftSection,
  SwipeActions as SwiftSwipeActions,
  Text as SwiftText,
  TextField as SwiftTextField,
  useNativeState,
} from "@expo/ui/swift-ui";
import {
  disabled as swiftDisabled,
  foregroundStyle,
  onSubmit,
  submitLabel,
  textInputAutocapitalization,
  tint,
} from "@expo/ui/swift-ui/modifiers";
import { useNemuTheme } from "@/design-system";
import {
  canCreateMobileCollection,
  canRenameMobileCollection,
  collectionCount,
  isMobileCollectionActionBusy,
  type MobileCollectionActionState,
} from "@/lib/mobileCollections";
import { formatMobileString, type MobileStrings } from "@/lib/mobileI18n";
import { getMobileLibraryOptionsNativeSheetHeight } from "@/lib/mobileLibraryOptionsSheetLayout";
import { MobileNativeFormSheet } from "./MobileNativeFormSheet";
import { NativeCheckRow } from "./MobileNativeFormSheetParts.ios";
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
 * Create / rename a collection: one text field in a short Form sheet, Cancel
 * and Create / Save in the bar (Reminders' "New List"), Return submits.
 */
export function MobileCollectionNameNativeSheet({
  visible,
  mode,
  initialName = "",
  strings,
  saving,
  onClose,
  onDismiss,
  onSubmit: submit,
}: MobileCollectionNameNativeSheetProps) {
  const { fontScale, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const textState = useNativeState(initialName);
  const [name, setName] = useState(initialName);
  const nameRef = useRef(initialName);
  const [visibleSeen, setVisibleSeen] = useState(visible);
  if (visible !== visibleSeen) {
    setVisibleSeen(visible);
    if (visible) setName(initialName);
  }
  useEffect(() => {
    if (!visible) return;
    textState.set(initialName);
    nameRef.current = initialName;
  }, [initialName, textState, visible]);
  const actionState: MobileCollectionActionState = {
    creating: mode === "create" ? saving : false,
    renaming: mode === "rename" ? saving : false,
    savingMembership: false,
    removing: false,
  };
  const valid = (value: string) =>
    mode === "create"
      ? canCreateMobileCollection(actionState, value)
      : canRenameMobileCollection(actionState, value, initialName);
  const trySubmit = () => {
    const value = nameRef.current;
    if (!valid(value)) return;
    submit(value.trim());
  };
  const sheetHeight = getMobileLibraryOptionsNativeSheetHeight({
    sections: [1],
    footerLines: 2,
    fontScale,
    maxHeight: height - insets.top,
  });

  return (
    <MobileNativeFormSheet
      visible={visible}
      onClose={() => {
        if (!saving) onClose();
      }}
      onDismiss={onDismiss}
      title={mode === "create" ? strings.library.newCollection : strings.library.renameCollection}
      detents={[{ height: sheetHeight }]}
      interactiveDismissDisabled={saving}
      cancel={{ label: strings.common.cancel, onPress: onClose, disabled: saving }}
      confirm={{
        label: mode === "create" ? strings.common.create : strings.common.save,
        onPress: trySubmit,
        disabled: !valid(name),
        busy: saving,
      }}
      testID={mode === "create" ? "NewCollectionSheet" : "RenameCollectionSheet"}
    >
      <SwiftSection
        footer={
          <SwiftText>
            {mode === "create" ? strings.library.newCollectionDescription : strings.library.renameDescription}
          </SwiftText>
        }
      >
        <SwiftTextField
          text={textState}
          autoFocus
          placeholder={strings.library.collectionName}
          onTextChange={(value) => {
            nameRef.current = value;
            setName(value);
          }}
          modifiers={[textInputAutocapitalization("words"), submitLabel("done"), onSubmit(trySubmit)]}
        />
      </SwiftSection>
    </MobileNativeFormSheet>
  );
}

/**
 * Every collection with its book count: "New Collection…" first (as in the
 * title's Collections sheet), tap a row to open it (checkmark on the one
 * showing), swipe or touch and hold to rename or remove.
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
  const busy = isMobileCollectionActionBusy(actionState);
  return (
    <MobileNativeFormSheet
      visible={visible}
      onClose={onClose}
      onDismiss={onDismiss}
      title={strings.library.manageCollections}
      detents={["medium", "large"]}
      closeAccessibilityLabel={strings.common.done}
      testID="CollectionsManagerSheet"
      formKey={collections.map((collection) => collection.collectionId).join("|")}
    >
      <SwiftSection>
        <SwiftButton
          label={strings.collectionMembership.newCollectionAction}
          systemImage="plus"
          onPress={onCreate}
          modifiers={busy ? [swiftDisabled(true)] : []}
        />
      </SwiftSection>
      <SwiftSection
        footer={collections.length ? <SwiftText>{strings.collectionMembership.manageRowsFooter}</SwiftText> : undefined}
      >
        {collections.length ? (
          collections.map((collection) => {
            const countLabel = bookCountText(collectionCount(collection.collectionId, membership), strings);
            return (
              <SwiftSwipeActions key={collection.collectionId}>
                <SwiftContextMenu>
                  <SwiftContextMenu.Trigger>
                    <NativeCheckRow
                      title={collection.name}
                      detail={countLabel}
                      systemImage="rectangle.stack"
                      selectedSystemImage="rectangle.stack.fill"
                      selected={selectedCollectionId === collection.collectionId}
                      disabled={busy}
                      tintColor={tokens.primary}
                        textColor={tokens.foreground}
                        detailColor={tokens.mutedForeground}
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
                      onPress={() => onRename(collection)}
                    />
                    <SwiftButton
                      label={strings.library.removeCollection}
                      systemImage="trash"
                      role="destructive"
                      onPress={() => onRemove(collection)}
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
                    onPress={() => onRemove(collection)}
                    modifiers={[tint(tokens.danger)]}
                  />
                  <SwiftButton
                    label={strings.collectionMembership.renameAction}
                    systemImage="pencil"
                    onPress={() => onRename(collection)}
                    modifiers={[tint(tokens.primary)]}
                  />
                </SwiftSwipeActions.Actions>
              </SwiftSwipeActions>
            );
          })
        ) : (
          <SwiftText modifiers={[foregroundStyle({ type: "hierarchical", style: "secondary" })]}>
            {strings.collectionMembership.noCollectionsYet}
          </SwiftText>
        )}
      </SwiftSection>
    </MobileNativeFormSheet>
  );
}
