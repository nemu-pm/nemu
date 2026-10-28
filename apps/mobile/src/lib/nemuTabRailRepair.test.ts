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

  test("toggles the bar once per controller, only when a vertical bar is up", () => {
    const body = section(repair, "static func repairIfNeeded", "private final class Toggle");
    expect(body).toContain("verticalBarEdge != .unspecified");
    expect(body).toContain("objc_setAssociatedObject(controller, &repairedKey");
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
    expect(toggle).toContain("NemuVerticalBarOverride.release(path: path)");
  });
});
