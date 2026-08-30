import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { router } from "expo-router";
import {
  ActivityIndicator,
  Platform,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import appIcon from "../../assets/icon.jpg";
import { MobileInlineErrorBanner } from "@/components/MobileInlineErrorBanner";
import {
  MobileNativeSheetScaffold,
  MobileCachedImage,
  NemuPressable,
  NemuButton,
  radius,
  nemuBrandTextStyle,
  nemuFontWeight,
  useNemuTheme,
} from "@/design-system";
import { NemuAppIconHalo } from "@/components/NemuAppIconHalo";
import { useMobileDataStore } from "@/data/mobileDataContext";
import { emitMobileDataChanged } from "@/data/mobileDataEvents";
import {
  useAvailableSources,
  useInstalledSources,
  useMobileLanguageSettings,
  useSourceInstaller,
} from "@/data/mobileHooks";
import type { AppLanguage } from "@/data/schema";
import { hapticConfirm, hapticError, hapticWarning } from "@/lib/haptics";
import {
  formatMobileString,
  getMobileStrings,
  type MobileStrings,
} from "@/lib/mobileI18n";
import { describeMobileErrorDetail } from "@/lib/mobileSourceErrors";
import {
  canSelectMobileWelcomeLanguageOption,
  canRunMobileWelcomePrimaryAction,
  canRunMobileWelcomeSkipAction,
  buildMobileWelcomeInstalledSourceKeySet,
  createMobileWelcomeCompletionWriteCoordinator,
  getMobileWelcomeAvailableSources,
  getMobileWelcomeDefaultSelection,
  getMobileWelcomePendingSourceInstallCount,
  MOBILE_WELCOME_ICON_SIZE,
  resolveMobileWelcomeNativeSheetPresentation,
  shouldBlockMobileWelcomeUnderlyingContent,
  shouldStackMobileWelcomeActions,
  type MobileWelcomeStep,
} from "@/lib/mobileWelcome";
import { makeSourceKey, type MobileRegistrySource } from "@/sources/aidokuRegistry";

const languageOptions: Array<{ value: AppLanguage; label: string }> = [
  { value: "en", label: "English" },
  { value: "zh", label: "简体中文" },
  { value: "ja", label: "日本語" },
];

function formatLanguages(languages?: string[]): string | undefined {
  return languages?.length ? languages.join(", ").toUpperCase() : undefined;
}

const BRAND_TOKEN = "{{brand}}";

/**
 * `welcome.title` is a per-locale template so each language decides where the
 * branded "nemu" sits ("Welcome to nemu", "欢迎使用 nemu", "nemuへようこそ").
 * Splitting on the placeholder lets the brand keep its own text style.
 */
function splitWelcomeTitleAroundBrand(title: string): [string, string] {
  const index = title.indexOf(BRAND_TOKEN);
  if (index === -1) return [title, ""];
  return [title.slice(0, index), title.slice(index + BRAND_TOKEN.length)];
}

function LanguageStep({
  selectedLanguage,
  strings,
  disabled,
  onSelect,
}: {
  selectedLanguage: AppLanguage;
  strings: MobileStrings;
  disabled: boolean;
  onSelect: (language: AppLanguage) => void;
}) {
  const { tokens } = useNemuTheme();
  return (
    <View style={styles.segmented}>
      {languageOptions.map((option) => {
        const selected = option.value === selectedLanguage;
        const canSelect = canSelectMobileWelcomeLanguageOption({
          selected,
          disabled,
        });
        return (
          <NemuPressable
            key={option.value}
            accessibilityRole="tab"
            accessibilityLabel={formatMobileString(strings.settings.selectSettingOption, {
              title: strings.welcome.languageTitle,
              option: option.label,
            })}
            accessibilityState={{ selected, disabled }}
            disabled={disabled}
            hapticFeedback={canSelect ? "selection" : "none"}
            onPress={() => {
              if (canSelect) {
                onSelect(option.value);
              }
            }}
            pressedScale={0.98}
            containerStyle={styles.segmentContainer}
            style={[
              styles.segment,
              {
                backgroundColor: selected ? tokens.primary : tokens.muted,
                borderColor: selected ? tokens.primary : tokens.border,
                opacity: disabled ? 0.65 : 1,
              },
            ]}
          >
            <Text
              style={[
                styles.segmentText,
                { color: selected ? tokens.primaryForeground : tokens.mutedForeground },
              ]}
            >
              {option.label}
            </Text>
          </NemuPressable>
        );
      })}
    </View>
  );
}

function SourceOption({
  source,
  selected,
  installed,
  disabled,
  strings,
  onToggle,
}: {
  source: MobileRegistrySource;
  selected: boolean;
  installed: boolean;
  disabled: boolean;
  strings: MobileStrings;
  onToggle: () => void;
}) {
  const { tokens } = useNemuTheme();
  const active = selected || installed;
  const optionDisabled = installed || disabled;
  return (
    <NemuPressable
      accessibilityRole="checkbox"
      accessibilityLabel={formatMobileString(strings.welcome.selectRecommendedSource, {
        name: source.name,
      })}
      accessibilityState={{ checked: active, disabled: optionDisabled }}
      disabled={optionDisabled}
      hapticFeedback="selection"
      onPress={onToggle}
      pressedScale={0.985}
      style={[
        styles.sourceOption,
        {
          backgroundColor: tokens.card,
          borderColor: active ? tokens.primary : tokens.border,
          opacity: optionDisabled ? 0.72 : 1,
        },
      ]}
    >
      <View
        style={[
          styles.checkCircle,
          {
            backgroundColor: active ? tokens.primary : "transparent",
            borderColor: active ? tokens.primary : tokens.border,
          },
        ]}
      >
        {active ? (
          <Ionicons name="checkmark" size={14} color={tokens.primaryForeground} />
        ) : null}
      </View>
      <View
        style={[
          styles.sourceIcon,
          { backgroundColor: tokens.sourceIconGlass, borderColor: tokens.border },
        ]}
      >
        {source.icon ? (
          <MobileCachedImage
            fallback={
              <Ionicons
                name="globe-outline"
                size={21}
                color={tokens.mutedForeground}
              />
            }
            uriOwnership="source"
            source={{ uri: source.icon }}
            style={styles.sourceIconImage}
          />
        ) : (
          <Ionicons name="globe-outline" size={21} color={tokens.mutedForeground} />
        )}
      </View>
      <View style={styles.sourceText}>
        <Text numberOfLines={1} style={[styles.sourceTitle, { color: tokens.foreground }]}>
          {source.name}
        </Text>
        <Text numberOfLines={1} style={[styles.sourceSubtitle, { color: tokens.mutedForeground }]}>
          {formatLanguages(source.languages)}
        </Text>
      </View>
    </NemuPressable>
  );
}

export function MobileWelcomeWizard({
  onVisibilityChange,
}: {
  onVisibilityChange?: (visible: boolean) => void;
}) {
  const store = useMobileDataStore();
  const [visible, setVisible] = useState(false);
  const [checking, setChecking] = useState(true);
  const [startupError, setStartupError] = useState<unknown | null>(null);
  const [retryingStartup, setRetryingStartup] = useState(false);
  const settingsReadRunRef = useRef(0);

  const readWelcomeCompletion = useCallback(
    async (initial: boolean) => {
      const run = settingsReadRunRef.current + 1;
      settingsReadRunRef.current = run;
      if (initial) setChecking(true);
      else setRetryingStartup(true);

      try {
        const settings = await store.getSettings();
        if (settingsReadRunRef.current !== run) return;
        setStartupError(null);
        setVisible(settings.mobileWelcomeCompleted !== true);
      } catch (error) {
        if (settingsReadRunRef.current !== run) return;
        // Fail closed: storage failures keep setup modal and recoverable rather
        // than silently bypassing onboarding.
        // JavaScript permits rejecting with nullish/falsy values. Keep the
        // recovery banner and action gate present even for those malformed
        // failures instead of accidentally treating them as "no error".
        setStartupError(error || new Error());
        setVisible(true);
      } finally {
        if (settingsReadRunRef.current === run) {
          if (initial) setChecking(false);
          else setRetryingStartup(false);
        }
      }
    },
    [store],
  );

  useEffect(() => {
    void readWelcomeCompletion(true);
    return () => {
      settingsReadRunRef.current += 1;
    };
  }, [readWelcomeCompletion]);

  useEffect(() => {
    // Hide the underlying navigation tree only while the modal wizard really
    // owns focus. Always release that ownership on provider/profile remounts.
    onVisibilityChange?.(
      shouldBlockMobileWelcomeUnderlyingContent({ checking, visible }),
    );
    return () => onVisibilityChange?.(false);
  }, [checking, onVisibilityChange, visible]);

  if (checking || !visible) return null;

  return (
    <MobileWelcomeWizardContent
      onCompleted={() => setVisible(false)}
      onRetryStartup={() => {
        void readWelcomeCompletion(false);
      }}
      startupError={startupError}
      startupRetrying={retryingStartup}
    />
  );
}

type MobileWelcomeOperationError = {
  title: string;
  detail: string;
};

function MobileWelcomeWizardContent({
  onCompleted,
  onRetryStartup,
  startupError,
  startupRetrying,
}: {
  onCompleted: () => void;
  onRetryStartup: () => void;
  startupError: unknown | null;
  startupRetrying: boolean;
}) {
  const { tokens } = useNemuTheme();
  const insets = useSafeAreaInsets();
  const {
    fontScale,
    height: windowHeight,
    width: windowWidth,
  } = useWindowDimensions();
  const store = useMobileDataStore();
  const completionWriteCoordinator = useMemo(
    () => createMobileWelcomeCompletionWriteCoordinator(),
    [],
  );
  const availableSources = useAvailableSources();
  const installedSources = useInstalledSources();
  const installer = useSourceInstaller();
  const { appLanguage, setAppLanguage } = useMobileLanguageSettings();
  const [step, setStep] = useState<MobileWelcomeStep>("welcome");
  const [selectedLanguage, setSelectedLanguage] = useState<AppLanguage>(appLanguage);
  const [selectedSourceKeys, setSelectedSourceKeys] = useState<Set<string>>(
    () => new Set()
  );
  const [installing, setInstalling] = useState(false);
  const installingRef = useRef(false);
  const [completing, setCompleting] = useState(false);
  const completeGuardRef = useRef(false);
  const [changingLanguage, setChangingLanguage] = useState(false);
  const changingLanguageRef = useRef(false);
  const [skipConfirm, setSkipConfirm] = useState(false);
  const [operationError, setOperationError] =
    useState<MobileWelcomeOperationError | null>(null);
  const [sheetVisible, setSheetVisible] = useState(true);
  const afterSheetDismissRef = useRef<(() => void) | null>(null);

  const strings = getMobileStrings(selectedLanguage);
  const startupBlocked = startupError !== null || startupRetrying;
  const recommendedSources = useMemo(
    () => getMobileWelcomeAvailableSources(selectedLanguage, availableSources.data),
    [availableSources.data, selectedLanguage]
  );
  const installedKeys = useMemo(
    () => buildMobileWelcomeInstalledSourceKeySet(installedSources.data),
    [installedSources.data]
  );
  const pendingSourceInstallCount = useMemo(
    () =>
      getMobileWelcomePendingSourceInstallCount(
        recommendedSources,
        selectedSourceKeys,
        installedKeys,
      ),
    [installedKeys, recommendedSources, selectedSourceKeys],
  );
  const actionState = {
    step,
    installing,
    completing,
    changingLanguage,
    sourcesLoading: availableSources.loading,
    startupBlocked,
  };
  const primaryDisabled = !canRunMobileWelcomePrimaryAction(actionState);
  const skipDisabled = !canRunMobileWelcomeSkipAction(actionState);
  const actionBusy = installing || completing || changingLanguage || startupBlocked;
  const getGuardedActionState = () => ({
    step,
    installing: installingRef.current || installing,
    completing: completeGuardRef.current || completing,
    changingLanguage: changingLanguageRef.current || changingLanguage,
    sourcesLoading: availableSources.loading,
    startupBlocked,
  });

  useEffect(() => {
    setSelectedLanguage(appLanguage);
  }, [appLanguage]);

  useEffect(
    () => () => {
      afterSheetDismissRef.current = null;
    },
    [],
  );

  useEffect(() => {
    setSelectedSourceKeys(
      new Set(getMobileWelcomeDefaultSelection(selectedLanguage, availableSources.data))
    );
  }, [availableSources.data, selectedLanguage]);

  const markCompleted = useCallback(
    () =>
      completionWriteCoordinator.run(async () => {
        await store.updateSettings((settings) => ({
          ...settings,
          mobileWelcomeCompleted: true,
        }));
        emitMobileDataChanged("settings");
      }),
    [completionWriteCoordinator, store],
  );

  // Persist completion as soon as the user reaches the final step. The wizard
  // is safely re-enterable, but a force-quit on the "done" screen used to
  // replay the whole flow even though setup had finished.
  useEffect(() => {
    if (step !== "done") return;
    void markCompleted().catch((error) => {
      setOperationError({
        title: strings.settings.settingsActionFailed,
        detail: describeMobileErrorDetail(
          error,
          strings.settings.settingsActionFailedDetail,
        ),
      });
    });
  }, [
    markCompleted,
    step,
    strings.settings.settingsActionFailed,
    strings.settings.settingsActionFailedDetail,
  ]);

  const completeWelcome = async (afterComplete?: () => void) => {
    if (!canRunMobileWelcomePrimaryAction(getGuardedActionState())) return;

    completeGuardRef.current = true;
    setCompleting(true);
    setOperationError(null);
    let completed = false;
    try {
      await markCompleted();
      await hapticConfirm();
      completed = true;
      // Let the stable native sheet finish its close animation on both
      // platforms; its onClose callback then releases onboarding ownership.
      afterSheetDismissRef.current = afterComplete ?? null;
      setSheetVisible(false);
    } catch (error) {
      afterSheetDismissRef.current = null;
      await hapticError();
      setOperationError({
        title: strings.settings.settingsActionFailed,
        detail: describeMobileErrorDetail(
          error,
          strings.settings.settingsActionFailedDetail,
        ),
      });
    } finally {
      if (!completed) {
        completeGuardRef.current = false;
        setCompleting(false);
      }
    }
  };

  const selectLanguage = async (language: AppLanguage) => {
    if (
      language === selectedLanguage ||
      !canRunMobileWelcomePrimaryAction(getGuardedActionState())
    ) {
      return;
    }
    changingLanguageRef.current = true;
    setChangingLanguage(true);
    setSelectedLanguage(language);
    setOperationError(null);
    try {
      await setAppLanguage(language);
    } catch (error) {
      await hapticError();
      setOperationError({
        title: strings.settings.settingsActionFailed,
        detail: describeMobileErrorDetail(
          error,
          strings.settings.settingsActionFailedDetail,
        ),
      });
    } finally {
      if (changingLanguageRef.current) {
        changingLanguageRef.current = false;
      }
      setChangingLanguage(false);
    }
  };

  const toggleSource = (source: MobileRegistrySource) => {
    if (!canRunMobileWelcomeSkipAction(getGuardedActionState())) return;
    const key = makeSourceKey(source.registryId, source.id);
    setSelectedSourceKeys((current) => {
      const next = new Set(current);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const installSelectedSources = async () => {
    if (!canRunMobileWelcomePrimaryAction(getGuardedActionState())) return;

    installingRef.current = true;
    setInstalling(true);
    setOperationError(null);
    try {
      for (const source of recommendedSources) {
        const key = makeSourceKey(source.registryId, source.id);
        if (!selectedSourceKeys.has(key) || installedKeys.has(key)) continue;
        await installer.installSource(source);
      }
      await installedSources.reload();
      setStep("done");
      await hapticConfirm();
    } catch (error) {
      await hapticError();
      setOperationError({
        title: strings.welcome.sourceInstallFailed,
        detail: describeMobileErrorDetail(
          error,
          strings.welcome.sourceInstallFailedDetail,
        ),
      });
    } finally {
      installingRef.current = false;
      setInstalling(false);
    }
  };

  const skip = () => {
    if (!canRunMobileWelcomeSkipAction(getGuardedActionState())) return;

    if (!skipConfirm) {
      setSkipConfirm(true);
      void hapticWarning();
      return;
    }
    void completeWelcome();
  };

  const openCloudSync = () => {
    void completeWelcome(() => {
      router.navigate("/settings");
    });
  };

  const handleWelcomeSheetClosed = useCallback(() => {
    const afterDismiss = afterSheetDismissRef.current;
    afterSheetDismissRef.current = null;
    onCompleted();
    afterDismiss?.();
  }, [onCompleted]);

  const primaryAction = () => {
    if (!canRunMobileWelcomePrimaryAction(getGuardedActionState())) return;

    setSkipConfirm(false);
    if (step === "welcome") {
      setStep("language");
      return;
    }
    if (step === "language") {
      setStep("sources");
      return;
    }
    if (step === "sources") {
      void installSelectedSources();
      return;
    }
    void completeWelcome();
  };

  const sheetTopPadding = Math.max(insets.top, 18);
  const isSourceStep = step === "sources";
  const sourceRowCount =
    availableSources.loading || !recommendedSources.length
      ? 1
      : recommendedSources.length;
  const sourceListHeight =
    availableSources.loading || !recommendedSources.length
      ? 109
      : sourceRowCount * 58 + Math.max(0, sourceRowCount - 1) * 8 + 25;
  const sourcePreferredHeight =
    18 + Math.max(insets.bottom, 16) + 56 + sourceListHeight + 60;
  const sourceSheetHeight = Math.min(
    620,
    Math.max(320, Math.min(sourcePreferredHeight, windowHeight - sheetTopPadding - 12)),
  );
  const nativePreferredHeight =
    step === "welcome" ? 520 : step === "language" ? 560 : 420;
  const nativeSheetHeight = isSourceStep
    ? sourceSheetHeight
    : Math.min(
        nativePreferredHeight,
        Math.max(240, windowHeight - sheetTopPadding - 12),
      );
  const availableNativeSheetHeight = windowHeight - sheetTopPadding - 12;
  const welcomeSheetPlatform = Platform.OS === "android" ? "android" : "ios";
  const welcomeSheetPresentation = useMemo(
    () =>
      resolveMobileWelcomeNativeSheetPresentation({
        platform: welcomeSheetPlatform,
        step,
        fontScale,
        availableHeight: availableNativeSheetHeight,
        nativeSheetHeight,
      }),
    [
      availableNativeSheetHeight,
      fontScale,
      nativeSheetHeight,
      step,
      welcomeSheetPlatform,
    ],
  );
  const welcomeIntroWidth = Math.min(400, windowWidth - 40);
  const stackActions = shouldStackMobileWelcomeActions(windowWidth);
  const welcomeIntroLines = strings.welcome.introLines;
  const [welcomeTitleBeforeBrand, welcomeTitleAfterBrand] =
    splitWelcomeTitleAroundBrand(strings.welcome.title);

  const content = (
    <>
      {step === "welcome" ? (
        <NemuAppIconHalo
          accessibilityLabel={strings.about.appIconLabel}
          iconSize={MOBILE_WELCOME_ICON_SIZE}
          source={appIcon}
          style={styles.iconWrap}
        />
      ) : null}

      <View style={[styles.header, step === "welcome" && styles.centerHeader]}>
        <Text
          style={[
            styles.title,
            step === "welcome" && styles.welcomeTitle,
            { color: tokens.foreground },
          ]}
        >
          {step === "welcome" ? (
            <>
              {welcomeTitleBeforeBrand}
              <Text style={[styles.brandWord, nemuBrandTextStyle, { color: tokens.primary }]}>
                nemu
              </Text>
              {welcomeTitleAfterBrand}
            </>
          ) : null}
          {step === "language" ? strings.welcome.languageTitle : null}
          {step === "sources" ? strings.welcome.sourcesTitle : null}
          {step === "done" ? strings.welcome.doneTitle : null}
        </Text>
        <Text style={[styles.description, { color: tokens.mutedForeground }]}>
          {step === "welcome" ? strings.welcome.description : null}
          {step === "language" ? strings.welcome.languageDescription : null}
          {step === "sources" ? strings.welcome.sourcesDescription : null}
          {step === "done" ? strings.welcome.doneDescription : null}
        </Text>
      </View>

      {startupError ? (
        <MobileInlineErrorBanner
          title={strings.settings.settingsActionFailed}
          detail={describeMobileErrorDetail(
            startupError,
            strings.settings.settingsActionFailedDetail,
          )}
          actionLabel={strings.common.retry}
          actionDisabled={startupRetrying}
          actionLoading={startupRetrying}
          onActionPress={onRetryStartup}
          variant="embedded"
        />
      ) : operationError ? (
        <MobileInlineErrorBanner
          title={operationError.title}
          detail={operationError.detail}
          dismissLabel={strings.common.clear}
          onDismiss={() => setOperationError(null)}
          variant="embedded"
        />
      ) : null}

      {step === "welcome" ? (
        <View
          accessibilityLabel={welcomeIntroLines.join("\n")}
          accessible
          style={[
            styles.welcomeIntro,
            { width: welcomeIntroWidth },
          ]}
        >
          {/*
            Lines are pre-split per locale, so no font-shrinking hack is needed
            to keep English on one line. CJK copy simply wraps when a device is
            narrow enough to need it.
          */}
          {welcomeIntroLines.map((line, index) => (
            <Text
              key={`${index}-${line}`}
              numberOfLines={2}
              style={[styles.body, styles.welcomeIntroLine, { color: tokens.mutedForeground }]}
            >
              {line}
            </Text>
          ))}
        </View>
      ) : null}

      {step === "language" ? (
        <LanguageStep
          selectedLanguage={selectedLanguage}
          strings={strings}
          disabled={actionBusy}
          onSelect={(language) => {
            void selectLanguage(language);
          }}
        />
      ) : null}

      {step === "sources" ? (
        <View style={styles.sourceList}>
          {availableSources.loading ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator color={tokens.primary} />
              <Text style={[styles.body, { color: tokens.mutedForeground }]}>
                {strings.welcome.loadingSources}
              </Text>
            </View>
          ) : recommendedSources.length ? (
            recommendedSources.map((source) => {
              const key = makeSourceKey(source.registryId, source.id);
              return (
                <SourceOption
                  key={key}
                  source={source}
                  selected={selectedSourceKeys.has(key)}
                  installed={installedKeys.has(key)}
                  disabled={actionBusy || availableSources.loading}
                  strings={strings}
                  onToggle={() => toggleSource(source)}
                />
              );
            })
          ) : (
            <View style={styles.emptyRow}>
              <Ionicons name="globe-outline" size={22} color={tokens.mutedForeground} />
              <Text style={[styles.body, { color: tokens.mutedForeground }]}>
                {strings.welcome.noRecommendedSources}
              </Text>
            </View>
          )}
          <Text style={[styles.hint, { color: tokens.mutedForeground }]}>
            {strings.welcome.sourcesHint}
          </Text>
        </View>
      ) : null}

      {step === "done" ? (
        <View style={styles.doneBlock}>
          <Text style={[styles.body, styles.leftBody, { color: tokens.mutedForeground }]}>
            {strings.welcome.syncHint}
          </Text>
        </View>
      ) : null}

      <View style={[styles.actions, stackActions && styles.stackedActions]}>
        {step !== "done" ? (
          <NemuButton
            label={skipConfirm ? strings.welcome.confirmSkip : strings.welcome.skip}
            variant="ghost"
            disabled={skipDisabled}
            hapticFeedback="none"
            containerStyle={stackActions ? styles.stackedActionContainer : undefined}
            style={stackActions ? styles.stackedAction : undefined}
            onPress={skip}
          />
        ) : (
          // `syncHint` asks the user to sign in, so give that ask an actual
          // affordance: finish the wizard, then land on the settings root that
          // hosts the cloud-sync card.
          <NemuButton
            label={strings.welcome.signIn}
            variant="ghost"
            disabled={primaryDisabled}
            hapticFeedback="none"
            containerStyle={stackActions ? styles.stackedActionContainer : undefined}
            style={stackActions ? styles.stackedAction : undefined}
            onPress={openCloudSync}
          />
        )}
        <NemuButton
          label={
            step === "welcome"
              ? strings.welcome.getStarted
              : step === "language"
                ? strings.welcome.next
                : step === "sources"
                  ? installing
                    ? strings.welcome.installing
                    : pendingSourceInstallCount > 0
                      ? strings.welcome.installAndContinue
                      : strings.welcome.continueWithoutInstalling
                  : strings.welcome.startReading
          }
          variant="default"
          loading={installing || completing}
          disabled={primaryDisabled}
          containerStyle={stackActions ? styles.stackedActionContainer : undefined}
          style={[
            step === "done" && !stackActions ? styles.doneActionButton : undefined,
            stackActions ? styles.stackedAction : undefined,
          ]}
          onPress={primaryAction}
        />
      </View>
    </>
  );

  return (
    <MobileNativeSheetScaffold
      visible={sheetVisible}
      onClose={handleWelcomeSheetClosed}
      snapPoints={welcomeSheetPresentation.snapPoints}
      scroll={welcomeSheetPresentation.scroll}
      enablePanDownToClose={welcomeSheetPresentation.enablePanDownToClose}
      backgroundColor={tokens.background}
      testID="MobileWelcomeWizard"
      contentStyle={styles.sheetContent}
    >
      {content}
    </MobileNativeSheetScaffold>
  );
}

const styles = StyleSheet.create({
  sheetContent: {
    gap: 18,
    paddingHorizontal: 24,
    paddingTop: 18,
  },
  iconWrap: {
    alignSelf: "center",
    height: 128,
    width: 128,
  },
  header: {
    alignItems: "stretch",
    gap: 8,
  },
  centerHeader: {
    alignItems: "center",
  },
  title: {
    fontSize: 22,
    fontWeight: nemuFontWeight.medium,
    lineHeight: 28,
    letterSpacing: 0,
  },
  welcomeTitle: {
    fontSize: 24,
    lineHeight: 30,
    textAlign: "center",
  },
  brandWord: {
    fontWeight: nemuFontWeight.medium,
  },
  description: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: nemuFontWeight.regular,
    letterSpacing: 0,
  },
  body: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: nemuFontWeight.regular,
    letterSpacing: 0,
    textAlign: "center",
  },
  welcomeIntro: {
    alignSelf: "center",
  },
  welcomeIntroLine: {
    width: "100%",
  },
  leftBody: {
    textAlign: "left",
  },
  segmented: {
    flexDirection: "row",
    gap: 4,
  },
  segment: {
    minHeight: 40,
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 8,
  },
  segmentContainer: {
    flex: 1,
    minWidth: 0,
  },
  segmentText: {
    fontSize: 14,
    fontWeight: nemuFontWeight.bold,
  },
  sourceList: {
    gap: 8,
  },
  sourceOption: {
    minHeight: 58,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 12,
  },
  sourceIcon: {
    height: 32,
    width: 32,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  sourceIconImage: {
    height: "100%",
    width: "100%",
  },
  sourceText: {
    flex: 1,
    minWidth: 0,
  },
  sourceTitle: {
    fontSize: 14,
    fontWeight: nemuFontWeight.bold,
    lineHeight: 18,
  },
  sourceSubtitle: {
    fontSize: 12,
    lineHeight: 16,
  },
  checkCircle: {
    height: 22,
    width: 22,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
  },
  hint: {
    fontSize: 12,
    lineHeight: 17,
  },
  loadingRow: {
    minHeight: 84,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  emptyRow: {
    minHeight: 84,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  doneBlock: {
    alignItems: "center",
    gap: 12,
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 8,
    paddingTop: 2,
  },
  stackedActions: {
    alignItems: "stretch",
    flexDirection: "column",
  },
  stackedActionContainer: {
    alignSelf: "stretch",
  },
  stackedAction: {
    width: "100%",
  },
  doneActionButton: {
    alignSelf: "flex-end",
  },
});
