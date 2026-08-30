import { describe, expect, test } from "bun:test";
import {
  canNavigateMobileRootTab,
  exactMobileRootTabHrefForPathname,
  getMobileRootTabPressAction,
  isMobileReaderRoute,
  isMobileRootTabSelected,
  shouldReselectMobileRootTab,
  shouldShowMobileFloatingTabBar,
} from "./mobileRootTabs";

describe("mobile root tabs", () => {
  test("selects exact root tabs and nested tab routes for presentation", () => {
    expect(isMobileRootTabSelected("/", "/library")).toBe(true);
    expect(isMobileRootTabSelected("/index", "/library")).toBe(true);
    expect(isMobileRootTabSelected("/index/", "/library")).toBe(true);
    expect(isMobileRootTabSelected("/library", "/library")).toBe(true);
    expect(isMobileRootTabSelected("/library/", "/library")).toBe(true);
    expect(isMobileRootTabSelected("/library/item-1", "/library")).toBe(true);
    expect(
      isMobileRootTabSelected("/library/collection/favorites", "/library"),
    ).toBe(true);
    expect(isMobileRootTabSelected("/browse", "/browse")).toBe(true);
    expect(isMobileRootTabSelected("/browse/", "/browse")).toBe(true);
    expect(isMobileRootTabSelected("/browse/aidoku/mangadex", "/browse")).toBe(
      true,
    );
    expect(isMobileRootTabSelected("/settings/sources", "/settings")).toBe(
      true,
    );
    expect(
      isMobileRootTabSelected(
        "/sources/aidoku/mangadex/blue-lock",
        "/browse",
      ),
    ).toBe(true);
    expect(
      isMobileRootTabSelected(
        "/sources/aidoku/mangadex/blue-lock",
        "/search",
      ),
    ).toBe(false);
  });

  test("allows root tab navigation only when it would change the route", () => {
    expect(canNavigateMobileRootTab("/", "/library")).toBe(false);
    expect(canNavigateMobileRootTab("/index", "/library")).toBe(false);
    expect(canNavigateMobileRootTab("/index/", "/library")).toBe(false);
    expect(canNavigateMobileRootTab("/library", "/library")).toBe(false);
    expect(canNavigateMobileRootTab("/library/item-1", "/library")).toBe(true);
    expect(canNavigateMobileRootTab("/browse", "/browse")).toBe(false);
    expect(canNavigateMobileRootTab("/browse/", "/browse")).toBe(false);
    expect(canNavigateMobileRootTab("/browse/aidoku/mangadex", "/browse")).toBe(
      true,
    );
    expect(canNavigateMobileRootTab("/search", "/search")).toBe(false);
    expect(canNavigateMobileRootTab("/settings/profile", "/settings")).toBe(
      true,
    );
  });

  test("resolves a single press action for root tab taps", () => {
    expect(getMobileRootTabPressAction("/", "/library")).toBe("reselect");
    expect(getMobileRootTabPressAction("/library", "/library")).toBe("reselect");
    expect(getMobileRootTabPressAction("/browse", "/browse")).toBe("reselect");
    expect(getMobileRootTabPressAction("/browse/", "/browse")).toBe("reselect");
    expect(getMobileRootTabPressAction("/browse/aidoku/mangadex", "/browse")).toBe(
      "navigate",
    );
    expect(getMobileRootTabPressAction("/library/item-1", "/library")).toBe(
      "navigate",
    );
    expect(getMobileRootTabPressAction("/settings", "/search")).toBe("navigate");
    expect(getMobileRootTabPressAction("/search", "/search")).toBe("reselect");
  });

  test("resolves only exact root tab routes for reselect handling", () => {
    expect(exactMobileRootTabHrefForPathname("/")).toBe("/library");
    expect(exactMobileRootTabHrefForPathname("/index")).toBe("/library");
    expect(exactMobileRootTabHrefForPathname("/index/")).toBe("/library");
    expect(exactMobileRootTabHrefForPathname("/library")).toBe("/library");
    expect(exactMobileRootTabHrefForPathname("/library/")).toBe("/library");
    expect(exactMobileRootTabHrefForPathname("/browse")).toBe("/browse");
    expect(exactMobileRootTabHrefForPathname("/browse/")).toBe("/browse");
    expect(exactMobileRootTabHrefForPathname("/search")).toBe("/search");
    expect(exactMobileRootTabHrefForPathname("/settings")).toBe("/settings");
    expect(exactMobileRootTabHrefForPathname("/browse/aidoku/mangadex")).toBe(
      null,
    );
    expect(exactMobileRootTabHrefForPathname("/library/item-1")).toBe(null);
  });

  test("reselects only the currently active exact root tab", () => {
    expect(shouldReselectMobileRootTab("/", "/library")).toBe(true);
    expect(shouldReselectMobileRootTab("/library", "/library")).toBe(true);
    expect(shouldReselectMobileRootTab("/browse", "/browse")).toBe(true);
    expect(shouldReselectMobileRootTab("/browse/", "/browse")).toBe(true);
    expect(shouldReselectMobileRootTab("/browse/aidoku/mangadex", "/browse")).toBe(
      false,
    );
    expect(shouldReselectMobileRootTab("/library/item-1", "/library")).toBe(false);
    expect(shouldReselectMobileRootTab("/settings", "/search")).toBe(false);
  });

  test("keeps shell tabs visible outside the fullscreen reader", () => {
    expect(shouldShowMobileFloatingTabBar("/")).toBe(true);
    expect(shouldShowMobileFloatingTabBar("/browse")).toBe(true);
    expect(shouldShowMobileFloatingTabBar("/browse/aidoku/mangadex")).toBe(
      true,
    );
    expect(shouldShowMobileFloatingTabBar("/library/item-1")).toBe(true);
    expect(shouldShowMobileFloatingTabBar("/library/collection/favorites")).toBe(
      true,
    );
    expect(shouldShowMobileFloatingTabBar("/sources/aidoku/mangadex/blue-lock")).toBe(
      true,
    );
  });

  test("hides shell tabs on fullscreen reader routes", () => {
    expect(isMobileReaderRoute("/sources/aidoku/mangadex/blue-lock")).toBe(
      false,
    );
    expect(
      isMobileReaderRoute(
        "/sources/aidoku/mangadex/blue-lock/chapter-1",
      ),
    ).toBe(true);
    expect(
      shouldShowMobileFloatingTabBar(
        "/sources/aidoku/mangadex/blue-lock/chapter-1",
      ),
    ).toBe(false);
  });
});
