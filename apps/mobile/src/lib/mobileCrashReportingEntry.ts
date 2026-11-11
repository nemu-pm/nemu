import { startMobileCrashReporting } from "./mobileCrashReporting";

// Imported from index.ts right after the polyfills, before the rest of the
// app is evaluated, so errors from module evaluation onwards are reported.
startMobileCrashReporting();
