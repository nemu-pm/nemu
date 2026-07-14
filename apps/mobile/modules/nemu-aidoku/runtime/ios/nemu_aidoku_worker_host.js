"use strict";

// Trusted page-side host for the iOS Aidoku worker. The page itself never
// evaluates AIX code. It only owns a dedicated Web Worker, enforces a hard
// watchdog, and relays bounded JSON/base64 messages to WebKit's isolated
// WebContent process.
(() => {
  const MAX_RUNTIME_CHARACTERS = 2 * 1024 * 1024;
  const MAX_COMMAND_CHARACTERS = 48 * 1024 * 1024;
  const MAX_RESULT_CHARACTERS = 16 * 1024 * 1024;
  const MAX_WATCHDOG_MS = 20_000;

  let runtimeSource = null;
  let worker = null;
  let workerUrl = null;
  let nextCommandId = 0;
  const pending = new Map();

  function boundedError(error) {
    const detail = error instanceof Error ? error.message : String(error);
    return (detail || "The isolated Aidoku worker failed.").slice(0, 2_048);
  }

  function decodeUtf8Base64(value) {
    if (typeof value !== "string" || value.length === 0 || value.length > MAX_RUNTIME_CHARACTERS) {
      throw new Error("The isolated Aidoku runtime asset is invalid.");
    }
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  }

  function rejectPending(error) {
    for (const state of pending.values()) {
      clearTimeout(state.timer);
      state.reject(error);
    }
    pending.clear();
  }

  function terminateWorker(reason) {
    if (worker) worker.terminate();
    worker = null;
    if (workerUrl) URL.revokeObjectURL(workerUrl);
    workerUrl = null;
    rejectPending(new Error(reason || "The isolated Aidoku worker was terminated."));
  }

  const workerPrelude = String.raw`
"use strict";
const __nemuNamedData = new Map();
const __nemuOutputData = new Map();
const __nemuMaxNamedDataCharacters = 48 * 1024 * 1024;
const __nemuMaxResultCharacters = 16 * 1024 * 1024;

function __nemuDecodeBase64(value) {
  if (typeof value !== "string" || value.length > __nemuMaxNamedDataCharacters) {
    throw new Error("Aidoku named data exceeds the safety limit.");
  }
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function __nemuEncodeBase64(value) {
  const bytes = value instanceof Uint8Array
    ? value
    : new Uint8Array(value.buffer || value, value.byteOffset || 0, value.byteLength);
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.byteLength; offset += chunkSize) {
    const chunk = bytes.subarray(offset, Math.min(bytes.byteLength, offset + chunkSize));
    binary += String.fromCharCode.apply(null, chunk);
  }
  return btoa(binary);
}

Object.defineProperty(globalThis, "android", {
  configurable: false,
  enumerable: false,
  writable: false,
  value: Object.freeze({
    async consumeNamedDataAsArrayBuffer(name) {
      const encoded = __nemuNamedData.get(name);
      if (encoded === undefined) throw new Error("Aidoku named data is unavailable.");
      __nemuNamedData.delete(name);
      return __nemuDecodeBase64(encoded).buffer;
    },
    async getNamedPort(name) {
      return Object.freeze({
        postMessage(value) {
          __nemuOutputData.set(name, __nemuEncodeBase64(value));
        },
        close() {},
      });
    },
  }),
});

// The worker has no network role. All source HTTP is replayed through the
// bounded native URLSession host. Keep ambient browser networking unavailable
// even if a future runtime dependency accidentally starts using it.
for (const name of ["fetch", "XMLHttpRequest", "WebSocket", "EventSource", "importScripts"]) {
  try {
    Object.defineProperty(globalThis, name, {
      configurable: false,
      enumerable: false,
      writable: false,
      value: undefined,
    });
  } catch {}
}
`;

  const workerSuffix = String.raw`
const __nemuAllowedMethods = new Set([
  "probeRuntime",
  "registerSession",
  "beginOperation",
  "executeOperation",
  "appendReplayResponse",
  "updateSessionSettings",
  "applyPersistedSettings",
  "finishOperation",
  "disposeSession",
]);

self.onmessage = async (event) => {
  const command = event.data;
  const id = command && command.id;
  try {
    if (!command || typeof command !== "object" || !Number.isSafeInteger(id)) {
      throw new Error("The isolated Aidoku command is invalid.");
    }
    if (!__nemuAllowedMethods.has(command.method)) {
      throw new Error("The isolated Aidoku command is not allowed.");
    }
    if (!Array.isArray(command.args)) {
      throw new Error("The isolated Aidoku command arguments are invalid.");
    }
    __nemuNamedData.clear();
    __nemuOutputData.clear();
    const namedData = command.namedData || {};
    for (const [name, value] of Object.entries(namedData)) {
      if (typeof name !== "string" || name.length === 0 || name.length > 256) {
        throw new Error("The isolated Aidoku named-data ID is invalid.");
      }
      if (typeof value !== "string" || value.length > __nemuMaxNamedDataCharacters) {
        throw new Error("Aidoku named data exceeds the safety limit.");
      }
      __nemuNamedData.set(name, value);
    }
    const method = globalThis.NemuAidokuSandbox && globalThis.NemuAidokuSandbox[command.method];
    if (typeof method !== "function") {
      throw new Error("The isolated Aidoku runtime method is unavailable.");
    }
    const value = await method(...command.args);
    if (
      typeof value !== "string" ||
      value.length > __nemuMaxResultCharacters ||
      new TextEncoder().encode(value).byteLength > 4 * 1024 * 1024
    ) {
      throw new Error("The isolated Aidoku runtime returned an invalid result.");
    }
    self.postMessage({
      type: "result",
      id,
      value,
      namedData: Object.fromEntries(__nemuOutputData),
    });
  } catch (error) {
    self.postMessage({
      type: "error",
      id,
      detail: error instanceof Error ? error.message.slice(0, 2_048) : "The isolated Aidoku worker failed.",
    });
  } finally {
    __nemuNamedData.clear();
    __nemuOutputData.clear();
  }
};

self.postMessage({ type: "booted" });
`;

  function ensureWorker() {
    if (worker) return worker;
    if (typeof runtimeSource !== "string") {
      throw new Error("The isolated Aidoku runtime is not configured.");
    }
    workerUrl = URL.createObjectURL(
      new Blob([workerPrelude, runtimeSource, workerSuffix], { type: "text/javascript" }),
    );
    const nextWorker = new Worker(workerUrl);
    worker = nextWorker;
    nextWorker.onmessage = (event) => {
      const message = event.data;
      if (!message) return;
      if (message.type === "booted") {
        if (workerUrl) URL.revokeObjectURL(workerUrl);
        workerUrl = null;
        return;
      }
      const state = pending.get(message.id);
      if (!state) return;
      pending.delete(message.id);
      clearTimeout(state.timer);
      if (message.type === "result") {
        const serialized = JSON.stringify({ value: message.value, namedData: message.namedData || {} });
        if (
          serialized.length > MAX_RESULT_CHARACTERS ||
          new TextEncoder().encode(serialized).byteLength > MAX_RESULT_CHARACTERS
        ) {
          terminateWorker("The isolated Aidoku worker response exceeds the safety limit.");
          state.reject(new Error("The isolated Aidoku worker response exceeds the safety limit."));
          return;
        }
        state.resolve(serialized);
      } else {
        state.reject(new Error(String(message.detail || "The isolated Aidoku worker failed.").slice(0, 2_048)));
      }
    };
    nextWorker.onerror = (event) => {
      const detail = String(event.message || "The isolated Aidoku worker crashed.").slice(0, 2_048);
      terminateWorker(detail);
    };
    nextWorker.onmessageerror = () => terminateWorker("The isolated Aidoku worker returned an invalid message.");
    return nextWorker;
  }

  function configure(runtimeBase64) {
    terminateWorker("The isolated Aidoku runtime was reconfigured.");
    runtimeSource = decodeUtf8Base64(runtimeBase64);
    return true;
  }

  function invoke(commandJson, timeoutMs) {
    if (
      typeof commandJson !== "string" ||
      commandJson.length === 0 ||
      commandJson.length > MAX_COMMAND_CHARACTERS ||
      new TextEncoder().encode(commandJson).byteLength > MAX_COMMAND_CHARACTERS
    ) {
      return Promise.reject(new Error("The isolated Aidoku command exceeds the safety limit."));
    }
    let command;
    try {
      command = JSON.parse(commandJson);
    } catch {
      return Promise.reject(new Error("The isolated Aidoku command is malformed."));
    }
    const id = ++nextCommandId;
    command.id = id;
    const boundedTimeout = Math.max(1, Math.min(MAX_WATCHDOG_MS, Number(timeoutMs) || MAX_WATCHDOG_MS));
    return new Promise((resolve, reject) => {
      let activeWorker;
      try {
        activeWorker = ensureWorker();
      } catch (error) {
        reject(error);
        return;
      }
      const timer = setTimeout(() => {
        pending.delete(id);
        activeWorker.terminate();
        if (worker === activeWorker) {
          worker = null;
          if (workerUrl) URL.revokeObjectURL(workerUrl);
          workerUrl = null;
        }
        reject(new Error("The isolated Aidoku operation exceeded its watchdog."));
      }, boundedTimeout);
      pending.set(id, { resolve, reject, timer });
      try {
        activeWorker.postMessage(command);
      } catch (error) {
        pending.delete(id);
        clearTimeout(timer);
        reject(new Error(boundedError(error)));
      }
    });
  }

  Object.defineProperty(globalThis, "NemuAidokuIOSHost", {
    configurable: false,
    enumerable: false,
    writable: false,
    value: Object.freeze({ configure, invoke, terminateWorker }),
  });
})();
