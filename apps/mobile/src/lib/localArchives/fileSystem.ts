import { Directory, File, Paths } from "expo-file-system";
import type { ArchiveFs, ArchiveWorkspace } from "./importArchive";
import { LOCAL_ARCHIVE_DIRECTORY_NAME } from "./policy";
import type { ArchivePageSink } from "./extract";

const READ_CHUNK_BYTES = 256 * 1024;
const INDEX_NAME = "index.json";

function root(): Directory {
  const dir = new Directory(Paths.document, LOCAL_ARCHIVE_DIRECTORY_NAME);
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  return dir;
}

function pageName(position: number, extension: string): string {
  return `${String(position + 1).padStart(6, "0")}.${extension}`;
}

/**
 * expo-file-system implementation of the importer's I/O. Everything lives
 * under `<documents>/local-archives/`, outside every cache directory, so
 * clearing caches can never delete an imported book.
 */
export const deviceArchiveFs: ArchiveFs = {
  async *readChunks(uri) {
    const handle = new File(uri).open();
    try {
      for (;;) {
        const chunk = await handle.readBytes(READ_CHUNK_BYTES);
        if (chunk.length === 0) return;
        yield chunk;
      }
    } finally {
      handle.close();
    }
  },

  async openWorkspace(): Promise<ArchiveWorkspace> {
    const base = root();
    const staging = new Directory(base, `.incoming-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`);
    staging.create({ intermediates: true, idempotent: true });
    const raw = new Directory(staging, "raw");
    raw.create({ idempotent: true });
    const archive = new File(staging, "archive.zip");
    archive.create({ overwrite: true });
    const archiveHandle = archive.open();
    const handles = new Map<number, ReturnType<File["open"]>>();
    const extensions = new Map<number, string>();
    let order: number[] = [];

    const sink: ArchivePageSink = {
      begin(entryId, extension) {
        const file = new File(raw, `${entryId}.${extension}`);
        file.create({ overwrite: true });
        handles.set(entryId, file.open());
        extensions.set(entryId, extension);
      },
      async write(entryId, chunk) {
        await handles.get(entryId)?.writeBytes(chunk);
      },
      end(entryId) {
        handles.get(entryId)?.close();
        handles.delete(entryId);
      },
      finalize(orderedEntryIds) {
        order = orderedEntryIds;
      },
      abort() {
        for (const handle of handles.values()) handle.close();
        handles.clear();
      },
    };

    return {
      writeArchive: (chunk) => archiveHandle.writeBytes(chunk),
      sink,
      async commit(volumeId) {
        archiveHandle.close();
        const target = new Directory(base, volumeId);
        if (target.exists) {
          staging.delete();
          return "already-present";
        }
        const pages = new Directory(staging, "pages");
        pages.create({ idempotent: true });
        order.forEach((entryId, position) => {
          const extension = extensions.get(entryId) ?? "jpg";
          new File(raw, `${entryId}.${extension}`).move(new File(pages, pageName(position, extension)));
        });
        raw.delete();
        staging.move(target);
        return "moved";
      },
      async discard() {
        sink.abort();
        try {
          archiveHandle.close();
        } catch {
          // already closed
        }
        if (staging.exists) staging.delete();
      },
    };
  },

  listPageNames(volumeId) {
    const pages = new Directory(root(), volumeId, "pages");
    if (!pages.exists) return [];
    return pages
      .list()
      .filter((entry): entry is File => entry instanceof File)
      .map((file) => file.name)
      .sort((a, b) => a.localeCompare(b));
  },

  rootUri() {
    return Paths.document.uri;
  },

  async removeVolumeFiles(volumeId) {
    const dir = new Directory(root(), volumeId);
    if (dir.exists) dir.delete();
  },

  async readIndex() {
    const file = new File(root(), INDEX_NAME);
    if (!file.exists) return { volumes: [], files: [] };
    try {
      const parsed = JSON.parse(await file.text());
      return {
        volumes: Array.isArray(parsed.volumes) ? parsed.volumes : [],
        files: Array.isArray(parsed.files) ? parsed.files : [],
      };
    } catch {
      return { volumes: [], files: [] };
    }
  },

  async writeIndex(index) {
    const file = new File(root(), INDEX_NAME);
    file.create({ overwrite: true });
    file.write(JSON.stringify(index));
  },
};
