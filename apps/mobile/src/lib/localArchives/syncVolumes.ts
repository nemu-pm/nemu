import type { CloudLocalArchiveVolume } from "@nemu/core/sources";
import { fromCloudLocalArchiveVolume } from "./cloud";
import { indexBackedStorage, type ArchiveFs } from "./importArchive";
import type { LocalArchiveVolume } from "./library";

export type VolumeReconcilePlan = {
  /** Cloud records newer than (or missing from) this device's index. */
  apply: LocalArchiveVolume[];
  /** Local records the cloud lacks or has an older copy of. */
  push: LocalArchiveVolume[];
};

/** Newest `updatedAt` wins per volume id; tombstones travel like any record. */
export function reconcileLocalArchiveVolumes(
  local: readonly LocalArchiveVolume[],
  cloud: readonly CloudLocalArchiveVolume[],
): VolumeReconcilePlan {
  const plan: VolumeReconcilePlan = { apply: [], push: [] };
  const localById = new Map(local.map((volume) => [volume.volumeId, volume]));
  const cloudById = new Map(cloud.map((volume) => [volume.volumeId, volume]));
  for (const remote of cloud) {
    const mine = localById.get(remote.volumeId);
    if (!mine || remote.updatedAt > mine.updatedAt) plan.apply.push(fromCloudLocalArchiveVolume(remote));
  }
  for (const mine of local) {
    const remote = cloudById.get(mine.volumeId);
    if (!remote || mine.updatedAt > remote.updatedAt) plan.push.push(mine);
  }
  return plan;
}

/**
 * Brings this device's volume index in line with the cloud list. The device
 * file mapping is never touched by sync, except that a volume deleted
 * elsewhere also loses its local files. Returns what to push.
 */
export async function applyLocalArchiveVolumeSync(
  fs: ArchiveFs,
  cloud: readonly CloudLocalArchiveVolume[],
): Promise<{ push: LocalArchiveVolume[]; changed: boolean }> {
  const storage = indexBackedStorage(fs);
  const plan = reconcileLocalArchiveVolumes(await storage.getVolumes(), cloud);
  for (const volume of plan.apply) {
    await storage.saveVolume(volume);
    if (volume.removed) {
      await fs.removeVolumeFiles(volume.volumeId);
      await storage.removeDeviceFile(volume.volumeId);
    }
  }
  return { push: plan.push, changed: plan.apply.length > 0 };
}
