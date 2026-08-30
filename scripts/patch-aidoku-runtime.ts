import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { constants as fsConstants } from "node:fs";

type FilePatch = {
  file: string;
  replacements: Array<{
    label: string;
    before: string;
    after: string;
    sentinel?: string;
  }>;
};

const runtimeDistDir = path.resolve(
  process.cwd(),
  "node_modules/@nemu.pm/aidoku-runtime/dist"
);

const patches: FilePatch[] = [
  {
    file: "global-store.js",
    replacements: [
      {
        label: "runtime bounded allocation cleanup state",
        before:
          "    // Cleanup timer\n    cleanupTimer = null;\n    // Statistics for debugging\n",
        after:
          "    // Cleanup timer\n    cleanupTimer = null;\n    // Count allocations so runtimes without an event-loop timer still perform\n    // bounded, opportunistic cleanup.\n    allocationsSinceCleanup = 0;\n    // Statistics for debugging\n",
      },
      {
        label: "runtime optional cancellable cleanup timer",
        before:
          "    startCleanupTimer() {\n        if (typeof globalThis !== \"undefined\" && !this.cleanupTimer) {\n            this.cleanupTimer = setInterval(() => {\n                this.performCleanup();\n            }, MEMORY_CONFIG.CLEANUP_INTERVAL_MS);\n        }\n    }\n",
        after:
          "    startCleanupTimer() {\n        // AndroidX JavaScriptEngine isolates intentionally have no timer event\n        // loop. Only install the periodic cleanup when the host supplies both\n        // sides of a cancellable interval contract.\n        if (typeof globalThis.setInterval === \"function\" &&\n            typeof globalThis.clearInterval === \"function\" &&\n            this.cleanupTimer === null) {\n            this.cleanupTimer = globalThis.setInterval(() => {\n                this.performCleanup();\n            }, MEMORY_CONFIG.CLEANUP_INTERVAL_MS);\n        }\n    }\n",
      },
      {
        label: "runtime opportunistic cleanup and allocation limits",
        before:
          "    /** Perform automatic cleanup of stale descriptors and requests */\n    performCleanup() {\n        const now = Date.now();\n",
        after:
          "    prepareAllocation(kind) {\n        this.allocationsSinceCleanup += 1;\n        if (this.allocationsSinceCleanup >= 256) {\n            this.performCleanup();\n        }\n        const entries = kind === \"descriptor\" ? this.descriptors : this.requests;\n        const limit = kind === \"descriptor\"\n            ? MEMORY_CONFIG.MAX_DESCRIPTORS\n            : MEMORY_CONFIG.MAX_REQUESTS;\n        if (entries.size >= limit) {\n            this.performCleanup();\n            if (entries.size >= limit) {\n                throw new Error(`Aidoku runtime ${kind} limit exceeded.`);\n            }\n        }\n    }\n    /** Perform automatic cleanup of stale descriptors and requests */\n    performCleanup() {\n        this.allocationsSinceCleanup = 0;\n        const now = Date.now();\n",
      },
      {
        label: "runtime descriptor allocation guard",
        before:
          "    storeStdValue(value) {\n        const rid = this.allocateRid();\n",
        after:
          "    storeStdValue(value) {\n        this.prepareAllocation(\"descriptor\");\n        const rid = this.allocateRid();\n",
      },
      {
        label: "runtime request allocation guard",
        before:
          "    createRequest(method = 0) {\n        const rid = this.allocateRid();\n",
        after:
          "    createRequest(method = 0) {\n        this.prepareAllocation(\"request\");\n        const rid = this.allocateRid();\n",
      },
      {
        label: "runtime cleanup allocation reset",
        before:
          "    reset() {\n        this.descriptors.clear();\n        this.requests.clear();\n        this.resources.clear();\n        this.ridCounter = 0;\n",
        after:
          "    reset() {\n        this.descriptors.clear();\n        this.requests.clear();\n        this.resources.clear();\n        this.ridCounter = 0;\n        this.allocationsSinceCleanup = 0;\n",
      },
      {
        label: "runtime feature-detected interval cancellation",
        before:
          "    destroy() {\n        if (this.cleanupTimer) {\n            clearInterval(this.cleanupTimer);\n            this.cleanupTimer = null;\n        }\n        this.reset();\n",
        after:
          "    destroy() {\n        if (this.cleanupTimer !== null) {\n            if (typeof globalThis.clearInterval === \"function\") {\n                globalThis.clearInterval(this.cleanupTimer);\n            }\n            this.cleanupTimer = null;\n        }\n        this.reset();\n",
      },
    ],
  },
  {
    file: "imports/std.js",
    replacements: [
      {
        label: "runtime deterministic current-time helper",
        before:
          'import { encodeVecString, decodeString, decodeI64, decodeBool, decodeF32 } from "../postcard";\n// Object type enum matching Swift\'s WasmStd.ObjectType\n',
        after:
          'import { encodeVecString, decodeString, decodeI64, decodeBool, decodeF32 } from "../postcard";\nfunction nemuAidokuNow() {\n    const deterministicNow = globalThis.__nemuAidokuDeterministicNowBridge;\n    return typeof deterministicNow === "function" ? deterministicNow() : Date.now();\n}\n// Object type enum matching Swift\'s WasmStd.ObjectType\n',
      },
      {
        label: "runtime deterministic current date",
        before:
          "        current_date: () => {\n            return Date.now() / 1000;\n        },\n",
        after:
          "        current_date: () => {\n            return nemuAidokuNow() / 1000;\n        },\n",
      },
      {
        label: "runtime deterministic current timezone offset",
        before:
          "            return BigInt(-new Date().getTimezoneOffset() * 60);",
        after:
          "            return BigInt(-new Date(nemuAidokuNow()).getTimezoneOffset() * 60);",
      },
      {
        label: "runtime deterministic date creation",
        before:
          "            const date = timestamp < 0 ? new Date() : new Date(timestamp * 1000);",
        after:
          "            const date = timestamp < 0 ? new Date(nemuAidokuNow()) : new Date(timestamp * 1000);",
      },
      {
        label: "runtime deterministic relative dates",
        before:
          "function parseRelativeDate(str) {\n    const now = new Date();\n",
        after:
          "function parseRelativeDate(str) {\n    const now = new Date(nemuAidokuNow());\n",
      },
    ],
  },
  {
    file: "imports/env.js",
    replacements: [
      {
        label: "runtime deterministic sleep bridge",
        before:
          "        sleep: (seconds) => {\n            // Blocking sleep using sync busy-wait\n            // This is a hack but necessary for WASM sync calls\n            const start = Date.now();\n            while (Date.now() - start < seconds * 1000) {\n                // Busy wait - not ideal but works for short sleeps\n            }\n        },\n",
        after:
          "        sleep: (seconds) => {\n            const deterministicSleep = globalThis.__nemuAidokuDeterministicSleepBridge;\n            if (typeof deterministicSleep === \"function\") {\n                deterministicSleep(seconds);\n                return;\n            }\n            // Blocking fallback for runtimes that do not install the deterministic bridge.\n            const start = Date.now();\n            while (Date.now() - start < seconds * 1000) {\n                // Busy wait - not ideal but preserves the upstream synchronous contract.\n            }\n        },\n",
      },
    ],
  },
  {
    file: "runtime.js",
    replacements: [
      {
        label: "runtime precompiled module option",
        before:
          "        const { httpBridge, settingsGetter = () => undefined, settingsSetter, canvasModule = defaultCanvasModule } = options;",
        after:
          "        const { httpBridge, settingsGetter = () => undefined, settingsSetter, canvasModule = defaultCanvasModule, compiledModule } = options;",
      },
      {
        label: "runtime precompiled module reuse",
        before:
          "        const module = await WebAssembly.compile(wasmBytes);",
        after:
          "        const module = compiledModule ?? await WebAssembly.compile(wasmBytes);",
      },
      {
        label: "runtime synchronous precompiled module instantiation",
        before:
          "        const instance = await WebAssembly.instantiate(module, importObject);",
        after:
          "        const instance = compiledModule\n            ? new WebAssembly.Instance(module, importObject)\n            : await WebAssembly.instantiate(module, importObject);",
      },
      {
        label: "runtime postcard import",
        before:
          'import { encodeString, encodeEmptyVec, encodeManga, encodeChapter, encodeImageResponse, encodeHashMap, encodeFilterValues, decodeMangaPageResult, decodeManga, decodePageList, decodeFilterList, decodeString, decodeVec, concatBytes, decodeHomeLayout, decodeHomeComponent, } from "./postcard";',
        after:
          'import { encodeString, encodeVecString, encodeEmptyVec, encodeManga, encodeChapter, encodeImageResponse, encodeHashMap, encodeFilterValues, decodeMangaPageResult, decodeManga, decodePageList, decodeFilterList, decodeString, decodeVec, decodeBool, concatBytes, decodeHomeLayout, decodeHomeComponent, } from "./postcard";',
      },
      {
        label: "runtime result-decoder import",
        before:
          'import { readResultPayload, decodeRidFromPayload, RuntimeMode, detectRuntimeMode, } from "./result-decoder";',
        after:
          'import { readResultPayload, decodeRidFromPayload, RuntimeMode, detectRuntimeMode, getResultErrorMessage, } from "./result-decoder";',
      },
      {
        label: "runtime auth export detection",
        before:
          "        const handleBasicLogin = exports.handle_basic_login;\n        const handleWebLogin = exports.handle_web_login;\n",
        after:
          "        const handleBasicLoginExport = exports.handle_basic_login;\n        const handleWebLoginExport = exports.handle_web_login;\n        const handleNotificationExport = exports.handle_notification;\n",
      },
      {
        label: "runtime auth helpers",
        before:
          "        function readResult(ptr) {\n            if (ptr <= 0)\n                return null;\n            try {\n                const view = new DataView(memory.buffer);\n                const len = view.getInt32(ptr, true);\n                if (len <= 8)\n                    return null;\n                const data = new Uint8Array(memory.buffer, ptr + 8, len - 8);\n                return data.slice();\n            }\n            catch {\n                return null;\n            }\n        }\n        // Helper to convert decoded filter to Filter type\n",
        after:
          "        function readResult(ptr) {\n            if (ptr <= 0)\n                return null;\n            try {\n                const view = new DataView(memory.buffer);\n                const len = view.getInt32(ptr, true);\n                if (len <= 8)\n                    return null;\n                const data = new Uint8Array(memory.buffer, ptr + 8, len - 8);\n                return data.slice();\n            }\n            catch {\n                return null;\n            }\n        }\n        function readBooleanResult(resultPtr, action) {\n            if (resultPtr < 0) {\n                throw new Error(getResultErrorMessage(memory, resultPtr) ?? `${action} failed: ${resultPtr}`);\n            }\n            const payload = readResultPayload(memory, resultPtr);\n            if (freeResult && resultPtr > 0) {\n                freeResult(resultPtr);\n            }\n            if (!payload) {\n                return false;\n            }\n            const [result] = decodeBool(payload, 0);\n            return result;\n        }\n        function assertSuccess(resultCode, action) {\n            if (resultCode < 0) {\n                throw new Error(getResultErrorMessage(memory, resultCode) ?? `${action} failed: ${resultCode}`);\n            }\n        }\n        // Helper to convert decoded filter to Filter type\n",
      },
      {
        label: "runtime auth capability flags",
        before:
          "            handlesBasicLogin: !!handleBasicLogin,\n            handlesWebLogin: !!handleWebLogin,\n",
        after:
          "            handlesBasicLogin: !!handleBasicLoginExport,\n            handlesWebLogin: !!handleWebLoginExport,\n",
      },
      {
        label: "runtime auth methods",
        before:
          "            getSearchMangaList(query, page, filters) {\n",
        after:
          "            handleBasicLogin(key, username, password) {\n                if (!handleBasicLoginExport)\n                    return false;\n                const scope = store.createScope();\n                try {\n                    const keyDescriptor = scope.storeValue(encodeString(key));\n                    const usernameDescriptor = scope.storeValue(encodeString(username));\n                    const passwordDescriptor = scope.storeValue(encodeString(password));\n                    const resultPtr = handleBasicLoginExport(keyDescriptor, usernameDescriptor, passwordDescriptor);\n                    return readBooleanResult(resultPtr, \"handle_basic_login\");\n                }\n                finally {\n                    scope.cleanup();\n                }\n            },\n            handleWebLogin(key, cookies) {\n                if (!handleWebLoginExport)\n                    return false;\n                const scope = store.createScope();\n                try {\n                    const keys = Object.keys(cookies);\n                    const values = keys.map((cookieKey) => cookies[cookieKey] ?? \"\");\n                    const keyDescriptor = scope.storeValue(encodeString(key));\n                    const keysDescriptor = scope.storeValue(encodeVecString(keys));\n                    const valuesDescriptor = scope.storeValue(encodeVecString(values));\n                    const resultPtr = handleWebLoginExport(keyDescriptor, keysDescriptor, valuesDescriptor);\n                    return readBooleanResult(resultPtr, \"handle_web_login\");\n                }\n                finally {\n                    scope.cleanup();\n                }\n            },\n            handleNotification(notification) {\n                if (!handleNotificationExport)\n                    return;\n                const scope = store.createScope();\n                try {\n                    const notificationDescriptor = scope.storeValue(encodeString(notification));\n                    const resultCode = handleNotificationExport(notificationDescriptor);\n                    assertSuccess(resultCode, \"handle_notification\");\n                }\n                finally {\n                    scope.cleanup();\n                }\n            },\n            getSearchMangaList(query, page, filters) {\n",
      },
      {
        label: "runtime initialization control-flow errors",
        before:
          "                    catch (e) {\n                        console.error(\"[Aidoku] Initialize error:\", e);\n                    }\n",
        after:
          "                    catch (e) {\n                        if (e instanceof CloudflareBlockedError)\n                            throw e;\n                        console.error(\"[Aidoku] Initialize error:\", e);\n                    }\n",
      },
      {
        label: "runtime filter control-flow errors",
        before:
          "                catch (e) {\n                    console.error(\"[Aidoku] getFilterList error:\", e);\n                    return [];\n                }\n",
        after:
          "                catch (e) {\n                    if (e instanceof CloudflareBlockedError)\n                        throw e;\n                    console.error(\"[Aidoku] getFilterList error:\", e);\n                    return [];\n                }\n",
      },
      {
        label: "runtime legacy image-request control-flow errors",
        before:
          "                    catch (e) {\n                        console.error(\"[Aidoku] OLD ABI modifyImageRequest error:\", e);\n                    }\n",
        after:
          "                    catch (e) {\n                        if (e instanceof CloudflareBlockedError)\n                            throw e;\n                        console.error(\"[Aidoku] OLD ABI modifyImageRequest error:\", e);\n                    }\n",
      },
      {
        label: "runtime image-request control-flow errors",
        before:
          "                catch (e) {\n                    console.error(\"[Aidoku] modifyImageRequest error:\", e);\n                    return { url, headers: defaultHeaders };\n                }\n",
        after:
          "                catch (e) {\n                    if (e instanceof CloudflareBlockedError)\n                        throw e;\n                    console.error(\"[Aidoku] modifyImageRequest error:\", e);\n                    return { url, headers: defaultHeaders };\n                }\n",
      },
      {
        label: "runtime image-processor control-flow errors",
        before:
          "                catch {\n                    return null;\n                }\n                finally {\n                    scope.cleanup();\n                }\n            },\n            getMangaListForListing(listing, page) {\n",
        after:
          "                catch (e) {\n                    if (e instanceof CloudflareBlockedError)\n                        throw e;\n                    return null;\n                }\n                finally {\n                    scope.cleanup();\n                }\n            },\n            getMangaListForListing(listing, page) {\n",
      },
      {
        label: "runtime source disposal",
        before:
          "            },\n        };\n    };\n}\n// Helper to encode Listing for aidoku-rs\n",
        after:
          "            },\n            dispose() {\n                store.destroy();\n            },\n        };\n    };\n}\n// Helper to encode Listing for aidoku-rs\n",
      },
      {
        label: "runtime listing control-flow errors",
        before:
          "                catch (e) {\n                    console.error(\"[Aidoku] getListings error:\", e);\n                    return [];\n                }\n",
        after:
          "                catch (e) {\n                    if (e instanceof CloudflareBlockedError)\n                        throw e;\n                    console.error(\"[Aidoku] getListings error:\", e);\n                    return [];\n                }\n",
      },
    ],
  },
  {
    file: "runtime.d.ts",
    replacements: [
      {
        label: "runtime precompiled module type",
        before:
          "    /** Canvas module for image operations (auto-detected, but can be overridden) */\n    canvasModule?: CanvasModule;\n",
        after:
          "    /** Canvas module for image operations (auto-detected, but can be overridden) */\n    canvasModule?: CanvasModule;\n    /** Reuse an immutable compiled module while instantiating fresh source state. */\n    compiledModule?: WebAssembly.Module;\n",
      },
      {
        label: "runtime source disposal type",
        before:
          "    processPageImage(imageData: Uint8Array, context: Record<string, string> | null, requestUrl: string, requestHeaders: Record<string, string>, responseCode: number, responseHeaders: Record<string, string>): Promise<Uint8Array | null>;\n}\n",
        after:
          "    processPageImage(imageData: Uint8Array, context: Record<string, string> | null, requestUrl: string, requestHeaders: Record<string, string>, responseCode: number, responseHeaders: Record<string, string>): Promise<Uint8Array | null>;\n    dispose(): void;\n}\n",
      },
    ],
  },
  {
    file: "imports/defaults.js",
    replacements: [
      {
        label: "defaults item reader helper",
        before:
          "export function createDefaultsImports(store, settingsGetter, settingsSetter) {\n    // Helper to encode a JS value to postcard bytes for storage\n",
        after:
          "export function createDefaultsImports(store, settingsGetter, settingsSetter) {\n    function readItemBytes(ptr) {\n        if (ptr <= 0)\n            return null;\n        const memory = store.memory;\n        if (!memory)\n            return null;\n        try {\n            const view = new DataView(memory.buffer);\n            const len = view.getInt32(ptr, true);\n            if (len <= 8)\n                return null;\n            return new Uint8Array(memory.buffer, ptr + 8, len - 8).slice();\n        }\n        catch {\n            return null;\n        }\n    }\n    // Helper to encode a JS value to postcard bytes for storage\n",
      },
      {
        label: "defaults decode item bytes",
        before:
          "    // Helper to decode postcard bytes from WASM memory based on kind\n    function decodeValueFromWasm(kind, ptr) {\n        if (ptr <= 0)\n            return null;\n        // Read the postcard-encoded value from WASM memory\n        const memory = store.memory;\n        if (!memory)\n            return null;\n        // Read enough bytes for decoding (max reasonable size for settings)\n        const maxLen = 4096;\n        const bytes = store.readBytes(ptr, maxLen);\n        if (!bytes)\n            return null;\n        try {\n",
        after:
          "    // Helper to decode postcard bytes from WASM memory based on kind\n    function decodeValueFromWasm(kind, ptr) {\n        if (kind === DefaultKind.Null)\n            return null;\n        const bytes = readItemBytes(ptr);\n        if (!bytes)\n            return null;\n        try {\n",
      },
      {
        label: "defaults decode data bytes",
        before:
          "                case DefaultKind.Data: {\n                    // Raw data - just store the bytes\n                    // First decode the length to know how much to read\n                    let len = 0;\n                    let shift = 0;\n                    let pos = 0;\n                    while (pos < bytes.length) {\n                        const byte = bytes[pos++];\n                        len |= (byte & 0x7f) << shift;\n                        if ((byte & 0x80) === 0)\n                            break;\n                        shift += 7;\n                    }\n                    return bytes.slice(pos, pos + len);\n                }\n",
        after:
          "                case DefaultKind.Data:\n                    return bytes;\n",
      },
    ],
  },
  {
    file: "async/index.js",
    replacements: [
      {
        label: "browser async settings setter",
        before:
          "    // Get initial settings\n    const initialSettings = settings?.get() ?? {};\n    // Load source in worker\n",
        after:
          "    // Get initial settings\n    const initialSettings = settings?.get() ?? {};\n    const settingsSetter = settings?.set\n        ? Comlink.proxy((key, value) => {\n            settings.set?.(key, value);\n        })\n        : null;\n    // Load source in worker\n",
      },
      {
        label: "browser async worker load args",
        before:
          "    const result = await workerSource.load(Comlink.transfer(aixBytes, [aixBytes]), sourceKey, useSabMode ? null : (proxyUrl ?? null), // Don't use proxyUrl in SAB mode\n    initialSettings, sharedBuffer // Will be null if not using SAB mode\n    );\n",
        after:
          "    const result = await workerSource.load(Comlink.transfer(aixBytes, [aixBytes]), sourceKey, useSabMode ? null : (proxyUrl ?? null), // Don't use proxyUrl in SAB mode\n    initialSettings, sharedBuffer, settingsSetter // Will be null if not using SAB mode\n    );\n",
      },
      {
        label: "browser async auth methods",
        before:
          "        async handlesWebLogin() {\n            return workerSource.handlesWebLogin();\n        },\n        async getHome() {\n",
        after:
          "        async handlesWebLogin() {\n            return workerSource.handlesWebLogin();\n        },\n        async handleBasicLogin(key, username, password) {\n            return workerSource.handleBasicLogin(key, username, password);\n        },\n        async handleWebLogin(key, cookies) {\n            return workerSource.handleWebLogin(key, cookies);\n        },\n        async handleNotification(notification) {\n            return workerSource.handleNotification(notification);\n        },\n        async getHome() {\n",
      },
    ],
  },
  {
    file: "async/worker.js",
    replacements: [
      {
        label: "worker load signature",
        before:
          "    async load(aixBytes, sourceKey, proxyUrl, initialSettings, sharedBuffer = null) {\n",
        after:
          "    async load(aixBytes, sourceKey, proxyUrl, initialSettings, sharedBuffer = null, settingsSetter = null) {\n",
      },
      {
        label: "worker settings setter bridge",
        before:
          "            // Settings getter reads from local store (updated via updateSettings)\n            const settingsGetter = (key) => this.settings[key];\n            // Load the source (but don't initialize yet - we need defaults first)\n            this.source = await loadSource(new Uint8Array(aixBytes), sourceKey, {\n                httpBridge,\n                settingsGetter,\n            });\n",
        after:
          "            // Settings getter reads from local store (updated via updateSettings)\n            const settingsGetter = (key) => this.settings[key];\n            const persistSetting = (key, value) => {\n                this.settings = { ...this.settings, [key]: value };\n                void settingsSetter?.(key, value);\n            };\n            // Load the source (but don't initialize yet - we need defaults first)\n            this.source = await loadSource(new Uint8Array(aixBytes), sourceKey, {\n                httpBridge,\n                settingsGetter,\n                settingsSetter: persistSetting,\n            });\n",
      },
      {
        label: "worker auth methods",
        before:
          "    handlesWebLogin() {\n        return this.source?.handlesWebLogin ?? false;\n    }\n    getHome() {\n",
        after:
          "    handlesWebLogin() {\n        return this.source?.handlesWebLogin ?? false;\n    }\n    handleBasicLogin(key, username, password) {\n        if (!this.source)\n            return false;\n        return this.source.handleBasicLogin(key, username, password);\n    }\n    handleWebLogin(key, cookies) {\n        if (!this.source)\n            return false;\n        return this.source.handleWebLogin(key, cookies);\n    }\n    handleNotification(notification) {\n        if (!this.source)\n            return;\n        this.source.handleNotification(notification);\n    }\n    getHome() {\n",
      },
    ],
  },
  {
    file: "async/common.js",
    replacements: [
      {
        label: "bounded prototype-safe settings defaults",
        sentinel: "const NEMU_SETTING_DEFAULT_LIMITS = Object.freeze({",
        before: `/**
 * Extract default values from settings.json structure
 * Matches iOS Aidoku behavior from Source.swift
 */
export function extractSettingsDefaults(settingsJson) {
    const defaults = {};
    if (!settingsJson)
        return defaults;
    for (const item of settingsJson) {
        if (typeof item !== "object" || item === null)
            continue;
        const settingItem = item;
        // Handle group items (nested settings)
        if (settingItem.type === "group" && Array.isArray(settingItem.items)) {
            for (const subItem of settingItem.items) {
                if (typeof subItem !== "object" || subItem === null)
                    continue;
                const setting = subItem;
                if (setting.key && setting.default !== undefined) {
                    defaults[setting.key] = setting.default;
                }
            }
        }
        // Handle top-level items with key and default
        else if (settingItem.key && settingItem.default !== undefined) {
            defaults[settingItem.key] = settingItem.default;
        }
    }
    return defaults;
}`,
        after: `const NEMU_SETTING_DEFAULT_LIMITS = Object.freeze({
    depth: 32,
    nodes: 1024,
    listItems: 256,
    keyLength: 256,
    stringLength: 4096,
    schemaStringChars: 1048576,
    absoluteNumber: 1000000000000,
});
const NEMU_SETTING_DEFAULT_TYPES = new Set([
    "select",
    "multi-select",
    "multi-single-select",
    "switch",
    "slider",
    "stepper",
    "segment",
    "text",
    "editable-list",
]);
function nemuOwnDataValue(value, key) {
    try {
        const descriptor = Object.getOwnPropertyDescriptor(value, key);
        return descriptor && "value" in descriptor ? descriptor.value : undefined;
    }
    catch {
        return undefined;
    }
}
function nemuAsArray(value) {
    try {
        return Array.isArray(value) ? value : null;
    }
    catch {
        return null;
    }
}
function nemuArrayLength(value) {
    const length = nemuOwnDataValue(value, "length");
    return Number.isSafeInteger(length) && length >= 0 ? length : 0;
}
function nemuArrayValue(value, index) {
    return nemuOwnDataValue(value, String(index));
}
function nemuAsPlainRecord(value) {
    if (!value || typeof value !== "object" || nemuAsArray(value))
        return null;
    try {
        const prototype = Object.getPrototypeOf(value);
        return prototype === Object.prototype || prototype === null ? value : null;
    }
    catch {
        return null;
    }
}
function nemuIsUnsafeKeyCodePoint(codePoint) {
    return codePoint < 32 ||
        (codePoint >= 127 && codePoint <= 159) ||
        codePoint === 173 ||
        codePoint === 1564 ||
        codePoint === 8203 ||
        codePoint === 8206 ||
        codePoint === 8207 ||
        (codePoint >= 8234 && codePoint <= 8238) ||
        codePoint === 8288 ||
        (codePoint >= 8294 && codePoint <= 8297) ||
        codePoint === 65279;
}
function nemuSafeSettingKey(value) {
    if (typeof value !== "string" ||
        value.length === 0 ||
        value.length > NEMU_SETTING_DEFAULT_LIMITS.keyLength ||
        value.trim().length === 0) {
        return null;
    }
    for (const character of value) {
        if (nemuIsUnsafeKeyCodePoint(character.codePointAt(0) ?? 0))
            return null;
    }
    return value;
}
function nemuFiniteSettingNumber(value) {
    return typeof value === "number" &&
        Number.isFinite(value) &&
        Math.abs(value) <= NEMU_SETTING_DEFAULT_LIMITS.absoluteNumber
        ? value
        : null;
}
function nemuSanitizeStringDefault(value, remainingStringChars) {
    if (typeof value !== "string" ||
        value.length > NEMU_SETTING_DEFAULT_LIMITS.stringLength ||
        value.length > remainingStringChars) {
        return null;
    }
    return { value, stringChars: value.length };
}
function nemuSanitizeStringArrayDefault(value, remainingStringChars) {
    const input = nemuAsArray(value);
    if (!input)
        return null;
    const length = nemuArrayLength(input);
    if (length > NEMU_SETTING_DEFAULT_LIMITS.listItems)
        return null;
    const output = [];
    let stringChars = 0;
    for (let index = 0; index < length; index += 1) {
        const item = nemuArrayValue(input, index);
        if (typeof item !== "string" ||
            item.length > NEMU_SETTING_DEFAULT_LIMITS.stringLength ||
            stringChars + item.length > remainingStringChars) {
            return null;
        }
        output.push(item);
        stringChars += item.length;
    }
    return { value: output, stringChars };
}
function nemuSanitizeSettingDefault(type, value, record, remainingStringChars) {
    if (type === "select" || type === "text")
        return nemuSanitizeStringDefault(value, remainingStringChars);
    if (type === "multi-select" ||
        type === "multi-single-select" ||
        type === "editable-list") {
        return nemuSanitizeStringArrayDefault(value, remainingStringChars);
    }
    if (type === "switch") {
        return typeof value === "boolean" ? { value, stringChars: 0 } : null;
    }
    if (type === "segment") {
        return typeof value === "number" &&
            Number.isInteger(value) &&
            value >= 0 &&
            value <= NEMU_SETTING_DEFAULT_LIMITS.absoluteNumber
            ? { value, stringChars: 0 }
            : null;
    }
    if (type === "slider" || type === "stepper") {
        const number = nemuFiniteSettingNumber(value);
        if (number === null)
            return null;
        const rawMinimum = nemuFiniteSettingNumber(nemuOwnDataValue(record, "min")) ??
            nemuFiniteSettingNumber(nemuOwnDataValue(record, "minimumValue")) ??
            0;
        const rawMaximum = nemuFiniteSettingNumber(nemuOwnDataValue(record, "max")) ??
            nemuFiniteSettingNumber(nemuOwnDataValue(record, "maximumValue")) ??
            100;
        const minimum = Math.min(rawMinimum, rawMaximum);
        const maximum = Math.max(rawMinimum, rawMaximum);
        return {
            value: Math.min(maximum, Math.max(minimum, number)),
            stringChars: 0,
        };
    }
    return null;
}
/**
 * Extract only bounded, type-compatible defaults before source initialization.
 * The result has no prototype; callers spread it into their own settings state.
 */
export function extractSettingsDefaults(settingsJson) {
    const defaults = Object.create(null);
    const root = nemuAsArray(settingsJson);
    if (!root)
        return defaults;
    const seenRecords = new WeakSet();
    const seenArrays = new WeakSet([root]);
    const claimedKeys = new Set();
    const stack = [{
            input: root,
            length: nemuArrayLength(root),
            index: 0,
            depth: 0,
        }];
    let inspectedNodes = 0;
    let remainingStringChars = NEMU_SETTING_DEFAULT_LIMITS.schemaStringChars;
    while (stack.length > 0 && inspectedNodes < NEMU_SETTING_DEFAULT_LIMITS.nodes) {
        const frame = stack[stack.length - 1];
        if (frame.index >= frame.length) {
            stack.pop();
            continue;
        }
        const rawNode = nemuArrayValue(frame.input, frame.index++);
        inspectedNodes += 1;
        const record = nemuAsPlainRecord(rawNode);
        if (!record || seenRecords.has(record))
            continue;
        seenRecords.add(record);
        const type = nemuOwnDataValue(record, "type");
        if (type === "group" || type === "page") {
            const children = nemuAsArray(nemuOwnDataValue(record, "items"));
            if (children &&
                frame.depth < NEMU_SETTING_DEFAULT_LIMITS.depth &&
                !seenArrays.has(children)) {
                seenArrays.add(children);
                stack.push({
                    input: children,
                    length: nemuArrayLength(children),
                    index: 0,
                    depth: frame.depth + 1,
                });
            }
            continue;
        }
        if (typeof type !== "string" || !NEMU_SETTING_DEFAULT_TYPES.has(type))
            continue;
        const key = nemuSafeSettingKey(nemuOwnDataValue(record, "key"));
        if (!key || claimedKeys.has(key) || key.length > remainingStringChars)
            continue;
        const defaultValue = nemuOwnDataValue(record, "default");
        if (defaultValue === undefined)
            continue;
        const sanitized = nemuSanitizeSettingDefault(type, defaultValue, record, remainingStringChars - key.length);
        if (!sanitized)
            continue;
        Object.defineProperty(defaults, key, {
            value: sanitized.value,
            enumerable: true,
            configurable: true,
            writable: true,
        });
        claimedKeys.add(key);
        remainingStringChars -= key.length + sanitized.stringChars;
        if (remainingStringChars <= 0)
            break;
    }
    return defaults;
}`,
      },
      {
        label: "single-choice array default normalization",
        before: `    if (type === "multi-select" ||
        type === "multi-single-select" ||
        type === "editable-list") {
        return nemuSanitizeStringArrayDefault(value, remainingStringChars);
    }`,
        after: `    if (type === "multi-select" ||
        type === "multi-single-select" ||
        type === "editable-list") {
        const result = nemuSanitizeStringArrayDefault(value, remainingStringChars);
        if (type !== "multi-single-select" || !result || result.value.length <= 1)
            return result;
        return {
            value: result.value.slice(0, 1),
            stringChars: result.value[0].length,
        };
    }`,
      },
      {
        label: "node async wrapper auth methods",
        before:
          "        async handlesWebLogin() {\n            return source.handlesWebLogin;\n        },\n        async getHome() {\n",
        after:
          "        async handlesWebLogin() {\n            return source.handlesWebLogin;\n        },\n        async handleBasicLogin(key, username, password) {\n            return cfRetry(() => source.handleBasicLogin(key, username, password));\n        },\n        async handleWebLogin(key, cookies) {\n            return cfRetry(() => source.handleWebLogin(key, cookies));\n        },\n        async handleNotification(notification) {\n            return cfRetry(() => source.handleNotification(notification));\n        },\n        async getHome() {\n",
      },
    ],
  },
  {
    file: "async/common.d.ts",
    replacements: [
      {
        label: "settings defaults unknown trust boundary type",
        before:
          "export declare function extractSettingsDefaults(settingsJson: unknown[] | undefined): Record<string, unknown>;",
        after:
          "export declare function extractSettingsDefaults(settingsJson: unknown): Record<string, unknown>;",
      },
    ],
  },
  {
    file: "async/index.node.js",
    replacements: [
      {
        label: "node async settings setter",
        before:
          "    const source = await loadSourceSync(input, sourceKey, {\n        httpBridge,\n        settingsGetter: (key) => currentSettings[key],\n    });\n",
        after:
          "    const source = await loadSourceSync(input, sourceKey, {\n        httpBridge,\n        settingsGetter: (key) => currentSettings[key],\n        settingsSetter: (key, value) => {\n            currentSettings = { ...currentSettings, [key]: value };\n            settings?.set?.(key, value);\n        },\n    });\n",
      },
    ],
  },
];

function replaceOnce(
  content: string,
  before: string,
  after: string,
  file: string,
  label: string,
  sentinel?: string,
): string {
  if (content.includes(sentinel ?? after)) return content;
  if (!content.includes(before)) {
    throw new Error(
      `Failed to patch ${file} (${label}): expected snippet not found.`,
    );
  }
  return content.replace(before, after);
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const available = await fileExists(runtimeDistDir);
  if (!available) {
    console.warn("[patch-aidoku-runtime] Skipped: runtime package not installed.");
    return;
  }

  // Compute every replacement before writing anything. A mid-run mismatch used
  // to leave node_modules half-patched, and the already-written files then look
  // "already patched" on the next install, so the failure never self-corrects.
  const pendingWrites: { filePath: string; content: string }[] = [];

  for (const patch of patches) {
    const filePath = path.join(runtimeDistDir, patch.file);
    const original = await readFile(filePath, "utf8");
    let content = original;

    for (const replacement of patch.replacements) {
      content = replaceOnce(
        content,
        replacement.before,
        replacement.after,
        patch.file,
        replacement.label,
        replacement.sentinel,
      );
    }

    if (content !== original) {
      pendingWrites.push({ filePath, content });
    }
  }

  for (const { filePath, content } of pendingWrites) {
    await writeFile(filePath, content, "utf8");
  }

  const touchedFiles = pendingWrites.length;

  console.log(
    touchedFiles > 0
      ? `[patch-aidoku-runtime] Patched ${touchedFiles} runtime files.`
      : "[patch-aidoku-runtime] Runtime already patched."
  );
}

await main();
