import { useEffect, useRef, useState } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import {
  MobileNativeSheetScaffold,
  nemuColorWithAlpha,
  NemuPressable,
  radius,
  nemuFontWeight,
  nemuSheetMetrics,
  useNemuTheme,
  useMobileNativeSheetTheme,
  NemuButton,
} from "@/design-system";
import {
  MobileCloudSignOutNativeSheet,
  mobileCloudSignOutNativeSheetAvailable,
} from "@/components/MobileCloudSignOutNativeSheet";
import { MobileSheetSelectionIndicator } from "@/components/MobileSheetSelectionIndicator";
import { MobileInlineErrorBanner } from "@/components/MobileInlineErrorBanner";
import { hapticConfirm, hapticError } from "@/lib/haptics";
import type { MobileStrings } from "@/lib/mobileI18n";
import { mobileProfileSwitchLanding } from "@/lib/mobileProfileSwitchLanding";
import { describeMobileErrorDetail } from "@/lib/mobileSourceErrors";
import { mobileAuthClient } from "@/sync/mobileAuthClient";
import { unregisterMobileBackgroundSyncAsync } from "@/sync/mobileBackgroundSync";
import { signOutAndUnregisterMobileBackgroundSync } from "@/sync/mobileBackgroundSyncLifecycle";
import { runWithMobileSyncSuspended } from "@/sync/mobileSyncRuntime";
import {
  canSelectMobileCloudSignOutChoice,
  canStartMobileCloudSignOut,
  type MobileOAuthProvider,
  classifyMobileCloudSignOutError,
  completeMobileCloudSignOut,
  getMobileCloudSignOutResultAction,
} from "@/sync/mobileOAuthProvider";
import { useMobileDataStore } from "@/data/mobileDataContext";
import { clearMobileAidokuSandboxDataForProfile } from "@/sources/mobileAidokuSandboxData";
import { makeMobileProfileId, retainMobileDataProfile } from "@/data/mobileDataProfile";
import {
  MOBILE_LOCAL_DATA_CLEANUP_UNAVAILABLE,
  removeMobileDataProfileAfterSignOut,
} from "@/data/mobileDataProfileCleanup";
import { emitMobileDataChanged } from "@/data/mobileDataEvents";

// The cloud sign-out flow (keep data / remove data sheet), moved verbatim from
// MobileCloudSyncCard so the Account page owns it. Behaviour is unchanged.

export type CloudSignOutError = {
  title: string;
  detail: string;
  accountId?: string | null;
};

type SignOutChoiceSheetProps = {
  visible: boolean;
  strings: MobileStrings;
  keepData: boolean;
  loading: boolean;
  error?: CloudSignOutError | null;
  onKeepDataChange: (keepData: boolean) => void;
  onErrorDismiss: () => void;
  onCancel: () => void;
  onConfirm: () => void;
};


function SignOutChoiceSheet({
  visible,
  strings,
  keepData,
  loading,
  error,
  onKeepDataChange,
  onErrorDismiss,
  onCancel,
  onConfirm,
}: SignOutChoiceSheetProps) {
  const { tokens } = useMobileNativeSheetTheme();

  const requestClose = () => {
    if (visible && !loading) {
      onCancel();
    }
  };

  const selectChoice = (nextKeepData: boolean) => {
    if (!loading) {
      onKeepDataChange(nextKeepData);
    }
  };

  if (mobileCloudSignOutNativeSheetAvailable) {
    return (
      <MobileCloudSignOutNativeSheet
        visible={visible}
        strings={strings}
        keepData={keepData}
        loading={loading}
        error={error}
        onSelectChoice={selectChoice}
        onErrorDismiss={onErrorDismiss}
        onClose={requestClose}
        onConfirm={onConfirm}
      />
    );
  }

  return (
    <MobileNativeSheetScaffold
      visible={visible}
      onClose={requestClose}
      title={strings.settings.cloudSyncSignOutTitle}
      subtitle={strings.settings.cloudSyncSignOutMessage}
      headerLeading={
        <View style={styles.sheetIconFrame}>
          {/* Signing out keeps the cloud data: no red anywhere in this flow. */}
          <Ionicons name="log-out-outline" size={22} color={tokens.primary} />
        </View>
      }
      dismissLabel={strings.common.cancel}
      dismissDisabled={loading}
      // Android: the body's Cancel button is the explicit escape (as in
      // `MobileConfirmationSheet`), so the chrome close would duplicate it;
      // pan-down and hardware Back still dismiss while not signing out.
      showDismissButton={Platform.OS !== "android"}
      enablePanDownToClose={!loading}
      contentStyle={styles.sheetContent}
    >
      <View style={styles.signOutOptions}>
        <SignOutOption
          active={keepData}
          description={strings.settings.cloudSyncKeepDataDescription}
          disabled={loading}
          iconName="phone-portrait-outline"
          label={strings.settings.cloudSyncKeepData}
          onPress={() => selectChoice(true)}
        />
        <SignOutOption
          active={!keepData}
          description={strings.settings.cloudSyncRemoveDataDescription}
          disabled={loading}
          mutedIcon
          iconName="trash-outline"
          label={strings.settings.cloudSyncRemoveData}
          onPress={() => selectChoice(false)}
        />
      </View>

      {error ? (
        <MobileInlineErrorBanner
          title={error.title}
          detail={error.detail}
          dismissLabel={strings.common.clear}
          onDismiss={onErrorDismiss}
          variant="embedded"
        />
      ) : null}

      <View style={styles.sheetActions}>
        <NemuButton
          accessibilityLabel={strings.common.cancel}
          containerStyle={styles.sheetButton}
          disabled={loading}
          hapticFeedback="none"
          label={strings.common.cancel}
          onPress={onCancel}
          variant="secondary"
        />
        <NemuButton
          accessibilityLabel={strings.settings.cloudSyncSignOutLabel}
          containerStyle={styles.sheetButton}
          disabled={loading}
          label={strings.settings.cloudSyncSignOut}
          loading={loading}
          onPress={onConfirm}
          style={styles.sheetConfirmButton}
          variant="default"
        />
      </View>
    </MobileNativeSheetScaffold>
  );
}

function SignOutOption({
  active,
  description,
  disabled,
  iconName,
  label,
  mutedIcon = false,
  onPress,
}: {
  active: boolean;
  description: string;
  disabled: boolean;
  iconName: keyof typeof Ionicons.glyphMap;
  label: string;
  /**
   * The icon stays muted when selected ("Remove data": a local cleanup, the
   * cloud data stays — never red).
   */
  mutedIcon?: boolean;
  onPress: () => void;
}) {
  const { tokens } = useNemuTheme();
  const activeColor = tokens.primary;
  const canSelect = canSelectMobileCloudSignOutChoice({
    active,
    loading: disabled,
  });

  return (
    <NemuPressable
      accessibilityRole="radio"
      accessibilityLabel={label}
      accessibilityState={{ checked: active, disabled }}
      disabled={disabled}
      hapticFeedback={canSelect ? "selection" : "none"}
      onPress={() => {
        if (canSelect) {
          onPress();
        }
      }}
      pressedScale={0.985}
      style={[
        styles.optionRow,
        nemuSheetMetrics.twoLineRowLayout,
        {
          backgroundColor: active
            ? nemuColorWithAlpha(activeColor, 0.09)
            : tokens.muted,
          borderColor: active ? activeColor : tokens.border,
          opacity: disabled ? 0.65 : 1,
        },
      ]}
    >
      <View style={styles.optionIconFrame}>
        <Ionicons
          name={iconName}
          size={Platform.OS === "android" ? nemuSheetMetrics.rowIconSize : 19}
          color={active && !mutedIcon ? activeColor : tokens.mutedForeground}
        />
      </View>
      <View style={styles.optionCopy}>
        <Text
          numberOfLines={1}
          style={[
            styles.optionTitle,
            nemuSheetMetrics.twoLineRowTitle,
            { color: active ? activeColor : tokens.foreground },
          ]}
        >
          {label}
        </Text>
        <Text
          numberOfLines={2}
          style={[
            styles.optionDescription,
            nemuSheetMetrics.twoLineRowSupporting,
            { color: tokens.mutedForeground },
          ]}
        >
          {description}
        </Text>
      </View>
      <MobileSheetSelectionIndicator
        kind="radio"
        checked={active}
        color={activeColor}
        iosStyle={styles.optionRadio}
      />
    </NemuPressable>
  );
}


export function useMobileCloudSignOut({
  user,
  strings,
  busyProvider = null,
  onSignedOut,
}: {
  user: { id?: string } | null | undefined;
  strings: MobileStrings;
  busyProvider?: MobileOAuthProvider | null;
  /**
   * After a sign-out confirmed in the sheet succeeded (not one `signOut`
   * callers run themselves), while `signingOut` is still set.
   */
  onSignedOut?: () => void;
}) {
  const store = useMobileDataStore();
  const [signingOut, setSigningOut] = useState(false);
  const signingOutRef = useRef(false);
  const [signOutSheetOpen, setSignOutSheetOpen] = useState(false);
  const [signOutSheetAccountId, setSignOutSheetAccountId] = useState<string | null>(null);
  const [keepDataOnSignOut, setKeepDataOnSignOut] = useState(true);
  const [error, setError] = useState<CloudSignOutError | null>(null);
  const busyProviderRef = useRef<MobileOAuthProvider | null>(busyProvider);
  busyProviderRef.current = busyProvider;

  const signOut = async (
    keepData: boolean,
    onSucceeded?: () => void,
  ): Promise<boolean> => {
    const errorAccountId = user?.id ?? null;
    if (
      !canStartMobileCloudSignOut(
        busyProviderRef.current ?? busyProvider,
        signingOutRef.current || signingOut,
      )
    ) {
      return false;
    }

    signingOutRef.current = true;
    setSigningOut(true);
    setError(null);
    // Removing the data leaves this profile's database: the tree remounts.
    if (!keepData) mobileProfileSwitchLanding.hold();
    try {
      await runWithMobileSyncSuspended(async () => {
        await completeMobileCloudSignOut({
          keepData,
          signOutAndUnregister: (onSignOutConfirmed) =>
            signOutAndUnregisterMobileBackgroundSync({
              onSignOutConfirmed,
              signOut: () => mobileAuthClient.signOut(),
              unregister: unregisterMobileBackgroundSyncAsync,
            }),
          retainLocalData: async () => {
            const profileId = makeMobileProfileId(user?.id);
            if (profileId) await retainMobileDataProfile(profileId);
          },
          clearLocalData: async () => {
            const profileId = makeMobileProfileId(errorAccountId);
            if (!profileId) {
              throw new Error(MOBILE_LOCAL_DATA_CLEANUP_UNAVAILABLE);
            }
            await removeMobileDataProfileAfterSignOut({
              profileId,
              clearSandboxData: clearMobileAidokuSandboxDataForProfile,
              clearAccountData: () => store.clearAccountData(),
            });
            emitMobileDataChanged("all");
          },
        });
      });
      if (
        getMobileCloudSignOutResultAction({ succeeded: true }) ===
        "close-confirmation"
      ) {
        setSignOutSheetOpen(false);
      }
      if (!keepData) mobileProfileSwitchLanding.release(true);
      await hapticConfirm();
      onSucceeded?.();
      return true;
    } catch (nextError) {
      if (!keepData) mobileProfileSwitchLanding.release(false);
      if (
        getMobileCloudSignOutResultAction({ succeeded: false }) ===
        "close-confirmation"
      ) {
        setSignOutSheetOpen(false);
      }
      const failure = classifyMobileCloudSignOutError(nextError);
      setError({
        title: strings.settings.cloudSyncSignOutFailed,
        detail:
          failure === "network"
            ? strings.settings.cloudSyncAuthenticationNetworkUnavailable
            : failure === "storage"
              ? strings.settings.cloudSyncAuthenticationStorageUnavailable
              : describeMobileErrorDetail(
                  nextError,
                  strings.settings.cloudSyncSignOutFailed,
                ),
        accountId: errorAccountId,
      });
      await hapticError();
      return false;
    } finally {
      signingOutRef.current = false;
      setSigningOut(false);
    }
  };

  const confirmSignOut = () => {
    if (!user?.id) return;
    setError(null);
    setKeepDataOnSignOut(true);
    setSignOutSheetAccountId(user.id);
    setSignOutSheetOpen(true);
  };


  // A different account (or none) never inherits an open sheet or its error.
  const accountId = user?.id ?? null;
  useEffect(() => {
    setSignOutSheetOpen(false);
    setSignOutSheetAccountId(null);
    setError(null);
  }, [accountId]);

  const sheet = (
    <SignOutChoiceSheet
      error={error}
      keepData={keepDataOnSignOut}
      loading={signingOut}
      onCancel={() => {
        setSignOutSheetOpen(false);
        setSignOutSheetAccountId(null);
      }}
      onConfirm={() => {
        void signOut(keepDataOnSignOut, onSignedOut);
      }}
      onErrorDismiss={() => setError(null)}
      onKeepDataChange={setKeepDataOnSignOut}
      strings={strings}
      visible={signOutSheetOpen && signOutSheetAccountId === (user?.id ?? null)}
    />
  );

  return {
    signingOut,
    requestSignOut: confirmSignOut,
    signOut: (keepData: boolean) => signOut(keepData),
    sheet,
  };
}

const styles = StyleSheet.create({
  sheetContent: { gap: 16 },
  sheetIconFrame: { width: 24, height: 24, alignItems: "center", justifyContent: "center" },
  signOutOptions: { gap: 10 },
  optionRow: {
    minHeight: 74,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  optionIconFrame: { width: 24, height: 24, alignItems: "center", justifyContent: "center" },
  optionCopy: { flex: 1, minWidth: 0 },
  optionTitle: { fontSize: 14, lineHeight: 18, fontWeight: nemuFontWeight.semibold },
  optionDescription: { marginTop: 2, fontSize: 12, lineHeight: 16 },
  optionRadio: {
    width: 22,
    height: 22,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  sheetActions: { flexDirection: "row", gap: 10 },
  sheetButton: { flex: 1 },
  sheetConfirmButton: { minWidth: 132 },
});
