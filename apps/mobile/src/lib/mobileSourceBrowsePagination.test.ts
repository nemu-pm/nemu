import { describe, expect, test } from "bun:test";
import {
  canLoadMoreMobileSourceBrowseResults,
  resolveMobileSourceBrowsePagination,
} from "./mobileSourceBrowsePagination";

describe("mobile source browse pagination", () => {
  test("allows loading another page only when more results are idle", () => {
    expect(
      canLoadMoreMobileSourceBrowseResults({
        hasMore: true,
        loading: false,
        inFlight: false,
      }),
    ).toBe(true);
    expect(
      canLoadMoreMobileSourceBrowseResults({
        hasMore: false,
        loading: false,
        inFlight: false,
      }),
    ).toBe(false);
    expect(
      canLoadMoreMobileSourceBrowseResults({
        hasMore: true,
        loading: true,
        inFlight: false,
      }),
    ).toBe(false);
    expect(
      canLoadMoreMobileSourceBrowseResults({
        hasMore: true,
        loading: false,
        inFlight: true,
      }),
    ).toBe(false);
  });

  test("a ready result updates hasMore and clears loading", () => {
    expect(
      resolveMobileSourceBrowsePagination(
        { hasMore: false, loading: true },
        { loading: false, readyHasMore: true },
      ),
    ).toEqual({ hasMore: true, loading: false });
    expect(
      resolveMobileSourceBrowsePagination(
        { hasMore: true, loading: true },
        { loading: false, readyHasMore: false },
      ),
    ).toEqual({ hasMore: false, loading: false });
  });

  test("an in-flight transition keeps the last-known hasMore", () => {
    // Regression: collapsing hasMore to false while a load-more was in flight
    // made the onEndReached guard drop the next trigger, so the footer never
    // showed and new content only popped in after a later scroll event.
    expect(
      resolveMobileSourceBrowsePagination(
        { hasMore: true, loading: false },
        { loading: true },
      ),
    ).toEqual({ hasMore: true, loading: true });
  });

  test("blocked and failed transitions keep hasMore for the retry", () => {
    expect(
      resolveMobileSourceBrowsePagination(
        { hasMore: true, loading: true },
        { loading: false },
      ),
    ).toEqual({ hasMore: true, loading: false });
  });

  test("the completion of a load-more admits the next trigger immediately", () => {
    // Mirrors the screen sequence: ready result lands, then the next
    // onEndReached must pass the guard without waiting for a re-sync.
    let pagination = resolveMobileSourceBrowsePagination(
      { hasMore: false, loading: false },
      { loading: false, readyHasMore: true },
    );
    expect(
      canLoadMoreMobileSourceBrowseResults({
        hasMore: pagination.hasMore,
        loading: pagination.loading,
        inFlight: false,
      }),
    ).toBe(true);

    pagination = resolveMobileSourceBrowsePagination(pagination, {
      loading: true,
    });
    expect(
      canLoadMoreMobileSourceBrowseResults({
        hasMore: pagination.hasMore,
        loading: pagination.loading,
        inFlight: true,
      }),
    ).toBe(false);

    pagination = resolveMobileSourceBrowsePagination(pagination, {
      loading: false,
      readyHasMore: true,
    });
    expect(
      canLoadMoreMobileSourceBrowseResults({
        hasMore: pagination.hasMore,
        loading: pagination.loading,
        inFlight: false,
      }),
    ).toBe(true);
  });
});
