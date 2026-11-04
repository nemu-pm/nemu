import { describe, expect, test } from "bun:test";

import {
  MOBILE_READER_STRIP_IDENTITY_BRIDGE,
  mobileReaderStripBridgeClampedLocalIndex,
  mobileReaderStripBridgeGlobalIndex,
  mobileReaderStripBridgeLocalAnchor,
  mobileReaderStripBridgeLocalIndex,
} from "./mobileReaderStripBridge";

// Previous chapter: 20 pages (rows 0-19), its divider (row 20); the open
// chapter: 12 pages (rows 21-32), then the next divider (row 33).
const bridge = { indexBase: 21, offsetBase: 31_000, localCount: 12 };

describe("seamless scroll bridge", () => {
  test("the identity bridge leaves indexes alone", () => {
    expect(mobileReaderStripBridgeLocalIndex(MOBILE_READER_STRIP_IDENTITY_BRIDGE, 7)).toBe(7);
    expect(mobileReaderStripBridgeGlobalIndex(MOBILE_READER_STRIP_IDENTITY_BRIDGE, 7)).toBe(7);
    expect(mobileReaderStripBridgeLocalAnchor(MOBILE_READER_STRIP_IDENTITY_BRIDGE, { pageIndex: 3, fraction: 0.4 }))
      .toEqual({ pageIndex: 3, fraction: 0.4 });
    expect(mobileReaderStripBridgeClampedLocalIndex(MOBILE_READER_STRIP_IDENTITY_BRIDGE, 9)).toBe(9);
  });

  test("rows of the open chapter map to its pages, others to null", () => {
    expect(mobileReaderStripBridgeLocalIndex(bridge, 21)).toBe(0);
    expect(mobileReaderStripBridgeLocalIndex(bridge, 32)).toBe(11);
    expect(mobileReaderStripBridgeLocalIndex(bridge, 20)).toBeNull();
    expect(mobileReaderStripBridgeLocalIndex(bridge, 33)).toBeNull();
    expect(mobileReaderStripBridgeLocalIndex(bridge, Number.NaN)).toBeNull();
    expect(mobileReaderStripBridgeGlobalIndex(bridge, 5)).toBe(26);
  });

  test("an anchor outside the open chapter clamps to its nearest edge", () => {
    expect(mobileReaderStripBridgeLocalAnchor(bridge, { pageIndex: 25, fraction: 0.3 }))
      .toEqual({ pageIndex: 4, fraction: 0.3 });
    expect(mobileReaderStripBridgeLocalAnchor(bridge, { pageIndex: 19, fraction: 0.5 }))
      .toEqual({ pageIndex: 0, fraction: 0 });
    expect(mobileReaderStripBridgeLocalAnchor(bridge, { pageIndex: 33, fraction: 0.5 }))
      .toEqual({ pageIndex: 11, fraction: 1 });
    expect(mobileReaderStripBridgeLocalAnchor(bridge, null)).toBeNull();
  });

  test("a centre row clamps into the open chapter", () => {
    expect(mobileReaderStripBridgeClampedLocalIndex(bridge, 10)).toBe(0);
    expect(mobileReaderStripBridgeClampedLocalIndex(bridge, 40)).toBe(11);
    expect(mobileReaderStripBridgeClampedLocalIndex(bridge, null)).toBeNull();
  });
});
