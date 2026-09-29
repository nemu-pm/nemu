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
import { foregroundStyle, tint } from "@expo/ui/swift-ui/modifiers";
import type { LocalCollection } from "@/data/schema";
import { useNemuTheme } from "@/design-system";
import { formatMobileString } from "@/lib/mobileI18n";
import { MobileNativeFormSheet } from "./MobileNativeFormSheet";
import { NativeCheckRow, NativeDestructiveDialog, NativeNameAlert } from "./MobileNativeFormSheetParts.ios";
import type { MobileCollectionMembershipNativeFormProps } from "./MobileCollectionMembershipNativeForm.types";

export const mobileCollectionMembershipNativeFormAvailable = true;

/**
 * Collections for one title as a native sheet (Photos "Add to Album",
 * Reminders' list pickers): Cancel / Save in the navigation bar, "New
 * Collection" as the first row (an alert with a name field), then every
 * collection as a checkmark row. Rename and Delete are the row's swipe
 * actions and its context menu, not buttons crowded into every row.
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
      detents={["medium", "large"]}
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
          <SwiftHStack spacing={10}>
            <SwiftProgressView />
            <SwiftText modifiers={[foregroundStyle({ type: "hierarchical", style: "secondary" })]}>
              {strings.collectionMembership.loading}
            </SwiftText>
          </SwiftHStack>
        </SwiftSection>
      ) : (
        <>
          <SwiftSection>
            {creating ? (
              <SwiftHStack spacing={10}>
                <SwiftProgressView />
                <SwiftText>{strings.collectionMembership.newCollection}</SwiftText>
              </SwiftHStack>
            ) : (
              <SwiftButton
                label={strings.collectionMembership.newCollectionAction}
                systemImage="plus"
                onPress={() => setCreatingName(true)}
                modifiers={busy ? [tint(tokens.mutedForeground)] : []}
              />
            )}
          </SwiftSection>
          <SwiftSection
            footer={
              rows.length ? (
                <SwiftText>{strings.collectionMembership.manageRowsFooter}</SwiftText>
              ) : undefined
            }
          >
            {rows.length ? (
              rows.map(({ collection, countLabel, selected }) => (
                <SwiftSwipeActions key={collection.collectionId}>
                  <SwiftContextMenu>
                    <SwiftContextMenu.Trigger>
                      <NativeCheckRow
                        title={collection.name}
                        detail={countLabel}
                        systemImage="rectangle.stack"
                        selectedSystemImage="rectangle.stack.fill"
                        selected={selected}
                        disabled={busy}
                        tintColor={tokens.primary}
                        textColor={tokens.foreground}
                        detailColor={tokens.mutedForeground}
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
            ) : (
              <SwiftText modifiers={[foregroundStyle({ type: "hierarchical", style: "secondary" })]}>
                {strings.collectionMembership.noCollectionsYet}
              </SwiftText>
            )}
          </SwiftSection>
          {error ? (
            <SwiftSection>
              <SwiftLabel
                title={error}
                systemImage="exclamationmark.triangle"
                color={tokens.danger}
                modifiers={[foregroundStyle(tokens.danger)]}
              />
              {canRetry ? (
                retrying ? (
                  <SwiftProgressView />
                ) : (
                  <SwiftButton label={strings.common.retry} systemImage="arrow.clockwise" onPress={onRetry} />
                )
              ) : null}
            </SwiftSection>
          ) : null}
        </>
      )}
    </MobileNativeFormSheet>
  );
}
