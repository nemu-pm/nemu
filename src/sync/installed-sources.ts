import { mergeInstalledSources } from "@nemu/core";
import type { InstalledSource } from "@/data/schema";

export function mergeInstalledSourceSnapshots(
  localSources: InstalledSource[],
  cloudSources: InstalledSource[],
): InstalledSource[] {
  return mergeInstalledSources(localSources, cloudSources);
}
