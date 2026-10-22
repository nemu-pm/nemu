import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";

const mobileRoot = path.resolve(import.meta.dir, "../..");
const iosManager = readFileSync(
  path.join(mobileRoot, "modules/nemu-aidoku/ios/NemuAidokuIOSandboxManager.swift"),
  "utf8",
);

describe("[aidoku-warm] iOS sandbox cold-boot diagnostics", () => {
  test("logs the WKWebView creation, the runtime HTML load and the package registration", () => {
    // NSLog reaches `simulator logs` at default level, like the manager's
    // existing settings-mirroring log.
    expect(iosManager).toContain('"[aidoku-warm] webview-create at=%.0f ms=%.0f');
    expect(iosManager).toContain('"[aidoku-warm] html-ready at=%.0f ms=%.0f callMs=%.0f"');
    expect(iosManager).toContain('"[aidoku-warm] html-failed at=%.0f ms=%.0f"');
    expect(iosManager).toContain('"[aidoku-warm] register-session at=%.0f ms=%.0f mainCallMs=%.0f');
    expect(iosManager).toContain('let warmDiag = method == "registerSession"');
    // The creation is timed around the constructor itself.
    expect(iosManager).toMatch(
      /let createStartMs = Self\.warmDiagNowMs\(\)\n\s+let nextWebView = WKWebView\(frame: \.zero, configuration: configuration\)\n\s+NSLog\(\n\s+"\[aidoku-warm\] webview-create/,
    );
  });
});
