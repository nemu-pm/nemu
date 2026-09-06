import { useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import {
  GlassSurface,
  MobileChip,
  MobileSheetScaffold,
  NemuButton,
  NemuPressable,
  nemuFontWeight,
  radius,
  useNemuTheme,
} from "@/design-system";
import type { SourcePackageSetting } from "@/data/schema";
import { hapticPress } from "@/lib/haptics";
import { formatMobileString, type MobileStrings } from "@/lib/mobileI18n";
import {
  MAX_SOURCE_SETTING_VALUE_ARRAY_ITEMS,
  MAX_SOURCE_SETTING_VALUE_STRING_LENGTH,
  MAX_SOURCE_SETTING_VALUES_STRING_CHARS,
} from "@nemu/core";

/**
 * Full-sheet presentations for the two richest source setting kinds. The
 * settings card collapses each of them into one picker row (summary +
 * chevron); tapping it hands off to one of these sheets, so a MangaDex-shaped
 * form no longer crowds its host sheet with inline pill grids and UUID chip
 * editors. Both apply every change immediately — there is no confirm step.
 */

/** Options lists beyond this many rows scroll inside a bounded detent. */
const SCROLLING_OPTION_LIMIT = 6;

/**
 * The sheet only ever needs a heading and a footnote from its subject, so a
 * `SourcePackageSetting` and a source browse filter group can both drive it.
 */
export type MobileSourceOptionSheetSubject = {
  title: string;
  subtitle?: string;
};

export function MobileSourceMultiSelectSheet({
  setting,
  options,
  selectedValues,
  visible,
  single,
  allowReselect = false,
  disabled,
  strings,
  optionHint,
  formatOptionAccessibilityLabel,
  onToggle,
  onLongPressOption,
  onClose,
  onDismiss,
}: {
  setting: MobileSourceOptionSheetSubject;
  options: Array<{ label: string; value: string }>;
  selectedValues: string[];
  visible: boolean;
  single: boolean;
  /**
   * Single-choice rows normally swallow a tap on the current selection. Sort
   * groups reuse that tap to flip the sort direction, so they opt back in.
   */
  allowReselect?: boolean;
  disabled: boolean;
  strings: MobileStrings;
  optionHint?: string;
  formatOptionAccessibilityLabel?: (option: {
    label: string;
    value: string;
  }) => string;
  onToggle: (value: string) => void;
  /** Tri-state groups hang their "exclude" affordance off a long press. */
  onLongPressOption?: (value: string) => void;
  onClose: () => void;
  onDismiss?: () => void;
}) {
  const { tokens } = useNemuTheme();
  // Long option lists (MangaDex's excluded tags) cannot fit a content-sized
  // detent, so they present inside a bounded, scrollable one instead; short
  // lists keep hugging their content.
  const frameMaxHeight =
    options.length > SCROLLING_OPTION_LIMIT ? "80%" : undefined;

  return (
    <MobileSheetScaffold
      visible={visible}
      onRequestClose={onClose}
      onDismiss={onDismiss}
      title={setting.title}
      dismissLabel={strings.common.done}
      {...(frameMaxHeight ? { frameMaxHeight } : null)}
    >
      <GlassSurface
        style={styles.optionGroup}
        contentStyle={styles.optionGroupContent}
      >
        {options.map((option, index) => {
          const selected = selectedValues.includes(option.value);
          return (
            <NemuPressable
              key={`${option.value}:${index}`}
              accessibilityLabel={
                formatOptionAccessibilityLabel?.(option) ??
                formatMobileString(
                  strings.settings.sourceSettingsToggleOption,
                  {
                    name: setting.title,
                    option: option.label,
                  },
                )
              }
              accessibilityHint={optionHint}
              accessibilityRole={single ? "radio" : "checkbox"}
              accessibilityState={{ checked: selected, disabled }}
              delayLongPress={260}
              disabled={disabled}
              hapticFeedback={
                disabled || (single && selected && !allowReselect)
                  ? "none"
                  : "selection"
              }
              onPress={() => {
                if (single && selected && !allowReselect) return;
                onToggle(option.value);
              }}
              onLongPress={
                onLongPressOption
                  ? () => onLongPressOption(option.value)
                  : undefined
              }
              pressedScale={0.99}
              style={[
                styles.optionRow,
                index < options.length - 1
                  ? {
                      borderBottomColor: tokens.border,
                      borderBottomWidth: StyleSheet.hairlineWidth,
                    }
                  : null,
              ]}
            >
              <Text
                numberOfLines={1}
                style={[
                  styles.optionText,
                  {
                    color: selected ? tokens.primary : tokens.foreground,
                    fontWeight: selected
                      ? nemuFontWeight.semibold
                      : nemuFontWeight.regular,
                  },
                ]}
              >
                {option.label}
              </Text>
              <View style={styles.optionAccessory}>
                {selected ? (
                  <Ionicons
                    name="checkmark-outline"
                    size={18}
                    color={tokens.primary}
                  />
                ) : null}
              </View>
            </NemuPressable>
          );
        })}
      </GlassSurface>
      {setting.subtitle ? (
        <Text style={[styles.footnote, { color: tokens.mutedForeground }]}>
          {setting.subtitle}
        </Text>
      ) : null}
    </MobileSheetScaffold>
  );
}

export function MobileSourceStringListSheet({
  setting,
  items,
  visible,
  disabled,
  strings,
  onAdd,
  onRemove,
  onClose,
  onDismiss,
}: {
  setting: SourcePackageSetting;
  items: string[];
  visible: boolean;
  disabled: boolean;
  strings: MobileStrings;
  onAdd: (item: string) => void;
  onRemove: (index: number) => void;
  onClose: () => void;
  onDismiss?: () => void;
}) {
  const { tokens } = useNemuTheme();
  const [draft, setDraft] = useState("");
  // The detent style is fixed for the whole presentation: switching between a
  // content-sized and a bounded detent mid-session would fight the native
  // sheet's memoized presentation inputs as the chip list grows.
  const [initialItemCount] = useState(items.length);
  const frameMaxHeight = initialItemCount > SCROLLING_OPTION_LIMIT
    ? "80%"
    : undefined;
  const trimmedDraft = draft.trim();
  const remainingListStringChars = Math.max(
    0,
    MAX_SOURCE_SETTING_VALUES_STRING_CHARS -
      setting.key.length -
      items.reduce((total, item) => total + item.length, 0),
  );
  const listIsFull =
    items.length >= MAX_SOURCE_SETTING_VALUE_ARRAY_ITEMS ||
    remainingListStringChars === 0;
  const draftIsTooLong = trimmedDraft.length > remainingListStringChars;
  const addDisabled = disabled || !trimmedDraft || listIsFull || draftIsTooLong;

  const addDraft = () => {
    if (addDisabled) return;
    onAdd(trimmedDraft);
    setDraft("");
    void hapticPress();
  };

  return (
    <MobileSheetScaffold
      visible={visible}
      onRequestClose={onClose}
      onDismiss={onDismiss}
      title={setting.title}
      dismissLabel={strings.common.done}
      {...(frameMaxHeight ? { frameMaxHeight } : null)}
    >
      <View style={styles.editorInputRow}>
        <GlassSurface
          style={styles.editorInputShell}
          contentStyle={styles.editorInputContent}
        >
          <TextInput
            accessibilityLabel={setting.title}
            autoCapitalize="none"
            autoCorrect={false}
            editable={!disabled}
            maxLength={Math.min(
              MAX_SOURCE_SETTING_VALUE_STRING_LENGTH,
              remainingListStringChars,
            )}
            returnKeyType="done"
            value={draft}
            onChangeText={setDraft}
            onSubmitEditing={addDraft}
            placeholder={setting.placeholder ?? setting.title}
            placeholderTextColor={tokens.mutedForeground}
            selectionColor={tokens.primary}
            style={[styles.editorInput, { color: tokens.foreground }]}
          />
        </GlassSurface>
        <NemuButton
          accessibilityLabel={`${strings.common.add} ${setting.title}`}
          accessibilityState={{ disabled: addDisabled }}
          disabled={addDisabled}
          icon="add-outline"
          onPress={addDraft}
          size="icon-sm"
          variant="default"
        />
      </View>
      {items.length ? (
        <View style={styles.editorItems}>
          {items.map((item, index) => (
            <MobileChip
              key={`${item}:${index}`}
              accessibilityRole="button"
              accessibilityLabel={`${strings.common.remove} ${item}`}
              accessibilityState={{ disabled }}
              disabled={disabled}
              label={item}
              onPress={() => onRemove(index)}
              trailingIcon="close-outline"
              variant="toggle"
            />
          ))}
        </View>
      ) : (
        <Text style={[styles.footnote, { color: tokens.mutedForeground }]}>
          {strings.settings.sourceSettingsNone}
        </Text>
      )}
      {setting.subtitle ? (
        <Text style={[styles.footnote, { color: tokens.mutedForeground }]}>
          {setting.subtitle}
        </Text>
      ) : null}
    </MobileSheetScaffold>
  );
}

const styles = StyleSheet.create({
  optionGroup: {
    borderRadius: radius.xl,
  },
  optionGroupContent: {
    paddingHorizontal: 0,
    paddingVertical: 0,
  },
  optionRow: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 14,
  },
  optionText: {
    flex: 1,
    minWidth: 0,
    fontSize: 15,
    lineHeight: 20,
  },
  optionAccessory: {
    width: 24,
    alignItems: "flex-end",
    justifyContent: "center",
  },
  editorInputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  editorInputShell: {
    flex: 1,
    minHeight: 38,
    borderRadius: radius.md,
  },
  editorInputContent: {
    paddingHorizontal: 10,
  },
  editorInput: {
    minHeight: 38,
    fontSize: 13,
  },
  editorItems: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  footnote: {
    fontSize: 12,
    lineHeight: 16,
  },
});
