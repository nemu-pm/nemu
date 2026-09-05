import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import {
  Button as SwiftButton,
  HStack as SwiftHStack,
  Host as SwiftHost,
  Image as SwiftImage,
  Menu as SwiftMenu,
  Text as SwiftText,
} from "@expo/ui/swift-ui";
import { MenuView, type MenuAction } from "@expo/ui/community/menu";
import {
  buttonStyle,
  controlSize,
  disabled as swiftDisabled,
  font as swiftFont,
  foregroundStyle,
  frame,
  tint,
} from "@expo/ui/swift-ui/modifiers";
import { MobileInlineErrorBanner } from "@/components/MobileInlineErrorBanner";
import { MobileSourceLoginSheet } from "@/components/MobileSourceLoginSheet";
import {
  createNemuButtonDepthStyle,
  getNemuButtonDepthVisual,
  NemuButton,
  NemuNativeSwitch,
  radius,
  nemuFontWeight,
  useNemuTheme,
  GlassSurface,
  NemuPressable,
  NemuText,
} from "@/design-system";
import { useMobileLanguageSettings } from "@/data/mobileHooks";
import type { SourcePackageSetting } from "@/data/schema";
import { hapticPress, hapticSelection } from "@/lib/haptics";
import { canRunMobileSwitchSelectionFeedback } from "@/lib/mobileAccessibility";
import {
  formatMobileString,
  formatMobileSourceItemListCount,
  getMobileStrings,
  type MobileStrings,
} from "@/lib/mobileI18n";
import { compactMobileLabelList } from "@/lib/mobileInstalledSourcePresentation";
import { useMobileSourceLoginSubmission } from "@/lib/useMobileSourceLoginSubmission";
import {
  canRunMobileSourceTextSettingBlurFeedback,
  canSelectMobileSourceSettingOption,
  describeSourceSettingValue,
  flattenVisibleEditableSourceSettings,
  formatSourceSettingSliderValue,
  formatSourceSettingAccessibilityLabel,
  getSourceSegmentIndex,
  getSourceSegmentOptions,
  getSourceSettingOptions,
  getSourceSettingValue,
  hasVisibleSourceSettingRows,
  isRenderableSourceSetting,
  isSourceSettingVisible,
  type MobileSourceSettingFeatureFlags,
} from "@/lib/mobileSourceSettings";
import {
  isMobileSourceLoggedIn,
  isMobileSourceLoginSetting,
  isMobileSourceOAuthCallbackSchemeSupported,
  mobileSourceLoginMethod,
  runMobileSourceOAuthLogin,
  type MobileSourceLoginSetting,
} from "@/lib/mobileSourceOAuth";
import type { MobileSourceLoginSubmission } from "@/lib/mobileSourceSettingActions";
import {
  isMobileSourceLoginCancellation,
  type MobileSourceLoginCapabilities,
} from "@/sources/mobileSourceSettingsExecutor";
import { sanitizeMobileSourceSettings } from "@/sources/mobileSourceSettingsSafety";
import {
  MAX_SOURCE_SETTING_VALUE_ARRAY_ITEMS,
  MAX_SOURCE_SETTING_VALUE_STRING_LENGTH,
  MAX_SOURCE_SETTING_VALUES_STRING_CHARS,
  sanitizeSourceSettingValues,
} from "@nemu/core";

const EMPTY_SETTING_FEATURES: MobileSourceSettingFeatureFlags = {};
const SLIDER_VALUE_LABEL_WIDTH = 48;

type MobileSourceSettingsCardProps = {
  settings: SourcePackageSetting[];
  values: Record<string, unknown>;
  features?: MobileSourceSettingFeatureFlags;
  loading?: boolean;
  error?: string | null;
  title?: string;
  subtitle?: string;
  hideSubtitle?: boolean;
  emptyMessage?: string;
  showEmpty?: boolean;
  disabled?: boolean;
  navigationResetKey?: string | number | null;
  loginCapabilities?: MobileSourceLoginCapabilities | null;
  onChange: (
    key: string,
    value: unknown,
    setting: SourcePackageSetting,
  ) => void;
  onAction?: (setting: SourcePackageSetting) => void;
  onLogin?: (
    setting: SourcePackageSetting,
    submission: MobileSourceLoginSubmission,
    options?: { signal?: AbortSignal },
  ) => Promise<string | null> | string | null;
  onLogout?: (setting: SourcePackageSetting) => void;
  onRetry?: () => void;
  onReset?: () => void;
  retryDisabled?: boolean;
  retrying?: boolean;
  onEmbeddedBackHandlerChange?: (handler: (() => void) | null) => void;
  /**
   * Full-sheet handoffs for the richest setting kinds. When provided, the
   * card renders those rows as picker buttons and the host layers the
   * dedicated sheet (with a dismiss-then-present animation); when absent the
   * card keeps its inline presentations.
   */
  onRequestLoginSheet?: (setting: SourcePackageSetting) => void;
  onRequestMultiSelectSheet?: (setting: SourcePackageSetting) => void;
  onRequestStringListSheet?: (setting: SourcePackageSetting) => void;
};

function settingValue(
  setting: SourcePackageSetting,
  values: Record<string, unknown>,
): unknown {
  return getSourceSettingValue(setting, values);
}

function numericSettingValue(
  setting: SourcePackageSetting,
  values: Record<string, unknown>,
): number {
  const value = settingValue(setting, values);
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : (setting.min ?? 0);
}

function stringListSettingValue(
  setting: SourcePackageSetting,
  values: Record<string, unknown>,
): string[] {
  const value = settingValue(setting, values);
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is string => typeof item === "string" && item.length > 0,
  );
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function snapSliderValue(
  value: number,
  min: number,
  max: number,
  step: number,
): number {
  const snapped = Math.round((value - min) / step) * step + min;
  return Number(clampNumber(snapped, min, max).toPrecision(15));
}

function SourceSettingSlider({
  setting,
  value,
  disabled,
  onChange,
}: {
  setting: SourcePackageSetting;
  value: number;
  disabled: boolean;
  onChange: (value: number) => void;
}) {
  const { tokens } = useNemuTheme();
  const [trackWidth, setTrackWidth] = useState(0);
  const lastEmittedValueRef = useRef(value);
  const min = setting.min ?? 0;
  const max = setting.max ?? 100;
  const step = setting.step ?? 1;
  const range = max > min ? max - min : 1;
  const progress = clampNumber((value - min) / range, 0, 1);
  const formatted = formatSourceSettingSliderValue(setting, value);
  const sliderValueLeft = trackWidth
    ? clampNumber(
        progress * trackWidth - SLIDER_VALUE_LABEL_WIDTH / 2,
        0,
        Math.max(0, trackWidth - SLIDER_VALUE_LABEL_WIDTH),
      )
    : 0;

  useEffect(() => {
    lastEmittedValueRef.current = value;
  }, [value]);

  const updateFromLocation = (locationX: number) => {
    if (disabled) return;
    if (!trackWidth) return;
    const nextValue = snapSliderValue(
      min + (clampNumber(locationX, 0, trackWidth) / trackWidth) * range,
      min,
      max,
      step,
    );
    if (nextValue !== lastEmittedValueRef.current) {
      lastEmittedValueRef.current = nextValue;
      onChange(nextValue);
      void hapticSelection();
    }
  };

  return (
    <View style={styles.sliderControl}>
      <NemuText
        density="compact"
        pointerEvents="none"
        numberOfLines={1}
        style={[
          styles.sliderFloatingValue,
          {
            color: tokens.mutedForeground,
            left: sliderValueLeft,
            width: SLIDER_VALUE_LABEL_WIDTH,
          },
        ]}
      >
        {formatted}
      </NemuText>
      <View
        accessibilityRole="adjustable"
        accessibilityLabel={setting.title}
        accessibilityState={{ disabled }}
        accessibilityValue={{
          min,
          max,
          now: value,
          text: formatted,
        }}
        onAccessibilityAction={(event) => {
          if (disabled) return;
          const action = event.nativeEvent.actionName;
          if (action === "increment") {
            const nextValue = snapSliderValue(value + step, min, max, step);
            if (nextValue !== value) {
              onChange(nextValue);
              void hapticSelection();
            }
          } else if (action === "decrement") {
            const nextValue = snapSliderValue(value - step, min, max, step);
            if (nextValue !== value) {
              onChange(nextValue);
              void hapticSelection();
            }
          }
        }}
        accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
        onLayout={(event) => setTrackWidth(event.nativeEvent.layout.width)}
        onMoveShouldSetResponder={() => !disabled}
        onStartShouldSetResponder={() => !disabled}
        onResponderGrant={(event) => {
          updateFromLocation(event.nativeEvent.locationX);
        }}
        onResponderMove={(event) => {
          updateFromLocation(event.nativeEvent.locationX);
        }}
        onResponderRelease={() => {
          if (!disabled) void hapticPress();
        }}
        style={[
          styles.sliderTrackTouchTarget,
          disabled && styles.disabledControl,
        ]}
      >
        <View style={[styles.sliderTrack, { backgroundColor: tokens.muted }]}>
          <View
            style={[
              styles.sliderFill,
              {
                backgroundColor: tokens.primary,
                width: `${progress * 100}%`,
              },
            ]}
          />
          <View
            style={[
              styles.sliderThumb,
              {
                backgroundColor: tokens.primary,
                borderColor: tokens.background,
                left: `${progress * 100}%`,
              },
            ]}
          />
        </View>
      </View>
    </View>
  );
}

function SourceSettingSelectMenu({
  setting,
  options,
  value,
  strings,
  disabled,
  onSelect,
}: {
  setting: SourcePackageSetting;
  options: Array<{ label: string; value: string }>;
  value: unknown;
  strings: MobileStrings;
  disabled: boolean;
  onSelect: (value: string) => void;
}) {
  const { scheme, tokens } = useNemuTheme();
  const selectedOption = options.find((option) => option.value === value);
  const selectedValue =
    selectedOption?.value ?? String(value ?? options[0]?.value ?? "");
  const selectedLabel =
    selectedOption?.label ??
    options.find((option) => option.value === selectedValue)?.label ??
    selectedValue;

  const triggerDepthStyle = createNemuButtonDepthStyle(
    getNemuButtonDepthVisual({
      variant: "outline",
      state: "rest",
      scheme,
      tokens,
    }),
  );

  if (Platform.OS === "ios") {
    return (
      <View
        style={[
          styles.settingMenuShell,
          triggerDepthStyle,
          { opacity: disabled ? 0.62 : 1 },
        ]}
      >
        <SwiftHost
          colorScheme={scheme}
          matchContents={{ horizontal: true, vertical: true }}
          style={styles.settingMenuHost}
        >
          <SwiftMenu
            label={
              <SwiftHStack alignment="center" spacing={6}>
                <SwiftText
                  modifiers={[
                    swiftFont({ size: 14, weight: "medium" }),
                    foregroundStyle(tokens.foreground),
                  ]}
                >
                  {selectedLabel}
                </SwiftText>
                <SwiftImage
                  systemName="chevron.down"
                  size={13}
                  color={tokens.primary}
                />
              </SwiftHStack>
            }
            modifiers={[
              buttonStyle("plain"),
              controlSize("small"),
              frame({ height: 32 }),
              tint(tokens.primary),
              ...(disabled ? [swiftDisabled(true)] : []),
            ]}
          >
            {options.map((option) => {
              const selected = option.value === selectedValue;
              return (
                <SwiftButton
                  key={option.value}
                  label={selected ? `✓ ${option.label}` : option.label}
                  onPress={() => {
                    if (selected) return;
                    void hapticSelection();
                    onSelect(option.value);
                  }}
                />
              );
            })}
          </SwiftMenu>
        </SwiftHost>
      </View>
    );
  }

  if (Platform.OS === "android") {
    const actions: MenuAction[] = options.map((option) => ({
      id: option.value,
      title: option.label,
      titleColor:
        option.value === selectedValue ? tokens.primary : tokens.foreground,
      state: option.value === selectedValue ? "on" : "off",
    }));
    const trigger = (
      <View
        accessibilityLabel={formatSourceSettingAccessibilityLabel(
          setting,
          {},
          strings,
        )}
        accessibilityRole="button"
        accessibilityState={{ disabled }}
        style={[
          styles.settingMaterialMenuTrigger,
          triggerDepthStyle,
          { opacity: disabled ? 0.62 : 1 },
        ]}
      >
        <NemuText
          density="compact"
          numberOfLines={1}
          style={[styles.settingMaterialMenuText, { color: tokens.foreground }]}
        >
          {selectedLabel}
        </NemuText>
        <Ionicons name="chevron-down" size={16} color={tokens.primary} />
      </View>
    );

    if (disabled) {
      return trigger;
    }

    return (
      <MenuView
        actions={actions}
        onPressAction={({ nativeEvent }) => {
          if (nativeEvent.event === selectedValue) return;
          void hapticSelection();
          onSelect(nativeEvent.event);
        }}
        style={styles.settingMaterialMenu}
      >
        {trigger}
      </MenuView>
    );
  }

  return (
    <View
      accessibilityLabel={formatSourceSettingAccessibilityLabel(
        setting,
        {},
        strings,
      )}
      accessibilityRole="radiogroup"
      style={styles.settingOptions}
    >
      {options.map((option, index) => {
        const selected = selectedValue === option.value;
        const canSelect = canSelectMobileSourceSettingOption({
          selected,
          disabled,
        });
        return (
          <NemuPressable
            key={`${option.value}:${index}`}
            accessibilityLabel={formatMobileString(
              strings.settings.sourceSettingsSelectOption,
              {
                name: setting.title,
                option: option.label,
              },
            )}
            accessibilityRole="radio"
            accessibilityState={{ checked: selected, disabled }}
            disabled={disabled}
            hapticFeedback={canSelect ? "selection" : "none"}
            onPress={() => {
              if (!canSelect) return;
              onSelect(option.value);
            }}
            pressedScale={0.98}
            style={[
              styles.settingOption,
              {
                backgroundColor: selected ? tokens.primary : tokens.muted,
                borderColor: selected ? tokens.primary : tokens.border,
                opacity: disabled ? 0.62 : 1,
              },
            ]}
          >
            <NemuText
              density="compact"
              numberOfLines={1}
              style={[
                styles.settingOptionText,
                {
                  color: selected
                    ? tokens.primaryForeground
                    : tokens.mutedForeground,
                },
              ]}
            >
              {option.label}
            </NemuText>
          </NemuPressable>
        );
      })}
    </View>
  );
}

function validPageStack(
  settings: SourcePackageSetting[],
  stack: SourcePackageSetting[],
  values: Record<string, unknown>,
  features: MobileSourceSettingFeatureFlags,
): SourcePackageSetting[] {
  const validStack: SourcePackageSetting[] = [];
  let currentSettings = settings;

  for (const page of stack) {
    if (!settingsTreeContainsPage(currentSettings, page, values, features))
      break;
    validStack.push(page);
    currentSettings = page.items ?? [];
  }

  return validStack;
}

function settingsTreeContainsPage(
  settings: SourcePackageSetting[],
  page: SourcePackageSetting,
  values: Record<string, unknown>,
  features: MobileSourceSettingFeatureFlags,
): boolean {
  return settings.some((setting) => {
    if (setting === page) {
      return isSourceSettingVisible(setting, values, features);
    }
    if (setting.type === "group" && setting.items?.length) {
      return settingsTreeContainsPage(setting.items, page, values, features);
    }
    return false;
  });
}

function SourceSettingControl({
  setting,
  values,
  strings,
  disabled,
  onChange,
}: {
  setting: SourcePackageSetting;
  values: Record<string, unknown>;
  strings: MobileStrings;
  disabled: boolean;
  onChange: (
    key: string,
    value: unknown,
    setting: SourcePackageSetting,
  ) => void;
}) {
  const { tokens } = useNemuTheme();
  const options = getSourceSettingOptions(setting);
  const value = settingValue(setting, values);
  const [draftListItem, setDraftListItem] = useState("");
  const textFocusValueRef = useRef<string | null>(null);
  const textCurrentValueRef = useRef<string | null>(null);

  const setValue = (nextValue: unknown) => {
    if (disabled) return;
    onChange(setting.key, nextValue, setting);
  };

  if (setting.type === "switch") {
    return (
      <View style={styles.settingControl}>
        <NemuNativeSwitch
          accessibilityLabel={formatSourceSettingAccessibilityLabel(
            setting,
            values,
            strings,
          )}
          disabled={disabled}
          value={value === true}
          onValueChange={(nextValue) => {
            const checked = value === true;
            if (
              !canRunMobileSwitchSelectionFeedback({
                checked,
                disabled,
                nextChecked: nextValue,
              })
            ) {
              return;
            }
            void hapticSelection();
            setValue(nextValue);
          }}
        />
      </View>
    );
  }

  if (setting.type === "segment") {
    const segmentOptions = getSourceSegmentOptions(setting);
    const selectedIndex = getSourceSegmentIndex(setting, values);
    if (segmentOptions.length > 0) {
      return (
        <View
          accessibilityLabel={formatSourceSettingAccessibilityLabel(
            setting,
            values,
            strings,
          )}
          accessibilityRole="radiogroup"
          style={styles.settingOptions}
        >
          {segmentOptions.map((option) => {
            const selected = selectedIndex === option.value;
            const canSelect = canSelectMobileSourceSettingOption({
              selected,
              disabled,
            });
            return (
              <NemuPressable
                key={`${setting.key}:${option.value}`}
                accessibilityLabel={formatMobileString(
                  strings.settings.sourceSettingsSelectOption,
                  {
                    name: setting.title,
                    option: option.label,
                  },
                )}
                accessibilityRole="radio"
                accessibilityState={{ checked: selected, disabled }}
                disabled={disabled}
                hapticFeedback={canSelect ? "selection" : "none"}
                onPress={() => {
                  if (!canSelect) return;
                  setValue(option.value);
                }}
                pressedScale={0.98}
                style={[
                  styles.settingOption,
                  {
                    backgroundColor: selected ? tokens.primary : tokens.muted,
                    borderColor: selected ? tokens.primary : tokens.border,
                    opacity: disabled ? 0.62 : 1,
                  },
                ]}
              >
                <NemuText
                  density="compact"
                  numberOfLines={1}
                  style={[
                    styles.settingOptionText,
                    {
                      color: selected
                        ? tokens.primaryForeground
                        : tokens.mutedForeground,
                    },
                  ]}
                >
                  {option.label}
                </NemuText>
              </NemuPressable>
            );
          })}
        </View>
      );
    }
  }

  if (setting.type === "select" && options.length > 0) {
    return (
      <SourceSettingSelectMenu
        setting={setting}
        options={options}
        value={value}
        strings={strings}
        disabled={disabled}
        onSelect={setValue}
      />
    );
  }

  if (setting.type === "multi-select" && options.length > 0) {
    const optionValues = new Set(options.map((option) => option.value));
    const supportedSelectedValues = stringListSettingValue(
      setting,
      values,
    ).filter((item) => optionValues.has(item));
    const selectedValues = setting.single
      ? supportedSelectedValues.slice(0, 1)
      : supportedSelectedValues;
    return (
      <View style={styles.settingOptions}>
        {options.map((option, index) => {
          const selected = selectedValues.includes(option.value);
          return (
            <NemuPressable
              key={`${option.value}:${index}`}
              accessibilityLabel={formatMobileString(
                strings.settings.sourceSettingsToggleOption,
                {
                  name: setting.title,
                  option: option.label,
                },
              )}
              accessibilityRole={setting.single ? "radio" : "checkbox"}
              accessibilityState={{ checked: selected, disabled }}
              disabled={disabled}
              hapticFeedback={
                disabled || (setting.single && selected) ? "none" : "selection"
              }
              onPress={() => {
                if (setting.single) {
                  if (!selected) setValue([option.value]);
                  return;
                }
                const next = selected
                  ? selectedValues.filter((item) => item !== option.value)
                  : [...selectedValues, option.value];
                setValue(next);
              }}
              pressedScale={0.98}
              style={[
                styles.settingOption,
                {
                  backgroundColor: selected ? tokens.primary : tokens.muted,
                  borderColor: selected ? tokens.primary : tokens.border,
                  opacity: disabled ? 0.62 : 1,
                },
              ]}
            >
              <NemuText
                density="compact"
                numberOfLines={1}
                style={[
                  styles.settingOptionText,
                  {
                    color: selected
                      ? tokens.primaryForeground
                      : tokens.mutedForeground,
                  },
                ]}
              >
                {option.label}
              </NemuText>
            </NemuPressable>
          );
        })}
      </View>
    );
  }

  if (setting.type === "slider") {
    const step = setting.step ?? 1;
    const min = setting.min ?? 0;
    const max = setting.max ?? 100;
    const current = clampNumber(numericSettingValue(setting, values), min, max);
    if (typeof setting.formatValue === "function") {
      return (
        <SourceSettingSlider
          setting={setting}
          value={current}
          disabled={disabled}
          onChange={setValue}
        />
      );
    }
    const decrementDisabled = current <= min;
    const incrementDisabled = current >= max;
    return (
      <View style={styles.stepper}>
        <NemuButton
          accessibilityLabel={formatSourceSettingAccessibilityLabel(
            setting,
            values,
            strings,
            formatMobileString(strings.settings.sourceSettingsDecrease, {
              name: setting.title,
            }),
          )}
          accessibilityState={{ disabled: disabled || decrementDisabled }}
          disabled={disabled || decrementDisabled}
          icon="remove-outline"
          onPress={() => setValue(Math.max(min, current - step))}
          size="icon-sm"
          variant="secondary"
        />
        <NemuText
          density="compact"
          style={[styles.stepperValue, { color: tokens.foreground }]}
        >
          {current}
        </NemuText>
        <NemuButton
          accessibilityLabel={formatSourceSettingAccessibilityLabel(
            setting,
            values,
            strings,
            formatMobileString(strings.settings.sourceSettingsIncrease, {
              name: setting.title,
            }),
          )}
          accessibilityState={{ disabled: disabled || incrementDisabled }}
          disabled={disabled || incrementDisabled}
          icon="add-outline"
          onPress={() => setValue(Math.min(max, current + step))}
          size="icon-sm"
          variant="secondary"
        />
      </View>
    );
  }

  if (setting.type === "editable-list") {
    const currentItems = stringListSettingValue(setting, values);
    const trimmedDraft = draftListItem.trim();
    const remainingListStringChars = Math.max(
      0,
      MAX_SOURCE_SETTING_VALUES_STRING_CHARS -
        setting.key.length -
        currentItems.reduce((total, item) => total + item.length, 0),
    );
    const listIsFull =
      currentItems.length >= MAX_SOURCE_SETTING_VALUE_ARRAY_ITEMS ||
      remainingListStringChars === 0;
    const draftIsTooLong = trimmedDraft.length > remainingListStringChars;
    const addDraftItem = (options?: { haptic?: boolean }) => {
      if (disabled) return;
      if (!trimmedDraft || listIsFull || draftIsTooLong) return;
      setValue([...currentItems, trimmedDraft]);
      setDraftListItem("");
      if (options?.haptic) void hapticPress();
    };

    return (
      <View style={styles.editableList}>
        <View style={styles.editableListInputRow}>
          <GlassSurface
            style={styles.editableListInputShell}
            contentStyle={styles.editableListInputContent}
          >
            <TextInput
              accessibilityLabel={formatSourceSettingAccessibilityLabel(
                setting,
                values,
                strings,
              )}
              autoCapitalize="none"
              autoCorrect={false}
              editable={!disabled}
              maxLength={Math.min(
                MAX_SOURCE_SETTING_VALUE_STRING_LENGTH,
                remainingListStringChars,
              )}
              returnKeyType="done"
              value={draftListItem}
              onChangeText={setDraftListItem}
              onSubmitEditing={() => addDraftItem({ haptic: true })}
              placeholder={setting.placeholder ?? setting.title}
              placeholderTextColor={tokens.mutedForeground}
              selectionColor={tokens.primary}
              style={[styles.editableListInput, { color: tokens.foreground }]}
            />
          </GlassSurface>
          <NemuButton
            accessibilityLabel={formatSourceSettingAccessibilityLabel(
              setting,
              values,
              strings,
              `${strings.common.add} ${setting.title}`,
            )}
            accessibilityState={{
              disabled:
                disabled || !trimmedDraft || listIsFull || draftIsTooLong,
            }}
            disabled={disabled || !trimmedDraft || listIsFull || draftIsTooLong}
            icon="add-outline"
            onPress={() => addDraftItem()}
            size="icon-sm"
            variant="default"
          />
        </View>
        {currentItems.length ? (
          <View style={styles.editableListItems}>
            {currentItems.map((item, index) => (
              <NemuPressable
                key={`${item}:${index}`}
                accessibilityRole="button"
                accessibilityLabel={`${strings.common.remove} ${item}`}
                accessibilityState={{ disabled }}
                disabled={disabled}
                onPress={() => {
                  setValue(
                    currentItems.filter((_, itemIndex) => itemIndex !== index),
                  );
                }}
                pressedScale={0.96}
                style={[
                  styles.editableListChip,
                  {
                    backgroundColor: tokens.muted,
                    opacity: disabled ? 0.62 : 1,
                  },
                ]}
              >
                <NemuText
                  density="compact"
                  numberOfLines={1}
                  style={[
                    styles.editableListChipText,
                    { color: tokens.mutedForeground },
                  ]}
                >
                  {item}
                </NemuText>
                <Ionicons
                  name="close-outline"
                  size={14}
                  color={tokens.mutedForeground}
                />
              </NemuPressable>
            ))}
          </View>
        ) : (
          <NemuText
            density="compact"
            style={[
              styles.editableListEmpty,
              { color: tokens.mutedForeground },
            ]}
          >
            {strings.settings.sourceSettingsNone}
          </NemuText>
        )}
      </View>
    );
  }

  if (setting.type === "text") {
    const textValue = typeof value === "string" ? value : "";
    return (
      <GlassSurface
        style={styles.settingInputShell}
        contentStyle={styles.settingInputContent}
      >
        <TextInput
          accessibilityLabel={formatSourceSettingAccessibilityLabel(
            setting,
            values,
            strings,
          )}
          autoCapitalize="none"
          autoCorrect={false}
          editable={!disabled}
          maxLength={MAX_SOURCE_SETTING_VALUE_STRING_LENGTH}
          returnKeyType="done"
          value={textValue}
          onChangeText={(nextValue) => {
            textCurrentValueRef.current = nextValue;
            setValue(nextValue);
          }}
          onFocus={() => {
            textFocusValueRef.current = textValue;
            textCurrentValueRef.current = textValue;
          }}
          onBlur={() => {
            const shouldRunFeedback = canRunMobileSourceTextSettingBlurFeedback(
              {
                initialValue: textFocusValueRef.current,
                currentValue: textCurrentValueRef.current ?? textValue,
                disabled,
              },
            );
            textFocusValueRef.current = null;
            textCurrentValueRef.current = null;
            if (shouldRunFeedback) void hapticPress();
          }}
          placeholder={setting.placeholder ?? setting.title}
          placeholderTextColor={tokens.mutedForeground}
          selectionColor={tokens.primary}
          secureTextEntry={setting.secure === true}
          style={[styles.settingInput, { color: tokens.foreground }]}
        />
      </GlassSurface>
    );
  }

  return (
    <View style={[styles.settingValuePill, { backgroundColor: tokens.muted }]}>
      <NemuText
        density="compact"
        numberOfLines={1}
        style={[styles.settingValueText, { color: tokens.mutedForeground }]}
      >
        {describeSourceSettingValue(setting, values, strings)}
      </NemuText>
    </View>
  );
}

/**
 * The single-row stand-in for settings that open a dedicated sheet (multi
 * select, string list): title plus the current selection summary, chevron,
 * exactly the login/page-row geometry.
 */
function SourceSettingPickerRow({
  title,
  summary,
  disabled,
  accessibilityLabel,
  onPress,
}: {
  title: string;
  summary: string;
  disabled: boolean;
  accessibilityLabel: string;
  onPress: () => void;
}) {
  const { tokens } = useNemuTheme();
  return (
    <NemuPressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      disabled={disabled}
      pressedScale={0.98}
      style={[
        styles.pageRow,
        { borderColor: tokens.border },
        disabled && styles.disabledControl,
      ]}
    >
      <View style={styles.settingText}>
        <NemuText
          density="compact"
          numberOfLines={1}
          style={[styles.settingTitle, { color: tokens.foreground }]}
        >
          {title}
        </NemuText>
        <NemuText
          density="compact"
          numberOfLines={1}
          style={[styles.settingSubtitle, { color: tokens.mutedForeground }]}
        >
          {summary}
        </NemuText>
      </View>
      <Ionicons
        name="chevron-forward"
        size={17}
        color={tokens.mutedForeground}
      />
    </NemuPressable>
  );
}

function SourceSettingRow({
  setting,
  values,
  strings,
  disabled,
  onChange,
}: {
  setting: SourcePackageSetting;
  values: Record<string, unknown>;
  strings: MobileStrings;
  disabled: boolean;
  onChange: (
    key: string,
    value: unknown,
    setting: SourcePackageSetting,
  ) => void;
}) {
  const { tokens } = useNemuTheme();
  const isSlider = setting.type === "slider";

  return (
    <View
      style={[
        styles.settingRow,
        isSlider && styles.settingRowStacked,
        { borderColor: tokens.border },
      ]}
    >
      <View style={[styles.settingText, isSlider && styles.settingTextFull]}>
        <View style={styles.settingTitleLine}>
          <NemuText
            density="compact"
            numberOfLines={1}
            style={[styles.settingTitle, { color: tokens.foreground }]}
          >
            {setting.title}
          </NemuText>
        </View>
        <NemuText
          density="compact"
          numberOfLines={2}
          style={[styles.settingSubtitle, { color: tokens.mutedForeground }]}
        >
          {setting.subtitle ??
            describeSourceSettingValue(setting, values, strings)}
        </NemuText>
      </View>
      <SourceSettingControl
        setting={setting}
        values={values}
        strings={strings}
        disabled={disabled}
        onChange={onChange}
      />
    </View>
  );
}

function SourceSettingsPageRow({
  setting,
  strings,
  disabled,
  onPress,
}: {
  setting: SourcePackageSetting;
  strings: MobileStrings;
  disabled: boolean;
  onPress: () => void;
}) {
  const { tokens } = useNemuTheme();
  const detail = setting.subtitle ?? setting.info;

  return (
    <NemuPressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      accessibilityLabel={[
        formatMobileString(strings.settings.sourceSettingsOpenPage, {
          name: setting.title,
        }),
        detail,
      ]
        .filter(Boolean)
        .join(", ")}
      onPress={onPress}
      disabled={disabled}
      pressedScale={0.98}
      style={[
        styles.pageRow,
        { borderColor: tokens.border },
        disabled && styles.disabledControl,
      ]}
    >
      <View style={styles.settingText}>
        <NemuText
          density="compact"
          numberOfLines={1}
          style={[styles.settingTitle, { color: tokens.foreground }]}
        >
          {setting.title}
        </NemuText>
        {detail ? (
          <NemuText
            density="compact"
            numberOfLines={2}
            style={[styles.settingSubtitle, { color: tokens.mutedForeground }]}
          >
            {detail}
          </NemuText>
        ) : null}
      </View>
      <Ionicons
        name="chevron-forward"
        size={17}
        color={tokens.mutedForeground}
      />
    </NemuPressable>
  );
}

function SourceSettingLoginRow({
  setting,
  values,
  strings,
  disabled,
  onLogin,
  onLogout,
  onRequestLogin,
  loginCapabilities,
}: {
  setting: MobileSourceLoginSetting;
  values: Record<string, unknown>;
  strings: MobileStrings;
  disabled: boolean;
  onLogin: (
    setting: SourcePackageSetting,
    submission: MobileSourceLoginSubmission,
    options?: { signal?: AbortSignal },
  ) => Promise<string | null> | string | null;
  onLogout: (setting: SourcePackageSetting) => void;
  onRequestLogin: (setting: SourcePackageSetting) => void;
  loginCapabilities: MobileSourceLoginCapabilities | null;
}) {
  const { tokens } = useNemuTheme();
  const loggedIn = isMobileSourceLoggedIn(setting, values);
  const method = mobileSourceLoginMethod(setting);
  const canRunLogin =
    method === "oauth"
      ? isMobileSourceOAuthCallbackSchemeSupported(setting.callbackScheme)
      : loginCapabilities?.[method] === true;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const oauthAbortRef = useRef<AbortController | null>(null);
  const oauthRequestRef = useRef(0);
  const rowDisabled = disabled || loading || (!loggedIn && !canRunLogin);

  useEffect(() => {
    return () => {
      oauthRequestRef.current += 1;
      oauthAbortRef.current?.abort();
      oauthAbortRef.current = null;
    };
  }, []);

  const statusText = error
    ? error
    : !loggedIn && !canRunLogin
      ? strings.settings.sourceSettingsLoginUnsupported
      : (setting.subtitle ??
        (loggedIn
          ? strings.settings.sourceSettingsLoggedIn
          : strings.settings.sourceSettingsLoggedOut));
  const actionLabel = loggedIn
    ? strings.settings.sourceSettingsLogout
    : canRunLogin
      ? strings.settings.sourceSettingsLogin
      : strings.settings.sourceSettingsLoginUnavailable;

  const handlePress = useCallback(async () => {
    if (rowDisabled || oauthAbortRef.current) return;
    setError(null);

    // Log out through the owner so confirmation and atomic cleanup stay
    // outside this presentation component.
    if (loggedIn) {
      void hapticPress();
      onLogout(setting);
      return;
    }

    if (!canRunLogin) {
      void hapticPress();
      setError(strings.settings.sourceSettingsLoginUnsupported);
      return;
    }

    if (method !== "oauth") {
      void hapticPress();
      onRequestLogin(setting);
      return;
    }

    // OAuth remains a system-browser flow; accepted output is delegated to
    // the settings owner for persistence. The browser API itself is not
    // abortable, so fence its result and propagate cancellation into the
    // credential-validation/persistence transaction.
    const requestId = oauthRequestRef.current + 1;
    oauthRequestRef.current = requestId;
    const controller = new AbortController();
    oauthAbortRef.current = controller;
    setLoading(true);
    void hapticPress();
    try {
      const result = await runMobileSourceOAuthLogin({ setting, values });
      if (
        controller.signal.aborted ||
        oauthRequestRef.current !== requestId
      ) {
        return;
      }
      if (result.ok) {
        const loginError = await onLogin(
          setting,
          {
            method: "oauth",
            token: result.token,
          },
          { signal: controller.signal },
        );
        if (
          controller.signal.aborted ||
          oauthRequestRef.current !== requestId
        ) {
          return;
        }
        if (loginError) setError(loginError);
      } else {
        setError(strings.settings.sourceOAuthErrors[result.code]);
      }
    } catch (nextError) {
      if (
        controller.signal.aborted ||
        isMobileSourceLoginCancellation(nextError) ||
        oauthRequestRef.current !== requestId
      ) {
        return;
      }
      setError(strings.settings.sourceSettingsLoginFailed);
    } finally {
      if (oauthRequestRef.current === requestId) {
        oauthAbortRef.current = null;
        setLoading(false);
      }
    }
  }, [
    rowDisabled,
    canRunLogin,
    loggedIn,
    setting,
    values,
    method,
    onLogin,
    onLogout,
    onRequestLogin,
    strings.settings.sourceSettingsLoginFailed,
    strings.settings.sourceSettingsLoginUnsupported,
    strings.settings.sourceOAuthErrors,
  ]);

  return (
    <NemuPressable
      accessibilityRole="button"
      accessibilityState={{ disabled: rowDisabled }}
      accessibilityLabel={[
        setting.title,
        loggedIn
          ? strings.settings.sourceSettingsLoggedIn
          : strings.settings.sourceSettingsLoggedOut,
        actionLabel,
      ]
        .filter(Boolean)
        .join(", ")}
      onPress={handlePress}
      disabled={rowDisabled}
      pressedScale={0.98}
      style={[
        styles.pageRow,
        { borderColor: tokens.border },
        rowDisabled && styles.disabledControl,
      ]}
    >
      <View style={styles.settingText}>
        <NemuText
          density="compact"
          numberOfLines={1}
          style={[styles.settingTitle, { color: tokens.foreground }]}
        >
          {setting.title}
        </NemuText>
        <NemuText
          density="compact"
          numberOfLines={2}
          style={[
            styles.settingSubtitle,
            { color: error ? tokens.danger : tokens.mutedForeground },
          ]}
        >
          {statusText}
        </NemuText>
      </View>
      {loading ? (
        <ActivityIndicator size="small" color={tokens.primary} />
      ) : (
        <NemuText
          density="compact"
          numberOfLines={1}
          style={[styles.loginActionLabel, { color: tokens.primary }]}
        >
          {actionLabel}
        </NemuText>
      )}
    </NemuPressable>
  );
}

function SourceSettingActionRow({
  setting,
  strings,
  disabled,
  onPress,
}: {
  setting: SourcePackageSetting;
  strings: MobileStrings;
  disabled: boolean;
  onPress: () => void;
}) {
  const { tokens } = useNemuTheme();
  const destructive = setting.destructive === true;
  const actionLabel =
    setting.type === "link"
      ? strings.settings.sourceSettingsOpenLink
      : strings.settings.sourceSettingsRunAction;
  const color = destructive ? tokens.danger : tokens.primary;
  return (
    <NemuPressable
      accessibilityRole="button"
      accessibilityLabel={[setting.title, setting.subtitle, actionLabel]
        .filter(Boolean)
        .join(", ")}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      pressedScale={0.98}
      style={[
        styles.pageRow,
        { borderColor: tokens.border },
        disabled && styles.disabledControl,
      ]}
    >
      <View style={styles.settingText}>
        <NemuText
          density="compact"
          numberOfLines={1}
          style={[
            styles.settingTitle,
            { color: destructive ? tokens.danger : tokens.foreground },
          ]}
        >
          {setting.title}
        </NemuText>
        {setting.subtitle ? (
          <NemuText
            density="compact"
            numberOfLines={2}
            style={[styles.settingSubtitle, { color: tokens.mutedForeground }]}
          >
            {setting.subtitle}
          </NemuText>
        ) : null}
      </View>
      <NemuText
        density="compact"
        style={[styles.loginActionLabel, { color }]}
      >
        {actionLabel}
      </NemuText>
    </NemuPressable>
  );
}

function SourceSettingsList({
  settings,
  values,
  strings,
  features,
  disabled,
  onChange,
  onAction,
  onLogin,
  onLogout,
  onRequestLogin,
  onPushPage,
  loginCapabilities,
  onRequestMultiSelectSheet,
  onRequestStringListSheet,
}: {
  settings: SourcePackageSetting[];
  values: Record<string, unknown>;
  strings: MobileStrings;
  features: MobileSourceSettingFeatureFlags;
  disabled: boolean;
  onChange: (
    key: string,
    value: unknown,
    setting: SourcePackageSetting,
  ) => void;
  onAction?: (setting: SourcePackageSetting) => void;
  onLogin?: (
    setting: SourcePackageSetting,
    submission: MobileSourceLoginSubmission,
    options?: { signal?: AbortSignal },
  ) => Promise<string | null> | string | null;
  onLogout?: (setting: SourcePackageSetting) => void;
  onRequestLogin: (setting: SourcePackageSetting) => void;
  onPushPage: (page: SourcePackageSetting) => void;
  loginCapabilities: MobileSourceLoginCapabilities | null;
  onRequestMultiSelectSheet?: (setting: SourcePackageSetting) => void;
  onRequestStringListSheet?: (setting: SourcePackageSetting) => void;
}) {
  const { tokens } = useNemuTheme();

  return (
    <>
      {settings.map((setting, index) => {
        if (!isSourceSettingVisible(setting, values, features)) return null;
        if (!isRenderableSourceSetting(setting)) return null;

        const key = `${setting.type}:${setting.key}:${index}`;

        if (setting.type === "group") {
          if (
            !setting.items?.length ||
            !hasVisibleSourceSettingRows(setting.items, values, features)
          ) {
            return null;
          }

          return (
            <View key={key} style={styles.settingGroup}>
              <NemuText
                density="compact"
                numberOfLines={1}
                style={[
                  styles.settingGroupTitle,
                  { color: tokens.mutedForeground },
                ]}
              >
                {setting.title}
              </NemuText>
              <View style={styles.settingGroupRows}>
                <SourceSettingsList
                  settings={setting.items}
                  values={values}
                  strings={strings}
                  features={features}
                  disabled={disabled}
                  onChange={onChange}
                  onAction={onAction}
                  onLogin={onLogin}
                  onLogout={onLogout}
                  onRequestLogin={onRequestLogin}
                  onPushPage={onPushPage}
                  loginCapabilities={loginCapabilities}
                  onRequestMultiSelectSheet={onRequestMultiSelectSheet}
                  onRequestStringListSheet={onRequestStringListSheet}
                />
              </View>
              {setting.footer ? (
                <NemuText
                  density="compact"
                  style={[
                    styles.settingGroupFooter,
                    { color: tokens.mutedForeground },
                  ]}
                >
                  {setting.footer}
                </NemuText>
              ) : null}
            </View>
          );
        }

        if (setting.type === "page") {
          return (
            <SourceSettingsPageRow
              key={key}
              setting={setting}
              strings={strings}
              disabled={disabled}
              onPress={() => onPushPage(setting)}
            />
          );
        }

        if (isMobileSourceLoginSetting(setting)) {
          return (
            <SourceSettingLoginRow
              key={key}
              setting={setting}
              values={values}
              strings={strings}
              disabled={disabled || !onLogin || !onLogout}
              onLogin={onLogin ?? (() => null)}
              onLogout={onLogout ?? (() => undefined)}
              onRequestLogin={onRequestLogin}
              loginCapabilities={loginCapabilities}
            />
          );
        }

        if (setting.type === "button" || setting.type === "link") {
          return (
            <SourceSettingActionRow
              key={key}
              setting={setting}
              strings={strings}
              disabled={disabled || !onAction}
              onPress={() => onAction?.(setting)}
            />
          );
        }

        if (setting.type === "multi-select" && onRequestMultiSelectSheet) {
          const options = getSourceSettingOptions(setting);
          if (options.length > 0) {
            const optionValues = new Set(options.map((option) => option.value));
            const selectedLabels = stringListSettingValue(setting, values)
              .filter((item) => optionValues.has(item))
              .map(
                (item) =>
                  options.find((option) => option.value === item)?.label ??
                  item,
              );
            return (
              <SourceSettingPickerRow
                key={key}
                accessibilityLabel={formatMobileString(
                  strings.settings.sourceSettingsOpenPage,
                  { name: setting.title },
                )}
                disabled={disabled}
                onPress={() => onRequestMultiSelectSheet(setting)}
                summary={
                  compactMobileLabelList(selectedLabels) ??
                  strings.settings.sourceSettingsNone
                }
                title={setting.title}
              />
            );
          }
        }

        if (setting.type === "editable-list" && onRequestStringListSheet) {
          const itemCount = stringListSettingValue(setting, values).length;
          return (
            <SourceSettingPickerRow
              key={key}
              accessibilityLabel={formatMobileString(
                strings.settings.sourceSettingsOpenPage,
                { name: setting.title },
              )}
              disabled={disabled}
              onPress={() => onRequestStringListSheet(setting)}
              summary={
                itemCount
                  ? formatMobileSourceItemListCount(itemCount, strings)
                  : strings.settings.sourceSettingsNone
              }
              title={setting.title}
            />
          );
        }

        return (
          <SourceSettingRow
            key={key}
            setting={setting}
            values={values}
            strings={strings}
            disabled={disabled}
            onChange={onChange}
          />
        );
      })}
    </>
  );
}

export function MobileSourceSettingsCard(props: MobileSourceSettingsCardProps) {
  return (
    <MobileSourceSettingsCardContent
      key={props.navigationResetKey ?? "source-settings-card"}
      {...props}
    />
  );
}

function MobileSourceSettingsCardContent({
  settings,
  values,
  features = EMPTY_SETTING_FEATURES,
  loading = false,
  error = null,
  title,
  subtitle,
  hideSubtitle = false,
  emptyMessage,
  showEmpty = false,
  disabled = false,
  onChange,
  onAction,
  onLogin,
  onLogout,
  onRetry,
  onReset,
  retryDisabled = false,
  retrying = false,
  loginCapabilities = null,
  onEmbeddedBackHandlerChange,
  onRequestLoginSheet,
  onRequestMultiSelectSheet,
  onRequestStringListSheet,
}: MobileSourceSettingsCardProps) {
  const { tokens } = useNemuTheme();
  const { appLanguage } = useMobileLanguageSettings();
  const strings = getMobileStrings(appLanguage);
  const [pageStack, setPageStack] = useState<SourcePackageSetting[]>([]);
  const [dismissedError, setDismissedError] = useState<string | null>(null);
  const login = useMobileSourceLoginSubmission(onLogin ?? (() => null));
  const safeSettings = useMemo(
    () => sanitizeMobileSourceSettings(settings),
    [settings],
  );
  const safeValues = useMemo(
    () => sanitizeSourceSettingValues(values),
    [values],
  );
  const activePageStack = useMemo(
    () => validPageStack(safeSettings, pageStack, safeValues, features),
    [features, pageStack, safeSettings, safeValues],
  );
  const currentPage =
    activePageStack.length > 0
      ? activePageStack[activePageStack.length - 1]
      : undefined;
  const currentSettings = currentPage?.items ?? safeSettings;
  const editableSettings = useMemo(
    () =>
      flattenVisibleEditableSourceSettings(safeSettings, safeValues, features),
    [features, safeSettings, safeValues],
  );
  const hasRootRows = useMemo(
    () => hasVisibleSourceSettingRows(safeSettings, safeValues, features),
    [features, safeSettings, safeValues],
  );
  const hasCurrentRows = useMemo(
    () => hasVisibleSourceSettingRows(currentSettings, safeValues, features),
    [currentSettings, features, safeValues],
  );
  const titleLabel = title ?? strings.settings.sourceSettingsDefaultTitle;
  const subtitleLabel = hideSubtitle
    ? null
    : loading
      ? strings.settings.sourceSettingsLoadingValues
      : (subtitle ?? strings.settings.sourceSettingsSavedOnDevice);
  const emptyLabel = emptyMessage ?? strings.settings.sourceSettingsEmpty;
  const activeError = error && error !== dismissedError ? error : null;
  const handleChange = useCallback(
    (key: string, value: unknown, setting: SourcePackageSetting) => {
      if (disabled) return;
      setDismissedError(null);
      onChange(key, value, setting);
    },
    [disabled, onChange],
  );
  const handleRetry = useCallback(() => {
    if (!onRetry || retryDisabled) return;
    setDismissedError(null);
    onRetry();
  }, [onRetry, retryDisabled]);

  useEffect(() => {
    onEmbeddedBackHandlerChange?.(
      login.setting ? login.close : null,
    );
    return () => onEmbeddedBackHandlerChange?.(null);
  }, [login.close, login.setting, onEmbeddedBackHandlerChange]);

  if (!hasRootRows && !showEmpty) return null;

  if (login.setting) {
    return (
      <MobileSourceLoginSheet
        key={login.setting.key}
        setting={login.setting}
        visible
        embedded
        submitting={login.submitting}
        error={login.error}
        onClose={login.close}
        onSubmit={(submission) => {
          void login.submit(submission).then((submitError) => {
            if (!submitError) login.close();
          });
        }}
      />
    );
  }

  return (
    <View
        style={[
          styles.settingsShell,
          { backgroundColor: tokens.card, borderColor: tokens.border },
        ]}
      >
        <View style={styles.settingsContent}>
          <View style={styles.settingsHeader}>
            {currentPage ? (
              <View style={styles.capabilityHeader}>
                <NemuButton
                  accessibilityLabel={strings.settings.sourceSettingsBack}
                  accessibilityState={{ disabled }}
                  disabled={disabled}
                  icon="chevron-back"
                  onPress={() => setPageStack(activePageStack.slice(0, -1))}
                  size="icon-sm"
                  variant="secondary"
                />
                <View style={styles.settingsHeaderText}>
                  <NemuText
                    density="compact"
                    style={[styles.statusLabel, { color: tokens.foreground }]}
                  >
                    {currentPage.title}
                  </NemuText>
                  {!hideSubtitle ? (
                    <NemuText
                      density="compact"
                      numberOfLines={1}
                      style={[
                        styles.settingsSubtitle,
                        { color: tokens.mutedForeground },
                      ]}
                    >
                      {currentPage.subtitle ?? titleLabel}
                    </NemuText>
                  ) : null}
                </View>
              </View>
            ) : (
              <View style={styles.capabilityHeader}>
                <Ionicons
                  name="options-outline"
                  size={19}
                  color={tokens.primary}
                />
                <View style={styles.settingsHeaderText}>
                  <NemuText
                    density="compact"
                    style={[styles.statusLabel, { color: tokens.foreground }]}
                  >
                    {titleLabel}
                  </NemuText>
                  {subtitleLabel ? (
                    <NemuText
                      density="compact"
                      numberOfLines={1}
                      style={[
                        styles.settingsSubtitle,
                        { color: tokens.mutedForeground },
                      ]}
                    >
                      {subtitleLabel}
                    </NemuText>
                  ) : null}
                </View>
              </View>
            )}
            {!currentPage && onReset && editableSettings.length ? (
              <NemuButton
                accessibilityLabel={strings.settings.sourceSettingsResetLabel}
                accessibilityState={{ disabled }}
                disabled={disabled}
                icon="refresh-outline"
                label={strings.settings.sourceSettingsReset}
                onPress={() => {
                  if (disabled) return;
                  setDismissedError(null);
                  onReset();
                }}
                size="sm"
                style={styles.settingsHeaderAction}
                variant="secondary"
              />
            ) : null}
          </View>
          {activeError ? (
            <MobileInlineErrorBanner
              title={strings.settings.settingsActionFailed}
              detail={activeError}
              actionLabel={onRetry ? strings.common.retry : undefined}
              actionDisabled={retryDisabled}
              actionLoading={retrying}
              dismissLabel={strings.common.clear}
              onActionPress={onRetry ? handleRetry : undefined}
              onDismiss={() => setDismissedError(activeError)}
              variant="embedded"
            />
          ) : null}
          {hasCurrentRows ? (
            <View style={styles.settingList}>
              <SourceSettingsList
                settings={currentSettings}
                values={safeValues}
                strings={strings}
                features={features}
                disabled={disabled}
                onChange={handleChange}
                onAction={onAction}
                onLogin={onLogin}
                onLogout={onLogout}
                onRequestLogin={(setting) => {
                  // The host sheet layers login as its own presented sheet
                  // (dismiss-then-present); without a host handoff the card
                  // swaps to its embedded panel in place.
                  if (onRequestLoginSheet) {
                    onRequestLoginSheet(setting);
                    return;
                  }
                  login.present(setting);
                }}
                onPushPage={(page) => {
                  if (disabled) return;
                  setPageStack([...activePageStack, page]);
                }}
                loginCapabilities={loginCapabilities}
                onRequestMultiSelectSheet={onRequestMultiSelectSheet}
                onRequestStringListSheet={onRequestStringListSheet}
              />
            </View>
          ) : (
            <View style={styles.emptyRow}>
              <Ionicons
                name="settings-outline"
                size={18}
                color={tokens.mutedForeground}
              />
              <NemuText
                density="compact"
                style={[styles.emptyText, { color: tokens.mutedForeground }]}
              >
                {emptyLabel}
              </NemuText>
            </View>
          )}
        </View>
      </View>
  );
}

const styles = StyleSheet.create({
  settingsShell: {
    overflow: "hidden",
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  settingsContent: {
    gap: 12,
    padding: 14,
  },
  settingsHeader: {
    minHeight: 34,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  settingsHeaderAction: {
    // Standard small button frame pinned to the header row's height so the
    // reset control right-aligns without looking cramped or tilted.
    minHeight: 34,
  },
  capabilityHeader: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },
  settingsHeaderText: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  statusLabel: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: nemuFontWeight.semibold,
  },
  settingsSubtitle: {
    fontSize: 11,
    lineHeight: 14,
  },
  settingList: {
    gap: 10,
  },
  settingGroup: {
    gap: 7,
  },
  settingGroupTitle: {
    // Sections must read as separate areas: the extra top padding keeps a
    // group title (Account, Blocked Groups, …) visually owned by its rows
    // instead of blending into the previous section's footer/rows.
    marginTop: 12,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: nemuFontWeight.semibold,
  },
  settingGroupRows: {
    gap: 0,
  },
  settingGroupFooter: {
    fontSize: 11,
    lineHeight: 14,
  },
  settingRow: {
    minHeight: 66,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 10,
  },
  settingRowStacked: {
    alignItems: "stretch",
    flexDirection: "column",
    gap: 8,
  },
  pageRow: {
    width: "100%",
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 10,
  },
  disabledControl: {
    opacity: 0.62,
  },
  loginActionLabel: {
    fontSize: 15,
    lineHeight: 18,
    fontWeight: nemuFontWeight.semibold,
  },
  settingText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  settingTextFull: {
    width: "100%",
  },
  settingTitleLine: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  settingTitle: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: nemuFontWeight.medium,
  },
  settingSubtitle: {
    fontSize: 11,
    lineHeight: 15,
  },
  settingControl: {
    minWidth: 54,
    alignItems: "flex-end",
  },
  settingOptions: {
    maxWidth: "54%",
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "flex-end",
    gap: 6,
  },
  settingOption: {
    minHeight: 28,
    maxWidth: 116,
    justifyContent: "center",
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 9,
  },
  settingOptionText: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: nemuFontWeight.medium,
  },
  // The select trigger is a depth button, not a flat well: it hugs its label
  // and sits at the row's trailing edge instead of stretching to a fixed width.
  // The comfortable padding, label size, and 34pt frame mirror the card's
  // standard small NemuButton surfaces so it reads as a pressable, and the row
  // keeps it vertically centered next to the sibling switches.
  // `settingRow` is a flex row, so the cross axis is vertical: `alignSelf:
  // "flex-end"` bottom-aligned the pill against the title/subtitle block
  // instead of pushing it to the trailing edge (the flex:1 text block already
  // does that). `center` is what actually centres it on the text.
  settingMenuShell: {
    alignSelf: "center",
    minHeight: 34,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    borderRadius: radius.md,
    paddingHorizontal: 12,
  },
  settingMenuHost: {
    height: 32,
  },
  settingMaterialMenu: {
    alignSelf: "center",
  },
  settingMaterialMenuTrigger: {
    minHeight: 34,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    overflow: "hidden",
    borderRadius: radius.md,
    paddingHorizontal: 12,
  },
  settingMaterialMenuText: {
    maxWidth: 180,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: nemuFontWeight.medium,
  },
  settingValuePill: {
    minHeight: 28,
    maxWidth: "48%",
    justifyContent: "center",
    borderRadius: radius.md,
    paddingHorizontal: 9,
  },
  settingValueText: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: nemuFontWeight.medium,
  },
  settingInputShell: {
    width: "48%",
    minHeight: 38,
    borderRadius: radius.md,
  },
  settingInputContent: {
    paddingHorizontal: 10,
  },
  settingInput: {
    minHeight: 38,
    fontSize: 12,
  },
  editableList: {
    width: "58%",
    alignItems: "flex-end",
    gap: 6,
  },
  editableListInputRow: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  editableListInputShell: {
    flex: 1,
    minHeight: 34,
    borderRadius: radius.md,
  },
  editableListInputContent: {
    paddingHorizontal: 9,
  },
  editableListInput: {
    minHeight: 34,
    fontSize: 12,
  },
  editableListItems: {
    width: "100%",
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "flex-end",
    gap: 5,
  },
  editableListChip: {
    minHeight: 26,
    maxWidth: "100%",
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderRadius: radius.md,
    paddingHorizontal: 8,
  },
  editableListChipText: {
    maxWidth: 132,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: nemuFontWeight.medium,
  },
  editableListEmpty: {
    fontSize: 11,
    lineHeight: 14,
    textAlign: "right",
  },
  sliderControl: {
    width: "100%",
    minHeight: 48,
    justifyContent: "flex-end",
    paddingTop: 18,
  },
  sliderFloatingValue: {
    position: "absolute",
    top: 0,
    textAlign: "center",
    fontSize: 11,
    lineHeight: 14,
    fontWeight: nemuFontWeight.medium,
  },
  sliderTrackTouchTarget: {
    height: 24,
    justifyContent: "center",
  },
  sliderTrack: {
    height: 6,
    overflow: "visible",
    borderRadius: radius.pill,
  },
  sliderFill: {
    height: 6,
    borderRadius: radius.pill,
  },
  sliderThumb: {
    position: "absolute",
    top: -6,
    width: 18,
    height: 18,
    marginLeft: -9,
    borderRadius: 9,
    borderWidth: 3,
  },
  stepper: {
    minHeight: 32,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  stepperValue: {
    minWidth: 34,
    textAlign: "center",
    fontSize: 12,
    lineHeight: 15,
    fontWeight: nemuFontWeight.medium,
  },
  emptyRow: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  emptyText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 16,
  },
});
