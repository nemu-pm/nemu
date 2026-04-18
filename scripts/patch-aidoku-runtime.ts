import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { constants as fsConstants } from "node:fs";

type FilePatch = {
  file: string;
  replacements: Array<{
    label: string;
    before: string;
    after: string;
  }>;
};

const runtimeDistDir = path.resolve(
  process.cwd(),
  "node_modules/@nemu.pm/aidoku-runtime/dist"
);

const patches: FilePatch[] = [
  {
    file: "runtime.js",
    replacements: [
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
        label: "node async wrapper auth methods",
        before:
          "        async handlesWebLogin() {\n            return source.handlesWebLogin;\n        },\n        async getHome() {\n",
        after:
          "        async handlesWebLogin() {\n            return source.handlesWebLogin;\n        },\n        async handleBasicLogin(key, username, password) {\n            return cfRetry(() => source.handleBasicLogin(key, username, password));\n        },\n        async handleWebLogin(key, cookies) {\n            return cfRetry(() => source.handleWebLogin(key, cookies));\n        },\n        async handleNotification(notification) {\n            return cfRetry(() => source.handleNotification(notification));\n        },\n        async getHome() {\n",
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

function replaceOnce(content: string, before: string, after: string, file: string, label: string): string {
  if (content.includes(after)) return content;
  if (!content.includes(before)) {
    throw new Error(`Failed to patch ${file} (${label}): expected snippet not found.`);
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

  let touchedFiles = 0;

  for (const patch of patches) {
    const filePath = path.join(runtimeDistDir, patch.file);
    let content = await readFile(filePath, "utf8");
    const original = content;

    for (const replacement of patch.replacements) {
      content = replaceOnce(content, replacement.before, replacement.after, patch.file, replacement.label);
    }

    if (content !== original) {
      await writeFile(filePath, content, "utf8");
      touchedFiles += 1;
    }
  }

  console.log(
    touchedFiles > 0
      ? `[patch-aidoku-runtime] Patched ${touchedFiles} runtime files.`
      : "[patch-aidoku-runtime] Runtime already patched."
  );
}

await main();
