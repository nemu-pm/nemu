import { describe, expect, test } from "bun:test";
import {
  createMobileHeldImageStack,
  markMobileHeldImageLoaded,
  mobileHeldImageStackIsSettling,
  settleMobileHeldImageStack,
  showInMobileHeldImageStack,
  type MobileHeldImageStack,
} from "./mobileCachedImageHold";

const keys = (stack: MobileHeldImageStack<string>) => stack.layers.map((layer) => layer.key);
const loadedA = () => markMobileHeldImageLoaded(createMobileHeldImageStack("title", "a", "A"), "a");

describe("mobileCachedImageHold", () => {
  test("a new cover goes over the one on screen, which stays until the new one has faded in", () => {
    const changed = showInMobileHeldImageStack(loadedA(), "title", "b", "B");
    expect(keys(changed)).toEqual(["a", "b"]);
    expect(changed.layers[1]!.swap).toBe(true);
    expect(mobileHeldImageStackIsSettling(changed)).toBe(false);
    expect(keys(settleMobileHeldImageStack(changed))).toEqual(["a", "b"]);

    const decoded = markMobileHeldImageLoaded(changed, "b");
    expect(mobileHeldImageStackIsSettling(decoded)).toBe(true);
    expect(keys(decoded)).toEqual(["a", "b"]);
    expect(keys(settleMobileHeldImageStack(decoded))).toEqual(["b"]);
  });

  test("a new cover that never loads leaves the old one up, and falling back to it drops the new one", () => {
    const changed = showInMobileHeldImageStack(loadedA(), "title", "b", "B");
    const fellBack = showInMobileHeldImageStack(changed, "title", "a", "A");
    expect(keys(fellBack)).toEqual(["a"]);
    expect(fellBack.layers[0]!.loaded).toBe(true);
  });

  test("a third cover before the second loaded replaces it, over the same held one", () => {
    const second = showInMobileHeldImageStack(loadedA(), "title", "b", "B");
    expect(keys(showInMobileHeldImageStack(second, "title", "c", "C"))).toEqual(["a", "c"]);
  });

  test("a third cover while the second fades in keeps both under it", () => {
    const fading = markMobileHeldImageLoaded(showInMobileHeldImageStack(loadedA(), "title", "b", "B"), "b");
    const third = showInMobileHeldImageStack(fading, "title", "c", "C");
    expect(keys(third)).toEqual(["a", "b", "c"]);
    expect(mobileHeldImageStackIsSettling(third)).toBe(false);
    expect(keys(settleMobileHeldImageStack(markMobileHeldImageLoaded(third, "c")))).toEqual(["c"]);
  });

  test("nothing loaded yet: nothing to hold, so the new source is a first layer with its fallback", () => {
    const changed = showInMobileHeldImageStack(createMobileHeldImageStack("title", "a", "A"), "title", "b", "B");
    expect(keys(changed)).toEqual(["b"]);
    expect(changed.layers[0]!.swap).toBe(false);
  });

  test("a recycled cell's new title never holds the previous title's cover", () => {
    const recycled = showInMobileHeldImageStack(loadedA(), "other", "b", "B");
    expect(keys(recycled)).toEqual(["b"]);
    expect(recycled.layers[0]!.swap).toBe(false);
  });

  test("the same source returns the same stack, so a rerender changes nothing", () => {
    const stack = loadedA();
    expect(showInMobileHeldImageStack(stack, "title", "a", "A")).toBe(stack);
    expect(markMobileHeldImageLoaded(stack, "a")).toBe(stack);
    expect(settleMobileHeldImageStack(stack)).toBe(stack);
  });
});
