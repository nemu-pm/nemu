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
import { MobileSheetSelectionIndicator } from "@/components/MobileSheetSelectionIndicator";
import { MobileInlineErrorBanner } from "@/components/MobileInlineErrorBanner";
import { hapticConfirm, hapticError } from "@/lib/haptics";
import type { MobileStrings } from "@/lib/mobileI18n";
import { describeMobileErrorDetail } from "@/lib/mobileSourceErrors";
import { mobileAuthClient } from "@/sync/mobileAuthClient";
import { isMobileAuthStorageUnavailable } from "@/sync/mobileAuthSecureStorage";
import { unregisterMobileBackgroundSyncAsync } from "@/sync/mobileBackgroundSync";
import { signOutAndUnregisterMobileBackgroundSync } from "@/sync/mobileBackgroundSyncLifecycle";
import { runWithMobileSyncSuspended } from "@/sync/mobileSyncRuntime";
import {
  canSelectMobileCloudSignOutChoice,
  canStartMobileCloudSignOut,
  type MobileOAuthProvider,
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

  return (
    <MobileNativeSheetScaffold
      visible={visible}
      onClose={requestClose}
      title={strings.settings.cloudSyncSignOutTitle}
      subtitle={strings.settings.cloudSyncSignOutMessage}
      headerLeading={
        <View style={styles.sheetIconFrame}>
          <Ionicons name="log-out-outline" size={22} color={tokens.danger} />
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
          destructive
          disabled={loading}
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
          style={styles.sheetDestructiveButton}
          variant="destructive"
        />
      </View>
    </MobileNativeSheetScaffold>
  );
}

function SignOutOption({
  active,
  description,
  destructive = false,
  disabled,
  iconName,
  label,
  onPress,
}: {
  active: boolean;
  description: string;
  destructive?: boolean;
  disabled: boolean;
  iconName: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  const { tokens } = useNemuTheme();
  const activeColor = destructive ? tokens.danger : tokens.primary;
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
          color={active ? activeColor : tokens.mutedForeground}
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
}: {
  user: { id?: string } | null | undefined;
  strings: MobileStrings;
  busyProvider?: MobileOAuthProvider | null;
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

  const signOut = async (keepData: boolean): Promise<boolean> => {
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
      await hapticConfirm();
      return true;
    } catch (nextError) {
      if (
        getMobileCloudSignOutResultAction({ succeeded: false }) ===
        "close-confirmation"
      ) {
        setSignOutSheetOpen(false);
      }
      setError({
        title: strings.settings.cloudSyncSignOutFailed,
        detail: isMobileAuthStorageUnavailable(nextError)
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
        void signOut(keepDataOnSignOut);
      }}
      onErrorDismiss={() => setError(null)}
      onKeepDataChange={setKeepDataOnSignOut}
      strings={strings}
      visible={signOutSheetOpen && signOutSheetAccountId === (user?.id ?? null)}
    />
  );

  return { signingOut, requestSignOut: confirmSignOut, signOut, sheet };
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
  sheetDestructiveButton: { minWidth: 132 },
});
