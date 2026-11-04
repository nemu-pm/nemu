import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";

const iosDir = path.join(import.meta.dir, "../../modules/nemu-window-layout/ios");
const moduleSwift = readFileSync(path.join(iosDir, "NemuWindowLayoutModule.swift"), "utf8");
const gateSwift = readFileSync(path.join(iosDir, "NemuOrientationGate.swift"), "utf8");

function section(source: string, start: string, end: string): string {
  const from = source.indexOf(start);
  expect(from).toBeGreaterThanOrEqual(0);
  return source.slice(from, source.indexOf(end, from));
}

// iOS 27.2 leaves the tab group out of the iPhone Duo vertical bar when the tab
// bar controller first appears with the bar already up (inner display,
// landscape cold launch). The repair replays the bar going away and coming back.
describe("tab bar rail repair (iPhone Duo, iOS 27.2)", () => {
  const repair = section(moduleSwift, "enum NemuTabRailRepair", "\n#endif");

  test("is installed at launch, before any tab bar controller appears", () => {
    const launch = section(gateSwift, "didFinishLaunchingWithOptions", "return true");
    expect(launch).toContain("NemuTabRailRepair.install()");
    expect(launch).toContain("#if NEMU_SDK_27_1");
  });

  test("runs only on iOS 27.2+, from UITabBarController's viewDidAppear", () => {
    const install = section(repair, "static func install()", "static func repairIfNeeded");
    expect(install).toContain("#available(iOS 27.2, *)");
    expect(install).toContain("UITabBarController.self");
    expect(install).toContain("viewDidAppear(_:)");
    // The original appearance runs first.
    expect(install.indexOf("original(controller, selector, animated)")).toBeLessThan(
      install.indexOf("repairIfNeeded(tabs)"),
    );
  });

  test("toggles the bar on a controller's first appearance, only when a vertical bar is up", () => {
    const body = section(repair, "static func repairIfNeeded", "private final class Toggle");
    expect(body).toContain("verticalBarEdge != .unspecified");
    expect(body).toContain("guard objc_getAssociatedObject(controller, &appearedKey) == nil else { return }");
    expect(body.indexOf("objc_setAssociatedObject(controller, &appearedKey")).toBeLessThan(
      body.indexOf("verticalBarEdge != .unspecified"),
    );
    expect(body).toContain("NemuVerticalBarOverride.acquire(path: path)");
  });

  test("marks the end of UIKit's walk, not the tab bar controller (it forwards to its selected tab)", () => {
    const body = section(repair, "static func repairIfNeeded", "private final class Toggle");
    expect(body).toMatch(/while let child = leaf\.childForPreferredVerticalBarBehavior/);
    expect(body).toContain("var path: [UIViewController] = [leaf]");
  });

  test("turns the bar back on only once UIKit has taken it away, or after a cap", () => {
    const body = section(repair, "static func repairIfNeeded", "private final class Toggle");
    // Released from the controller's own bar-edge traits, a turn after they report no bar.
    const handler = section(body, "registerForTraitChanges(UITraitCollection.systemTraitsAffectingVerticalBarEdge)", "\n    }\n");
    expect(handler).toContain("verticalBarEdge == .unspecified");
    expect(handler).toContain("DispatchQueue.main.async");
    expect(handler).toContain('toggle.release("bar off")');
    expect(body).toMatch(/asyncAfter\(deadline: \.now\(\) \+ releaseCap\)[^\n]*toggle\.release\("cap"\)/);
    const toggle = section(repair, "private final class Toggle", "\n  }\n}");
    expect(toggle).toContain("guard !released else { return }");
    expect(toggle).toContain("unregisterForTraitChanges");
    expect(toggle).toContain("NemuVerticalBarOverride.release(path: path");
  });

  // The off-and-on round trip shows (tabs at the bottom, then the rail), and
  // at a cold launch the tab bar controller first appears just before the
  // launch screen lifts.
  test("is unanimated, and the bar comes back at once, not after the reader's transition grace", () => {
    const body = section(repair, "static func repairIfNeeded", "private final class Toggle");
    expect(body).toMatch(/UIView\.performWithoutAnimation \{\s*NemuVerticalBarOverride\.acquire\(path: path\)/);
    const release = section(repair, "func release(_ reason: String)", "func finish()");
    expect(release).toMatch(
      /UIView\.performWithoutAnimation \{\s*NemuVerticalBarOverride\.release\(path: path, afterTransitions: false\)\s*controller\?\.view\.window\?\.layoutIfNeeded\(\)/,
    );
    const override = section(moduleSwift, "static func release(path: [UIViewController], afterTransitions: Bool = true)", "private static func invalidate");
    expect(override).toContain("if afterTransitions { NemuTransitionSettle.wait(update) } else { update() }");
  });

  test("is finished once the bar is back (or after a cap), then wakes whoever waits on it", () => {
    const body = section(repair, "static func repairIfNeeded", "private final class Toggle");
    expect(body).toContain("running.append(toggle)");
    const handler = section(body, "registerForTraitChanges(UITraitCollection.systemTraitsAffectingVerticalBarEdge)", "\n    }\n");
    expect(handler).toMatch(/else if toggle\.released \{[^}]*toggle\.finish\(\)/);
    const release = section(repair, "func release(_ reason: String)", "func finish()");
    expect(release).toMatch(/asyncAfter\(deadline: \.now\(\) \+ rebuildCap\)[^\n]*self\.finish\(\)/);
    const finish = section(repair, "func finish()", "\n  }\n}");
    expect(finish).toContain("guard !finished else { return }");
    expect(finish).toContain("NemuTabRailRepair.finished(self)");
  });

  test("lets a waiter through at once when no repair is running or about to start, else when it is done or capped", () => {
    const wait = section(repair, "static func afterRepairs", "private static func pending()");
    expect(wait).toContain("guard pending() else { return done() }");
    expect(wait).toMatch(/asyncAfter\(deadline: \.now\(\) \+ waitCap\)[^\n]*waiter\.run\(\)/);
    const pending = section(repair, "private static func pending()", "private static func finished");
    // Off below 27.2 (not installed): 27.1, the outer display, portrait and other iPhones never wait.
    expect(pending).toContain("guard installed else { return false }");
    expect(pending).toContain("if !running.isEmpty { return true }");
    expect(pending).toContain("objc_getAssociatedObject(tabs, &appearedKey) == nil");
    expect(pending).toContain("tabs.traitCollection.verticalBarEdge != .unspecified");
  });
});

describe("launch reveal (iPhone Duo, iOS 27.2)", () => {
  test("sets its start state only once the tab rail repair is done, so the launch screen covers it", () => {
    const prepare = section(moduleSwift, "static func prepare(mode: String, background: String?, completion:", "private static func prepareNow");
    expect(prepare).toContain("NemuTabRailRepair.afterRepairs { completion(prepareNow(mode: mode, background: background)) }");
    expect(prepare).toContain("#if NEMU_SDK_27_1");
    const binding = section(moduleSwift, 'AsyncFunction("prepareLaunchReveal")', ".runOnQueue(.main)");
    expect(binding).toContain("promise: Promise");
    expect(binding).toContain("promise.resolve($0)");
  });
});
