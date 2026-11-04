import { Unzip, UnzipInflate } from "fflate";
import { classifyArchiveEntry, compareNaturalPaths } from "./entries";
import { LOCAL_ARCHIVE_LIMITS, LocalArchiveError, type LocalArchiveLimits } from "./policy";

/** File output for extracted pages. Implemented over expo-file-system on device. */
export type ArchivePageSink = {
  begin(entryId: number, extension: string): Promise<void> | void;
  write(entryId: number, chunk: Uint8Array): Promise<void> | void;
  end(entryId: number): Promise<void> | void;
  /** Called with the entry ids in final reading order, after every entry is written. */
  finalize(orderedEntryIds: number[]): Promise<void> | void;
  /** Called on any failure so partial files are removed. */
  abort(): Promise<void> | void;
};

export type ExtractedPage = { entryId: number; name: string; bytes: number };

export type ExtractResult = { pages: ExtractedPage[]; totalBytes: number };

/**
 * Streams a zip from `chunks` and writes page entries through `sink`. Memory
 * use is bounded by the chunk size plus one inflated chunk. Size limits are
 * enforced on bytes actually inflated, since zip headers can lie.
 */
export async function extractArchivePages(options: {
  chunks: AsyncIterable<Uint8Array>;
  sink: ArchivePageSink;
  limits?: LocalArchiveLimits;
  signal?: AbortSignal;
}): Promise<ExtractResult> {
  const limits = options.limits ?? LOCAL_ARCHIVE_LIMITS;
  const { sink, signal } = options;
  const pages: ExtractedPage[] = [];
  const names = new Set<string>();
  let entries = 0;
  let totalBytes = 0;
  let archiveBytes = 0;
  let failure: LocalArchiveError | null = null;
  let chain: Promise<void> = Promise.resolve();
  let nextEntryId = 0;
  const enqueue = (work: () => Promise<void> | void) => {
    chain = chain.then(() => (failure ? undefined : work())).catch((error) => {
      failure ??= toArchiveError(error);
    });
  };

  const unzip = new Unzip();
  unzip.register(UnzipInflate);
  unzip.onfile = (file) => {
    if (failure) {
      file.terminate();
      return;
    }
    entries += 1;
    if (entries > limits.maxEntries) {
      failure = new LocalArchiveError("too-many-entries");
      file.terminate();
      return;
    }
    let decision;
    try {
      decision = classifyArchiveEntry(file.name, limits);
    } catch (error) {
      failure = toArchiveError(error);
      file.terminate();
      return;
    }
    if (decision.kind === "skip") {
      file.terminate();
      return;
    }
    if (names.has(decision.name)) {
      failure = new LocalArchiveError("corrupt", "Duplicate entry name.");
      file.terminate();
      return;
    }
    if (pages.length >= limits.maxPages) {
      failure = new LocalArchiveError("too-many-pages");
      file.terminate();
      return;
    }
    names.add(decision.name);
    const entryId = nextEntryId++;
    const page: ExtractedPage = { entryId, name: decision.name, bytes: 0 };
    pages.push(page);
    const compressed = file.size ?? 0;
    enqueue(() => sink.begin(entryId, decision.extension));
    file.ondata = (error, data, final) => {
      if (failure) return;
      if (error) {
        failure = new LocalArchiveError("corrupt", String(error.message ?? error));
        file.terminate();
        return;
      }
      page.bytes += data.length;
      totalBytes += data.length;
      if (page.bytes > limits.maxPageBytes) failure = new LocalArchiveError("page-too-large");
      else if (totalBytes > limits.maxTotalUncompressedBytes) failure = new LocalArchiveError("total-too-large");
      else if (
        compressed > 0 &&
        page.bytes > 1024 * 1024 &&
        page.bytes / compressed > limits.maxCompressionRatio
      ) {
        failure = new LocalArchiveError("compression-ratio");
      }
      if (failure) {
        file.terminate();
        return;
      }
      const copy = data.slice();
      enqueue(() => sink.write(entryId, copy));
      if (final) enqueue(() => sink.end(entryId));
    };
    file.start();
  };

  try {
    for await (const chunk of options.chunks) {
      if (signal?.aborted) throw new LocalArchiveError("aborted");
      archiveBytes += chunk.length;
      if (archiveBytes > limits.maxArchiveBytes) throw new LocalArchiveError("archive-too-large");
      unzip.push(chunk, false);
      await chain;
      if (failure) throw failure;
    }
    unzip.push(new Uint8Array(0), true);
    await chain;
    if (failure) throw failure;
    if (pages.length === 0) throw new LocalArchiveError("no-pages");
    const ordered = [...pages].sort((a, b) => compareNaturalPaths(a.name, b.name));
    await sink.finalize(ordered.map((page) => page.entryId));
    return { pages: ordered, totalBytes };
  } catch (error) {
    await Promise.resolve(sink.abort()).catch(() => undefined);
    throw toArchiveError(error);
  }
}

function toArchiveError(error: unknown): LocalArchiveError {
  if (error instanceof LocalArchiveError) return error;
  return new LocalArchiveError("corrupt", error instanceof Error ? error.message : String(error));
}
