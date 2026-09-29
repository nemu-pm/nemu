import { Fragment, useMemo, useRef, useState, type ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import {
  BottomSheet as SwiftBottomSheet,
  Button as SwiftButton,
  Form as SwiftForm,
  Group as SwiftGroup,
  HStack as SwiftHStack,
  Host as SwiftHost,
  Image as SwiftImage,
  Label as SwiftLabel,
  NavigationDestination as SwiftNavigationDestination,
  NavigationLink as SwiftNavigationLink,
  NavigationStack as SwiftNavigationStack,
  Picker as SwiftPicker,
  ProgressView as SwiftProgressView,
  Section as SwiftSection,
  Slider as SwiftSlider,
  Spacer as SwiftSpacer,
  Stepper as SwiftStepper,
  Text as SwiftText,
  Toggle as SwiftToggle,
  Toolbar as SwiftToolbar,
  ToolbarItem as SwiftToolbarItem,
  VStack as SwiftVStack,
} from "@expo/ui/swift-ui";
import {
  accessibilityLabel as swiftAccessibilityLabel,
  buttonStyle,
  disabled as swiftDisabled,
  fixedSize,
  font,
  foregroundStyle,
  frame,
  labelsHidden,
  lineLimit,
  monospacedDigit,
  navigationTitle,
  pickerStyle,
  presentationBackground,
  presentationDetents,
  presentationDragIndicator,
  progressViewStyle,
  tag,
  textSelection,
  tint,
} from "@expo/ui/swift-ui/modifiers";
import { useNemuTheme } from "@/design-system";
import { hapticSelection } from "@/lib/haptics";
import { formatMobileString, type MobileStrings } from "@/lib/mobileI18n";
import { MOBILE_JAPANESE_LEARNING_ENGINE_SETTING_KEY } from "@/lib/mobileJapaneseLearningEngine";
import {
  buildMobileReaderPluginNativeSections,
  encodeMobileReaderPluginPickerSelection,
  mobileReaderPluginRowSubtitle,
  mobileReaderPluginSystemImage,
  snapMobileReaderPluginNumber,
  type MobileReaderPluginNativeNumberRow,
  type MobileReaderPluginNativeRow,
} from "@/lib/mobileReaderPluginSheet";
import type { MobileReaderPluginState } from "@/lib/mobileReaderPlugins";
import { splitMobileInlineErrorDetail } from "@/lib/mobileSourceErrors";
import {
  inlineToolbarTitle,
  presentationColorScheme,
} from "../../../modules/nemu-window-layout/src/presentationColorScheme";
import { useMobileJapaneseLearningDictionaryRowModel } from "../useMobileJapaneseLearningDictionaryRowModel";
import type { ReaderPluginSettingsSheetProps } from "./ReaderPluginSettingsSheet.types";

const secondaryText = foregroundStyle({ type: "hierarchical", style: "secondary" });

/**
 * The reader's Plugins sheet as a system sheet: a navigation bar with the
 * title and the system close button, one inset-grouped section per plugin
 * (symbol, name, "5 settings", a trailing switch, the disclosure chevron;
 * the description as the section footer), and each plugin's settings pushed
 * onto the sheet's own navigation stack as native rows (Toggle, menu Picker,
 * Slider / Stepper, a destructive Reset). The appearance comes from one
 * source: the presentation's preferred color scheme and the Host both follow
 * the theme scope (dark inside the reader).
 */
export function ReaderPluginSettingsSheet({
  visible,
  plugins,
  selectedPluginId,
  loading,
  error,
  loadError,
  busy,
  retryingLoad,
  canRetryLoadError,
  strings,
  onClose,
  onDismissError,
  onDismissLoadError,
  onRetryLoad,
  onSelectPlugin,
  onClearSelectedPlugin,
  onTogglePlugin,
  onResetPlugin,
  onChangePluginValue,
}: ReaderPluginSettingsSheetProps) {
  const { scheme, tokens } = useNemuTheme();
  const selectedPlugin = selectedPluginId
    ? (plugins.find((plugin) => plugin.id === selectedPluginId) ?? null)
    : null;
  const path = selectedPlugin ? [selectedPlugin.id] : [];
  const busyModifiers = busy ? [swiftDisabled(true)] : [];

  const errorSections = (
    <ReaderPluginErrorSections
      error={error}
      loadError={loadError}
      retryingLoad={retryingLoad}
      canRetryLoadError={canRetryLoadError}
      dangerColor={tokens.danger}
      strings={strings}
      onDismissError={onDismissError}
      onDismissLoadError={onDismissLoadError}
      onRetryLoad={onRetryLoad}
    />
  );

  return (
    <View pointerEvents="none" style={styles.host} testID="ReaderPluginSettingsSheet">
      <SwiftHost colorScheme={scheme} seedColor={tokens.primary} style={StyleSheet.absoluteFill}>
        <SwiftBottomSheet
          isPresented={visible}
          onIsPresentedChange={(presented) => {
            if (!presented && visible) onClose();
          }}
        >
          <SwiftGroup
            modifiers={[
              presentationDetents(["medium", "large"]),
              presentationDragIndicator("visible"),
              presentationColorScheme(scheme),
              presentationBackground({ type: "material", material: "regular" }),
            ]}
          >
            <SwiftNavigationStack
              path={path}
              onPathChange={(nextPath) => {
                const next = nextPath[nextPath.length - 1] ?? null;
                if (next === null) {
                  if (selectedPluginId !== null) onClearSelectedPlugin();
                } else if (next !== selectedPluginId) {
                  onSelectPlugin(next);
                }
              }}
              modifiers={[tint(tokens.primary)]}
            >
              <SwiftToolbar>
                <SwiftForm modifiers={[navigationTitle(strings.settings.plugins), inlineToolbarTitle()]}>
                  {errorSections}
                  {loading && plugins.length === 0 ? (
                    <SwiftSection>
                      <SwiftHStack spacing={10}>
                        <SwiftProgressView />
                        <SwiftText modifiers={[secondaryText]}>{strings.settings.loadingReaderPlugins}</SwiftText>
                      </SwiftHStack>
                    </SwiftSection>
                  ) : null}
                  {plugins.map((plugin) => (
                    <SwiftSection
                      key={plugin.id}
                      footer={plugin.description ? <SwiftText>{plugin.description}</SwiftText> : undefined}
                    >
                      <SwiftNavigationLink value={plugin.id}>
                        <SwiftHStack spacing={12} alignment="center">
                          <SwiftImage
                            systemName={mobileReaderPluginSystemImage(plugin)}
                            color={plugin.enabled ? tokens.primary : tokens.mutedForeground}
                            modifiers={[font({ textStyle: "title3" }), frame({ width: 30 })]}
                          />
                          <SwiftVStack alignment="leading" spacing={2}>
                            <SwiftText modifiers={[lineLimit(1)]}>{plugin.name}</SwiftText>
                            <SwiftText modifiers={[font({ textStyle: "subheadline" }), secondaryText, lineLimit(1)]}>
                              {mobileReaderPluginRowSubtitle(plugin, strings)}
                            </SwiftText>
                          </SwiftVStack>
                          <SwiftSpacer />
                          <SwiftToggle
                            isOn={plugin.enabled}
                            onIsOnChange={(enabled) => {
                              if (busy || enabled === plugin.enabled) return;
                              onTogglePlugin(plugin, enabled);
                            }}
                            modifiers={[
                              labelsHidden(),
                              fixedSize(),
                              swiftAccessibilityLabel(
                                formatMobileString(strings.settings.readerPluginSwitch, { name: plugin.name }),
                              ),
                              ...busyModifiers,
                            ]}
                          />
                        </SwiftHStack>
                      </SwiftNavigationLink>
                    </SwiftSection>
                  ))}
                </SwiftForm>
                <SwiftToolbar.Content>
                  <SwiftToolbarItem placement="cancellationAction">
                    <SwiftButton
                      role="close"
                      onPress={onClose}
                      modifiers={[swiftAccessibilityLabel(strings.common.done)]}
                    />
                  </SwiftToolbarItem>
                </SwiftToolbar.Content>
              </SwiftToolbar>
              {plugins.map((plugin) => (
                <SwiftNavigationDestination key={plugin.id} value={plugin.id}>
                  <ReaderPluginDetail
                    plugin={plugin}
                    busy={busy}
                    strings={strings}
                    errorSections={errorSections}
                    onTogglePlugin={onTogglePlugin}
                    onResetPlugin={onResetPlugin}
                    onChangePluginValue={onChangePluginValue}
                  />
                </SwiftNavigationDestination>
              ))}
            </SwiftNavigationStack>
          </SwiftGroup>
        </SwiftBottomSheet>
      </SwiftHost>
    </View>
  );
}

function ReaderPluginErrorSections({
  error,
  loadError,
  retryingLoad,
  canRetryLoadError,
  dangerColor,
  strings,
  onDismissError,
  onDismissLoadError,
  onRetryLoad,
}: {
  error: string | null;
  loadError: string | null;
  retryingLoad: boolean;
  canRetryLoadError: boolean;
  dangerColor: string;
  strings: MobileStrings;
  onDismissError: () => void;
  onDismissLoadError: () => void;
  onRetryLoad: () => void;
}) {
  const renderError = (detail: string, actions: ReactNode, key: string) => {
    const { description, diagnostic } = splitMobileInlineErrorDetail(detail);
    return (
      <SwiftSection
        key={key}
        title={strings.settings.settingsActionFailed}
        footer={diagnostic ? <SwiftText modifiers={[textSelection(true)]}>{diagnostic}</SwiftText> : undefined}
      >
        <SwiftLabel
          title={description}
          systemImage="exclamationmark.triangle"
          modifiers={[foregroundStyle(dangerColor)]}
        />
        {actions}
      </SwiftSection>
    );
  };
  return (
    <>
      {loadError
        ? renderError(
            loadError,
            <>
              {retryingLoad ? (
                <SwiftHStack spacing={10}>
                  <SwiftProgressView />
                  <SwiftText modifiers={[secondaryText]}>{strings.common.retry}</SwiftText>
                </SwiftHStack>
              ) : (
                <SwiftButton
                  label={strings.common.retry}
                  systemImage="arrow.clockwise"
                  onPress={onRetryLoad}
                  modifiers={canRetryLoadError ? [] : [swiftDisabled(true)]}
                />
              )}
              <SwiftButton label={strings.common.clear} onPress={onDismissLoadError} />
            </>,
            "load-error",
          )
        : null}
      {error
        ? renderError(
            error,
            <SwiftButton label={strings.common.clear} onPress={onDismissError} />,
            "action-error",
          )
        : null}
    </>
  );
}

function ReaderPluginDetail({
  plugin,
  busy,
  strings,
  errorSections,
  onTogglePlugin,
  onResetPlugin,
  onChangePluginValue,
}: {
  plugin: MobileReaderPluginState;
  busy: boolean;
  strings: MobileStrings;
  errorSections: ReactNode;
  onTogglePlugin: ReaderPluginSettingsSheetProps["onTogglePlugin"];
  onResetPlugin: ReaderPluginSettingsSheetProps["onResetPlugin"];
  onChangePluginValue: ReaderPluginSettingsSheetProps["onChangePluginValue"];
}) {
  const sections = useMemo(
    () => buildMobileReaderPluginNativeSections(plugin.settings, plugin.values, strings),
    [plugin.settings, plugin.values, strings],
  );
  // Settings stay visible (greyed) while the plugin is off, so the page keeps
  // its shape when the switch above them flips.
  const locked = busy || !plugin.enabled;
  const change = (key: string, value: unknown) => {
    if (locked) return;
    onChangePluginValue(plugin, key, value);
  };

  return (
    <SwiftForm modifiers={[navigationTitle(plugin.name), inlineToolbarTitle()]}>
      {errorSections}
      <SwiftSection
        footer={
          <SwiftText>
            {plugin.enabled
              ? plugin.description
              : formatMobileString(strings.settings.readerPluginOffFooter, { name: plugin.name })}
          </SwiftText>
        }
      >
        <SwiftToggle
          label={plugin.name}
          systemImage={mobileReaderPluginSystemImage(plugin)}
          isOn={plugin.enabled}
          onIsOnChange={(enabled) => {
            if (busy || enabled === plugin.enabled) return;
            onTogglePlugin(plugin, enabled);
          }}
          modifiers={[
            swiftAccessibilityLabel(formatMobileString(strings.settings.readerPluginSwitch, { name: plugin.name })),
            ...(busy ? [swiftDisabled(true)] : []),
          ]}
        />
      </SwiftSection>
      {sections.length === 0 ? (
        <SwiftSection>
          <SwiftText modifiers={[secondaryText]}>{strings.settings.noPluginSettings}</SwiftText>
        </SwiftSection>
      ) : (
        sections.map((section) => (
          <SwiftSection
            key={section.key}
            title={section.title}
            footer={section.footer ? <SwiftText>{section.footer}</SwiftText> : undefined}
          >
            {section.rows.map((row) => (
              <Fragment key={row.id}>
                <ReaderPluginSettingRow row={row} locked={locked} strings={strings} onChange={change} />
                {plugin.id === "japanese-learning" && row.setting.key === MOBILE_JAPANESE_LEARNING_ENGINE_SETTING_KEY ? (
                  <ReaderPluginDictionaryRow
                    engine={plugin.values[MOBILE_JAPANESE_LEARNING_ENGINE_SETTING_KEY]}
                    disabled={locked}
                    strings={strings}
                  />
                ) : null}
              </Fragment>
            ))}
          </SwiftSection>
        ))
      )}
      {sections.length > 0 ? (
        <SwiftSection>
          <SwiftButton
            label={strings.settings.sourceSettingsResetLabel}
            systemImage="arrow.counterclockwise"
            role="destructive"
            onPress={() => {
              if (locked) return;
              onResetPlugin(plugin);
            }}
            modifiers={locked ? [swiftDisabled(true)] : []}
          />
        </SwiftSection>
      ) : null}
    </SwiftForm>
  );
}

function RowTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <SwiftVStack alignment="leading" spacing={2}>
      <SwiftText>{title}</SwiftText>
      {subtitle ? (
        <SwiftText modifiers={[font({ textStyle: "footnote" }), secondaryText]}>{subtitle}</SwiftText>
      ) : null}
    </SwiftVStack>
  );
}

function ReaderPluginSettingRow({
  row,
  locked,
  strings,
  onChange,
}: {
  row: MobileReaderPluginNativeRow;
  locked: boolean;
  strings: MobileStrings;
  onChange: (key: string, value: unknown) => void;
}) {
  const lockedModifiers = locked ? [swiftDisabled(true)] : [];
  switch (row.kind) {
    case "toggle":
      return (
        <SwiftToggle
          isOn={row.value}
          onIsOnChange={(value) => {
            if (value === row.value) return;
            onChange(row.setting.key, value);
          }}
          modifiers={lockedModifiers}
        >
          <SwiftText>{row.title}</SwiftText>
          {row.subtitle ? <SwiftText>{row.subtitle}</SwiftText> : null}
        </SwiftToggle>
      );
    case "picker":
      return (
        <SwiftPicker
          label={<RowTitle title={row.title} subtitle={row.subtitle} />}
          selection={row.selection}
          onSelectionChange={(selection) => {
            if (selection === null || selection === row.selection) return;
            void hapticSelection();
            onChange(row.setting.key, encodeMobileReaderPluginPickerSelection(row, selection));
          }}
          modifiers={[pickerStyle("menu"), ...lockedModifiers]}
        >
          {row.options.map((option) => (
            <SwiftText key={String(option.value)} modifiers={[tag(option.value)]}>
              {option.label}
            </SwiftText>
          ))}
        </SwiftPicker>
      );
    case "slider":
      return <ReaderPluginSliderRow row={row} locked={locked} onChange={onChange} />;
    case "stepper":
      return (
        <SwiftStepper
          label={formatMobileString(strings.settings.selectSettingOption, {
            title: row.title,
            option: row.valueLabel,
          })}
          value={row.value}
          min={row.min}
          max={row.max}
          step={row.step}
          onValueChange={(value) => {
            const next = snapMobileReaderPluginNumber(row, value);
            if (next === row.value) return;
            onChange(row.setting.key, next);
          }}
          modifiers={lockedModifiers}
        />
      );
    case "readonly":
      // A kind this sheet has no native control for: name it, show its value
      // and say where it can be changed, rather than dropping it.
      return (
        <SwiftVStack alignment="leading" spacing={2}>
          <SwiftHStack>
            <SwiftText>{row.title}</SwiftText>
            <SwiftSpacer />
            {row.valueText ? (
              <SwiftText modifiers={[secondaryText, lineLimit(1)]}>{row.valueText}</SwiftText>
            ) : null}
          </SwiftHStack>
          {row.subtitle ? (
            <SwiftText modifiers={[font({ textStyle: "footnote" }), secondaryText]}>{row.subtitle}</SwiftText>
          ) : null}
          <SwiftText modifiers={[font({ textStyle: "footnote" }), secondaryText]}>
            {strings.settings.readerPluginSettingEditElsewhere}
          </SwiftText>
        </SwiftVStack>
      );
  }
}

/** Previews while dragging, writes once on release (each write is a save). */
function ReaderPluginSliderRow({
  row,
  locked,
  onChange,
}: {
  row: MobileReaderPluginNativeNumberRow;
  locked: boolean;
  onChange: (key: string, value: unknown) => void;
}) {
  const [draft, setDraft] = useState(row.value);
  const draftRef = useRef(row.value);
  // A saved (or reset) value replaces the draft, derived during render.
  const [savedValue, setSavedValue] = useState(row.value);
  if (savedValue !== row.value) {
    setSavedValue(row.value);
    setDraft(row.value);
  }
  const format = row.setting.formatValue;
  const draftLabel = typeof format === "function" ? String(format(draft)) : String(draft);

  return (
    <SwiftVStack alignment="leading" spacing={6}>
      <SwiftHStack>
        <SwiftText>{row.title}</SwiftText>
        <SwiftSpacer />
        <SwiftText modifiers={[secondaryText, monospacedDigit()]}>{draftLabel}</SwiftText>
      </SwiftHStack>
      {row.subtitle ? (
        <SwiftText modifiers={[font({ textStyle: "footnote" }), secondaryText]}>{row.subtitle}</SwiftText>
      ) : null}
      <SwiftSlider
        value={draft}
        min={row.min}
        max={row.max}
        step={row.step}
        onValueChange={(value) => {
          const next = snapMobileReaderPluginNumber(row, value);
          draftRef.current = next;
          setDraft(next);
        }}
        onEditingChanged={(editing) => {
          if (editing) {
            draftRef.current = row.value;
            return;
          }
          if (draftRef.current === row.value) return;
          void hapticSelection();
          onChange(row.setting.key, draftRef.current);
        }}
        modifiers={[swiftAccessibilityLabel(row.title), ...(locked ? [swiftDisabled(true)] : [])]}
      />
    </SwiftVStack>
  );
}

/**
 * The on-device dictionary line under Recognition Engine (status, live
 * download progress, Download now / Retry / Remove). Nothing where there is
 * no on-device analyzer.
 */
function ReaderPluginDictionaryRow({
  engine,
  disabled,
  strings,
}: {
  engine: unknown;
  disabled: boolean;
  strings: MobileStrings;
}) {
  const { tokens } = useNemuTheme();
  const { row, copy, failed, actionLabel, actionPending, runAction } = useMobileJapaneseLearningDictionaryRowModel({
    engine,
    strings,
  });
  if (!row) return null;

  return (
    <SwiftVStack alignment="leading" spacing={8}>
      <SwiftHStack spacing={12}>
        <SwiftVStack alignment="leading" spacing={2}>
          <SwiftText>{copy.title}</SwiftText>
          <SwiftText
            modifiers={[font({ textStyle: "footnote" }), failed ? foregroundStyle(tokens.danger) : secondaryText]}
          >
            {row.status}
          </SwiftText>
        </SwiftVStack>
        <SwiftSpacer />
        {actionPending ? (
          <SwiftProgressView />
        ) : actionLabel ? (
          <SwiftButton
            label={actionLabel}
            role={row.action === "remove" ? "destructive" : undefined}
            onPress={() => {
              void runAction();
            }}
            modifiers={[
              buttonStyle("borderless"),
              swiftAccessibilityLabel(`${actionLabel}, ${copy.title}`),
              ...(disabled ? [swiftDisabled(true)] : []),
            ]}
          />
        ) : null}
      </SwiftHStack>
      {row.progress !== undefined ? (
        <SwiftProgressView
          value={row.progress}
          modifiers={[progressViewStyle("linear"), swiftAccessibilityLabel(copy.progressAccessibility)]}
        />
      ) : null}
    </SwiftVStack>
  );
}

const styles = StyleSheet.create({
  host: {
    position: "absolute",
    left: 0,
    top: 0,
    width: 1,
    height: 1,
  },
});
