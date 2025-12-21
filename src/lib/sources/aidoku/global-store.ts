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

// Resource types for unified store tracking
export enum ResourceType {
  StdValue = 0,
  Request = 1,
  JsContext = 2,
  Canvas = 3,
  Image = 4,
  Font = 5,
}

// Resource tracking for unified std.destroy
interface ResourceEntry {
  type: ResourceType;
  rid: number;
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

  // Unified RID counter for all resources (aidoku-rs style)
  private ridCounter = 0;

  // Descriptor management with reference counting
  private descriptors = new Map<number, DescriptorEntry>();

  // Request management - uses unified RID
  requests = new Map<number, WasmRequest>();

  // Unified resource tracking - maps RID to resource type for std.destroy
  private resources = new Map<number, ResourceType>();

  // Chapter counter for source ordering
  chapterCounter = 0;
  currentManga = "";

  // Partial home results storage (for streaming home layouts via send_partial_result)
  // Stores raw bytes that are copied before the WASM frees them
  partialHomeResultBytes: Uint8Array[] = [];

  // Callback for streaming partial home results to UI
  // Set by runtime before calling getHome, cleared after
  onPartialHomeBytes: ((bytes: Uint8Array) => void) | null = null;

  // Cookie storage (simulating HTTPCookieStorage)
  private cookies = new Map<string, string>();

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
   * Allocate a new unified RID
   */
  private allocateRid(): number {
    this.ridCounter += 1;
    return this.ridCounter;
  }

  /**
   * Store a value and return its descriptor
   */
  storeStdValue(value: unknown): number {
    const rid = this.allocateRid();
    this.descriptors.set(rid, {
      value,
      refCount: 1,
      createdAt: Date.now(),
    });
    this.resources.set(rid, ResourceType.StdValue);
    this.stats.totalDescriptorsCreated++;
    return rid;
  }

  /**
   * Read a value by descriptor
   */
  readStdValue(descriptor: number): unknown {
    const entry = this.descriptors.get(descriptor);
    return entry?.value;
  }

  /**
   * Update the value stored at a descriptor (used for caching encoded values)
   */
  updateStdValue(descriptor: number, value: unknown): void {
    const entry = this.descriptors.get(descriptor);
    if (entry) {
      entry.value = value;
    }
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
        this.resources.delete(descriptor);
        this.stats.totalDescriptorsDestroyed++;
      }
    }
  }

  /**
   * Force remove a value regardless of ref count
   */
  forceRemoveStdValue(descriptor: number): void {
    if (this.descriptors.delete(descriptor)) {
      this.resources.delete(descriptor);
      this.stats.totalDescriptorsDestroyed++;
    }
  }

  /**
   * Unified destroy - removes any resource by RID (aidoku-rs std.destroy semantics)
   * This is called by std.destroy and should free any type of resource.
   */
  destroyResource(rid: number): boolean {
    const resourceType = this.resources.get(rid);
    if (resourceType === undefined) {
      return false;
    }

    switch (resourceType) {
      case ResourceType.StdValue:
        this.forceRemoveStdValue(rid);
        return true;
      case ResourceType.Request:
        this.requests.delete(rid);
        this.resources.delete(rid);
        this.stats.totalRequestsCleaned++;
        return true;
      case ResourceType.JsContext:
      case ResourceType.Canvas:
      case ResourceType.Image:
      case ResourceType.Font:
        // These are stored as StdValue with type markers
        this.forceRemoveStdValue(rid);
        return true;
      default:
        this.resources.delete(rid);
        return false;
    }
  }

  /**
   * Register a resource type for a RID (used by imports that create typed resources)
   */
  registerResource(rid: number, type: ResourceType): void {
    this.resources.set(rid, type);
  }

  /**
   * Get resource type for a RID
   */
  getResourceType(rid: number): ResourceType | undefined {
    return this.resources.get(rid);
  }

  /**
   * Create a scoped descriptor tracker for automatic cleanup.
   * Use this to ensure all descriptors created during a WASM call are cleaned up.
   *
   * @example
   * const scope = store.createScope();
   * try {
   *   const d1 = scope.track(store.storeStdValue(value1));
   *   const d2 = scope.track(store.storeStdValue(value2));
   *   return wasmCall(d1, d2);
   * } finally {
   *   scope.cleanup();
   * }
   */
  createScope(): DescriptorScope {
    return new DescriptorScope(this);
  }

  /**
   * Create a new request
   */
  createRequest(method: number = 0): number {
    const rid = this.allocateRid();
    // aidoku-rs HttpMethod enum order: Get=0, Post=1, Put=2, Head=3, Delete=4, Patch=5, Options=6, Connect=7, Trace=8
    const methodStr = [
      "GET",     // 0
      "POST",    // 1
      "PUT",     // 2
      "HEAD",    // 3
      "DELETE",  // 4
      "PATCH",   // 5
      "OPTIONS", // 6
      "CONNECT", // 7
      "TRACE",   // 8
    ][method] || "GET";
    this.requests.set(rid, {
      id: rid,
      method: methodStr,
      headers: {},
      createdAt: Date.now(),
    });
    this.resources.set(rid, ResourceType.Request);
    this.stats.totalRequestsCreated++;
    return rid;
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
      // Find null terminator
      let end = bytes.indexOf(0);
      if (end === -1) end = length;
      return new TextDecoder().decode(bytes.subarray(0, end));
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

  // Cookie management (simulating HTTPCookieStorage)
  /**
   * Store cookies from a Set-Cookie header for a given domain
   */
  storeCookiesFromHeader(domain: string, setCookieHeader: string): void {
    // Parse Set-Cookie header and store cookies
    // Format: name=value; Path=/; Domain=.example.com; ...
    const cookieParts = setCookieHeader.split(";");
    if (cookieParts.length > 0) {
      const nameValue = cookieParts[0].trim();
      const eqIdx = nameValue.indexOf("=");
      if (eqIdx > 0) {
        const name = nameValue.slice(0, eqIdx);
        const value = nameValue.slice(eqIdx + 1);
        // Store with domain prefix for scoping
        this.cookies.set(`${domain}:${name}`, value);
      }
    }
  }

  /**
   * Store multiple cookies from response headers
   */
  storeCookiesFromResponse(url: string, headers: Record<string, string>): void {
    try {
      const urlObj = new URL(url);
      const domain = urlObj.hostname;
      
      // Check both Set-Cookie and set-cookie (case-insensitive)
      for (const [key, value] of Object.entries(headers)) {
        if (key.toLowerCase() === "set-cookie") {
          // Could be multiple cookies separated by comma (though this is rare)
          this.storeCookiesFromHeader(domain, value);
        }
      }
    } catch {
      // Invalid URL, ignore
    }
  }

  /**
   * Get cookies as a Cookie header value for a given URL
   */
  getCookiesForUrl(url: string): string | null {
    try {
      const urlObj = new URL(url);
      const domain = urlObj.hostname;
      
      // Collect matching cookies
      const matchingCookies: string[] = [];
      for (const [key, value] of this.cookies) {
        const [cookieDomain, cookieName] = key.split(":", 2);
        // Simple domain matching (exact match or subdomain)
        if (domain === cookieDomain || domain.endsWith(`.${cookieDomain}`)) {
          matchingCookies.push(`${cookieName}=${value}`);
        }
      }
      
      return matchingCookies.length > 0 ? matchingCookies.join("; ") : null;
    } catch {
      return null;
    }
  }

  /**
   * Clear all cookies
   */
  clearCookies(): void {
    this.cookies.clear();
  }

  /**
   * Reset all state
   */
  reset(): void {
    this.descriptors.clear();
    this.requests.clear();
    this.resources.clear();
    this.ridCounter = 0;
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
    this.memory = null;
  }
}

/**
 * Scoped descriptor tracker for automatic cleanup.
 * Tracks descriptors created during a WASM call and cleans them up on dispose.
 */
export class DescriptorScope {
  private tracked: number[] = [];
  private globalStore: GlobalStore;
  private disposed = false;

  constructor(globalStore: GlobalStore) {
    this.globalStore = globalStore;
  }

  /**
   * Track a descriptor for cleanup. Returns the descriptor for chaining.
   */
  track(descriptor: number): number {
    if (this.disposed) {
      throw new Error("Cannot track descriptor on disposed scope");
    }
    if (descriptor > 0) {
      this.tracked.push(descriptor);
    }
    return descriptor;
  }

  /**
   * Store a value and track it for cleanup.
   * Convenience method combining storeStdValue + track.
   */
  storeValue(value: unknown): number {
    return this.track(this.globalStore.storeStdValue(value));
  }

  /**
   * Clean up all tracked descriptors.
   * Safe to call multiple times.
   */
  cleanup(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const descriptor of this.tracked) {
      this.globalStore.forceRemoveStdValue(descriptor);
    }
    this.tracked = [];
  }

  /**
   * Get the count of tracked descriptors.
   */
  get size(): number {
    return this.tracked.length;
  }

  /**
   * Check if the scope has been disposed.
   */
  get isDisposed(): boolean {
    return this.disposed;
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
