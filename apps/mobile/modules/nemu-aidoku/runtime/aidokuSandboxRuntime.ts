import {
  CloudflareBlockedError,
  createLoadSource,
  extractAix,
  type AidokuSource,
  type Chapter,
  type FilterValue,
  type HomeLayout,
  type HttpBridge,
  type HttpRequest,
  type HttpResponse,
  type Listing,
  type Manga,
  type SourceManifest,
  type SourceComponents,
} from "@nemu.pm/aidoku-runtime";
import {
  createAidokuSandboxCanvasModule,
  decodeAidokuSandboxCanvasPlan,
  SANDBOX_IMAGE_MAX_COMPRESSED_BYTES,
} from "./aidokuSandboxCanvas";
import { probeAidokuSandboxGlobals } from "./aidokuSandboxGlobals";
import { prepareMobileAidokuWasm } from "./aidokuWasmSafety";
import {
  decodeSandboxPersistedSettings,
  SandboxSettingsTransaction,
  type SandboxJsonRecord,
} from "./aidokuSandboxSettings";

declare const android:
  | {
      consumeNamedDataAsArrayBuffer(name: string): Promise<ArrayBuffer>;
      getNamedPort(name: string): Promise<{
        postMessage(value: ArrayBuffer): void;
        close(): void;
      }>;
    }
  | undefined;

// The JS session cache retains six entries, but it must construct a replacement
// before it can evict the previous LRU entry. Background metadata refresh can
// also pin several evicted entries until their current operation finishes.
// Keep enough descriptors for that bounded overlap; the aggregate extracted
// package budget below remains the controlling memory ceiling.
const MAX_SESSIONS = 32;
const MAX_OPERATIONS = 1;
const MAX_SOURCE_KEY_LENGTH = 512;
const MAX_SETTINGS_JSON_LENGTH = 256 * 1024;
const MAX_OPERATION_JSON_LENGTH = 2 * 1024 * 1024;
const MAX_REQUEST_URL_LENGTH = 16 * 1024;
const MAX_REQUEST_HEADERS = 96;
const MAX_REQUEST_HEADER_BYTES = 64 * 1024;
const MAX_REQUEST_BODY_LENGTH = 2 * 1024 * 1024;
const MAX_AIX_PACKAGE_BYTES = 32 * 1024 * 1024;
const MAX_SESSION_BYTES_TOTAL = 32 * 1024 * 1024;
const MAX_REPLAY_RESPONSE_BYTES = 16 * 1024 * 1024;
const MAX_REPLAY_BYTES_TOTAL = 32 * 1024 * 1024;

type JsonRecord = Record<string, unknown>;

type SandboxSession = {
  id: string;
  sourceKey: string;
  components: SourceComponents;
  compiledModule: WebAssembly.Module;
  memoryByteLength: number;
  persistedSettings: SandboxJsonRecord;
  userSettings: JsonRecord;
  imageProcessorTransportAvailable: boolean;
};

type NormalizedRequest = {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string | null;
};

type ReplayResponse = {
  request: NormalizedRequest;
  response: HttpResponse;
};

type SandboxOperation = {
  id: string;
  sessionId: string;
  input: JsonRecord;
  startedAt: number;
  replay: ReplayResponse[];
  replayByteLength: number;
  pendingRequest: { cursor: number; request: NormalizedRequest } | null;
  imageBytes: Uint8Array | null;
};

type SandboxCapabilities = {
  id: string;
  staticListings: Listing[];
  hasListingProvider: boolean;
  hasHomeProvider: boolean;
  hasListings: boolean;
  isOnlySearch: boolean;
  handlesBasicLogin: boolean;
  handlesWebLogin: boolean;
  hasImageRequestProvider: boolean;
  hasImageProcessor: boolean;
};

const sessions = new Map<string, SandboxSession>();
const operations = new Map<string, SandboxOperation>();

class ReplayControlError extends CloudflareBlockedError {
  constructor(
    readonly control: "request-needed" | "replay-mismatch",
    readonly cursor: number,
    readonly request: NormalizedRequest,
    message?: string,
  ) {
    super(request.url, 0);
    this.name = "AidokuReplayControlError";
    if (message) this.message = message;
  }
}

function boundedErrorMessage(error: unknown): string {
  const detail = error instanceof Error ? error.message : String(error);
  return detail.slice(0, 2_048) || "The isolated Aidoku runtime failed.";
}

function result(value: JsonRecord): string {
  return JSON.stringify(value);
}

function success(
  value: unknown,
  settingsPatch: Record<string, unknown> = {},
): string {
  // Convex/React Native bridge values cannot carry `undefined`, functions, or
  // object prototypes. Aidoku results are data-only; JSON normalization also
  // prevents a hostile source from returning an exotic host object.
  const normalized = JSON.parse(JSON.stringify(value ?? null)) as unknown;
  return result({ status: "complete", value: normalized, settingsPatch });
}

function assertPlainRecord(value: unknown, label: string): JsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value as JsonRecord;
}

function assertString(value: unknown, label: string, maxLength = 4_096): string {
  if (typeof value !== "string" || value.length === 0 || value.length > maxLength) {
    throw new Error(`${label} is invalid.`);
  }
  return value;
}

function normalizeStringMap(
  value: unknown,
  label: string,
  maxEntries: number,
  maxBytes: number,
): Record<string, string> {
  const entries = Object.entries(assertPlainRecord(value, label));
  if (entries.length > maxEntries) {
    throw new Error(`${label} has too many entries.`);
  }
  const normalized: Record<string, string> = {};
  let totalBytes = 0;
  for (const [rawKey, rawValue] of entries) {
    if (typeof rawValue !== "string") {
      throw new Error(`${label} contains an invalid value.`);
    }
    const key = rawKey.trim();
    if (!key || /[\r\n]/.test(key) || /[\r\n]/.test(rawValue)) {
      throw new Error(`${label} contains an invalid entry.`);
    }
    totalBytes +=
      new TextEncoder().encode(key).byteLength +
      new TextEncoder().encode(rawValue).byteLength;
    if (totalBytes > maxBytes) {
      throw new Error(`${label} exceeds the safety limit.`);
    }
    normalized[key] = rawValue;
  }
  return normalized;
}

function assertManga(value: unknown): Manga {
  const manga = assertPlainRecord(value, "Manga");
  assertString(manga.key, "Manga key", MAX_REQUEST_URL_LENGTH);
  return manga as unknown as Manga;
}

function assertChapter(value: unknown): Chapter {
  const chapter = assertPlainRecord(value, "Chapter");
  assertString(chapter.key, "Chapter key", MAX_REQUEST_URL_LENGTH);
  return chapter as unknown as Chapter;
}

function assertListing(value: unknown): Listing {
  const listing = assertPlainRecord(value, "Listing");
  assertString(listing.id, "Listing ID", 4_096);
  assertString(listing.name, "Listing name", 4_096);
  return listing as unknown as Listing;
}

function normalizeHeaders(value: unknown): Record<string, string> {
  const input = assertPlainRecord(value, "HTTP headers");
  const entries = Object.entries(input);
  if (entries.length > MAX_REQUEST_HEADERS) {
    throw new Error("Aidoku HTTP request has too many headers.");
  }

  const normalized: Record<string, string> = {};
  let totalBytes = 0;
  for (const [rawKey, rawValue] of entries) {
    if (typeof rawValue !== "string") {
      throw new Error("Aidoku HTTP request contains an invalid header value.");
    }
    const key = rawKey.trim().toLowerCase();
    if (!key || /[\r\n]/.test(key) || /[\r\n]/.test(rawValue)) {
      throw new Error("Aidoku HTTP request contains an invalid header.");
    }
    totalBytes += key.length + rawValue.length;
    if (totalBytes > MAX_REQUEST_HEADER_BYTES) {
      throw new Error("Aidoku HTTP request headers exceed the safety limit.");
    }
    normalized[key] = rawValue;
  }

  return Object.fromEntries(
    Object.entries(normalized).sort(([left], [right]) => left.localeCompare(right)),
  );
}

function normalizeRequest(request: HttpRequest | JsonRecord): NormalizedRequest {
  const input = assertPlainRecord(request, "Aidoku HTTP request");
  const url = assertString(input.url, "Aidoku HTTP URL", MAX_REQUEST_URL_LENGTH);
  const parsed = new URL(url);
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Aidoku HTTP requests must use http or https.");
  }
  const rawMethod = typeof input.method === "string" ? input.method : "GET";
  const method = rawMethod.trim().toUpperCase();
  if (!/^[A-Z]{1,16}$/.test(method)) {
    throw new Error("Aidoku HTTP request method is invalid.");
  }
  const body = input.body == null ? null : String(input.body);
  if (body !== null && body.length > MAX_REQUEST_BODY_LENGTH) {
    throw new Error("Aidoku HTTP request body exceeds the safety limit.");
  }
  return {
    url: parsed.toString(),
    method,
    headers: normalizeHeaders(input.headers ?? {}),
    body,
  };
}

function sameRequest(left: NormalizedRequest, right: NormalizedRequest): boolean {
  return (
    left.url === right.url &&
    left.method === right.method &&
    left.body === right.body &&
    JSON.stringify(left.headers) === JSON.stringify(right.headers)
  );
}

function extractSettingsDefaults(
  settingsJson: unknown[] | undefined,
): JsonRecord {
  const defaults: JsonRecord = {};
  if (!settingsJson) return defaults;

  const visit = (item: unknown) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return;
    const setting = item as JsonRecord;
    if (setting.type === "group" && Array.isArray(setting.items)) {
      for (const child of setting.items) visit(child);
      return;
    }
    if (typeof setting.key === "string" && setting.default !== undefined) {
      defaults[setting.key] = setting.default;
    }
  };
  for (const item of settingsJson) visit(item);
  return defaults;
}

function applyManifestDefaults(settings: JsonRecord, manifest: SourceManifest): void {
  if (
    manifest.config?.allowsBaseUrlSelect &&
    manifest.info.urls?.length &&
    settings.url === undefined
  ) {
    settings.url = manifest.info.urls[0];
  }
  if (manifest.info.languages?.length && settings.languages === undefined) {
    settings.languages =
      manifest.config?.languageSelectType === "multi"
        ? [...manifest.info.languages]
        : [manifest.info.languages[0]];
  }
}

function resolveDefaultSettings(session: SandboxSession): JsonRecord {
  const resolved = extractSettingsDefaults(session.components.settingsJson);
  applyManifestDefaults(resolved, session.components.manifest);
  return resolved;
}

function sourceCapabilities(
  source: AidokuSource,
  session: SandboxSession,
): SandboxCapabilities {
  const staticListings = source.manifest.listings ?? [];
  const hasListings = source.hasDynamicListings || staticListings.length > 0;
  return {
    id: source.id,
    staticListings,
    hasListingProvider: source.hasListingProvider,
    hasHomeProvider: source.hasHome,
    hasListings,
    isOnlySearch: !source.hasHome && !hasListings,
    handlesBasicLogin: source.handlesBasicLogin,
    handlesWebLogin: source.handlesWebLogin,
    hasImageRequestProvider: source.hasImageRequestProvider,
    hasImageProcessor:
      source.hasImageProcessor && session.imageProcessorTransportAvailable,
  };
}

async function executeSourceOperation(
  source: AidokuSource,
  session: SandboxSession,
  operation: JsonRecord,
  imageBytes: Uint8Array | null,
): Promise<unknown> {
  const actionSource = source as AidokuSource & {
    handleBasicLogin(key: string, username: string, password: string): boolean;
    handleWebLogin(key: string, cookies: Record<string, string>): boolean;
    handleNotification(notification: string): void;
  };
  switch (operation.kind) {
    case "capabilities":
      return sourceCapabilities(source, session);
    case "search":
      return source.getSearchMangaList(
        operation.query == null ? null : String(operation.query),
        Number(operation.page),
        (Array.isArray(operation.filters) ? operation.filters : []) as FilterValue[],
      );
    case "details":
      return source.getMangaDetails(assertManga(operation.manga));
    case "chapters":
      return source.getChapterList(assertManga(operation.manga));
    case "pages":
      return source.getPageList(
        assertManga(operation.manga),
        assertChapter(operation.chapter),
      );
    case "filters":
      return source.getFilters();
    case "listings":
      return source.hasDynamicListings
        ? [...(source.manifest.listings ?? []), ...source.getListings()]
        : (source.manifest.listings ?? []);
    case "listing-page":
      return source.getMangaListForListing(
        assertListing(operation.listing),
        Number(operation.page),
      );
    case "home": {
      const partials: HomeLayout[] = [];
      const layout = source.getHomeWithPartials((partial) => partials.push(partial));
      return { layout, partials };
    }
    case "handle-basic-login":
      return actionSource.handleBasicLogin(
        assertString(operation.key, "Login key", 256),
        assertString(operation.username, "Username", 16_384),
        assertString(operation.password, "Password", 65_536),
      );
    case "handle-web-login":
      return actionSource.handleWebLogin(
        assertString(operation.key, "Login key", 256),
        normalizeStringMap(operation.cookies, "Cookies", 128, 65_536),
      );
    case "handle-notification":
      actionSource.handleNotification(
        assertString(operation.notification, "Notification", 256),
      );
      return null;
    case "modify-image-request":
      return source.modifyImageRequest(
        assertString(operation.url, "Image URL", MAX_REQUEST_URL_LENGTH),
        operation.context == null
          ? null
          : (assertPlainRecord(operation.context, "Image context") as Record<string, string>),
      );
    case "process-page-image": {
      if (!source.hasImageProcessor || !session.imageProcessorTransportAvailable) {
        return null;
      }
      if (!imageBytes) throw new Error("Aidoku image input is unavailable.");
      return source.processPageImage(
        imageBytes,
        operation.context == null
          ? null
          : (assertPlainRecord(operation.context, "Image context") as Record<
              string,
              string
            >),
        assertString(operation.requestUrl, "Image request URL", MAX_REQUEST_URL_LENGTH),
        normalizeHeaders(operation.requestHeaders ?? {}),
        Number(operation.responseCode),
        normalizeHeaders(operation.responseHeaders ?? {}),
      );
    }
    default:
      throw new Error("Unsupported isolated Aidoku operation.");
  }
}

function createReplayBridge(state: SandboxOperation): {
  bridge: HttpBridge;
  consumedResponses: () => number;
} {
  let cursor = 0;
  return {
    bridge: {
      request(rawRequest) {
        const request = normalizeRequest(rawRequest);
        const replay = state.replay[cursor];
        if (!replay) {
          state.pendingRequest = { cursor, request };
          throw new ReplayControlError("request-needed", cursor, request);
        }
        if (!sameRequest(replay.request, request)) {
          throw new ReplayControlError(
            "replay-mismatch",
            cursor,
            request,
            "Aidoku source produced a non-deterministic HTTP replay request.",
          );
        }
        cursor += 1;
        return replay.response;
      },
    },
    consumedResponses: () => cursor,
  };
}

async function runOperation(state: SandboxOperation): Promise<string> {
  const session = sessions.get(state.sessionId);
  if (!session) {
    return result({ status: "error", code: "session-missing", detail: "Aidoku session expired." });
  }

  const originalDateNow = Date.now;
  let replayClockStartedAt = 0;
  let source: AidokuSource | null = null;
  state.pendingRequest = null;
  try {
    if (state.input.kind === "process-page-image" && state.imageBytes == null) {
      const imageDataName = assertString(
        state.input.imageDataName,
        "Image named-data ID",
        256,
      );
      state.imageBytes = await consumeNamedBytes(imageDataName);
      if (
        state.imageBytes.byteLength === 0 ||
        state.imageBytes.byteLength > SANDBOX_IMAGE_MAX_COMPRESSED_BYTES
      ) {
        throw new Error("Aidoku image input exceeds the safety limit.");
      }
    }

    const canvasModule = createAidokuSandboxCanvasModule({
      inputWidth: Number(state.input.imageWidth ?? 0),
      inputHeight: Number(state.input.imageHeight ?? 0),
    });
    const loadSource = createLoadSource(canvasModule);
    const replayBridge = createReplayBridge(state);
    const settingsTransaction = new SandboxSettingsTransaction(
      resolveDefaultSettings(session),
      session.persistedSettings,
      session.userSettings,
    );
    // The AIX bytes are immutable for a session. Pass the module compiled
    // during registration explicitly so each replay receives fresh Wasm state
    // without mutating the isolate-wide WebAssembly API.
    source = await loadSource(session.components, session.sourceKey, {
      httpBridge: replayBridge.bridge,
      settingsGetter: (key) => settingsTransaction.get(key),
      settingsSetter: (key, value) => settingsTransaction.set(key, value),
      canvasModule,
      compiledModule: session.compiledModule,
    });
    // A fixed Date.now would deadlock sources that legitimately call env.sleep.
    // Anchor time to the operation start while still advancing with real
    // elapsed time. Replays therefore get stable request timestamps without
    // turning timeout/sleep loops into infinite CPU spins.
    replayClockStartedAt = originalDateNow();
    Date.now = () => state.startedAt + (originalDateNow() - replayClockStartedAt);
    source.initialize();
    const value = await executeSourceOperation(
      source,
      session,
      state.input,
      state.imageBytes,
    );
    if (replayBridge.consumedResponses() !== state.replay.length) {
      return result({
        status: "error",
        code: "non-deterministic-replay",
        detail: "Aidoku source did not consume every recorded HTTP replay response.",
      });
    }
    const settingsPatch = settingsTransaction.encodedPatch();
    if (state.input.kind === "process-page-image") {
      if (value == null) return success(null, settingsPatch);
      if (!(value instanceof Uint8Array)) {
        throw new Error("Aidoku image processor returned invalid data.");
      }
      const plan = decodeAidokuSandboxCanvasPlan(value);
      if (plan) {
        return success({ kind: "canvas-plan", plan }, settingsPatch);
      }
      if (value.byteLength > SANDBOX_IMAGE_MAX_COMPRESSED_BYTES) {
        throw new Error("Aidoku processed image exceeds the safety limit.");
      }
      const portName = assertString(
        state.input.outputPortName,
        "Image output port",
        256,
      );
      await postImageBytes(portName, value);
      return success(
        { kind: "binary", byteLength: value.byteLength },
        settingsPatch,
      );
    }
    return success(value, settingsPatch);
  } catch (error) {
    if (error instanceof ReplayControlError) {
      if (error.control === "request-needed") {
        return result({
          status: "http-request",
          cursor: error.cursor,
          request: error.request,
        });
      }
      return result({
        status: "error",
        code: "non-deterministic-replay",
        detail: boundedErrorMessage(error),
      });
    }
    return result({
      status: "error",
      code: "runtime-failed",
      detail: boundedErrorMessage(error),
    });
  } finally {
    Date.now = originalDateNow;
    try {
      source?.dispose();
    } catch {
      // The isolate is still bounded and can be terminated by the native host.
    }
  }
}

async function consumeNamedBytes(name: string): Promise<Uint8Array> {
  if (typeof android === "undefined") {
    throw new Error("Android named-data bridge is unavailable.");
  }
  const buffer = await android.consumeNamedDataAsArrayBuffer(name);
  return new Uint8Array(buffer);
}

async function postImageBytes(name: string, bytes: Uint8Array): Promise<void> {
  if (typeof android === "undefined" || typeof android.getNamedPort !== "function") {
    throw new Error("Android image message-port bridge is unavailable.");
  }
  const owned = new Uint8Array(new ArrayBuffer(bytes.byteLength));
  owned.set(bytes);
  const port = await android.getNamedPort(name);
  try {
    port.postMessage(owned.buffer);
  } finally {
    port.close();
  }
}

export const NemuAidokuSandbox = {
  async registerSession(
    sessionId: string,
    sourceKey: string,
    expectedSourceId: string,
    expectedVersion: number,
    dataName: string,
    userSettings: unknown,
    persistedSettings: unknown,
    imageProcessorTransportAvailable: boolean,
  ): Promise<string> {
    try {
      assertString(sessionId, "Session ID", 256);
      assertString(sourceKey, "Source key", MAX_SOURCE_KEY_LENGTH);
      assertString(expectedSourceId, "Expected source ID", 256);
      if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 0) {
        throw new Error("Expected Aidoku source version is invalid.");
      }
      assertString(dataName, "Named data ID", 256);
      const nextUserSettings = assertPlainRecord(userSettings, "Source settings");
      if (JSON.stringify(nextUserSettings).length > MAX_SETTINGS_JSON_LENGTH) {
        throw new Error("Aidoku settings exceed the safety limit.");
      }
      const nextPersistedSettings = decodeSandboxPersistedSettings(
        persistedSettings,
      );
      if (typeof imageProcessorTransportAvailable !== "boolean") {
        throw new Error("Aidoku image-processor capability is invalid.");
      }
      const bytes = await consumeNamedBytes(dataName);
      if (bytes.byteLength === 0 || bytes.byteLength > MAX_AIX_PACKAGE_BYTES) {
        throw new Error("AIX package exceeds the isolated runtime safety limit.");
      }
      if (!sessions.has(sessionId) && sessions.size >= MAX_SESSIONS) {
        throw new Error("Too many isolated Aidoku sessions are active.");
      }
      const extracted = extractAix(bytes);
      if (
        extracted.manifest.info.id !== expectedSourceId ||
        extracted.manifest.info.version !== expectedVersion
      ) {
        throw new Error(
          "The AIX package identity or version does not match the installed source.",
        );
      }
      const preparedWasm = prepareMobileAidokuWasm(extracted.wasmBytes);
      const metadataByteLength = new TextEncoder().encode(
        JSON.stringify({
          manifest: extracted.manifest,
          settingsJson: extracted.settingsJson,
          filtersJson: extracted.filtersJson,
        }),
      ).byteLength;
      const memoryByteLength = preparedWasm.bytes.byteLength + metadataByteLength;
      if (memoryByteLength > MAX_SESSION_BYTES_TOTAL) {
        throw new Error("AIX package expands beyond the isolated runtime memory limit.");
      }
      const previousByteLength = sessions.get(sessionId)?.memoryByteLength ?? 0;
      const nextTotalByteLength =
        [...sessions.values()].reduce(
          (total, session) => total + session.memoryByteLength,
          0,
        ) -
        previousByteLength +
        memoryByteLength;
      if (nextTotalByteLength > MAX_SESSION_BYTES_TOTAL) {
        throw new Error("Active AIX packages exceed the isolated runtime memory limit.");
      }
      const compiledModule = await WebAssembly.compile(preparedWasm.bytes);
      sessions.set(sessionId, {
        id: sessionId,
        sourceKey,
        components: {
          wasmBytes: preparedWasm.bytes,
          manifest: extracted.manifest,
          settingsJson: extracted.settingsJson,
          filtersJson: extracted.filtersJson,
        },
        compiledModule,
        memoryByteLength,
        persistedSettings: nextPersistedSettings,
        userSettings: { ...nextUserSettings },
        imageProcessorTransportAvailable,
      });
      return result({ status: "registered" });
    } catch (error) {
      return result({ status: "error", code: "registration-failed", detail: boundedErrorMessage(error) });
    }
  },

  beginOperation(
    operationId: string,
    sessionId: string,
    input: unknown,
    startedAt: number,
  ): string {
    try {
      assertString(operationId, "Operation ID", 256);
      assertString(sessionId, "Session ID", 256);
      if (!sessions.has(sessionId)) throw new Error("Aidoku session expired.");
      if (operations.size >= MAX_OPERATIONS && !operations.has(operationId)) {
        throw new Error("Another isolated Aidoku operation is still running.");
      }
      const operation = assertPlainRecord(input, "Aidoku operation");
      if (JSON.stringify(operation).length > MAX_OPERATION_JSON_LENGTH) {
        throw new Error("Aidoku operation exceeds the safety limit.");
      }
      if (!Number.isFinite(startedAt) || startedAt <= 0) {
        throw new Error("Aidoku operation timestamp is invalid.");
      }
      operations.set(operationId, {
        id: operationId,
        sessionId,
        input: operation,
        startedAt,
        replay: [],
        replayByteLength: 0,
        pendingRequest: null,
        imageBytes: null,
      });
      return result({ status: "started" });
    } catch (error) {
      return result({ status: "error", code: "operation-rejected", detail: boundedErrorMessage(error) });
    }
  },

  async executeOperation(operationId: string): Promise<string> {
    const state = operations.get(operationId);
    if (!state) {
      return result({ status: "error", code: "operation-missing", detail: "Aidoku operation expired." });
    }
    return runOperation(state);
  },

  async appendReplayResponse(
    operationId: string,
    cursor: number,
    rawRequest: unknown,
    status: number,
    headers: unknown,
    dataName: string,
  ): Promise<string> {
    try {
      const state = operations.get(operationId);
      if (!state) throw new Error("Aidoku operation expired.");
      if (!Number.isSafeInteger(cursor) || cursor !== state.replay.length) {
        throw new Error("Aidoku replay cursor is invalid.");
      }
      const request = normalizeRequest(assertPlainRecord(rawRequest, "Aidoku HTTP request"));
      if (
        !state.pendingRequest ||
        state.pendingRequest.cursor !== cursor ||
        !sameRequest(state.pendingRequest.request, request)
      ) {
        throw new Error("Aidoku replay response does not match the pending request.");
      }
      if (!Number.isSafeInteger(status) || status < 0 || status > 999) {
        throw new Error("Aidoku HTTP response status is invalid.");
      }
      const responseHeaders = normalizeHeaders(headers);
      const bytes = await consumeNamedBytes(assertString(dataName, "Named data ID", 256));
      if (bytes.byteLength > MAX_REPLAY_RESPONSE_BYTES) {
        throw new Error("Aidoku HTTP response exceeds the safety limit.");
      }
      if (state.replayByteLength + bytes.byteLength > MAX_REPLAY_BYTES_TOTAL) {
        throw new Error("Aidoku HTTP replay data exceeds the memory safety limit.");
      }
      state.replay.push({
        request,
        response: { status, headers: responseHeaders, body: "", bytes },
      });
      state.replayByteLength += bytes.byteLength;
      state.pendingRequest = null;
      return result({ status: "appended" });
    } catch (error) {
      return result({ status: "error", code: "replay-rejected", detail: boundedErrorMessage(error) });
    }
  },

  updateSessionSettings(sessionId: string, settings: unknown): string {
    try {
      const session = sessions.get(sessionId);
      if (!session) throw new Error("Aidoku session expired.");
      const nextSettings = assertPlainRecord(settings, "Source settings");
      if (JSON.stringify(nextSettings).length > MAX_SETTINGS_JSON_LENGTH) {
        throw new Error("Aidoku settings exceed the safety limit.");
      }
      session.userSettings = { ...nextSettings };
      return result({ status: "updated" });
    } catch (error) {
      return result({ status: "error", code: "settings-rejected", detail: boundedErrorMessage(error) });
    }
  },

  applyPersistedSettings(sourceKey: string, settings: unknown): string {
    try {
      assertString(sourceKey, "Source key", MAX_SOURCE_KEY_LENGTH);
      const decoded = decodeSandboxPersistedSettings(settings);
      for (const session of sessions.values()) {
        if (session.sourceKey === sourceKey) {
          session.persistedSettings = { ...decoded };
        }
      }
      return result({ status: "persisted" });
    } catch (error) {
      return result({
        status: "error",
        code: "settings-persistence-rejected",
        detail: boundedErrorMessage(error),
      });
    }
  },

  async probeRuntime(): Promise<string> {
    try {
      await probeAidokuSandboxGlobals();
      return result({ status: "ready" });
    } catch (error) {
      return result({
        status: "error",
        code: "runtime-probe-failed",
        detail: boundedErrorMessage(error),
      });
    }
  },

  finishOperation(operationId: string): string {
    operations.delete(operationId);
    return result({ status: "finished" });
  },

  disposeSession(sessionId: string): string {
    sessions.delete(sessionId);
    for (const [operationId, operation] of operations) {
      if (operation.sessionId === sessionId) operations.delete(operationId);
    }
    return result({ status: "disposed" });
  },
};

Object.defineProperty(globalThis, "NemuAidokuSandbox", {
  value: NemuAidokuSandbox,
  configurable: false,
  enumerable: false,
  writable: false,
});
