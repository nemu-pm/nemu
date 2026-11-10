import type { ChapterSummary } from "@/data/schema";
import type { MobileReaderPage } from "@/sources/mobileSourcePages";
import type { MobileDownloadFiles } from "./mobileDownloadFiles";
import {
  MOBILE_DOWNLOADS_STATE_FILE,
  mobileDownloadChapterDirectory,
  mobileDownloadMangaDirectory,
  mobileDownloadMangaKey,
  mobileDownloadPartialDirectory,
  mobileDownloadScopeDirectory,
} from "./mobileDownloadPaths";
import {
  cancelMobileDownloads,
  completeMobileDownloadJob,
  createMobileDownloadState,
  enqueueMobileDownloads,
  failMobileDownloadJob,
  mobileDownloadJobKeysForManga,
  mobileDownloadedChapterKeysForManga,
  pauseMobileDownloads,
  pickRunnableMobileDownloads,
  progressMobileDownloadJob,
  removeMobileDownloadedChapters,
  requeueMobileDownloadJob,
  restoreMobileDownloadState,
  resumeMobileDownloads,
  startMobileDownloadJob,
} from "./mobileDownloadQueue";
import {
  mobileDownloadedReaderPages,
  readMobileDownloadChapterIndex,
  readMobileDownloadManifest,
} from "./mobileDownloadStore";
import {
  runMobileChapterDownload,
  type MobileDownloadPageSource,
} from "./mobileDownloadRunner";
import type {
  MobileDownloadChapterRef,
  MobileDownloadJob,
  MobileDownloadRequest,
  MobileDownloadState,
} from "./mobileDownloadTypes";

/**
 * The one download queue: owns the live state, persists it per account
 * profile, and runs queued chapters while the network allows. React reads it
 * through `useSyncExternalStore` (`useMobileDownloads.ts`).
 */

export type MobileDownloadSourceAccess = {
  loadPages(job: MobileDownloadJob, signal: AbortSignal): Promise<MobileDownloadPageSource>;
  fetchImage(
    request: { uri: string; headers?: Record<string, string> },
    signal: AbortSignal,
  ): Promise<{ fileUri: string }>;
};

/** `null`: not known yet (treated as allowed, so a slow probe never blocks). */
export type MobileDownloadNetwork = {
  connected: boolean | null;
  /** Wi-Fi or Ethernet, as opposed to cellular. */
  unmetered: boolean | null;
};

export type MobileDownloadedChapterPages = {
  pages: MobileReaderPage[];
  chapter: ChapterSummary;
  chapters: ChapterSummary[];
  fetchedAt: number;
};

type StopReason = "pause" | "cancel" | "scope" | "network";

const SAVE_DELAY_MS = 400;

export class MobileDownloadManager {
  private state: MobileDownloadState = createMobileDownloadState();
  private scopeDirectory: string | null = null;
  private loading: Promise<void> = Promise.resolve();
  private readonly running = new Map<string, { controller: AbortController; stop?: StopReason }>();
  private readonly settling = new Set<Promise<void>>();
  private readonly listeners = new Set<() => void>();
  private access: MobileDownloadSourceAccess | null = null;
  private network: MobileDownloadNetwork = { connected: null, unmetered: null };
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private saving: Promise<void> = Promise.resolve();

  constructor(
    private readonly files: MobileDownloadFiles,
    private readonly now: () => number = Date.now,
  ) {}

  getState = (): MobileDownloadState => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  /** Resolves once the active profile's queue has been read from disk. */
  ready(): Promise<void> {
    return this.loading;
  }

  /** The source access the queue runs with; nothing starts before it is set. */
  setSourceAccess(access: MobileDownloadSourceAccess | null): void {
    this.access = access;
    this.pump();
  }

  setNetwork(network: MobileDownloadNetwork): void {
    this.network = network;
    if (!this.canRun()) this.stopAll("network");
    this.pump();
  }

  /**
   * Switches to a profile's downloads. Running chapters stop (and stay
   * queued for that profile); the previous profile's state is saved first.
   */
  switchProfileScope(profileScope: string): Promise<void> {
    const directory = mobileDownloadScopeDirectory(profileScope);
    if (directory === this.scopeDirectory) return this.loading;
    this.loading = this.loading
      .catch(() => undefined)
      .then(async () => {
        this.stopAll("scope");
        await Promise.allSettled([...this.settling]);
        await this.flush();
        this.scopeDirectory = directory;
        try {
          this.files.prepareRoot();
        } catch {
          // Reading can still work; writes will report their own failure.
        }
        const text = await this.files.readText(`${directory}/${MOBILE_DOWNLOADS_STATE_FILE}`).catch(() => null);
        let parsed: unknown = null;
        try {
          parsed = text ? (JSON.parse(text) as unknown) : null;
        } catch {
          parsed = null;
        }
        this.state = restoreMobileDownloadState(parsed);
        this.emit();
        this.pump();
      });
    return this.loading;
  }

  enqueue(requests: readonly MobileDownloadRequest[]): void {
    this.update(enqueueMobileDownloads(this.state, requests, this.now()));
    this.pump();
  }

  pause(keys: ReadonlySet<string> | null = null): void {
    for (const [key, run] of this.running) {
      if (!keys || keys.has(key)) this.stop(run, "pause");
    }
    this.update(pauseMobileDownloads(this.state, keys, this.now()));
  }

  resume(keys: ReadonlySet<string> | null = null): void {
    this.update(resumeMobileDownloads(this.state, keys, this.now()));
    this.pump();
  }

  /** Drops queued or running chapters and their partial pages. */
  cancel(keys: ReadonlySet<string> | null = null): void {
    const directory = this.scopeDirectory;
    const cancelled = this.state.jobs.filter((job) => !keys || keys.has(job.key));
    for (const job of cancelled) {
      const run = this.running.get(job.key);
      if (run) {
        // The run removes its own partial pages once it has stopped writing.
        this.stop(run, "cancel");
      } else if (directory) {
        void this.files
          .remove(`${directory}/${mobileDownloadPartialDirectory({ ...job, chapterId: job.chapter.id })}`)
          .catch(() => undefined);
      }
    }
    this.update(cancelMobileDownloads(this.state, keys));
    this.pump();
  }

  async deleteChapters(keys: ReadonlySet<string>): Promise<void> {
    const directory = this.scopeDirectory;
    if (!directory) return;
    const removed = [...keys].map((key) => this.state.chapters[key]).filter(Boolean);
    this.update(removeMobileDownloadedChapters(this.state, keys));
    await Promise.all(
      removed.map((chapter) =>
        this.files
          .remove(`${directory}/${mobileDownloadChapterDirectory({ ...chapter!, chapterId: chapter!.chapter.id })}`)
          .catch(() => undefined),
      ),
    );
  }

  /** Every chapter of a title: downloaded ones, and any still queued. */
  async deleteManga(mangaKey: string): Promise<void> {
    const directory = this.scopeDirectory;
    if (!directory) return;
    const jobs = mobileDownloadJobKeysForManga(this.state, mangaKey);
    if (jobs.length) this.cancel(new Set(jobs));
    const chapter = Object.values(this.state.chapters).find(
      (candidate) => mobileDownloadMangaKey(candidate) === mangaKey,
    );
    await this.deleteChapters(new Set(mobileDownloadedChapterKeysForManga(this.state, mangaKey)));
    if (chapter) {
      await Promise.allSettled([...this.settling]);
      await this.files.remove(`${directory}/${mobileDownloadMangaDirectory(chapter)}`).catch(() => undefined);
    }
  }

  async deleteAll(): Promise<void> {
    const directory = this.scopeDirectory;
    if (!directory) return;
    this.cancel(null);
    await Promise.allSettled([...this.settling]);
    this.update({ ...createMobileDownloadState(), wifiOnly: this.state.wifiOnly });
    for (const name of this.files.list(directory)) {
      if (name.startsWith("m-")) await this.files.remove(`${directory}/${name}`).catch(() => undefined);
    }
  }

  /**
   * "Clear All Data": every profile's downloads leave the device and the
   * queue empties. The active profile keeps its (now empty) state file.
   */
  async clearDevice(): Promise<void> {
    this.cancel(null);
    await Promise.allSettled([...this.settling]);
    this.update(createMobileDownloadState());
    for (const name of this.files.list("")) {
      await this.files.remove(name).catch(() => undefined);
    }
    await this.flush();
  }

  setWifiOnly(wifiOnly: boolean): void {
    if (this.state.wifiOnly === wifiOnly) return;
    this.update({ ...this.state, wifiOnly });
    if (!this.canRun()) this.stopAll("network");
    this.pump();
  }

  /** Whether the queue would start a chapter right now (for the Downloads page). */
  isWaitingForNetwork(): boolean {
    return this.access !== null && !this.canRun();
  }

  /**
   * A downloaded chapter's reader pages, or null to read it from the source
   * (not downloaded, or a page file has gone missing).
   */
  async loadDownloadedChapter(ref: MobileDownloadChapterRef): Promise<MobileDownloadedChapterPages | null> {
    await this.loading.catch(() => undefined);
    const directory = this.scopeDirectory;
    if (!directory) return null;
    const manifest = await readMobileDownloadManifest(this.files, directory, ref);
    if (!manifest) return null;
    const pages = mobileDownloadedReaderPages(this.files, directory, ref, manifest);
    if (!pages) return null;
    const chapters = (await readMobileDownloadChapterIndex(this.files, directory, ref)) ?? [];
    return { pages, chapter: manifest.chapter, chapters, fetchedAt: manifest.completedAt };
  }

  /** Writes any pending state now (the app is going to the background). */
  flush(): Promise<void> {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
      this.saving = this.saving.then(() => this.save());
    }
    return this.saving;
  }

  private canRun(): boolean {
    if (this.network.connected === false) return false;
    if (this.state.wifiOnly && this.network.unmetered === false) return false;
    return true;
  }

  private emit(): void {
    for (const listener of [...this.listeners]) listener();
  }

  private update(next: MobileDownloadState): void {
    if (next === this.state) return;
    this.state = next;
    this.emit();
    this.scheduleSave();
  }

  private scheduleSave(): void {
    if (!this.scopeDirectory || this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      this.saving = this.saving.then(() => this.save());
    }, SAVE_DELAY_MS);
  }

  private async save(): Promise<void> {
    const directory = this.scopeDirectory;
    if (!directory) return;
    try {
      await this.files.writeText(`${directory}/${MOBILE_DOWNLOADS_STATE_FILE}`, JSON.stringify(this.state));
    } catch {
      // The next change writes the whole state again.
    }
  }

  private stop(run: { controller: AbortController; stop?: StopReason }, reason: StopReason): void {
    if (run.stop) return;
    run.stop = reason;
    run.controller.abort(new DOMException(`Download stopped (${reason}).`, "AbortError"));
  }

  private stopAll(reason: StopReason): void {
    for (const run of this.running.values()) this.stop(run, reason);
  }

  private pump(): void {
    const access = this.access;
    const directory = this.scopeDirectory;
    if (!access || !directory || !this.canRun()) return;
    for (const job of pickRunnableMobileDownloads(this.state, new Set(this.running.keys()))) {
      this.start(job, access, directory);
    }
  }

  private start(job: MobileDownloadJob, access: MobileDownloadSourceAccess, directory: string): void {
    const run: { controller: AbortController; stop?: StopReason } = { controller: new AbortController() };
    this.running.set(job.key, run);
    this.update(startMobileDownloadJob(this.state, job.key, this.now()));
    const settled = (async () => {
      try {
        const result = await runMobileChapterDownload(
          job,
          {
            files: this.files,
            scopeDirectory: directory,
            loadPages: access.loadPages,
            fetchImage: access.fetchImage,
            now: this.now,
            onProgress: (progress) => {
              if (this.running.get(job.key) !== run || run.stop) return;
              this.update(progressMobileDownloadJob(this.state, job.key, progress));
            },
          },
          run.controller.signal,
        );
        // A run that finished just as it was stopped is whole: it is kept,
        // unless the chapter was cancelled.
        if (run.stop === "cancel") {
          await this.files
            .remove(`${directory}/${mobileDownloadChapterDirectory({ ...job, chapterId: job.chapter.id })}`)
            .catch(() => undefined);
          return;
        }
        if (this.scopeDirectory !== directory) return;
        this.update(completeMobileDownloadJob(this.state, job.key, result));
      } catch (error) {
        if (run.stop === "cancel") {
          await this.files
            .remove(`${directory}/${mobileDownloadPartialDirectory({ ...job, chapterId: job.chapter.id })}`)
            .catch(() => undefined);
          return;
        }
        if (this.scopeDirectory !== directory || run.stop === "pause") return;
        // Not the chapter's fault: back in line, its saved pages kept.
        if (run.stop === "scope" || run.stop === "network" || this.network.connected === false) {
          this.update(requeueMobileDownloadJob(this.state, job.key, this.now()));
          return;
        }
        const message = error instanceof Error ? error.message : String(error);
        this.update(failMobileDownloadJob(this.state, job.key, message, this.now()));
      } finally {
        if (this.running.get(job.key) === run) this.running.delete(job.key);
        this.pump();
      }
    })();
    this.settling.add(settled);
    void settled.finally(() => this.settling.delete(settled));
  }
}
