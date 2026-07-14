import { useMemo, type ReactNode } from "react";
import { MobileDataContext } from "./mobileDataContext";
import { getMobileWebStateKey, WebUserDataStore } from "./webStore";
import { createMobileSyncDataStore } from "@/sync/mobileSyncDataStore";
import { mobileAuthClient } from "@/sync/mobileAuthClient";
import { mobileSyncConfig } from "@/sync/mobileSyncConfig";
import { makeMobileProfileId } from "./mobileDataProfile";

function MobileWebDataStoreProvider({
  children,
  storageKey,
}: {
  children: ReactNode;
  storageKey: string;
}) {
  const baseStore = useMemo(() => new WebUserDataStore(storageKey), [storageKey]);
  const store = useMemo(() => createMobileSyncDataStore(baseStore), [baseStore]);

  return (
    <MobileDataContext.Provider value={{ store }}>
      {children}
    </MobileDataContext.Provider>
  );
}

function ProfiledMobileWebDataProvider({ children }: { children: ReactNode }) {
  const { data: session, isPending } = mobileAuthClient.useSession();
  if (isPending) return null;
  const profileId = makeMobileProfileId(session?.user?.id);
  return (
    <MobileWebDataStoreProvider storageKey={getMobileWebStateKey(profileId)}>
      {children}
    </MobileWebDataStoreProvider>
  );
}

export function MobileDataProvider({ children }: { children: ReactNode }) {
  if (!mobileSyncConfig.configured) {
    return (
      <MobileWebDataStoreProvider storageKey={getMobileWebStateKey(null)}>
        {children}
      </MobileWebDataStoreProvider>
    );
  }
  return <ProfiledMobileWebDataProvider>{children}</ProfiledMobileWebDataProvider>;
}
