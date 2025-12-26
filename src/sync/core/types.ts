/**
 * SyncCore types (Phase 7)
 *
 * Backend-agnostic types for sync orchestration.
 */

import type { CompositeCursor } from "@/data/schema";

/**
 * Sync status (same as before, kept for compatibility)
 */
export type SyncStatus = "offline" | "syncing" | "synced" | "pending";

/**
 * Reason for triggering a sync run
 */
export type SyncRunReason =
  | "manual" // User triggered
  | "online" // Network came online
  | "interval" // Periodic sync
  | "write" // Local write queued
  | "startup"; // Initial sync on startup

/**
 * Configuration for SyncCore
 */
export interface SyncCoreConfig {
  /** Interval between automatic sync runs (ms). Default: 30000 */
  pullIntervalMs: number;

  /** Max items per page when pulling. Default: 100 */
  pageLimit: number;

  /** Max pages to pull in a single tick (avoid starving UI). Default: 10 */
  maxPagesPerTick: number;

  /** Max concurrent sync runs. Default: 1 */
  maxInFlight: number;

  /** Retry policy for failed operations */
  retryPolicy: {
    /** Max retries before giving up. Default: 5 */
    maxRetries: number;
    /** Base delay between retries (ms). Default: 1000 */
    baseDelayMs: number;
    /** Max delay between retries (ms). Default: 30000 */
    maxDelayMs: number;
  };
}

/**
 * Default configuration
 */
export const DEFAULT_SYNC_CONFIG: SyncCoreConfig = {
  pullIntervalMs: 30_000,
  pageLimit: 100,
  maxPagesPerTick: 10,
  maxInFlight: 1,
  retryPolicy: {
    maxRetries: 5,
    baseDelayMs: 1_000,
    maxDelayMs: 30_000,
  },
};

/**
 * Cursors for each sync table
 */
export interface SyncCursors {
  libraryItems: CompositeCursor;
  sourceLinks: CompositeCursor;
  chapterProgress: CompositeCursor;
  mangaProgress: CompositeCursor;
  history: CompositeCursor; // Legacy
}

/**
 * Sync cursor keys
 */
export const CURSOR_KEYS = {
  LIBRARY_ITEMS: "library_items_cursor",
  SOURCE_LINKS: "source_links_cursor",
  CHAPTER_PROGRESS: "chapter_progress_cursor",
  MANGA_PROGRESS: "manga_progress_cursor",
  HISTORY: "history_cursor", // Legacy
} as const;

/**
 * Initial (zero) cursor value
 */
export const ZERO_CURSOR: CompositeCursor = {
  updatedAt: 0,
  cursorId: "",
};

/**
 * Metrics/events emitted by SyncCore (for observability)
 */
export interface SyncMetrics {
  /** Pull completed */
  pullCompleted: {
    table: string;
    entriesCount: number;
    durationMs: number;
  };

  /** Push completed */
  pushCompleted: {
    opId: string;
    table: string;
    durationMs: number;
  };

  /** Push failed */
  pushFailed: {
    opId: string;
    table: string;
    error: Error;
    retriesLeft: number;
  };

  /** Status changed */
  statusChanged: {
    from: SyncStatus;
    to: SyncStatus;
  };
}

export type SyncMetricsListener = <K extends keyof SyncMetrics>(
  event: K,
  data: SyncMetrics[K]
) => void;

/**
 * Pending operation stored in local queue
 */
export interface PendingOp {
  id: string;
  table: "library_items" | "source_links" | "chapter_progress" | "history" | "settings";
  operation: "save" | "remove";
  data: unknown;
  timestamp: number;
  retries: number;
}

