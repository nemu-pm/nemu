import { describe, expect, test } from "bun:test";
import {
  createMobileTabStackAnchorListeners,
  getAnchoredMobileTabStackState,
  type MobileTabStackState,
} from "./mobileTabStackAnchor";

function browseStack(routes: MobileTabStackState["routes"]): MobileTabStackState {
  return {
    key: "stack-browse",
    type: "stack",
    index: routes.length - 1,
    routeKeySeq: 3,
    routeNames: ["index", "[registryId]/[sourceId]"],
    routes,
    stale: false,
  };
}

const sourceRoute = {
  key: "stack-browse/[registryId]/[sourceId]-2",
  name: "[registryId]/[sourceId]",
  params: { registryId: "aidoku-community", sourceId: "multi.mangadex" },
};

describe("getAnchoredMobileTabStackState", () => {
  test("inserts the anchor beneath a stack created with only a pushed screen", () => {
    const anchored = getAnchoredMobileTabStackState(browseStack([sourceRoute]));
    expect(anchored).toEqual({
      ...browseStack([sourceRoute]),
      index: 1,
      routes: [{ name: "index", params: {} }, sourceRoute],
      stale: false,
    });
    // The visible screen keeps its key, so it stays mounted.
    expect(anchored?.routes[1]).toBe(sourceRoute);
  });

  test("keeps deeper pushes above the anchor and the focus on the top screen", () => {
    const detail = { key: "d-3", name: "[registryId]/[sourceId]", params: {} };
    const anchored = getAnchoredMobileTabStackState(browseStack([sourceRoute, detail]));
    expect(anchored?.routes.map((route) => route.name)).toEqual([
      "index",
      "[registryId]/[sourceId]",
      "[registryId]/[sourceId]",
    ]);
    expect(anchored?.index).toBe(2);
  });

  test("leaves stacks that already start at the anchor alone", () => {
    const index = { key: "stack-browse/index-1", name: "index", params: {} };
    expect(getAnchoredMobileTabStackState(browseStack([index]))).toBeNull();
    expect(getAnchoredMobileTabStackState(browseStack([index, sourceRoute]))).toBeNull();
  });

  test("ignores navigators that cannot hold the anchor or are not stacks", () => {
    expect(getAnchoredMobileTabStackState(undefined)).toBeNull();
    expect(getAnchoredMobileTabStackState(browseStack([]))).toBeNull();
    expect(
      getAnchoredMobileTabStackState({
        ...browseStack([sourceRoute]),
        routeNames: ["[registryId]/[sourceId]"],
      }),
    ).toBeNull();
    expect(
      getAnchoredMobileTabStackState({ ...browseStack([sourceRoute]), type: "tab" }),
    ).toBeNull();
  });
});

describe("createMobileTabStackAnchorListeners", () => {
  test("dispatches one complete RESET only when the stack lost its anchor", () => {
    const dispatched: unknown[] = [];
    const listeners = createMobileTabStackAnchorListeners()({
      navigation: { dispatch: (action) => dispatched.push(action) },
    });

    listeners.state({
      data: {
        state: browseStack([{ key: "i-1", name: "index", params: {} }, sourceRoute]),
      },
    });
    expect(dispatched).toEqual([]);

    listeners.state({ data: { state: browseStack([sourceRoute]) } });
    expect(dispatched).toEqual([
      {
        type: "RESET",
        payload: {
          ...browseStack([sourceRoute]),
          index: 1,
          routes: [{ name: "index", params: {} }, sourceRoute],
          stale: false,
        },
      },
    ]);
  });
});
