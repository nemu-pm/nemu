import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { strToU8, zipSync } from "fflate";
import vm from "node:vm";

const mobileRoot = path.resolve(import.meta.dir, "../..");
const bundlePath = path.join(
  mobileRoot,
  "modules/nemu-aidoku/runtime/assets/nemu_aidoku_sandbox.js",
);
const patchedGlobalStorePath = path.resolve(
  mobileRoot,
  "../..",
  "node_modules/@nemu.pm/aidoku-runtime/dist/global-store.js",
);

function loadPatchedGlobalStoreContext(
  globals: Record<string, unknown> = {},
): vm.Context {
  const moduleSource = readFileSync(patchedGlobalStorePath, "utf8").replace(
    /\bexport /g,
    "",
  );
  const context = vm.createContext({ console, ...globals });
  vm.runInContext(
    `${moduleSource}\nglobalThis.__NemuGlobalStore = GlobalStore;`,
    context,
    { timeout: 2_000 },
  );
  return context;
}

describe("Android Aidoku sandbox bundle", () => {
  test("boots without host TextEncoder TextDecoder or URL globals", async () => {
    const bundle = readFileSync(bundlePath, "utf8");
    const context = vm.createContext({ console });
    expect(vm.runInContext("typeof TextEncoder", context)).toBe("undefined");
    expect(vm.runInContext("typeof TextDecoder", context)).toBe("undefined");
    expect(vm.runInContext("typeof URL", context)).toBe("undefined");
    expect(vm.runInContext("typeof setInterval", context)).toBe("undefined");

    vm.runInContext(bundle, context, { timeout: 2_000 });
    const probe = JSON.parse(
      await vm.runInContext("NemuAidokuSandbox.probeRuntime()", context, {
        timeout: 2_000,
      }),
    ) as { status?: string };
    expect(probe.status).toBe("ready");
    expect(vm.runInContext("typeof setInterval", context)).toBe("undefined");
    expect(vm.runInContext("new URL('/猫', 'https://nemu.pm').href", context)).toBe(
      "https://nemu.pm/%E7%8C%AB",
    );
  });

  test("rejects substituted package identity and version before WASM compilation", async () => {
    const bundle = readFileSync(bundlePath, "utf8");
    const packageBytes = zipSync({
      "Payload/source.json": strToU8(
        JSON.stringify({
          info: {
            id: "en.example",
            name: "Example",
            version: 14,
            languages: ["en"],
          },
        }),
      ),
      "Payload/main.wasm": new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0]),
    });
    const packageBuffer = packageBytes.buffer.slice(
      packageBytes.byteOffset,
      packageBytes.byteOffset + packageBytes.byteLength,
    );
    let compileCalls = 0;
    const context = vm.createContext({
      console,
      android: {
        async consumeNamedDataAsArrayBuffer() {
          return packageBuffer;
        },
      },
      WebAssembly: {
        async compile(bytes: BufferSource) {
          compileCalls += 1;
          return WebAssembly.compile(bytes);
        },
      },
    });
    vm.runInContext(bundle, context, { timeout: 2_000 });

    const wrongId = JSON.parse(
      await vm.runInContext(
        'NemuAidokuSandbox.registerSession("id", "source", "en.other", 14, "data", {}, {}, false)',
        context,
        { timeout: 2_000 },
      ),
    ) as { status?: string; detail?: string };
    const wrongVersion = JSON.parse(
      await vm.runInContext(
        'NemuAidokuSandbox.registerSession("version", "source", "en.example", 13, "data", {}, {}, false)',
        context,
        { timeout: 2_000 },
      ),
    ) as { status?: string; detail?: string };

    expect(wrongId.status).toBe("error");
    expect(wrongId.detail).toContain("identity or version");
    expect(wrongVersion.status).toBe("error");
    expect(wrongVersion.detail).toContain("identity or version");
    expect(compileCalls).toBe(0);
  });

  test("bounds cleanup without timers and cancels a host interval on dispose", () => {
    const noTimerContext = loadPatchedGlobalStoreContext();
    expect(vm.runInContext("typeof setInterval", noTimerContext)).toBe(
      "undefined",
    );
    vm.runInContext(
      'globalThis.store = new __NemuGlobalStore("timerless")',
      noTimerContext,
    );
    vm.runInContext(
      "for (let index = 0; index < 10000; index += 1) store.storeStdValue(index)",
      noTimerContext,
      { timeout: 2_000 },
    );
    expect(() =>
      vm.runInContext("store.storeStdValue(10000)", noTimerContext),
    ).toThrow("Aidoku runtime descriptor limit exceeded.");
    vm.runInContext("store.destroy()", noTimerContext);
    vm.runInContext(
      'globalThis.requestStore = new __NemuGlobalStore("timerless-requests")',
      noTimerContext,
    );
    vm.runInContext(
      "for (let index = 0; index < 1000; index += 1) requestStore.createRequest()",
      noTimerContext,
      { timeout: 2_000 },
    );
    expect(() =>
      vm.runInContext("requestStore.createRequest()", noTimerContext),
    ).toThrow("Aidoku runtime request limit exceeded.");
    vm.runInContext("requestStore.destroy()", noTimerContext);

    let intervalDelay: number | undefined;
    let clearedHandle: unknown;
    const timerContext = loadPatchedGlobalStoreContext({
      setInterval(_callback: () => void, delay: number) {
        intervalDelay = delay;
        return 0;
      },
      clearInterval(handle: unknown) {
        clearedHandle = handle;
      },
    });
    vm.runInContext(
      'globalThis.store = new __NemuGlobalStore("host-timer")',
      timerContext,
    );
    expect(intervalDelay).toBe(60_000);
    vm.runInContext("store.destroy()", timerContext);
    expect(clearedHandle).toBe(0);
  });

  test("wires the isolated engine, bounded lifecycle, and fail-closed native bridge", () => {
    const moduleRoot = path.join(mobileRoot, "modules/nemu-aidoku");
    const gradle = readFileSync(path.join(moduleRoot, "android/build.gradle"), "utf8");
    const manager = readFileSync(
      path.join(
        moduleRoot,
        "runtime/kotlin/AidokuSandboxManager.kt",
      ),
      "utf8",
    );
    const sandboxRuntime = readFileSync(
      path.join(moduleRoot, "runtime/aidokuSandboxRuntime.ts"),
      "utf8",
    );
    const nativeModule = readFileSync(
      path.join(
        moduleRoot,
        "android/src/main/java/pm/nemu/mobile/aidoku/NemuAidokuModule.kt",
      ),
      "utf8",
    );
    const sandboxCookies = readFileSync(
      path.join(moduleRoot, "runtime/kotlin/AidokuSandboxCookies.kt"),
      "utf8",
    );
    const sandboxLifecycle = readFileSync(
      path.join(moduleRoot, "runtime/kotlin/AidokuSandboxLifecycle.kt"),
      "utf8",
    );
    const bridge = readFileSync(
      path.join(import.meta.dir, "mobileAidokuExecutorBridge.native.ts"),
      "utf8",
    );
    const sandboxBridge = readFileSync(
      path.join(import.meta.dir, "mobileAidokuSandboxExecutorBridge.native.ts"),
      "utf8",
    );

    expect(gradle).toContain(
      'implementation "androidx.javascriptengine:javascriptengine:1.1.0"',
    );
    expect(gradle).toContain('assets.srcDir "../runtime/assets"');
    expect(gradle).toContain('java.srcDir "../runtime/kotlin"');
    expect(manager).toContain("JS_FEATURE_WASM_COMPILATION");
    expect(manager).toContain("JS_FEATURE_ISOLATE_TERMINATION");
    expect(manager).toContain("JS_FEATURE_ISOLATE_MAX_HEAP_SIZE");
    expect(manager).toContain("JS_FEATURE_EVALUATE_WITHOUT_TRANSACTION_LIMIT");
    expect(manager).toContain("JS_FEATURE_MESSAGE_PORTS");
    expect(manager).toContain("createMessageChannel");
    expect(manager).toContain("Message.TYPE_ARRAY_BUFFER");
    expect(manager).toContain("AidokuSandboxSettingsStore");
    expect(manager).toContain("commitPatch");
    expect(manager).toContain("renderCanvasPlan");
    expect(manager).toContain("ensureBitmapAllocationBudget");
    expect(manager).toContain("retainedDestination");
    expect(manager).toContain("executor.execute {");
    expect(manager).toContain("executor.shutdown()");
    expect(manager).not.toContain(
      "sessions.values.forEach { it.registeredGeneration = -1 }",
    );
    expect(manager).toContain("var retained = false");
    expect(manager).toContain("if (!retained) cleanupSandboxSession(sessionId)");
    expect(manager).toContain("disposeRequestedSessionIds.add(sessionId)");
    expect(manager).toContain("SANDBOX_HEAP_BYTES = 96L * 1024L * 1024L");
    expect(manager).toContain("NEMU_AIDOKU_SANDBOX_MAX_EVALUATIONS = 1_024");
    expect(manager).toContain("withRuntimeRecycleBoundary");
    expect(manager).toContain("recyclePolicy.recordEvaluation()");
    expect(manager).toContain("requestRuntimeRecycle");
    expect(manager).toContain("SANDBOX_MAX_SESSIONS = 32");
    expect(manager).toContain("SANDBOX_MAX_SETTINGS_JSON_LENGTH = 256 * 1024");
    expect(sandboxRuntime).toContain("const MAX_SESSIONS = 32");
    expect(sandboxRuntime).toContain("const MAX_SETTINGS_JSON_LENGTH = 256 * 1024");
    expect(sandboxRuntime.indexOf("extracted.manifest.info.id !== expectedSourceId")).toBeLessThan(
      sandboxRuntime.indexOf("prepareMobileAidokuWasm(extracted.wasmBytes)"),
    );
    expect(sandboxRuntime.indexOf("extracted.manifest.info.version !== expectedVersion")).toBeLessThan(
      sandboxRuntime.indexOf("WebAssembly.compile(preparedWasm.bytes)"),
    );
    expect(manager).toContain("session.expectedSourceId");
    expect(manager).toContain("session.expectedVersion");
    expect(sandboxRuntime).toContain(
      "const owned = new Uint8Array(new ArrayBuffer(bytes.byteLength))",
    );
    expect(sandboxRuntime).toContain(
      "compiledModule: session.compiledModule",
    );
    expect(sandboxRuntime).toContain(
      'assertString(listing.name, "Listing name", 4_096)',
    );
    expect(sandboxRuntime).not.toContain(
      "WebAssembly.compile = async () => session.compiledModule",
    );
    expect(sandboxRuntime).toContain("source?.dispose()");
    expect(sandboxRuntime).toContain('case "handle-basic-login"');
    expect(sandboxRuntime).toContain('case "handle-web-login"');
    expect(sandboxRuntime).toContain('case "handle-notification"');
    expect(manager).toContain("SANDBOX_MAX_REPLAY_ROUNDS = 32");
    expect(manager).toContain("SANDBOX_OPERATION_TIMEOUT_MS = 20_000L");
    expect(nativeModule).toContain("appContext.backgroundCoroutineScope.launch");
    expect(nativeModule).toContain("runInterruptible");
    expect(nativeModule).toContain("processAidokuSandboxImage");
    expect(nativeModule).toContain("decorateSandboxImageHeaders");
    expect(nativeModule).toContain("sandboxCookieStore.get(sourceKey).loadForRequest(url)");
    expect(nativeModule).toContain("sandboxManagerOwner.destroy { it.close() }");
    expect(sandboxCookies).toContain("AidokuSandboxCookieInterceptor");
    expect(sandboxCookies).toContain("Cookie.parseAll(response.request.url, response.headers)");
    expect(sandboxLifecycle).toContain("enqueueNonCancellableAidokuCleanup");
    expect(sandboxLifecycle).toContain("AidokuSandboxManagerOwner");
    expect(bridge).toContain("mobileAidokuSandboxExecutorBridge.loadSource(input)");
    expect(bridge).toContain("if (!sandboxStatus.available)");
    expect(bridge).not.toContain("WebAssembly.compile");
    expect(sandboxBridge).toContain("processAidokuSandboxImage(");
    expect(sandboxBridge).toContain("sanitizeMobileAidokuOutput(");
    expect(sandboxBridge).toContain("SANDBOX_SESSION_CREATE_TIMEOUT_MS = 40_000");
  });

  test("keeps the checked-in bundle reproducible from the TypeScript runtime", () => {
    const entry = path.join(
      mobileRoot,
      "modules/nemu-aidoku/runtime/aidokuSandboxRuntime.ts",
    );
    const directory = mkdtempSync(path.join(tmpdir(), "nemu-aidoku-bundle-"));
    const outputPath = path.join(directory, "sandbox.js");
    const esbuildPath = path.resolve(
      mobileRoot,
      "../..",
      "node_modules/.bin/esbuild",
    );
    try {
      const result = spawnSync(
        esbuildPath,
        [
          entry,
          "--bundle",
          "--platform=browser",
          "--format=iife",
          "--target=chrome120",
          "--minify",
          "--legal-comments=eof",
          "--tree-shaking=true",
          "--log-level=silent",
          `--outfile=${outputPath}`,
        ],
        { cwd: mobileRoot, encoding: "utf8" },
      );

      expect(result.status, result.stderr).toBe(0);
      expect(readFileSync(outputPath, "utf8")).toBe(
        readFileSync(bundlePath, "utf8"),
      );
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
