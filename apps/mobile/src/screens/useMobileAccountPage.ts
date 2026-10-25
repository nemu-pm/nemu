import { useEffect, useRef, useState } from "react";
import { useNavigation, useRouter } from "expo-router";
import { useQuery } from "convex/react";
import { useMobileToast } from "@/components/MobileToastContext";
import { useMobileCloudSignOut } from "@/components/MobileCloudSignOut";
import { useMobileLanguageSettings } from "@/data/mobileHooks";
import { hapticConfirm, hapticError } from "@/lib/haptics";
import { getMobileStrings } from "@/lib/mobileI18n";
import {
  mobileAccountDeletionFailureMessage,
  runMobileAccountDeletion,
} from "@/lib/mobileAccountDeletion";
import {
  createMobileAccountLeave,
  leaveMobileAccountPages,
  shouldLeaveMobileAccountPages,
} from "@/lib/mobileAccountSignedOut";
import { mobileAuthClient } from "@/sync/mobileAuthClient";
import { normalizeMobileOAuthProvider } from "@/sync/mobileOAuthProvider";
import { mobileConvexRef } from "@/sync/mobileSyncRuntime";
import { api } from "../../../../convex/_generated/api";

/**
 * After deleting the account, device data is kept: the confirmation says so
 * ("data on this device is kept"), so the local sign-out takes the existing
 * keep-data path. Flip to `false` to use the existing remove-data path instead.
 */
const KEEP_DEVICE_DATA_AFTER_ACCOUNT_DELETION = true;

export function useMobileAccountPage() {
  // The Settings stack's navigation (this page is a route in it).
  const navigation = useNavigation() as unknown as Parameters<typeof leaveMobileAccountPages>[0];
  const router = useRouter();
  const toast = useMobileToast();
  const language = useMobileLanguageSettings();
  const strings = getMobileStrings(language.appLanguage);
  const latest = useRef({ navigation, router, toast, strings });
  latest.current = { navigation, router, toast, strings };
  // Once per page: a sign-out or deletion here lands on the Settings root
  // (its Cloud sync card is the signed-out state; this page has none), with
  // the account page off the stack so Back cannot return to it.
  const [leaveAccount] = useState(() =>
    createMobileAccountLeave({
      dismissToSettings: () => latest.current.router.dismissTo("/settings"),
      resetStack: () => {
        leaveMobileAccountPages(latest.current.navigation);
      },
      showSignedOutToast: () =>
        latest.current.toast.show({
          id: "account-signed-out",
          tone: "success",
          title: latest.current.strings.account.signedOut,
        }),
    }),
  );
  const { data: session, isPending: sessionPending } = mobileAuthClient.useSession();
  const user = session?.user;
  const rawProvider = useQuery(api.auth.getOAuthProvider, user ? {} : "skip");
  const provider = normalizeMobileOAuthProvider(rawProvider);
  const providerLabel = provider === "apple" ? "Apple" : provider === "google" ? "Google" : "—";
  const cloudSignOut = useMobileCloudSignOut({
    user,
    strings,
    onSignedOut: () => leaveAccount("signedOut"),
  });
  const [deleting, setDeleting] = useState(false);

  // Signed out without this page's sign-out / deletion leaving first — a
  // session expiry, a remote sign-out, or a sign-out whose local cleanup
  // failed (the session settles to null): the account pages still go, from
  // the Settings stack only (no tab switch, no toast).
  const leave = shouldLeaveMobileAccountPages({
    signedIn: Boolean(user),
    sessionPending,
    busy: deleting || cloudSignOut.signingOut,
  });
  useEffect(() => {
    if (leave) leaveAccount("sessionEnded");
  }, [leave, leaveAccount]);

  const deleteAccount = async () => {
    if (deleting || !user) return;
    const client = mobileConvexRef.current;
    if (!client) {
      toast.show({ id: "account-delete", tone: "danger", title: strings.account.deleteFailed });
      return;
    }
    setDeleting(true);
    try {
      const outcome = await runMobileAccountDeletion({
        deleteMyAccount: (args) => client.action(api.accountDeletion.deleteMyAccount, args),
        signOutLocally: () => cloudSignOut.signOut(KEEP_DEVICE_DATA_AFTER_ACCOUNT_DELETION),
      });
      if (outcome.status === "deleted") {
        await hapticConfirm();
        // Also when the local sign-out failed (the session may linger): the
        // account is gone, so are its pages.
        leaveAccount("deleted");
        toast.show({
          id: "account-delete",
          tone: outcome.localCleanup === "ok" ? "success" : "warning",
          title: strings.account.deleted,
          detail: outcome.localCleanup === "ok" ? undefined : strings.account.deleteCleanupFailed,
        });
      } else if (outcome.status === "failed") {
        await hapticError();
        toast.show({
          id: "account-delete",
          tone: "danger",
          title: mobileAccountDeletionFailureMessage(outcome.kind, strings),
        });
      }
    } finally {
      setDeleting(false);
    }
  };

  return {
    strings,
    user,
    displayName: user?.name && user.name !== user.email ? user.name : (user?.email ?? ""),
    email: user?.email ?? "",
    providerLabel,
    deleting,
    deleteAccount,
    signingOut: cloudSignOut.signingOut,
    requestSignOut: cloudSignOut.requestSignOut,
    signOutSheet: cloudSignOut.sheet,
  };
}
