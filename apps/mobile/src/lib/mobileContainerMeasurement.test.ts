import { expect, test } from "bun:test";
import { mobileContainerMeasurementIsCurrent as current } from "./mobileContainerMeasurement";
const outer = { width: 466, height: 678 };
const inner = { width: 951, height: 669 };
const frame = { x: 0, y: 0, ...outer };
test("late outer-display callback cannot become inner-display pane geometry", () => {
  expect(current(outer, inner, frame)).toBe(false);
  expect(current(inner, outer, { x: 0, y: 0, ...inner })).toBe(false);
});
test("same-display folding accepts a resized pane and its inset origin", () => {
  expect(current(inner, inner, { x: 20, y: 40, width: 430, height: 600 })).toBe(true);
});
test("incoming navigation frames and invalid measurements cannot move the fold", () => {
  expect(current(inner, inner, { ...frame, x: 700 })).toBe(false);
  expect(current(inner, inner, { ...frame, x: -20 })).toBe(false);
  expect(current(inner, inner, { ...frame, width: NaN })).toBe(false);
});
