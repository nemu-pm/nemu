import type { SourceRegistry } from "./schema";

/**
 * Last-read directory names by id, for labels drawn synchronously (an
 * installed source's origin). Filled whenever the directory list is read, so
 * a source whose directory arrived by sync or backfill reads as its name
 * rather than its registry id.
 */
const directoryNames = new Map<string, string>();

export function rememberMobileSourceDirectoryNames(
  registries: readonly SourceRegistry[],
): void {
  directoryNames.clear();
  for (const registry of registries) {
    if (registry.type === "url" && registry.name) {
      directoryNames.set(registry.id, registry.name);
    }
  }
}

export function getRememberedMobileSourceDirectoryName(
  registryId: string,
): string | undefined {
  return directoryNames.get(registryId);
}
