// AndroidX JavaScriptEngine exposes a deliberately small ECMAScript runtime.
// Aidoku's runtime additionally requires the Encoding and URL standards, so
// bundle deterministic implementations instead of depending on WebView globals.
import "../../../src/polyfills/textEncoding";
import {
  URL as StandardsURL,
  URLSearchParams as StandardsURLSearchParams,
} from "whatwg-url-minimum";

type SandboxGlobal = typeof globalThis & {
  URL?: typeof URL;
  URLSearchParams?: typeof URLSearchParams;
};

const sandboxGlobal = globalThis as SandboxGlobal;

sandboxGlobal.URL ??= StandardsURL as unknown as typeof URL;
sandboxGlobal.URLSearchParams ??=
  StandardsURLSearchParams as unknown as typeof URLSearchParams;

const MINIMAL_WASM_MODULE = Uint8Array.of(
  0x00,
  0x61,
  0x73,
  0x6d,
  0x01,
  0x00,
  0x00,
  0x00,
);

export async function probeAidokuSandboxGlobals(): Promise<void> {
  if (
    typeof TextEncoder !== "function" ||
    typeof TextDecoder !== "function" ||
    typeof URL !== "function" ||
    typeof URLSearchParams !== "function" ||
    typeof BigInt !== "function" ||
    typeof WebAssembly !== "object" ||
    typeof WebAssembly.compile !== "function" ||
    typeof WebAssembly.instantiate !== "function"
  ) {
    throw new Error("The isolated Aidoku runtime is missing required standards APIs.");
  }

  const text = "猫と🍙";
  if (new TextDecoder().decode(new TextEncoder().encode(text)) !== text) {
    throw new Error("The isolated Aidoku text encoding runtime is invalid.");
  }

  const url = new URL("../猫", "https://example.test/a/b/");
  url.searchParams.set("meal", "🍙");
  if (
    url.origin !== "https://example.test" ||
    url.pathname !== "/a/%E7%8C%AB" ||
    url.search !== "?meal=%F0%9F%8D%99"
  ) {
    throw new Error("The isolated Aidoku URL runtime is invalid.");
  }

  if (BigInt(41) + BigInt(1) !== BigInt(42)) {
    throw new Error("The isolated Aidoku BigInt runtime is invalid.");
  }

  const module = await WebAssembly.compile(MINIMAL_WASM_MODULE);
  await WebAssembly.instantiate(module);
}
