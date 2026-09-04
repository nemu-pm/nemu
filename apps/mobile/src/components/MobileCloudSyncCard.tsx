import { useEffect, useRef, useState } from "react";
import {
  AccessibilityInfo,
  ActivityIndicator,
  Platform,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useConvexAuth, useQuery } from "convex/react";
import {
  MobileNativeSheetScaffold,
  nemuColorWithAlpha,
  NemuPressable,
  radius,
  nemuFontWeight,
  nemuMaxFontSizeMultiplier,
  useNemuTheme,
  NemuButton,
} from "@/design-system";
import { MobileInlineErrorBanner } from "@/components/MobileInlineErrorBanner";
import { MobileConfirmationSheet } from "@/components/MobileConfirmationSheet";
import { useMobileLanguageSettings } from "@/data/mobileHooks";
import { hapticConfirm, hapticError } from "@/lib/haptics";
import {
  formatMobileString,
  getMobileStrings,
  type MobileStrings,
} from "@/lib/mobileI18n";
import { describeMobileErrorDetail } from "@/lib/mobileSourceErrors";
import { mobileAuthClient } from "@/sync/mobileAuthClient";
import { retryMobileConvexAuth } from "@/sync/mobileConvexAuthRetry";
import { isMobileAuthStorageUnavailable } from "@/sync/mobileAuthSecureStorage";
import { unregisterMobileBackgroundSyncAsync } from "@/sync/mobileBackgroundSync";
import { signOutAndUnregisterMobileBackgroundSync } from "@/sync/mobileBackgroundSyncLifecycle";
import { mobileSyncConfig } from "@/sync/mobileSyncConfig";
import {
  clearMobileCloudData,
  mobileSessionUserIdRef,
  runWithMobileSyncSuspended,
} from "@/sync/mobileSyncRuntime";
import { runMobileForegroundSyncNow } from "@/sync/mobileSyncSnapshotState";
import {
  canSelectMobileCloudSignOutChoice,
  canStartMobileCloudSignOut,
  canStartMobileOAuthSignIn,
  completeMobileCloudSignOut,
  getMobileCloudSignOutResultAction,
  normalizeMobileOAuthProvider,
  resolveMobileCloudSignInErrorDetail,
  resolveMobileOAuthSignInOutcome,
} from "@/sync/mobileOAuthProvider";
import { useMobileDataStore } from "@/data/mobileDataContext";
import { clearMobileAidokuSandboxDataForProfile } from "@/sources/mobileAidokuSandboxData";
import {
  makeMobileProfileId,
  retainMobileDataProfile,
} from "@/data/mobileDataProfile";
import {
  MOBILE_LOCAL_DATA_CLEANUP_UNAVAILABLE,
  removeMobileDataProfileAfterSignOut,
} from "@/data/mobileDataProfileCleanup";
import {
  emitMobileDataChanged,
  useMobileDataRevision,
} from "@/data/mobileDataEvents";
import type { MobileSyncSnapshotState } from "@/data/schema";
import { api } from "../../../../convex/_generated/api";

const authProviders = [
  { id: "google", label: "Google", icon: "logo-google" },
  { id: "apple", label: "Apple", icon: "logo-apple" },
] as const;

type AuthProviderId = (typeof authProviders)[number]["id"];

type CloudSyncError = {
  title: string;
  detail: string;
  accountId?: string | null;
};

type SignOutChoiceSheetProps = {
  visible: boolean;
  strings: MobileStrings;
  keepData: boolean;
  loading: boolean;
  error?: CloudSyncError | null;
  onKeepDataChange: (keepData: boolean) => void;
  onErrorDismiss: () => void;
  onCancel: () => void;
  onConfirm: () => void;
};

function SyncStatusBadge({ label }: { label: string }) {
  const { tokens } = useNemuTheme();

  return (
    <View style={[styles.statusBadge, { backgroundColor: tokens.muted }]}>
      <Text
        maxFontSizeMultiplier={nemuMaxFontSizeMultiplier}
        style={[styles.statusBadgeText, { color: tokens.mutedForeground }]}
      >
        {label}
      </Text>
    </View>
  );
}

function MobileCloudSyncUnavailableCard({
  strings,
}: {
  strings: MobileStrings;
}) {
  const { tokens } = useNemuTheme();

  return (
    <View
      style={[
        styles.shell,
        { backgroundColor: tokens.card, borderColor: tokens.border },
      ]}
    >
      <View style={styles.content}>
        <View style={styles.header}>
          <View style={styles.iconFrame}>
            <Ionicons name="cloud-outline" size={20} color={tokens.primary} />
          </View>
          <View style={styles.copy}>
            <Text
              maxFontSizeMultiplier={nemuMaxFontSizeMultiplier}
              style={[styles.title, { color: tokens.foreground }]}
            >
              {strings.settings.cloudSync}
            </Text>
            <Text
              maxFontSizeMultiplier={nemuMaxFontSizeMultiplier}
              style={[styles.subtitle, { color: tokens.mutedForeground }]}
            >
              {strings.settings.cloudSyncDescription}
            </Text>
          </View>
          <SyncStatusBadge label={strings.settings.cloudSyncUnavailable} />
        </View>
        <Text
          maxFontSizeMultiplier={nemuMaxFontSizeMultiplier}
          style={[styles.detail, { color: tokens.mutedForeground }]}
        >
          {strings.settings.cloudSyncUnavailableDetail}
        </Text>
      </View>
    </View>
  );
}

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
  const { tokens } = useNemuTheme();

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
          size={19}
          color={active ? activeColor : tokens.mutedForeground}
        />
      </View>
      <View style={styles.optionCopy}>
        <Text
          numberOfLines={1}
          style={[
            styles.optionTitle,
            { color: active ? activeColor : tokens.foreground },
          ]}
        >
          {label}
        </Text>
        <Text
          numberOfLines={2}
          style={[styles.optionDescription, { color: tokens.mutedForeground }]}
        >
          {description}
        </Text>
      </View>
      <View
        style={[
          styles.optionRadio,
          {
            borderColor: active ? activeColor : tokens.border,
            backgroundColor: active ? activeColor : "transparent",
          },
        ]}
      >
        {active ? (
          <Ionicons
            name="checkmark"
            size={13}
            color={tokens.primaryForeground}
          />
        ) : null}
      </View>
    </NemuPressable>
  );
}

function MobileCloudSyncConfiguredCard({
  strings,
}: {
  strings: MobileStrings;
}) {
  const { tokens } = useNemuTheme();
  const store = useMobileDataStore();
  const { data: session, isPending } = mobileAuthClient.useSession();
  const [busyProvider, setBusyProvider] = useState<AuthProviderId | null>(null);
  const busyProviderRef = useRef<AuthProviderId | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const signingOutRef = useRef(false);
  const [signOutSheetOpen, setSignOutSheetOpen] = useState(false);
  const [signOutSheetAccountId, setSignOutSheetAccountId] = useState<
    string | null
  >(null);
  const [keepDataOnSignOut, setKeepDataOnSignOut] = useState(true);
  const [error, setError] = useState<CloudSyncError | null>(null);
  const [syncSnapshotState, setSyncSnapshotState] =
    useState<MobileSyncSnapshotState | null>(null);
  const [syncSnapshotReadError, setSyncSnapshotReadError] =
    useState<CloudSyncError | null>(null);
  const [syncSnapshotAccountId, setSyncSnapshotAccountId] = useState<
    string | null
  >(null);
  const announcedSyncPauseRef = useRef<string | null>(null);
  const announcedSyncStorageErrorRef = useRef<string | null>(null);
  const [retryingSync, setRetryingSync] = useState(false);
  const retryingSyncRef = useRef(false);
  // Re-arming the Convex token fetch is fire-and-forget (it bumps an epoch the
  // provider watches), so the button gets a bounded busy window of its own
  // rather than borrowing the unrelated snapshot-retry state.
  const [transportRetryPending, setTransportRetryPending] = useState(false);
  const [recoverySheetOpen, setRecoverySheetOpen] = useState(false);
  const [recoverySheetAccountId, setRecoverySheetAccountId] = useState<
    string | null
  >(null);
  const [recoveryAcknowledged, setRecoveryAcknowledged] = useState(false);
  const [erasingSyncedData, setErasingSyncedData] = useState(false);
  const erasingSyncedDataRef = useRef(false);
  const [recoveryError, setRecoveryError] = useState<CloudSyncError | null>(
    null,
  );
  const syncStatusRevision = useMobileDataRevision(["syncStatus"]);
  // The Better Auth session and the Convex websocket are independent
  // transports. A signed-in session whose Convex token fetch failed twice is
  // permanently signed out at the sync layer (see mobileConvexAuth.tsx) —
  // surface that state instead of an eternally empty library.
  const {
    isAuthenticated: convexAuthenticated,
    isLoading: convexAuthLoading,
  } = useConvexAuth();
  const user = session?.user;
  const signedIn = Boolean(user);
  const convexAuthStalled =
    signedIn && !convexAuthLoading && !convexAuthenticated;
  const retryingTransport = transportRetryPending && convexAuthStalled;
  useEffect(() => {
    if (!transportRetryPending) return;
    // Bounded: a re-arm reports back through convexAuthStalled clearing, and
    // a re-arm that keeps failing must not pin the spinner forever.
    const timer = setTimeout(() => setTransportRetryPending(false), 8_000);
    return () => clearTimeout(timer);
  }, [transportRetryPending]);
  const rawOAuthProvider = useQuery(
    api.auth.getOAuthProvider,
    signedIn ? {} : "skip",
  );
  const oauthProvider = normalizeMobileOAuthProvider(rawOAuthProvider);
  const accountProvider =
    authProviders.find((provider) => provider.id === oauthProvider) ?? null;
  const displayName =
    user?.name && user.name !== user.email
      ? user.name
      : (user?.email ?? strings.settings.cloudSyncSignedIn);
  const recoverySubject =
    user?.email && user.email !== displayName
      ? `${displayName}\n${user.email}`
      : displayName;
  const visibleError =
    error && error.accountId === (user?.id ?? null) ? error : null;
  const visibleSyncSnapshotReadError =
    syncSnapshotReadError?.accountId === (user?.id ?? null)
      ? syncSnapshotReadError
      : null;

  useEffect(() => {
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (cancelled) return;
      setError(null);
      setSyncSnapshotReadError(null);
      setRecoveryError(null);
      setSignOutSheetOpen(false);
      setSignOutSheetAccountId(null);
      setRecoverySheetOpen(false);
      setRecoverySheetAccountId(null);
      setRecoveryAcknowledged(false);
    });
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  useEffect(() => {
    if (
      Platform.OS !== "ios" ||
      !user?.id ||
      syncSnapshotAccountId !== user.id ||
      syncSnapshotState?.status !== "budget-exceeded"
    ) {
      announcedSyncPauseRef.current = null;
      return;
    }
    const announcementKey = `${syncSnapshotState.generation}:${syncSnapshotState.observedAt}`;
    if (announcedSyncPauseRef.current === announcementKey) return;
    announcedSyncPauseRef.current = announcementKey;
    AccessibilityInfo.announceForAccessibility(
      `${strings.settings.cloudSyncPaused}. ${strings.settings.cloudSyncPausedDetail}`,
    );
  }, [
    strings.settings.cloudSyncPaused,
    strings.settings.cloudSyncPausedDetail,
    syncSnapshotAccountId,
    syncSnapshotState,
    user?.id,
  ]);

  useEffect(() => {
    if (
      Platform.OS !== "ios" ||
      !user?.id ||
      visibleSyncSnapshotReadError === null
    ) {
      announcedSyncStorageErrorRef.current = null;
      return;
    }
    const announcementKey = `${user.id}:${visibleSyncSnapshotReadError.title}:${visibleSyncSnapshotReadError.detail}`;
    if (announcedSyncStorageErrorRef.current === announcementKey) return;
    announcedSyncStorageErrorRef.current = announcementKey;
    AccessibilityInfo.announceForAccessibility(
      `${visibleSyncSnapshotReadError.title}. ${visibleSyncSnapshotReadError.detail}`,
    );
  }, [user?.id, visibleSyncSnapshotReadError]);

  useEffect(() => {
    let cancelled = false;
    const expectedUserId = user?.id;
    if (!expectedUserId) {
      setSyncSnapshotState(null);
      setSyncSnapshotAccountId(null);
      setRecoverySheetOpen(false);
      setRecoveryAcknowledged(false);
      setRecoveryError(null);
      return () => {
        cancelled = true;
      };
    }

    void store
      .getSyncSnapshotState()
      .then((nextState) => {
        if (!cancelled && user?.id === expectedUserId) {
          setSyncSnapshotState(nextState);
          setSyncSnapshotAccountId(expectedUserId);
          setSyncSnapshotReadError(null);
        }
      })
      .catch((nextError) => {
        if (!cancelled && user?.id === expectedUserId) {
          console.warn(
            "[MobileSync] Failed to read sync snapshot state:",
            nextError,
          );
          setSyncSnapshotState(null);
          setSyncSnapshotAccountId(expectedUserId);
          setSyncSnapshotReadError({
            title: strings.settings.cloudSyncStorageUnavailable,
            detail: strings.settings.cloudSyncStorageUnavailableDetail,
            accountId: expectedUserId,
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    store,
    strings.settings.cloudSyncStorageUnavailable,
    strings.settings.cloudSyncStorageUnavailableDetail,
    syncStatusRevision,
    user?.id,
  ]);

  const retryCloudSync = async () => {
    const expectedUserId = user?.id;
    if (!expectedUserId || retryingSyncRef.current) return;
    retryingSyncRef.current = true;
    setRetryingSync(true);
    setError(null);
    try {
      const result = await runMobileForegroundSyncNow(store);
      if (mobileSessionUserIdRef.current !== expectedUserId) return;
      emitMobileDataChanged("syncStatus");
      const nextSnapshotState = await store.getSyncSnapshotState();
      if (mobileSessionUserIdRef.current !== expectedUserId) return;
      setSyncSnapshotState(nextSnapshotState);
      setSyncSnapshotAccountId(expectedUserId);
      if (
        result.reason === "completed" &&
        nextSnapshotState?.status === "healthy"
      ) {
        await hapticConfirm();
        return;
      }
      if (result.reason === "already-running") return;
      setError({
        title: strings.settings.cloudSyncRetryFailed,
        detail:
          result.reason === "budget-exceeded"
            ? strings.settings.cloudSyncStillTooLarge
            : strings.settings.cloudSyncRetryFailed,
        accountId: expectedUserId,
      });
      await hapticError();
    } catch (nextError) {
      if (mobileSessionUserIdRef.current !== expectedUserId) return;
      setError({
        title: strings.settings.cloudSyncRetryFailed,
        detail: describeMobileErrorDetail(
          nextError,
          strings.settings.cloudSyncRetryFailed,
        ),
        accountId: expectedUserId,
      });
      await hapticError();
    } finally {
      retryingSyncRef.current = false;
      setRetryingSync(false);
    }
  };

  const openSyncRecovery = () => {
    if (!user?.id || erasingSyncedDataRef.current) return;
    setRecoveryAcknowledged(false);
    setRecoveryError(null);
    setRecoverySheetAccountId(user.id);
    setRecoverySheetOpen(true);
  };

  const eraseSyncedDataEverywhere = async () => {
    const expectedUserId = user?.id;
    if (
      !expectedUserId ||
      !recoveryAcknowledged ||
      erasingSyncedDataRef.current
    ) {
      return;
    }
    erasingSyncedDataRef.current = true;
    setErasingSyncedData(true);
    setRecoveryError(null);
    try {
      await runWithMobileSyncSuspended(async () => {
        if (mobileSessionUserIdRef.current !== expectedUserId) {
          throw new Error(strings.settings.cloudSyncEraseFailed);
        }
        const cleared = await clearMobileCloudData(store);
        if (!cleared) throw new Error(strings.settings.cloudSyncEraseFailed);
      });
      if (mobileSessionUserIdRef.current !== expectedUserId) return;
      setSyncSnapshotState(null);
      setSyncSnapshotAccountId(null);
      setRecoverySheetOpen(false);
      setRecoverySheetAccountId(null);
      setRecoveryAcknowledged(false);
      emitMobileDataChanged("all");
      await hapticConfirm();
    } catch (nextError) {
      if (mobileSessionUserIdRef.current !== expectedUserId) {
        setRecoverySheetOpen(false);
        setRecoverySheetAccountId(null);
        return;
      }
      setRecoveryError({
        title: strings.settings.cloudSyncEraseFailed,
        detail: describeMobileErrorDetail(
          nextError,
          strings.settings.cloudSyncEraseFailed,
        ),
      });
      await hapticError();
    } finally {
      erasingSyncedDataRef.current = false;
      setErasingSyncedData(false);
    }
  };

  const signIn = async (provider: AuthProviderId) => {
    const errorAccountId = user?.id ?? null;
    if (
      !canStartMobileOAuthSignIn(
        busyProviderRef.current ?? busyProvider,
        signingOutRef.current || signingOut,
      )
    ) {
      return;
    }

    busyProviderRef.current = provider;
    setBusyProvider(provider);
    setError(null);
    try {
      const result = await mobileAuthClient.signIn.social({
        provider,
        callbackURL: "/settings",
      });
      if (result.error) {
        setError({
          title: strings.settings.cloudSyncSignInFailed,
          detail: resolveMobileCloudSignInErrorDetail(result.error, {
            signInFailed: strings.settings.cloudSyncSignInFailed,
            networkUnavailable:
              strings.settings.cloudSyncAuthenticationNetworkUnavailable,
            storageUnavailable:
              strings.settings.cloudSyncAuthenticationStorageUnavailable,
          }),
          accountId: errorAccountId,
        });
        await hapticError();
        return;
      }
      // The Expo client resolves `signIn.social` with the original redirect
      // response even when the user closes the OAuth browser, so only a
      // persisted session proves the callback completed.
      const session = await mobileAuthClient.getSession();
      const outcome = resolveMobileOAuthSignInOutcome(session);
      if (outcome === "failed") {
        setError({
          title: strings.settings.cloudSyncSignInFailed,
          detail: resolveMobileCloudSignInErrorDetail(session.error, {
            signInFailed: strings.settings.cloudSyncSignInFailed,
            networkUnavailable:
              strings.settings.cloudSyncAuthenticationNetworkUnavailable,
            storageUnavailable:
              strings.settings.cloudSyncAuthenticationStorageUnavailable,
          }),
          accountId: errorAccountId,
        });
        await hapticError();
        return;
      }
      if (outcome === "dismissed") return;
      await hapticConfirm();
    } catch (nextError) {
      setError({
        title: strings.settings.cloudSyncSignInFailed,
        detail: isMobileAuthStorageUnavailable(nextError)
          ? strings.settings.cloudSyncAuthenticationStorageUnavailable
          : describeMobileErrorDetail(
              nextError,
              strings.settings.cloudSyncSignInFailed,
            ),
        accountId: errorAccountId,
      });
      await hapticError();
    } finally {
      if (busyProviderRef.current === provider) {
        busyProviderRef.current = null;
      }
      setBusyProvider(null);
    }
  };

  const signOut = async (keepData: boolean) => {
    const errorAccountId = user?.id ?? null;
    if (
      !canStartMobileCloudSignOut(
        busyProviderRef.current ?? busyProvider,
        signingOutRef.current || signingOut,
      )
    ) {
      return;
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

  return (
    <>
      <View
        style={[
          styles.shell,
          { backgroundColor: tokens.card, borderColor: tokens.border },
        ]}
      >
        <View style={styles.content}>
          <View style={styles.header}>
            <View style={styles.iconFrame}>
              <Ionicons name="cloud-outline" size={20} color={tokens.primary} />
            </View>
            <View style={styles.copy}>
              <Text
                maxFontSizeMultiplier={nemuMaxFontSizeMultiplier}
                style={[styles.title, { color: tokens.foreground }]}
              >
                {strings.settings.cloudSync}
              </Text>
              <Text
                maxFontSizeMultiplier={nemuMaxFontSizeMultiplier}
                style={[styles.subtitle, { color: tokens.mutedForeground }]}
              >
                {strings.settings.cloudSyncDescription}
              </Text>
            </View>
          </View>

          {isPending ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator size="small" color={tokens.primary} />
              <Text
                maxFontSizeMultiplier={nemuMaxFontSizeMultiplier}
                style={[styles.detail, { color: tokens.mutedForeground }]}
              >
                {strings.settings.cloudSyncCheckingSession}
              </Text>
            </View>
          ) : signedIn ? (
            <View style={[styles.accountRow, { borderColor: tokens.border }]}>
              <View style={styles.accountIdentity}>
                {accountProvider ? (
                  <View
                    accessibilityLabel={accountProvider.label}
                    style={styles.accountProviderFrame}
                  >
                    <Ionicons
                      name={accountProvider.icon}
                      size={18}
                      color={tokens.foreground}
                    />
                  </View>
                ) : null}
                <View style={styles.accountCopy}>
                  <Text
                    maxFontSizeMultiplier={nemuMaxFontSizeMultiplier}
                    numberOfLines={1}
                    style={[styles.accountName, { color: tokens.foreground }]}
                  >
                    {displayName}
                  </Text>
                  {user?.email && displayName !== user.email ? (
                    <Text
                      maxFontSizeMultiplier={nemuMaxFontSizeMultiplier}
                      numberOfLines={1}
                      style={[styles.detail, { color: tokens.mutedForeground }]}
                    >
                      {user.email}
                    </Text>
                  ) : null}
                </View>
              </View>
              <NemuButton
                accessibilityLabel={strings.settings.cloudSyncSignOutLabel}
                disabled={signingOut}
                label={strings.settings.cloudSyncSignOut}
                loading={signingOut}
                onPress={confirmSignOut}
                size="sm"
                style={styles.signOutButton}
                variant="secondary"
              />
            </View>
          ) : (
            <View style={styles.signInBlock}>
              <Text
                maxFontSizeMultiplier={nemuMaxFontSizeMultiplier}
                style={[styles.detail, { color: tokens.mutedForeground }]}
              >
                {strings.settings.cloudSyncSignInPrompt}
              </Text>
              <View style={styles.providerActions}>
                {authProviders.map((provider) => {
                  const busy = busyProvider === provider.id;
                  return (
                    <NemuButton
                      key={provider.id}
                      accessibilityLabel={formatMobileString(
                        strings.settings.cloudSyncContinueWith,
                        {
                          provider: provider.label,
                        },
                      )}
                      containerStyle={styles.providerButtonContainer}
                      disabled={busyProvider !== null}
                      icon={provider.icon}
                      label={provider.label}
                      loading={busy}
                      onPress={() => {
                        void signIn(provider.id);
                      }}
                      style={styles.providerButton}
                      variant="secondary"
                    />
                  );
                })}
              </View>
            </View>
          )}

          {convexAuthStalled ? (
            <View accessibilityLiveRegion="polite">
              <MobileInlineErrorBanner
                actionDisabled={retryingTransport || signingOut}
                actionLabel={strings.settings.cloudSyncRetry}
                actionLoading={retryingTransport}
                detail={strings.settings.cloudSyncTransportStalledDetail}
                iconName="cloud-offline-outline"
                onActionPress={() => {
                  setTransportRetryPending(true);
                  retryMobileConvexAuth();
                }}
                title={strings.settings.cloudSyncTransportStalled}
                variant="embedded"
              />
            </View>
          ) : null}

          {signedIn &&
          syncSnapshotAccountId === user?.id &&
          syncSnapshotState?.status === "budget-exceeded" ? (
            <View
              accessibilityLiveRegion="polite"
              style={styles.syncPausedBlock}
            >
              <MobileInlineErrorBanner
                announce={false}
                actionDisabled={retryingSync || signingOut}
                actionLabel={strings.settings.cloudSyncRetry}
                actionLoading={retryingSync}
                detail={strings.settings.cloudSyncPausedDetail}
                iconName="warning-outline"
                onActionPress={() => {
                  void retryCloudSync();
                }}
                title={strings.settings.cloudSyncPaused}
                variant="embedded"
              />
              <NemuButton
                accessibilityLabel={strings.settings.cloudSyncRecovery}
                disabled={retryingSync || signingOut}
                label={strings.settings.cloudSyncRecovery}
                onPress={openSyncRecovery}
                size="sm"
                variant="secondary"
              />
            </View>
          ) : null}

          {visibleError ? (
            <MobileInlineErrorBanner
              title={visibleError.title}
              detail={visibleError.detail}
              dismissLabel={strings.common.clear}
              onDismiss={() => setError(null)}
              variant="embedded"
            />
          ) : null}

          {visibleSyncSnapshotReadError ? (
            <View accessibilityLiveRegion="polite">
              <MobileInlineErrorBanner
                announce={false}
                actionLabel={strings.settings.cloudSyncRetry}
                title={visibleSyncSnapshotReadError.title}
                detail={visibleSyncSnapshotReadError.detail}
                iconName="warning-outline"
                onActionPress={() => emitMobileDataChanged("syncStatus")}
                variant="embedded"
              />
            </View>
          ) : null}
        </View>
      </View>
      <SignOutChoiceSheet
        error={visibleError}
        keepData={keepDataOnSignOut}
        loading={signingOut}
        onErrorDismiss={() => setError(null)}
        onCancel={() => {
          setSignOutSheetOpen(false);
          setSignOutSheetAccountId(null);
        }}
        onConfirm={() => {
          void signOut(keepDataOnSignOut);
        }}
        onKeepDataChange={setKeepDataOnSignOut}
        strings={strings}
        visible={
          signOutSheetOpen && signOutSheetAccountId === (user?.id ?? null)
        }
      />
      <MobileConfirmationSheet
        cancelLabel={strings.common.cancel}
        confirmAccessibilityLabel={strings.settings.cloudSyncEraseConfirm}
        confirmDisabled={!recoveryAcknowledged}
        confirmLabel={strings.settings.cloudSyncEraseConfirm}
        description={strings.settings.cloudSyncEraseDescription}
        destructive
        iconName="cloud-offline-outline"
        loading={erasingSyncedData}
        onCancel={() => {
          if (erasingSyncedData) return;
          setRecoverySheetOpen(false);
          setRecoverySheetAccountId(null);
          setRecoveryAcknowledged(false);
          setRecoveryError(null);
        }}
        onConfirm={() => {
          void eraseSyncedDataEverywhere();
        }}
        subject={recoverySubject}
        title={strings.settings.cloudSyncEraseTitle}
        visible={
          recoverySheetOpen && recoverySheetAccountId === (user?.id ?? null)
        }
      >
        <NemuPressable
          accessibilityLabel={strings.settings.cloudSyncEraseAcknowledgement}
          accessibilityRole="checkbox"
          accessibilityState={{
            checked: recoveryAcknowledged,
            disabled: erasingSyncedData,
          }}
          disabled={erasingSyncedData}
          hapticFeedback="selection"
          onPress={() => {
            setRecoveryAcknowledged((current) => !current);
          }}
          pressedScale={0.985}
          style={[
            styles.recoveryAcknowledgement,
            {
              backgroundColor: recoveryAcknowledged
                ? nemuColorWithAlpha(tokens.danger, 0.07)
                : tokens.muted,
              borderColor: recoveryAcknowledged ? tokens.danger : tokens.border,
            },
          ]}
        >
          <View
            style={[
              styles.recoveryCheckbox,
              {
                backgroundColor: recoveryAcknowledged
                  ? tokens.danger
                  : "transparent",
                borderColor: recoveryAcknowledged
                  ? tokens.danger
                  : tokens.mutedForeground,
              },
            ]}
          >
            {recoveryAcknowledged ? (
              <Ionicons
                name="checkmark"
                size={14}
                color={tokens.primaryForeground}
              />
            ) : null}
          </View>
          <Text
            style={[
              styles.recoveryAcknowledgementText,
              { color: tokens.foreground },
            ]}
          >
            {strings.settings.cloudSyncEraseAcknowledgement}
          </Text>
        </NemuPressable>
        {recoveryError ? (
          <MobileInlineErrorBanner
            detail={recoveryError.detail}
            dismissLabel={strings.common.clear}
            onDismiss={() => setRecoveryError(null)}
            title={recoveryError.title}
            variant="embedded"
          />
        ) : null}
      </MobileConfirmationSheet>
    </>
  );
}

export function MobileCloudSyncCard() {
  const { appLanguage } = useMobileLanguageSettings();
  const strings = getMobileStrings(appLanguage);

  if (!mobileSyncConfig.configured) {
    return <MobileCloudSyncUnavailableCard strings={strings} />;
  }

  return <MobileCloudSyncConfiguredCard strings={strings} />;
}

const styles = StyleSheet.create({
  shell: {
    minHeight: 76,
    overflow: "hidden",
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  content: {
    gap: 12,
    padding: 14,
  },
  header: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  iconFrame: {
    width: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  copy: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: nemuFontWeight.semibold,
  },
  subtitle: {
    marginTop: 2,
    fontSize: 13,
    lineHeight: 17,
  },
  detail: {
    fontSize: 12,
    lineHeight: 16,
  },
  statusBadge: {
    minHeight: 26,
    justifyContent: "center",
    borderRadius: radius.md,
    paddingHorizontal: 9,
  },
  statusBadgeText: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: nemuFontWeight.semibold,
  },
  loadingRow: {
    minHeight: 34,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },
  accountRow: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 12,
  },
  accountIdentity: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  accountProviderFrame: {
    width: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  accountCopy: {
    flex: 1,
    minWidth: 0,
  },
  accountName: {
    fontSize: 13,
    lineHeight: 17,
    fontWeight: nemuFontWeight.semibold,
  },
  signOutButton: {
    minWidth: 82,
  },
  syncPausedBlock: {
    gap: 8,
  },
  recoveryAcknowledgement: {
    minHeight: 64,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  recoveryCheckbox: {
    width: 22,
    height: 22,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
  },
  recoveryAcknowledgementText: {
    flex: 1,
    minWidth: 0,
    fontSize: 12,
    lineHeight: 17,
  },
  signInBlock: {
    gap: 10,
  },
  providerActions: {
    flexDirection: "row",
    gap: 8,
  },
  providerButtonContainer: {
    flex: 1,
  },
  providerButton: {
    width: "100%",
  },
  sheetContent: {
    gap: 16,
  },
  sheetIconFrame: {
    width: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  signOutOptions: {
    gap: 10,
  },
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
  optionIconFrame: {
    width: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  optionCopy: {
    flex: 1,
    minWidth: 0,
  },
  optionTitle: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: nemuFontWeight.semibold,
  },
  optionDescription: {
    marginTop: 2,
    fontSize: 12,
    lineHeight: 16,
  },
  optionRadio: {
    width: 22,
    height: 22,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  sheetActions: {
    flexDirection: "row",
    gap: 10,
  },
  sheetButton: {
    flex: 1,
  },
  sheetDestructiveButton: {
    minWidth: 132,
  },
});
