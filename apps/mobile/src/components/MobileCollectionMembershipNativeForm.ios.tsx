import { useState } from "react";
import {
  Button as SwiftButton,
  ContextMenu as SwiftContextMenu,
  HStack as SwiftHStack,
  Label as SwiftLabel,
  ProgressView as SwiftProgressView,
  Section as SwiftSection,
  SwipeActions as SwiftSwipeActions,
  Text as SwiftText,
} from "@expo/ui/swift-ui";
import {
  disabled as swiftDisabled,
  foregroundStyle,
  listRowBackground,
  tint,
} from "@expo/ui/swift-ui/modifiers";
import { useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { LocalCollection } from "@/data/schema";
import { useNemuTheme } from "@/design-system";
import { formatMobileString } from "@/lib/mobileI18n";
import { getMobileCollectionListNativeDetents } from "@/lib/mobileLibrarySheetLayout";
import { MobileNativeFormSheet } from "./MobileNativeFormSheet";
import {
  NativeCheckRow,
  NativeDestructiveDialog,
  NativeNameAlert,
} from "./MobileNativeFormSheetParts.ios";
import { nativeGroupedRowColors } from "./MobileNativeFormSheetColors";
import type { MobileCollectionMembershipNativeFormProps } from "./MobileCollectionMembershipNativeForm.types";

export const mobileCollectionMembershipNativeFormAvailable = true;

/**
 * Collections for one title as a native sheet (Photos "Add to Album",
 * Reminders' list pickers) on the opaque grouped background: Cancel / Save
 * in the navigation bar, "New Collection" heading the group (an alert with a
 * name field), then every collection as a compact checkmark row with its
 * book count trailing. Rename and Delete are the row's swipe actions and its
 * context menu, not buttons crowded into every row.
 */
export function MobileCollectionMembershipNativeForm({
  visible,
  strings,
  subtitle,
  loading,
  rows,
  busy,
  saving,
  creating,
  saveDisabled,
  dirty,
  error,
  canRetry,
  retrying,
  onRetry,
  onToggle,
  onCreate,
  onRename,
  onRemove,
  onSave,
  onCancel,
  onClose,
  onDismiss,
}: MobileCollectionMembershipNativeFormProps) {
  const { tokens } = useNemuTheme();
  const { fontScale, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const colors = nativeGroupedRowColors;
  const rowBackground = listRowBackground(colors.rowBackground);
  const [creatingName, setCreatingName] = useState(false);
  const [renameTarget, setRenameTarget] = useState<LocalCollection | null>(null);
  const [removeTarget, setRemoveTarget] = useState<LocalCollection | null>(null);

  const renameLabel = strings.library.renameCollection;
  const removeLabel = strings.common.remove;

  return (
    <MobileNativeFormSheet
      visible={visible}
      onClose={onClose}
      onDismiss={onDismiss}
      title={strings.collectionMembership.title}
      subtitle={subtitle}
      detents={getMobileCollectionListNativeDetents({
        collectionCount: rows.length,
        fontScale,
        height,
        topInset: insets.top,
      })}
      background="grouped"
      interactiveDismissDisabled={dirty}
      cancel={{ label: strings.common.cancel, onPress: onCancel }}
      confirm={{ label: strings.common.save, onPress: onSave, disabled: saveDisabled, busy: saving }}
      testID="MobileCollectionMembershipSheet"
      formKey={rows.map((row) => row.collection.collectionId).join("|")}
      wrapForm={(form) => (
        <NativeNameAlert
          presented={creatingName}
          title={strings.collectionMembership.newCollection}
          message={strings.collectionMembership.newCollectionDescription}
          placeholder={strings.collectionMembership.collectionName}
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
            title={renameLabel}
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
              title={formatMobileString(strings.library.removeCollectionNamed, { name: removeTarget?.name ?? "" })}
              message={strings.library.removeCollectionConfirm}
              confirmLabel={removeLabel}
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
      {loading ? (
        <SwiftSection>
          <SwiftHStack spacing={10} modifiers={[rowBackground]}>
            <SwiftProgressView />
            <SwiftText modifiers={[foregroundStyle(colors.detail)]}>
              {strings.collectionMembership.loading}
            </SwiftText>
          </SwiftHStack>
        </SwiftSection>
      ) : (
        <>
          <SwiftSection
            footer={
              <SwiftText>
                {rows.length
                  ? strings.collectionMembership.manageRowsFooter
                  : strings.collectionMembership.noCollectionsYet}
              </SwiftText>
            }
          >
            {creating ? (
              <SwiftHStack spacing={10} modifiers={[rowBackground]}>
                <SwiftProgressView />
                <SwiftText modifiers={[foregroundStyle(colors.detail)]}>
                  {strings.collectionMembership.newCollection}
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
            {rows.length ? (
              rows.map(({ collection, count, countLabel, selected }) => (
                <SwiftSwipeActions key={collection.collectionId}>
                  <SwiftContextMenu>
                    <SwiftContextMenu.Trigger>
                      <NativeCheckRow
                        title={collection.name}
                        value={String(count)}
                        systemImage="rectangle.stack"
                        selectedSystemImage="rectangle.stack.fill"
                        selected={selected}
                        disabled={busy}
                        tintColor={tokens.primary}
                        textColor={colors.text}
                        detailColor={colors.detail}
                        rowBackground={colors.rowBackground}
                        accessibilityLabel={formatMobileString(
                          strings.collectionMembership.collectionRowAccessibility,
                          { name: collection.name, countLabel },
                        )}
                        onPress={() => onToggle(collection.collectionId)}
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
                      label={removeLabel}
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
              ))
            ) : null}
          </SwiftSection>
          {error ? (
            <SwiftSection>
              <SwiftLabel
                title={error}
                systemImage="exclamationmark.triangle"
                color={tokens.danger}
                modifiers={[foregroundStyle(tokens.danger), rowBackground]}
              />
              {canRetry ? (
                retrying ? (
                  <SwiftProgressView modifiers={[rowBackground]} />
                ) : (
                  <SwiftButton
                    label={strings.common.retry}
                    systemImage="arrow.clockwise"
                    onPress={onRetry}
                    modifiers={[rowBackground]}
                  />
                )
              ) : null}
            </SwiftSection>
          ) : null}
        </>
      )}
    </MobileNativeFormSheet>
  );
}
