import type { InstalledSource } from "@/data/schema";
import type { CloudLocalArchiveVolume } from "@nemu/core/sources";
import type { LocalArchiveVolume } from "./library";
import type { MobileAidokuExecutorSource } from "@/sources/mobileSourceExecutor";

/**
 * What the app plugs in for the `local-archive` source. Registered once on
 * device; absent in tests and on platforms without a file system, where the
 * source simply does not exist.
 */
export type LocalArchiveProvider = {
  /** The source record, only when this device has (or knows of) any volumes. */
  getInstalledSource(): Promise<InstalledSource | null>;
  createExecutorSource(): MobileAidokuExecutorSource;
  /** Deletes the files of every volume of a work and tombstones them. */
  deleteWork(workId: string): Promise<void>;
  /** Merges the cloud's volume list into this device's index; returns what the cloud lacks. */
  applyCloudVolumes(cloud: readonly CloudLocalArchiveVolume[]): Promise<{ push: LocalArchiveVolume[]; changed: boolean }>;
};

let provider: LocalArchiveProvider | null = null;

export function registerLocalArchiveProvider(next: LocalArchiveProvider | null): void {
  provider = next;
}

export function getLocalArchiveProvider(): LocalArchiveProvider | null {
  return provider;
}
