// Single switch for react-native-worklets Bundle Mode, shared by
// babel.config.js (worklets plugin `bundleMode` option) and metro.config.js
// (`getBundleModeMetroConfig`). Both sides must agree: the Babel plugin
// rewrites the library's `_WORKLETS_BUNDLE_MODE_ENABLED` flag, while the Metro
// wrapper adds the `prepareBundleMode` polyfill and stable module ids.
//
// Off by default. With Bundle Mode on, the prepareBundleMode polyfill starts a
// second runtime that evaluates the *entire* bundle at launch, and the JS
// thread blocks on it (WorkletsModuleProxyInitializer::finalize waits for the
// AOT proxy) the first time react-native-gesture-handler/reanimated load from
// app/_layout.tsx — directly lengthening the native launch screen. Its only
// consumer was the off-thread dual-reader FFT, which falls back to the JS
// thread (src/lib/mobileDualReaderAlignThread.ts).
//
// Opt back in for a non-development bundle with NEMU_WORKLETS_BUNDLE_MODE=1.
// Metro development never uses it: HMR retains complete bundle generations in
// worklet runtimes and grows the app until the OS kills it.
function isWorkletsBundleModeEnabled(env = process.env) {
  return (
    env.NODE_ENV !== "development" && env.NEMU_WORKLETS_BUNDLE_MODE === "1"
  );
}

module.exports = { isWorkletsBundleModeEnabled };
