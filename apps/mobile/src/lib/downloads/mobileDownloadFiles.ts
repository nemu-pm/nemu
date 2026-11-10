import { createMemoryMobileDownloadFiles, type MobileDownloadFiles } from "./mobileDownloadFilesMemory";

export type { MobileDownloadFiles } from "./mobileDownloadFilesMemory";

/** Tests and Expo web (no downloads): in memory. Native: `mobileDownloadFiles.native.ts`. */
export const mobileDownloadFiles: MobileDownloadFiles = createMemoryMobileDownloadFiles();
