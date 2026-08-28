import type { InstalledSource, SourceRegistry } from "./schema";
import type { MobileDataStore } from "./storeTypes";
import {
  createMobileNativeAbortError,
  throwIfMobileNativeHttpAborted,
} from "@/sources/mobileNativeHttpAbort";

type MobileSourceInstallPersistenceOptions = {
  store: MobileDataStore;
  registry: SourceRegistry;
  source: InstalledSource;
  signal?: AbortSignal;
  /**
   * Auto-updates must only replace the exact installed revision they
   * discovered. A user uninstall, account-data removal, or a newer update
   * therefore wins even when package hydration completed late.
   */
  expectedInstalledUpdatedAt?: number;
  updateOnly?: boolean;
  isAccountMutationBlocked?: () => boolean;
};

export function assertMobileSourceInstallActive(
  signal?: AbortSignal,
  isAccountMutationBlocked?: () => boolean,
): void {
  throwIfMobileNativeHttpAborted(signal);
  if (isAccountMutationBlocked?.()) {
    throw createMobileNativeAbortError();
  }
}

/**
 * Persists a hydrated source package with cancellation and commit-time
 * identity fences. The final check and store invocation deliberately share a
 * synchronous turn: profile cleanup either starts first and blocks this write,
 * or this write enters the store queue first and cleanup removes it afterward.
 */
export async function persistMobileRegistrySourceInstall(
  options: MobileSourceInstallPersistenceOptions,
): Promise<boolean> {
  const {
    store,
    registry,
    source,
    signal,
    expectedInstalledUpdatedAt,
    updateOnly = false,
    isAccountMutationBlocked,
  } = options;

  assertMobileSourceInstallActive(signal, isAccountMutationBlocked);
  await store.saveRegistry(registry);
  assertMobileSourceInstallActive(signal, isAccountMutationBlocked);

  if (updateOnly) {
    const saveIfCurrent = store.saveInstalledSourceIfCurrent?.bind(store);
    if (!saveIfCurrent) return false;
    return saveIfCurrent(source, expectedInstalledUpdatedAt);
  }

  await store.saveInstalledSource(source);
  return true;
}
