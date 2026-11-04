import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { canonicalZoomId } from "../../modules/nemu-window-layout/src/zoomId";
import { canonicalMobileReaderZoomId, mobileReaderZoomIdForDetail } from "./mobileReaderZoomHandoff";

const moduleDir = path.join(import.meta.dir, "../../modules/nemu-window-layout");
const read = (file: string) => readFileSync(path.join(moduleDir, file), "utf8");
const vectors = JSON.parse(read("zoomIdVectors.json")) as { raw: string; canonical: string }[];

describe("canonical zoom ids", () => {
  test("every shared vector: one spelling, the same one the native registry takes", () => {
    expect(vectors.length).toBeGreaterThan(5);
    for (const { raw, canonical } of vectors) {
      expect(canonicalZoomId(raw) ?? "").toBe(canonical);
      // Idempotent: a source and a target that both canonicalise still agree.
      expect(canonicalZoomId(canonicalZoomId(raw) ?? "") ?? "").toBe(canonical);
      // The reader's handoff key is the same helper.
      expect(canonicalMobileReaderZoomId(raw) ?? "").toBe(canonical);
    }
  });

  test("a source built from an encoded item id meets the target the router decodes", () => {
    const itemId = "source:aidoku-community:ja.shonenjumpplus:%2Fepisode%2F108";
    for (const kind of ["continue", "shelf", "grid", "search", "detail"]) {
      const sourceId = canonicalZoomId(`${kind}:${itemId}`);
      // The route param: the id as pushed, decoded once by the router.
      const routeParam = decodeURIComponent(encodeURIComponent(`${kind}:${itemId}`));
      expect(canonicalZoomId(routeParam)).toBe(sourceId);
      expect(sourceId).toBe(`${kind}:source:aidoku-community:ja.shonenjumpplus:/episode/108`);
    }
    expect(mobileReaderZoomIdForDetail(itemId)).toBe(canonicalZoomId(`detail:${itemId}`));
  });

  test("the reader href and the route agree with the source", () => {
    const explore = readFileSync(path.join(import.meta.dir, "../components/explore/mobileExploreCover.ts"), "utf8");
    expect(explore).toContain("zoomId = canonicalMobileReaderZoomId(zoomId);");
    const route = readFileSync(path.join(import.meta.dir, "../../app/sources/[registryId]/[sourceId]/[mangaId]/[chapterId].tsx"), "utf8");
    expect(route).toContain("const zoom = canonicalMobileReaderZoomId(zoomParam ?? null);");
  });

  test("ZoomSource and ZoomTarget hand native the canonical id", () => {
    const native = read("src/ZoomTransition.native.tsx");
    expect(native).toContain('import { canonicalZoomId } from "./zoomId";');
    expect(native).toContain("<NativeZoomSource zoomId={canonicalZoomId(zoomId)}");
    expect(native).toMatch(/<NativeZoomTarget\s+zoomId=\{canonicalZoomId\(zoomId\)\}/);
    expect(read("index.ts")).toContain('export { canonicalZoomId } from "./src/zoomId";');
  });

  test("the native registry keys every id by the same rule", () => {
    const swiftId = read("ios/NemuZoomId.swift");
    expect(swiftId).toContain('"%[0-9a-fA-F]{2}"');
    expect(swiftId).toContain("while value.range(of:");
    expect(swiftId).toContain("value.removingPercentEncoding");
    const module = read("ios/NemuWindowLayoutModule.swift");
    expect(module).toContain("NemuZoomId.canonical(id) as NSString");
    const registry = module.slice(module.indexOf("enum NemuZoomRegistry"), module.indexOf("/// The zoom each screen was last given"));
    // No raw id reaches a map table.
    expect(registry).not.toContain("forKey: id as NSString");
    expect(registry.match(/forKey: key\(id\)/g)?.length).toBe(8);
    // The Swift check reads the same vectors.
    expect(read("iosTest/NemuZoomIdTests.swift")).toContain('appendingPathComponent("zoomIdVectors.json")');
  });

  test("one os_log line per zoomed open, public in Release", () => {
    const module = read("ios/NemuWindowLayoutModule.swift");
    expect(module).toContain('Logger(subsystem: "pm.nemu", category: "reader-zoom")');
    const setup = module.slice(module.indexOf("  private func setup() {"), module.indexOf("// MARK: - Content scroll view"));
    expect(setup.match(/readerZoomLog\.notice\(/g)?.length).toBe(1);
    // Logged after the once-per-controller guard: not on every re-render.
    expect(setup.indexOf("readerZoomLog.notice(")).toBeGreaterThan(setup.indexOf("NemuZoomRegistry.setConfiguration(key, of: controller)"));
    for (const field of ["open id=\\(NemuZoomId.canonical(id), privacy: .public)", "found=\\(sourceView != nil, privacy: .public)", "transitionCoordinator=\\(controller.transitionCoordinator != nil, privacy: .public)"]) {
      expect(setup).toContain(field);
    }
    expect(setup).not.toContain("#if DEBUG");
  });
});
