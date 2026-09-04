import { useEffect, useRef, useState } from "react";
import {
  AccessibilityInfo,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  GlassSurface,
  MobileSheetScaffold,
  NemuButton,
  nemuFontWeight,
  radius,
  useNemuTheme,
} from "@/design-system";
import { useMobileLanguageSettings } from "@/data/mobileHooks";
import type { SourcePackageSetting } from "@/data/schema";
import { formatMobileString, getMobileStrings } from "@/lib/mobileI18n";
import {
  parseMobileSourceWebSession,
  type MobileSourceLoginSubmission,
} from "@/lib/mobileSourceSettingActions";

export type MobileSourceLoginSheetProps = {
  setting: SourcePackageSetting | null;
  visible: boolean;
  /** Renders inside an existing native sheet without presenting another host. */
  embedded?: boolean;
  submitting: boolean;
  error: string | null;
  onClose: () => void;
  /** Called when the standalone sheet's native dismissal has fully finished. */
  onDismiss?: () => void;
  onSubmit: (submission: MobileSourceLoginSubmission) => void;
};

export function MobileSourceLoginSheet({
  setting,
  visible,
  embedded = false,
  submitting,
  error,
  onClose,
  onDismiss,
  onSubmit,
}: MobileSourceLoginSheetProps) {
  const { tokens } = useNemuTheme();
  const { appLanguage } = useMobileLanguageSettings();
  const strings = getMobileStrings(appLanguage);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [cookiesText, setCookiesText] = useState("");
  const [localStorageText, setLocalStorageText] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);
  const lastAnnouncedErrorRef = useRef<string | null>(null);
  const method = setting?.method ?? "basic";
  const isWeb = method === "web";

  const submit = () => {
    if (!setting || submitting) return;
    setValidationError(null);
    if (isWeb) {
      try {
        const session = parseMobileSourceWebSession(
          cookiesText,
          localStorageText,
          setting.localStorageKeys ?? [],
        );
        onSubmit({ method: "web", ...session });
      } catch {
        setValidationError(strings.settings.sourceSettingsInvalidLoginForm);
      }
      return;
    }

    if (!username.trim() || !password) {
      setValidationError(strings.settings.sourceSettingsInvalidLoginForm);
      return;
    }
    onSubmit({ method: "basic", username: username.trim(), password });
  };

  const activeError = validationError ?? error;
  const usernameLabel = setting?.useEmail
    ? strings.settings.sourceSettingsEmail
    : strings.settings.sourceSettingsUsername;
  const title = setting?.title ?? strings.settings.sourceSettingsLogin;
  const subtitle = isWeb
    ? strings.settings.sourceSettingsWebLoginInstructions
    : strings.settings.sourceSettingsBasicLoginInstructions;

  useEffect(() => {
    if (!visible || !activeError || Platform.OS !== "ios") {
      lastAnnouncedErrorRef.current = null;
      return;
    }
    if (lastAnnouncedErrorRef.current === activeError) return;
    lastAnnouncedErrorRef.current = activeError;
    AccessibilityInfo.announceForAccessibility(activeError);
  }, [activeError, visible]);

  const formContent = (
    <>
      {isWeb ? (
        <View style={styles.fields}>
          <SourceLoginField
            label={strings.settings.sourceSettingsCookies}
            value={cookiesText}
            placeholder={strings.settings.sourceSettingsCookiesPlaceholder}
            editable={!submitting}
            multiline
            onChangeText={setCookiesText}
          />
          {setting?.localStorageKeys?.length ? (
            <View style={styles.fieldGroup}>
              <SourceLoginField
                label={strings.settings.sourceSettingsLocalStorage}
                value={localStorageText}
                placeholder={strings.settings.sourceSettingsLocalStoragePlaceholder}
                editable={!submitting}
                multiline
                onChangeText={setLocalStorageText}
              />
              <Text style={[styles.hint, { color: tokens.mutedForeground }]}>
                {formatMobileString(
                  strings.settings.sourceSettingsLocalStorageKeys,
                  { keys: setting.localStorageKeys.join(", ") },
                )}
              </Text>
            </View>
          ) : null}
        </View>
      ) : (
        <View style={styles.fields}>
          <SourceLoginField
            label={usernameLabel}
            value={username}
            placeholder={usernameLabel}
            editable={!submitting}
            keyboardType={setting?.useEmail ? "email-address" : "default"}
            onChangeText={setUsername}
          />
          <SourceLoginField
            label={strings.settings.sourceSettingsPassword}
            value={password}
            placeholder={strings.settings.sourceSettingsPassword}
            editable={!submitting}
            secureTextEntry
            onChangeText={setPassword}
          />
        </View>
      )}

      {activeError ? (
        <Text
          accessibilityLiveRegion="polite"
          accessibilityRole="alert"
          style={[styles.error, { color: tokens.danger }]}
        >
          {activeError}
        </Text>
      ) : null}

      <View style={styles.actions}>
        <NemuButton
          accessibilityLabel={strings.common.cancel}
          containerStyle={styles.actionButton}
          // Cancel stays live while the credentials are in flight — it is the
          // sheet's escape route.
          hapticFeedback="none"
          label={strings.common.cancel}
          onPress={onClose}
          variant="secondary"
        />
        <NemuButton
          accessibilityLabel={strings.settings.sourceSettingsSubmitLogin}
          containerStyle={styles.actionButton}
          disabled={submitting}
          hapticFeedback="confirm"
          label={strings.settings.sourceSettingsSubmitLogin}
          loading={submitting}
          onPress={submit}
          variant="default"
        />
      </View>
    </>
  );

  if (embedded) {
    return visible && setting ? (
      <View
        style={[
          styles.embeddedPanel,
          { backgroundColor: tokens.card, borderColor: tokens.border },
        ]}
      >
        <View style={styles.embeddedHeader}>
          <Text style={[styles.embeddedTitle, { color: tokens.foreground }]}>
            {title}
          </Text>
          <Text
            style={[
              styles.embeddedSubtitle,
              { color: tokens.mutedForeground },
            ]}
          >
            {subtitle}
          </Text>
        </View>
        {formContent}
      </View>
    ) : null;
  }

  return (
    <MobileSheetScaffold
      visible={visible && setting !== null}
      // Pan-down is disabled while credentials are in flight; the explicit
      // Cancel action remains available so the request can be fenced safely.
      onRequestClose={onClose}
      onDismiss={onDismiss}
      title={title}
      subtitle={subtitle}
      dismissLabel={strings.common.cancel}
      showDismissButton={false}
      backdropDisabled={submitting}
    >
      {formContent}
    </MobileSheetScaffold>
  );
}

function SourceLoginField({
  label,
  value,
  placeholder,
  editable,
  multiline = false,
  keyboardType = "default",
  secureTextEntry = false,
  onChangeText,
}: {
  label: string;
  value: string;
  placeholder: string;
  editable: boolean;
  multiline?: boolean;
  keyboardType?: "default" | "email-address";
  secureTextEntry?: boolean;
  onChangeText: (value: string) => void;
}) {
  const { tokens } = useNemuTheme();
  return (
    <View style={styles.field}>
      <Text style={[styles.label, { color: tokens.foreground }]}>{label}</Text>
      <GlassSurface style={styles.inputShell} contentStyle={styles.inputContent}>
        <TextInput
          accessibilityLabel={label}
          autoCapitalize="none"
          autoCorrect={false}
          editable={editable}
          keyboardType={keyboardType}
          multiline={multiline}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={tokens.mutedForeground}
          secureTextEntry={secureTextEntry}
          selectionColor={tokens.primary}
          style={[
            styles.input,
            multiline && styles.multilineInput,
            { color: tokens.foreground },
          ]}
          value={value}
        />
      </GlassSurface>
    </View>
  );
}

const styles = StyleSheet.create({
  embeddedPanel: {
    gap: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.lg,
    padding: 14,
  },
  embeddedHeader: { gap: 4 },
  embeddedTitle: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: nemuFontWeight.semibold,
  },
  embeddedSubtitle: { fontSize: 13, lineHeight: 18 },
  fields: { gap: 12 },
  fieldGroup: { gap: 5 },
  field: { gap: 6 },
  label: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: nemuFontWeight.medium,
  },
  hint: { fontSize: 11, lineHeight: 15 },
  inputShell: { borderRadius: radius.lg },
  inputContent: { minHeight: 46, justifyContent: "center" },
  input: {
    minHeight: 46,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    lineHeight: 20,
  },
  multilineInput: { minHeight: 92, textAlignVertical: "top" },
  error: { fontSize: 13, lineHeight: 18 },
  actions: { flexDirection: "row", gap: 10 },
  actionButton: { flex: 1 },
});
