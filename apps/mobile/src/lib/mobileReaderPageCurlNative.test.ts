import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";

const iosDir = path.join(import.meta.dir, "../../modules/nemu-window-layout/ios");
const curl = readFileSync(path.join(iosDir, "NemuPageCurl.swift"), "utf8");
const leaves = readFileSync(path.join(iosDir, "NemuPageCurlLeaves.swift"), "utf8");

describe("native single-page curl", () => {
  test("a single page's leaf back is the leaf that turns: the page on screen turning on, the page landed on turning back", () => {
    expect(leaves).toContain("case back(Int, source: Int)");
    // The leaf nearer the binding is on top: left-bound, the left-hand slot; right-bound (manga), the right-hand one.
    expect(leaves).toContain("spine == .max ? Swift.max(from, to) : Swift.min(from, to)");
    // Gesture turns (both data source methods) and requested turns (tap, slider) alike.
    expect(leaves).toContain("return .back(target, source: turningSlot(from: source, to: target, spine: spine))");
    expect(leaves).toContain("[.front(slot), .back(slot, source: turningSlot(from: from ?? slot, to: slot, spine: spine))]");
    expect(curl).toContain("case .back(let target, let source): return backController(target: target, showing: source)");
    expect(curl).toContain("guard let page = controller(for: source) else { return nil }");
    expect(curl).toContain("NemuPageCurlLeaves.before(leaf, slotCount: slotCount, spine: spineLocation)");
    expect(curl).toContain("NemuPageCurlLeaves.after(leaf, slotCount: slotCount, spine: spineLocation)");
    expect(curl).toContain('spine == "mid" ? .mid : spine == "max" ? .max : .min }');
    expect(curl).not.toContain("landingOn");
  });

  test("the back is mirrored once and washed with 85% paper (white on light, #090a0d on dark)", () => {
    expect(curl).toContain("static let mirrorsBack = true");
    expect(curl).toContain("cg.scaleBy(x: -1, y: 1)");
    expect(curl).toContain("static let opacity: CGFloat = 0.85");
    expect(curl).toContain("UIColor(red: 9 / 255, green: 10 / 255, blue: 13 / 255, alpha: opacity)");
    expect(curl).toContain("NemuPageCurlPaper.wash(over: pageBackground)");
  });

  test("the back is rendered at the leaf's size and never stretched", () => {
    expect(curl).toContain("imageView.contentMode = .center");
    expect(curl).not.toContain("imageView.contentMode = .scaleToFill");
  });

  test("the frame never changes mid-turn, and the page on screen is set again after it does", () => {
    expect(curl).toContain("if !transitioning && pageController.view.frame != frame {");
    expect(curl).toContain("if positioned && appliedToken != navigationToken { applyNavigation() }");
    // The pending turn starts before the frame of its target is applied.
    expect(curl.indexOf("if positioned && appliedToken != navigationToken { applyNavigation() }"))
      .toBeLessThan(curl.indexOf("if !transitioning && pageController.view.frame != frame {"));
    expect(curl).toContain("private func reseatAfterFrameChange()");
    expect(curl).toContain("pageController.setViewControllers(vcs, direction: .forward, animated: false)");
  });

  test("single pages bind on an edge; only spreads use the middle spine", () => {
    expect(curl).toContain('spine == "mid" ? .mid : spine == "max" ? .max : .min');
    expect(curl).toContain("slotCount: slotCount, spine: spineLocation, animated: animated");
  });

  test("the leaf sequence stays Foundation-only (its iosTest compiles without UIKit)", () => {
    expect(leaves).toContain("import Foundation");
    expect(leaves).not.toContain("import UIKit");
    expect(leaves).not.toContain("UIColor");
  });

  test("a fold never reaches UIKit's size transition, and only a new size re-sets the spread", () => {
    // The left (verso) page of a mid-spine spread was re-laid through a
    // rasterized still for the system transition (heavily blurred ~0.5 s).
    expect(curl).toContain("final class NemuPageCurlController: UIPageViewController {");
    expect(curl).toMatch(
      /override func viewWillTransition\(to size: CGSize, with coordinator: UIViewControllerTransitionCoordinator\) \{\s*\/\/[^\n]*\n\s*\/\/[^\n]*\n\s*\}/,
    );
    expect(curl).toContain("let controller = NemuPageCurlController(");
    expect(curl).not.toContain("let controller = UIPageViewController(");
    expect(curl).toContain("if positioned && resized { reseatPending = true }");
    expect(leaves).toContain("static func needsReseat(from old: CGSize, to new: CGSize) -> Bool");
    expect(leaves).toContain("abs(old.width - new.width) >= 0.5 || abs(old.height - new.height) >= 0.5");
  });
});
