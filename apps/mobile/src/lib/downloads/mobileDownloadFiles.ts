/**
 * The downloads' file I/O, as paths relative to the downloads root
 * (`<documents>/nemu-downloads/`). Metro resolves the expo-file-system
 * implementation in `mobileDownloadFiles.native.ts`; bun's test runner and
 * Expo web get the in-memory one below.
 */
export type MobileDownloadFiles = {
  /** Creates the root and keeps it out of device backups (the pages can be fetched again). */
  prepareRoot(): void;
  readText(path: string): Promise<string | null>;
  /** Replaces the file whole: written beside it, then moved over it. */
  writeText(path: string, text: string): Promise<void>;
  writeBytes(path: string, bytes: Uint8Array): Promise<void>;
  /** Moves a file this app owns (a finished native download) into place. */
  adoptFile(sourceUri: string, path: string): Promise<void>;
  copyFile(sourceUri: string, path: string): Promise<void>;
  readHead(path: string, length: number): Promise<Uint8Array>;
  /** The file's size, or null when there is no such file. */
  fileSize(path: string): number | null;
  /** Total bytes of every file under `path` (0 when missing). */
  directorySize(path: string): number;
  exists(path: string): boolean;
  /** Moves a file or directory, replacing whatever is at `to`. */
  move(from: string, to: string): Promise<void>;
  /** Removes a file or a directory with everything in it; missing is fine. */
  remove(path: string): Promise<void>;
  list(path: string): string[];
  /** The `file://` URI the image loader paints. */
  uri(path: string): string;
};

function parentOf(path: string): string {
  const slash = path.lastIndexOf("/");
  return slash < 0 ? "" : path.slice(0, slash);
}

/** In-memory files: tests and Expo web (which has no downloads). */
export function createMemoryMobileDownloadFiles(): MobileDownloadFiles & {
  readonly files: Map<string, Uint8Array>;
  /** A file outside the root, as a finished native download hands over. */
  putExternal(uri: string, bytes: Uint8Array): void;
} {
  const files = new Map<string, Uint8Array>();
  const external = new Map<string, Uint8Array>();
  const under = (path: string) => [...files.keys()].filter((key) => key === path || key.startsWith(`${path}/`));
  return {
    files,
    prepareRoot() {},
    async readText(path) {
      const bytes = files.get(path);
      return bytes ? new TextDecoder().decode(bytes) : null;
    },
    async writeText(path, text) {
      files.set(path, new TextEncoder().encode(text));
    },
    async writeBytes(path, bytes) {
      files.set(path, bytes);
    },
    async adoptFile(sourceUri, path) {
      const bytes = external.get(sourceUri);
      if (!bytes) throw new Error(`No such file: ${sourceUri}`);
      external.delete(sourceUri);
      files.set(path, bytes);
    },
    async copyFile(sourceUri, path) {
      const bytes = external.get(sourceUri);
      if (!bytes) throw new Error(`No such file: ${sourceUri}`);
      files.set(path, bytes.slice());
    },
    async readHead(path, length) {
      return (files.get(path) ?? new Uint8Array()).slice(0, length);
    },
    fileSize(path) {
      return files.get(path)?.byteLength ?? null;
    },
    directorySize(path) {
      return under(path).reduce((total, key) => total + (files.get(key)?.byteLength ?? 0), 0);
    },
    exists(path) {
      return under(path).length > 0;
    },
    async move(from, to) {
      for (const key of under(to)) files.delete(key);
      for (const key of under(from)) {
        files.set(`${to}${key.slice(from.length)}`, files.get(key)!);
        files.delete(key);
      }
    },
    async remove(path) {
      for (const key of under(path)) files.delete(key);
    },
    list(path) {
      const names = new Set<string>();
      for (const key of files.keys()) {
        if (parentOf(key) === path) names.add(key.slice(path.length + 1));
        else if (key.startsWith(`${path}/`)) names.add(key.slice(path.length + 1).split("/")[0]!);
      }
      return [...names];
    },
    uri(path) {
      return `memory://nemu-downloads/${path}`;
    },
    putExternal(uri, bytes) {
      external.set(uri, bytes);
    },
  };
}

export const mobileDownloadFiles: MobileDownloadFiles = createMemoryMobileDownloadFiles();
