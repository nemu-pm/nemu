import type { InstalledSource } from "@/data/schema";
import type { MobileDataStore } from "@/data/storeTypes";
import {
  installedSourceIdFromKey,
  isMobileInstalledSourceDisabled,
  normalizeInstalledSource,
} from "@/sources/mobileSourceRuntime";
import { makeMobileSourceExecutionKey } from "@/sources/mobileSourceProfileScope";
import { loadMobileSourceSettingsByKeys } from "./mobileSourceSettings";
import { selfHostedCookieScope } from "./selfHosted/executorSource";
import { resetLocalNetworkImageGrantsForTests, setLocalNetworkImageGrant } from "./selfHosted/imageScopes";
import { SELF_HOSTED_REGISTRY_ID, isSelfHostedConfig } from "./selfHosted/policy";

/**
 * Self-hosted sources whose server lives on the user's own network, and the
 * setting that holds the server address. (The built-in Komga / Kavita /
 * Suwayomi sources are not listed here: their address is part of the source
 * row itself, and `resolveMobileLocalNetworkAllowanceTargets` grants it to
 * their own scope.)
 *
 * The native HTTP layer refuses every private, loopback and reserved
 * destination for a source package. These entries are the only way a source
 * gets an exception, and only for the one host:port the *user* typed into the
 * named setting (never a value the package declares as its default). Adding a
 * source here is a reviewed app change, not something a package can ask for.
 */
export const MOBILE_LOCAL_NETWORK_SERVER_SETTINGS: Readonly<
  Record<string, readonly string[]>
> = {
  "multi.lanraragi": ["baseUrl"],
};

const MAX_URLS_PER_SOURCE = 4;
const MAX_URL_LENGTH = 2_048;

export function getMobileLocalNetworkServerSettingKeys(
  sourceId: string,
): readonly string[] {
  return Object.prototype.hasOwnProperty.call(
    MOBILE_LOCAL_NETWORK_SERVER_SETTINGS,
    sourceId,
  )
    ? MOBILE_LOCAL_NETWORK_SERVER_SETTINGS[sourceId]!
    : [];
}

/**
 * The http(s) server URLs among the user's saved values for [sourceId]'s
 * server-URL settings. Anything else a source stores is ignored.
 */
export function collectMobileLocalNetworkUrls(
  sourceId: string,
  userValues: Record<string, unknown> | null | undefined,
): string[] {
  if (!userValues) return [];
  const urls: string[] = [];
  for (const key of getMobileLocalNetworkServerSettingKeys(sourceId)) {
    const value = userValues[key];
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (
      !trimmed ||
      trimmed.length > MAX_URL_LENGTH ||
      !/^https?:\/\//i.test(trimmed) ||
      urls.includes(trimmed)
    ) {
      continue;
    }
    urls.push(trimmed);
    if (urls.length >= MAX_URLS_PER_SOURCE) break;
  }
  return urls;
}

export type MobileLocalNetworkAllowanceTarget = {
  /** The cookie scope native keys the grant by (profile-scoped execution key). */
  scopeKey: string;
  urls: string[];
};

export async function resolveMobileLocalNetworkAllowanceTargets(
  store: Pick<MobileDataStore, "getSourceSettings">,
  installedSources: readonly InstalledSource[],
  profileScope?: string,
): Promise<MobileLocalNetworkAllowanceTarget[]> {
  const targets: MobileLocalNetworkAllowanceTarget[] = [];
  for (const installed of installedSources) {
    if (installed.removed || isMobileInstalledSourceDisabled(installed)) continue;
    if (installed.registryId === SELF_HOSTED_REGISTRY_ID) {
      // A built-in server source: its one address, for its own scope only.
      if (isSelfHostedConfig(installed.selfHosted) && installed.sourceId) {
        targets.push({
          scopeKey: selfHostedCookieScope(installed.sourceId, profileScope),
          urls: [installed.selfHosted.server],
        });
      }
      continue;
    }
    const runtime = normalizeInstalledSource(installed);
    if (runtime.sourceKind !== "aidoku") continue;
    const sourceId = (installedSourceIdFromKey(runtime) ?? runtime.sourceId).trim();
    if (getMobileLocalNetworkServerSettingKeys(sourceId).length === 0) continue;

    const canonicalKey = `${runtime.registryId}:${sourceId}`;
    const saved = await loadMobileSourceSettingsByKeys(store, [
      canonicalKey,
      installed.id,
    ]);
    const urls = collectMobileLocalNetworkUrls(sourceId, saved?.values);
    if (urls.length === 0) continue;
    targets.push({
      scopeKey: makeMobileSourceExecutionKey(canonicalKey, profileScope),
      urls,
    });
  }
  return targets;
}

export type MobileLocalNetworkAllowanceNative = {
  setLocalNetworkAllowance?: (sourceKey: string, urls: string[]) => string[];
};

/** Scope keys granted by the last apply, so a removed URL is revoked. */
const appliedScopeKeys = new Set<string>();

/**
 * Brings native in line with the user's saved server URLs: grants the
 * endpoints now present and revokes any granted earlier that no longer are
 * (URL cleared, source disabled or uninstalled, other profile).
 */
export function applyMobileLocalNetworkAllowances(
  native: MobileLocalNetworkAllowanceNative,
  targets: readonly MobileLocalNetworkAllowanceTarget[],
): void {
  const set = native.setLocalNetworkAllowance;
  if (typeof set !== "function") return;
  const wanted = new Set<string>();
  for (const target of targets) {
    wanted.add(target.scopeKey);
    const accepted = set.call(native, target.scopeKey, target.urls);
    // The image pipeline may use a grant only for what native accepted.
    setLocalNetworkImageGrant(target.scopeKey, Array.isArray(accepted) ? accepted : []);
  }
  for (const previous of [...appliedScopeKeys]) {
    if (wanted.has(previous)) continue;
    set.call(native, previous, []);
    setLocalNetworkImageGrant(previous, []);
  }
  appliedScopeKeys.clear();
  for (const key of wanted) appliedScopeKeys.add(key);
}

export function resetMobileLocalNetworkAllowanceStateForTests(): void {
  appliedScopeKeys.clear();
  resetLocalNetworkImageGrantsForTests();
}
