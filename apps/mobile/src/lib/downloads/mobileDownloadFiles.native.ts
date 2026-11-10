import { Directory, File, Paths } from "expo-file-system";
import { Platform } from "react-native";
import NemuAidokuModule from "../../../modules/nemu-aidoku/src/NemuAidokuModule";
import { MOBILE_DOWNLOADS_DIRECTORY_NAME } from "./mobileDownloadPaths";
import type { MobileDownloadFiles } from "./mobileDownloadFilesMemory";

export type { MobileDownloadFiles } from "./mobileDownloadFilesMemory";

function root(): Directory {
  return new Directory(Paths.document, MOBILE_DOWNLOADS_DIRECTORY_NAME);
}

function segments(path: string): string[] {
  const parts = path.split("/").filter(Boolean);
  // Paths are built from digests and fixed names only (`mobileDownloadPaths`);
  // this is the last guard against a path leaving the root.
  if (parts.some((part) => part === "." || part === "..")) {
    throw new Error("Download paths stay inside the downloads directory.");
  }
  return parts;
}

function fileAt(path: string): File {
  return new File(root(), ...segments(path));
}

function directoryAt(path: string): Directory {
  return new Directory(root(), ...segments(path));
}

function ensureParent(path: string): void {
  const parts = segments(path);
  if (parts.length < 2) return;
  const parent = new Directory(root(), ...parts.slice(0, -1));
  if (!parent.exists) parent.create({ intermediates: true, idempotent: true });
}

function isDirectory(path: string): boolean {
  try {
    return Paths.info(directoryAt(path).uri).isDirectory === true;
  } catch {
    return false;
  }
}

function sizeOf(entry: Directory | File): number {
  if (entry instanceof File) return entry.size ?? 0;
  let total = 0;
  for (const child of entry.list()) total += sizeOf(child);
  return total;
}

/** Under `<documents>/nemu-downloads/`, outside every cache directory. */
export const mobileDownloadFiles: MobileDownloadFiles = {
  prepareRoot() {
    const directory = root();
    if (!directory.exists) directory.create({ intermediates: true, idempotent: true });
    if (Platform.OS === "ios") {
      try {
        NemuAidokuModule.excludeFromBackup?.(directory.uri);
      } catch {
        // A binary without the call keeps the default; the files still work.
      }
    }
  },
  async readText(path) {
    const file = fileAt(path);
    if (!file.exists) return null;
    return file.text();
  },
  async writeText(path, text) {
    ensureParent(path);
    const staged = fileAt(`${path}.tmp`);
    await staged.write(text);
    await staged.move(fileAt(path), { overwrite: true });
  },
  async writeBytes(path, bytes) {
    ensureParent(path);
    await fileAt(path).write(bytes);
  },
  async adoptFile(sourceUri, path) {
    ensureParent(path);
    await new File(sourceUri).move(fileAt(path), { overwrite: true });
  },
  async copyFile(sourceUri, path) {
    ensureParent(path);
    await new File(sourceUri).copy(fileAt(path), { overwrite: true });
  },
  async readHead(path, length) {
    const handle = fileAt(path).open();
    try {
      return await handle.readBytes(length);
    } finally {
      handle.close();
    }
  },
  fileSize(path) {
    const file = fileAt(path);
    return file.exists ? (file.size ?? 0) : null;
  },
  directorySize(path) {
    const directory = directoryAt(path);
    if (!directory.exists) return 0;
    try {
      return sizeOf(directory);
    } catch {
      return 0;
    }
  },
  exists(path) {
    return isDirectory(path) || fileAt(path).exists;
  },
  async move(from, to) {
    ensureParent(to);
    if (isDirectory(from)) {
      // Only ever a sibling rename (`<chapter>.partial` -> `<chapter>`).
      const fromParts = segments(from);
      const toParts = segments(to);
      if (fromParts.slice(0, -1).join("/") !== toParts.slice(0, -1).join("/")) {
        throw new Error("Download directories only move within their parent.");
      }
      const target = directoryAt(to);
      if (target.exists) target.delete();
      directoryAt(from).rename(toParts[toParts.length - 1]!);
      return;
    }
    await fileAt(from).move(fileAt(to), { overwrite: true });
  },
  async remove(path) {
    if (isDirectory(path)) {
      directoryAt(path).delete();
      return;
    }
    const file = fileAt(path);
    if (file.exists) file.delete();
  },
  list(path) {
    const directory = path ? directoryAt(path) : root();
    if (!directory.exists) return [];
    return directory.list().map((entry) => entry.name);
  },
  uri(path) {
    return fileAt(path).uri;
  },
};
