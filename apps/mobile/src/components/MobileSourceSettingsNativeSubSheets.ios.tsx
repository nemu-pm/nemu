import { useState } from "react";
import { useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Button as SwiftButton,
  HStack as SwiftHStack,
  Section as SwiftSection,
  Spacer as SwiftSpacer,
  Text as SwiftText,
  TextField as SwiftTextField,
  useNativeState,
} from "@expo/ui/swift-ui";
import {
  accessibilityLabel as swiftAccessibilityLabel,
  autocorrectionDisabled,
  buttonStyle,
  disabled as swiftDisabled,
  foregroundStyle,
  labelStyle,
  lineLimit,
  listRowBackground,
  onSubmit,
  submitLabel,
  textInputAutocapitalization,
  tint,
} from "@expo/ui/swift-ui/modifiers";
import {
  MAX_SOURCE_SETTING_VALUE_ARRAY_ITEMS,
  MAX_SOURCE_SETTING_VALUE_STRING_LENGTH,
  MAX_SOURCE_SETTING_VALUES_STRING_CHARS,
  moveSourceSettingListItem,
} from "@nemu/core";
import { useNemuTheme } from "@/design-system";
import { hapticPress, hapticSelection } from "@/lib/haptics";
import { formatMobileString } from "@/lib/mobileI18n";
import { MOBILE_NATIVE_FORM_ROW, getMobileNativeFormSheetHeight } from "@/lib/mobileNativeFormSheetLayout";
import { MOBILE_SOURCE_OPTION_SHEET_SCROLL_LIMIT } from "@/lib/mobileSourceOptionSheetFrame";
import { MobileNativeFormSheet } from "./MobileNativeFormSheet";
import { nativeGroupedRowColors } from "./MobileNativeFormSheetColors";
import { NativeCheckRow } from "./MobileNativeFormSheetParts.ios";
import type {
  MobileSourceMultiSelectNativeSheetProps,
  MobileSourceStringListNativeSheetProps,
} from "./MobileSourceSettingsNativeSubSheets.types";

export const mobileSourceSettingsNativeSubSheetsAvailable = true;

/**
 * The sheet's detent: as tall as its rows while they fit; a long list (more
 * than the option sheet's scroll limit) stops at 80% of the window and the
 * Form scrolls, as the React Native sheet did. Sized from the rows the sheet
 * opened with, so a growing list never resizes it mid-presentation.
 */
function useSubSheetDetent(rows: number, footer: string | undefined) {
  const { fontScale, height, width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [initialRows] = useState(rows);
  const maxHeight = height - insets.top;
  return getMobileNativeFormSheetHeight({
    sections: [{ rows: Array.from({ length: initialRows }, () => MOBILE_NATIVE_FORM_ROW), footer }],
    sheetWidth: Math.min(width - insets.left - insets.right - 16, 620),
    fontScale,
    maxHeight: initialRows > MOBILE_SOURCE_OPTION_SHEET_SCROLL_LIMIT ? Math.round(height * 0.8) : maxHeight,
    tightTop: true,
    bottomInset: insets.bottom,
  });
}

/**
 * A multi- (or single-) select source setting as a native sheet: the
 * setting's name in the bar with ✕, one checkmark row per option, its
 * description as the footer. Every tap applies at once.
 */
export function MobileSourceMultiSelectNativeSheet({
  setting,
  options,
  selectedValues,
  visible,
  single,
  disabled,
  strings,
  onToggle,
  onClose,
  onDismiss,
}: MobileSourceMultiSelectNativeSheetProps) {
  const { tokens } = useNemuTheme();
  const colors = nativeGroupedRowColors;
  const sheetHeight = useSubSheetDetent(options.length, setting.subtitle);
  return (
    <MobileNativeFormSheet
      visible={visible}
      onClose={onClose}
      onDismiss={onDismiss}
      title={setting.title}
      detents={[{ height: sheetHeight }, "large"]}
      background="grouped"
      padSizing="form"
      closeAccessibilityLabel={strings.common.close}
      testID="MobileSourceMultiSelectSheet"
    >
      <SwiftSection footer={setting.subtitle ? <SwiftText>{setting.subtitle}</SwiftText> : undefined}>
        {options.map((option, index) => {
          const selected = selectedValues.includes(option.value);
          return (
            <NativeCheckRow
              key={`${option.value}:${index}`}
              title={option.label}
              selected={selected}
              disabled={disabled}
              tintColor={tokens.primary}
              textColor={colors.text}
              detailColor={colors.detail}
              rowBackground={colors.rowBackground}
              accessibilityLabel={formatMobileString(strings.settings.sourceSettingsToggleOption, {
                name: setting.title,
                option: option.label,
              })}
              onPress={() => {
                if (disabled || (single && selected)) return;
                void hapticSelection();
                onToggle(option.value);
              }}
            />
          );
        })}
      </SwiftSection>
    </MobileNativeFormSheet>
  );
}

/**
 * A string-list source setting (blocked group IDs and the like) as a native
 * sheet: the setting's name in the bar with ✕, a field with an add button,
 * then the entries in order, each with Move Up / Move Down and a remove
 * button. Every change applies at once.
 */
export function MobileSourceStringListNativeSheet({
  setting,
  items,
  visible,
  disabled,
  strings,
  onAdd,
  onRemove,
  onMove,
  onClose,
  onDismiss,
}: MobileSourceStringListNativeSheetProps) {
  const { tokens } = useNemuTheme();
  const colors = nativeGroupedRowColors;
  const row = listRowBackground(colors.rowBackground);
  const draftState = useNativeState("");
  const [draft, setDraft] = useState("");
  const sheetHeight = useSubSheetDetent(1 + Math.max(1, items.length) + 1, setting.subtitle);
  const trimmedDraft = draft.trim();
  const remainingListStringChars = Math.max(
    0,
    MAX_SOURCE_SETTING_VALUES_STRING_CHARS -
      setting.key.length -
      items.reduce((total, item) => total + item.length, 0),
  );
  const listIsFull =
    items.length >= MAX_SOURCE_SETTING_VALUE_ARRAY_ITEMS || remainingListStringChars === 0;
  const draftIsTooLong = trimmedDraft.length > remainingListStringChars;
  const addDisabled = disabled || !trimmedDraft || listIsFull || draftIsTooLong;

  const addDraft = () => {
    if (addDisabled) return;
    onAdd(trimmedDraft);
    setDraft("");
    draftState.set("");
    void hapticPress();
  };
  const moveItem = (fromIndex: number, toIndex: number) => {
    if (disabled) return;
    if (!moveSourceSettingListItem(items, fromIndex, toIndex)) return;
    onMove(fromIndex, toIndex);
    void hapticPress();
  };
  // Several buttons in one Form row: each keeps its own hit area.
  const iconButton = (
    label: string,
    systemImage: string,
    isDisabled: boolean,
    onPress: () => void,
    color?: string,
  ) => (
    <SwiftButton
      label={label}
      systemImage={systemImage as never}
      onPress={onPress}
      modifiers={[
        labelStyle("iconOnly"),
        buttonStyle("borderless"),
        ...(color ? [tint(color)] : []),
        ...(isDisabled ? [swiftDisabled(true)] : []),
      ]}
    />
  );

  return (
    <MobileNativeFormSheet
      visible={visible}
      onClose={onClose}
      onDismiss={onDismiss}
      title={setting.title}
      detents={[{ height: sheetHeight }, "large"]}
      background="grouped"
      padSizing="form"
      closeAccessibilityLabel={strings.common.close}
      testID="MobileSourceStringListSheet"
    >
      <SwiftSection>
        <SwiftHStack spacing={12} modifiers={[row]}>
          <SwiftTextField
            text={draftState}
            placeholder={setting.placeholder ?? setting.title}
            maxLength={Math.min(MAX_SOURCE_SETTING_VALUE_STRING_LENGTH, remainingListStringChars)}
            onTextChange={setDraft}
            modifiers={[
              swiftAccessibilityLabel(setting.title),
              textInputAutocapitalization("never"),
              autocorrectionDisabled(),
              submitLabel("done"),
              onSubmit(addDraft),
              ...(disabled ? [swiftDisabled(true)] : []),
            ]}
          />
          {iconButton(`${strings.common.add} ${setting.title}`, "plus.circle.fill", addDisabled, addDraft)}
        </SwiftHStack>
      </SwiftSection>
      <SwiftSection footer={setting.subtitle ? <SwiftText>{setting.subtitle}</SwiftText> : undefined}>
        {items.length ? (
          items.map((item, index) => (
            <SwiftHStack key={`${item}:${index}`} spacing={16} modifiers={[row]}>
              <SwiftText modifiers={[foregroundStyle(colors.text), lineLimit(1)]}>{item}</SwiftText>
              <SwiftSpacer />
              {iconButton(`${strings.common.moveUp} ${item}`, "chevron.up", disabled || index === 0, () =>
                moveItem(index, index - 1),
              )}
              {iconButton(
                `${strings.common.moveDown} ${item}`,
                "chevron.down",
                disabled || index === items.length - 1,
                () => moveItem(index, index + 1),
              )}
              {iconButton(
                `${strings.common.remove} ${item}`,
                "minus.circle.fill",
                disabled,
                () => {
                  if (disabled) return;
                  void hapticSelection();
                  onRemove(index);
                },
                tokens.danger,
              )}
            </SwiftHStack>
          ))
        ) : (
          <SwiftText modifiers={[foregroundStyle(colors.detail), row]}>{strings.settings.sourceSettingsNone}</SwiftText>
        )}
      </SwiftSection>
    </MobileNativeFormSheet>
  );
}
