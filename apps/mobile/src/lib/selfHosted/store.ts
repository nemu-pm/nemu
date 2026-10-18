import { nextSyncTimestamp } from "@nemu/core";
import type { InstalledSource } from "@/data/schema";
import type { MobileDataStore } from "@/data/storeTypes";
import {
  SELF_HOSTED_CREDENTIAL_KEYS,
  SELF_HOSTED_REGISTRY_ID,
  makeSelfHostedSourceId,
  selfHostedSourceKey,
  type SelfHostedCredentials,
  type SelfHostedKind,
} from "./policy";

export type SelfHostedStore = Pick<
  MobileDataStore,
  "getSyncSettings" | "saveInstalledSource" | "saveSourceSettings" | "resetSourceSettings"
>;

export type SelfHostedSourceInput = {
  kind: SelfHostedKind;
  name: string;
  /** Already normalised by `normalizeServerUrl`. */
  server: string;
  credentials: SelfHostedCredentials;
  /** Present when editing an existing server; its key never changes. */
  sourceId?: string;
};

/**
 * Persists a server source. The row (kind, address, display name) is an
 * ordinary installed source and syncs with the account. The login goes to the
 * per-source settings vault instead (Keychain / Keystore, this device only,
 * never synced); the settings are written first so a crash can leave a login
 * without a source, never a source without its login.
 *
 * The key (`komga.home`) is chosen once and kept: renaming a server changes
 * only its display name, so library entries and progress stay attached.
 */
export async function saveSelfHostedSource(
  store: SelfHostedStore,
  input: SelfHostedSourceInput,
): Promise<InstalledSource> {
  const installed = (await store.getSyncSettings()).installedSources;
  const sourceId =
    input.sourceId ??
    makeSelfHostedSourceId(
      input.kind,
      input.name,
      // Removed servers keep their key reserved: a library entry of the old
      // server must never attach to a different one that reused the name.
      installed.filter((source) => source.registryId === SELF_HOSTED_REGISTRY_ID).map((source) => source.sourceId ?? ""),
    );
  const key = selfHostedSourceKey(sourceId);
  const existing = installed.find((source) => source.id === key);

  const values: Record<string, unknown> = {};
  for (const name of SELF_HOSTED_CREDENTIAL_KEYS) {
    const value = input.credentials[name];
    if (value) values[name] = value;
  }
  if (Object.keys(values).length > 0) {
    await store.saveSourceSettings({ sourceKey: key, values, updatedAt: Date.now() });
  } else {
    await store.resetSourceSettings(key);
  }

  const source: InstalledSource = {
    id: key,
    registryId: SELF_HOSTED_REGISTRY_ID,
    sourceKind: "aidoku",
    sourceId,
    name: input.name.trim() || sourceId,
    hasAuthentication: Object.keys(values).length > 0,
    version: 1,
    updatedAt: nextSyncTimestamp(existing?.updatedAt),
    removed: false,
    selfHosted: { kind: input.kind, server: input.server },
    ...(existing?.disabled == null ? {} : { disabled: existing.disabled }),
  };
  await store.saveInstalledSource(source);
  return source;
}

/** A server source whose login is not on this device (synced from another device, or cleared). */
export function selfHostedNeedsSignIn(
  source: Pick<InstalledSource, "registryId" | "hasAuthentication">,
  savedValues: Record<string, unknown> | null | undefined,
): boolean {
  if (source.registryId !== SELF_HOSTED_REGISTRY_ID || !source.hasAuthentication) return false;
  return !SELF_HOSTED_CREDENTIAL_KEYS.some((name) => typeof savedValues?.[name] === "string" && savedValues[name] !== "");
}
