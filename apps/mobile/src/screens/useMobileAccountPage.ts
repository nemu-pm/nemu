import { useState } from "react";
import { useRouter } from "expo-router";
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
  const router = useRouter();
  const toast = useMobileToast();
  const language = useMobileLanguageSettings();
  const strings = getMobileStrings(language.appLanguage);
  const { data: session } = mobileAuthClient.useSession();
  const user = session?.user;
  const rawProvider = useQuery(api.auth.getOAuthProvider, user ? {} : "skip");
  const provider = normalizeMobileOAuthProvider(rawProvider);
  const providerLabel = provider === "apple" ? "Apple" : provider === "google" ? "Google" : "—";
  const cloudSignOut = useMobileCloudSignOut({ user, strings });
  const [deleting, setDeleting] = useState(false);

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
        router.back();
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
