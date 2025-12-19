// Global store for WASM runtime - manages descriptors and memory
import type { Cheerio } from "cheerio";
import type { AnyNode } from "domhandler";

export interface WasmRequest {
  id: number;
  url?: string;
  method?: string;
  headers: Record<string, string>;
  body?: Uint8Array;
  response?: WasmResponse;
  createdAt: number;
}

export interface WasmResponse {
  data?: Uint8Array;
  statusCode?: number;
  headers?: Record<string, string>;
  bytesRead: number;
}

interface DescriptorEntry {
  value: unknown;
  refCount: number;
  createdAt: number;
}

// Configuration for memory management
const MEMORY_CONFIG = {
  // Maximum age for descriptors before cleanup (5 minutes)
  MAX_DESCRIPTOR_AGE_MS: 5 * 60 * 1000,
  // Maximum age for requests before cleanup (10 minutes)
  MAX_REQUEST_AGE_MS: 10 * 60 * 1000,
  // Maximum number of descriptors before forced cleanup
  MAX_DESCRIPTORS: 10000,
  // Maximum number of requests before forced cleanup
  MAX_REQUESTS: 1000,
  // Cleanup interval (1 minute)
  CLEANUP_INTERVAL_MS: 60 * 1000,
};

export class GlobalStore {
  id: string;
  memory: WebAssembly.Memory | null = null;

  // Descriptor management with reference counting
  private descriptorPointer = 0;
  private descriptors = new Map<number, DescriptorEntry>();

  // Request management
  private requestsPointer = 0;
  requests = new Map<number, WasmRequest>();

  // Chapter counter for source ordering
  chapterCounter = 0;
  currentManga = "";

  // Settings storage (simulating UserDefaults)
  private settings = new Map<string, unknown>();

  // Cleanup timer
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  // Statistics for debugging
  private stats = {
    totalDescriptorsCreated: 0,
    totalDescriptorsDestroyed: 0,
    totalRequestsCreated: 0,
    totalRequestsCleaned: 0,
  };

  constructor(id: string) {
    this.id = id;
    this.startCleanupTimer();
  }

  private startCleanupTimer(): void {
    if (typeof window !== "undefined" && !this.cleanupTimer) {
      this.cleanupTimer = setInterval(() => {
        this.performCleanup();
      }, MEMORY_CONFIG.CLEANUP_INTERVAL_MS);
    }
  }

  /**
   * Perform automatic cleanup of stale descriptors and requests
   */
  performCleanup(): void {
    const now = Date.now();
    let descriptorsCleaned = 0;
    let requestsCleaned = 0;

    // Clean up old descriptors with refCount 0
    for (const [key, entry] of this.descriptors) {
      const age = now - entry.createdAt;
      if (
        entry.refCount <= 0 &&
        age > MEMORY_CONFIG.MAX_DESCRIPTOR_AGE_MS
      ) {
        this.descriptors.delete(key);
        descriptorsCleaned++;
        this.stats.totalDescriptorsDestroyed++;
      }
    }

    // Clean up old requests
    for (const [key, request] of this.requests) {
      const age = now - request.createdAt;
      if (age > MEMORY_CONFIG.MAX_REQUEST_AGE_MS) {
        this.requests.delete(key);
        requestsCleaned++;
        this.stats.totalRequestsCleaned++;
      }
    }

    // Force cleanup if too many entries
    if (this.descriptors.size > MEMORY_CONFIG.MAX_DESCRIPTORS) {
      const toRemove = this.descriptors.size - MEMORY_CONFIG.MAX_DESCRIPTORS + 100;
      const entries = Array.from(this.descriptors.entries())
        .filter(([, e]) => e.refCount <= 0)
        .sort((a, b) => a[1].createdAt - b[1].createdAt)
        .slice(0, toRemove);

      for (const [key] of entries) {
        this.descriptors.delete(key);
        descriptorsCleaned++;
        this.stats.totalDescriptorsDestroyed++;
      }
    }

    if (this.requests.size > MEMORY_CONFIG.MAX_REQUESTS) {
      const toRemove = this.requests.size - MEMORY_CONFIG.MAX_REQUESTS + 50;
      const entries = Array.from(this.requests.entries())
        .sort((a, b) => a[1].createdAt - b[1].createdAt)
        .slice(0, toRemove);

      for (const [key] of entries) {
        this.requests.delete(key);
        requestsCleaned++;
        this.stats.totalRequestsCleaned++;
      }
    }

    if (descriptorsCleaned > 0 || requestsCleaned > 0) {
      console.debug(
        `[GlobalStore] Cleanup: removed ${descriptorsCleaned} descriptors, ${requestsCleaned} requests`
      );
    }
  }

  /**
   * Get memory statistics for debugging
   */
  getStats(): {
    descriptorCount: number;
    requestCount: number;
    totalDescriptorsCreated: number;
    totalDescriptorsDestroyed: number;
    totalRequestsCreated: number;
    totalRequestsCleaned: number;
  } {
    return {
      descriptorCount: this.descriptors.size,
      requestCount: this.requests.size,
      ...this.stats,
    };
  }

  setMemory(memory: WebAssembly.Memory): void {
    this.memory = memory;
  }

  /**
   * Store a value and return its descriptor
   */
  storeStdValue(value: unknown): number {
    this.descriptorPointer += 1;
    this.descriptors.set(this.descriptorPointer, {
      value,
      refCount: 1,
      createdAt: Date.now(),
    });
    this.stats.totalDescriptorsCreated++;
    return this.descriptorPointer;
  }

  /**
   * Read a value by descriptor
   */
  readStdValue(descriptor: number): unknown {
    const entry = this.descriptors.get(descriptor);
    return entry?.value;
  }

  /**
   * Increment reference count for a descriptor
   */
  retainStdValue(descriptor: number): void {
    const entry = this.descriptors.get(descriptor);
    if (entry) {
      entry.refCount++;
    }
  }

  /**
   * Remove a value by descriptor (decrements ref count)
   */
  removeStdValue(descriptor: number): void {
    const entry = this.descriptors.get(descriptor);
    if (entry) {
      entry.refCount--;
      // Only delete if refCount is 0 or negative
      if (entry.refCount <= 0) {
        this.descriptors.delete(descriptor);
        this.stats.totalDescriptorsDestroyed++;
      }
    }
  }

  /**
   * Force remove a value regardless of ref count
   */
  forceRemoveStdValue(descriptor: number): void {
    if (this.descriptors.delete(descriptor)) {
      this.stats.totalDescriptorsDestroyed++;
    }
  }

  /**
   * Create a new request
   */
  createRequest(method: number): number {
    this.requestsPointer += 1;
    const methodStr = [
      "GET",
      "POST",
      "HEAD",
      "PUT",
      "DELETE",
      "PATCH",
      "OPTIONS",
      "CONNECT",
      "TRACE",
    ][method] || "GET";
    this.requests.set(this.requestsPointer, {
      id: this.requestsPointer,
      method: methodStr,
      headers: {},
      createdAt: Date.now(),
    });
    this.stats.totalRequestsCreated++;
    return this.requestsPointer;
  }

  /**
   * Get a request by ID
   */
  getRequest(id: number): WasmRequest | undefined {
    return this.requests.get(id);
  }

  /**
   * Remove a request by ID
   */
  removeRequest(id: number): void {
    this.requests.delete(id);
  }

  // Memory read helpers
  readString(offset: number, length: number): string | null {
    if (!this.memory || length <= 0) return null;
    try {
      const bytes = new Uint8Array(this.memory.buffer, offset, length);
      return new TextDecoder().decode(bytes);
    } catch {
      return null;
    }
  }

  readBytes(offset: number, length: number): Uint8Array | null {
    if (!this.memory || length <= 0) return null;
    try {
      return new Uint8Array(this.memory.buffer, offset, length).slice();
    } catch {
      return null;
    }
  }

  // Memory write helpers
  writeBytes(bytes: Uint8Array | ArrayLike<number>, offset: number): void {
    if (!this.memory) return;
    const view = new Uint8Array(this.memory.buffer, offset, bytes.length);
    view.set(bytes);
  }

  writeString(str: string, offset: number): void {
    const bytes = new TextEncoder().encode(str);
    this.writeBytes(bytes, offset);
  }

  // Settings management
  getSetting(key: string): unknown {
    return this.settings.get(`${this.id}.${key}`);
  }

  setSetting(key: string, value: unknown): void {
    this.settings.set(`${this.id}.${key}`, value);
  }

  getAllSettings(): Map<string, unknown> {
    const result = new Map<string, unknown>();
    const prefix = `${this.id}.`;
    for (const [key, value] of this.settings) {
      if (key.startsWith(prefix)) {
        result.set(key.slice(prefix.length), value);
      }
    }
    return result;
  }

  /**
   * Import settings from an external source (e.g., localStorage)
   */
  importSettings(settings: Record<string, unknown>): void {
    for (const [key, value] of Object.entries(settings)) {
      this.settings.set(`${this.id}.${key}`, value);
    }
  }

  /**
   * Export settings for persistence
   */
  exportSettings(): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    const prefix = `${this.id}.`;
    for (const [key, value] of this.settings) {
      if (key.startsWith(prefix)) {
        result[key.slice(prefix.length)] = value;
      }
    }
    return result;
  }

  /**
   * Reset all state
   */
  reset(): void {
    this.descriptors.clear();
    this.descriptorPointer = 0;
    this.requests.clear();
    this.requestsPointer = 0;
    this.chapterCounter = 0;
    this.currentManga = "";
  }

  /**
   * Destroy the store and clean up resources
   */
  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    this.reset();
    this.settings.clear();
    this.memory = null;
  }
}

// Type guard helpers
export function isCheerioNode(value: unknown): value is Cheerio<AnyNode> {
  return value !== null && typeof value === "object" && "cheerio" in value;
}

export function isArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

export function isObject(
  value: unknown
): value is Record<string, unknown> {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    !isCheerioNode(value)
  );
}

// Legacy export for backward compatibility
export { GlobalStore as default };
