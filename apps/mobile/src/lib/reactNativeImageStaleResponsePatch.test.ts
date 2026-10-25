import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";

// Browse icon swap (Duo iOS 27.1): the two "Sources in your library" rows
// remount together; Fabric hands their RCTImageComponentViews back out of a
// LIFO recycle pool, crossed. An image response the previous request had
// already dispatched to the main queue then landed in the view that now paints
// the other row's icon. The react-native patch drops responses that are not
// addressed to the view's current request.
const repositoryRoot = path.resolve(import.meta.dir, "../../../..");
const patchPath = "patches/react-native@0.88.0.patch";
const read = (relative: string) =>
  readFileSync(path.join(repositoryRoot, relative), "utf8");

function patchedFile(patch: string, file: string): string {
  const start = patch.indexOf(`diff --git a/${file} b/${file}`);
  expect(start).toBeGreaterThanOrEqual(0);
  const next = patch.indexOf("\ndiff --git ", start + 1);
  return patch.slice(start, next < 0 ? undefined : next);
}

describe("react-native image view: no late response from a previous request", () => {
  const patch = read(patchPath);

  test("the patch is registered for the installed react-native version", () => {
    const rootPackage = JSON.parse(read("package.json")) as {
      dependencies?: Record<string, string>;
      patchedDependencies?: Record<string, string>;
    };
    const mobilePackage = JSON.parse(read("apps/mobile/package.json")) as {
      dependencies?: Record<string, string>;
    };
    expect(mobilePackage.dependencies?.["react-native"]).toBe("0.88.0");
    expect(rootPackage.patchedDependencies?.["react-native@0.88.0"]).toBe(patchPath);
    expect(read("bun.lock")).toContain(`"react-native@0.88.0": "${patchPath}"`);
  });

  test("a view gets a fresh observer proxy whenever its image request changes", () => {
    const view = patchedFile(
      patch,
      "React/Fabric/Mounting/ComponentViews/Image/RCTImageComponentView.mm",
    );
    expect(view).toContain("+  if (nextCoordinator != previousCoordinator) {");
    expect(view).toContain(
      "+    _imageResponseObserverProxy = std::make_shared<RCTImageResponseObserverProxy>(self);",
    );
    // The proxy is replaced before the new request is subscribed.
    expect(view.indexOf("if (nextCoordinator != previousCoordinator)")).toBeLessThan(
      view.indexOf("observerCoordinator.addObserver(_imageResponseObserverProxy);"),
    );
  });

  test("image, progress and failure callbacks drop anything not from the current proxy", () => {
    const view = patchedFile(
      patch,
      "React/Fabric/Mounting/ComponentViews/Image/RCTImageComponentView.mm",
    );
    const guards = view.match(/^\+\s+if \(observer != _imageResponseObserverProxy\.get\(\)/gm) ?? [];
    expect(guards.length).toBe(3);
    // The failure guard comes before the view clears its image.
    const failure = view.slice(view.indexOf("didReceiveFailure:(NSError *)error"));
    expect(failure.indexOf("observer != _imageResponseObserverProxy.get()")).toBeLessThan(
      failure.indexOf("_imageView.image = nil;"),
    );
  });

  test("a dispatched response keeps its proxy alive, so no new proxy can reuse its address", () => {
    const header = patchedFile(patch, "React/Fabric/RCTImageResponseObserverProxy.h");
    expect(header).toContain(
      "public std::enable_shared_from_this<RCTImageResponseObserverProxy>",
    );
    const proxy = patchedFile(patch, "React/Fabric/RCTImageResponseObserverProxy.mm");
    expect(proxy.match(/^\+\s+auto retainedThis = weak_from_this\(\)\.lock\(\);$/gm)?.length).toBe(3);
    expect(proxy.match(/^\+\s+\(void\)retainedThis;$/gm)?.length).toBe(3);
  });
});
