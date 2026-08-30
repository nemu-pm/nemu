import type { InstalledSource, LocalSourceLink } from "@/data/schema";
import { makeSourceKey, parseSourceKey } from "@/sources/aidokuRegistry";
import { normalizeInstalledSource } from "@/sources/mobileSourceRuntime";
import { getMobileSourceRouteParamCandidates } from "./mobileSourceRoutes";

export function getMobileInstalledSourceRegistryKey(source: InstalledSource): string {
  const parsed = parseSourceKey(source.id);

  if (
    parsed.registryId !== "unknown" &&
    parsed.sourceId &&
    (!source.registryId || source.registryId === parsed.registryId)
  ) {
    return makeSourceKey(parsed.registryId, parsed.sourceId);
  }

  const normalized = normalizeInstalledSource(source);
  return makeSourceKey(normalized.registryId, normalized.sourceId);
}

export function getMobileInstalledSourceRegistryRef(source: InstalledSource): {
  registryId: string;
  sourceId: string;
} {
  const parsed = parseSourceKey(getMobileInstalledSourceRegistryKey(source));
  if (parsed.registryId !== "unknown") return parsed;

  const normalized = normalizeInstalledSource(source);
  return {
    registryId: normalized.registryId,
    sourceId: normalized.sourceId,
  };
}

export function getMobileInstalledSourceRegistryKeys(source: InstalledSource): string[] {
  const normalized = normalizeInstalledSource(source);
  const keys = new Set([
    source.id,
    getMobileInstalledSourceRegistryKey(source),
    makeSourceKey(normalized.registryId, normalized.sourceId),
  ]);

  if (source.id && !source.id.includes(":")) {
    keys.add(makeSourceKey(normalized.registryId, source.id));
  }

  return [...keys].filter((key) => key.length > 0);
}

export function getMobileInstalledSourceSettingsKeys(source: InstalledSource): string[] {
  return getMobileInstalledSourceRegistryKeys(source);
}

export function getMobileSourceLinkRegistryKeys(
  link: Pick<LocalSourceLink, "registryId" | "sourceId">,
  installedSource?: InstalledSource | null,
): string[] {
  const keys = new Set([makeSourceKey(link.registryId, link.sourceId)]);

  if (installedSource) {
    for (const key of getMobileInstalledSourceRegistryKeys(installedSource)) {
      const parsed = parseSourceKey(key);
      keys.add(
        parsed.registryId === "unknown"
          ? makeSourceKey(link.registryId, key)
          : makeSourceKey(parsed.registryId, parsed.sourceId),
      );
    }
  }

  return [...keys];
}

export function mobileInstalledSourceMatchesRoute(
  source: InstalledSource,
  registryId: string,
  sourceId: string,
): boolean {
  const routeKeys = new Set(
    getMobileSourceRouteParamCandidates(sourceId).map((candidate) =>
      makeSourceKey(registryId, candidate),
    ),
  );
  return getMobileInstalledSourceRegistryKeys(source).some((key) => {
    const parsed = parseSourceKey(key);
    const sourceKey =
      parsed.registryId === "unknown"
        ? makeSourceKey(registryId, key)
        : makeSourceKey(parsed.registryId, parsed.sourceId);
    return routeKeys.has(sourceKey);
  });
}

export function mobileInstalledSourceMatchesLink(
  source: InstalledSource,
  link: Pick<LocalSourceLink, "registryId" | "sourceId">,
): boolean {
  return mobileInstalledSourceMatchesRoute(source, link.registryId, link.sourceId);
}
