import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  createMobileAccountLeave,
  getMobileSettingsStackWithoutAccountPages,
  leaveMobileAccountPages,
  planMobileAccountLeave,
  shouldLeaveMobileAccountPages,
} from "./mobileAccountSignedOut";
import { getMobileStrings } from "./mobileI18n";

type TestStack = {
  index: number;
  routes: { key?: string; name: string; params?: object }[];
  [key: string]: unknown;
};

const stack = (names: string[], index = names.length - 1): TestStack => ({
  key: "settings-stack",
  type: "stack",
  routeNames: ["index", "[section]", "account", "server"],
  index,
  routes: names.map((name, i) => ({ key: `${name}-${i}`, name, params: {} })),
});

describe("leaving the account pages when signed out", () => {
  test("leaves only once the session settled signed out and nothing is running", () => {
    expect(shouldLeaveMobileAccountPages({ signedIn: false, sessionPending: false, busy: false })).toBe(true);
    // Still signed in, or the session is still loading (cold deep link).
    expect(shouldLeaveMobileAccountPages({ signedIn: true, sessionPending: false, busy: false })).toBe(false);
    expect(shouldLeaveMobileAccountPages({ signedIn: false, sessionPending: true, busy: false })).toBe(false);
    // Sign-out / deletion still finishing (sheet open, local cleanup pending).
    expect(shouldLeaveMobileAccountPages({ signedIn: false, sessionPending: false, busy: true })).toBe(false);
  });

  test("drops the account page and everything above it, keeping the root by key", () => {
    const next = getMobileSettingsStackWithoutAccountPages(stack(["index", "account"]));
    expect(next?.routes).toEqual([{ key: "index-0", name: "index", params: {} }]);
    expect(next?.index).toBe(0);
    expect(next?.stale).toBe(false);
    expect(next?.routeNames).toEqual(["index", "[section]", "account", "server"]);
  });

  test("clears a whole stack of account sub-pages (e.g. delete details)", () => {
    const next = getMobileSettingsStackWithoutAccountPages(
      stack(["index", "account", "account-delete"]),
      ["account", "account-delete"],
    );
    expect(next?.routes.map((r) => r.name)).toEqual(["index"]);
    // Any page pushed above the Account page goes with it.
    expect(
      getMobileSettingsStackWithoutAccountPages(stack(["index", "account", "server"]))?.routes.map((r) => r.name),
    ).toEqual(["index"]);
  });

  test("pages under the Account page stay; an anchorless stack gets the root", () => {
    expect(
      getMobileSettingsStackWithoutAccountPages(stack(["index", "[section]", "account"]))?.routes.map((r) => r.key),
    ).toEqual(["index-0", "[section]-1"]);
    const rootless = getMobileSettingsStackWithoutAccountPages(stack(["account"]));
    expect(rootless?.routes).toEqual([{ name: "index", params: {} }]);
    expect(rootless?.index).toBe(0);
  });

  test("is a no-op once the account pages are gone (sign-out and deletion both leave)", () => {
    expect(getMobileSettingsStackWithoutAccountPages(stack(["index"]))).toBeNull();
    expect(getMobileSettingsStackWithoutAccountPages(stack(["index", "[section]"]))).toBeNull();
    expect(getMobileSettingsStackWithoutAccountPages(undefined)).toBeNull();

    let state = stack(["index", "account"]);
    const dispatched: unknown[] = [];
    const navigation = {
      getState: () => state,
      dispatch: (action: { type: "RESET"; payload: TestStack }) => {
        dispatched.push(action.type);
        state = action.payload;
      },
    };
    expect(leaveMobileAccountPages(navigation)).toBe(true);
    expect(leaveMobileAccountPages(navigation)).toBe(false);
    expect(dispatched).toEqual(["RESET"]);
    expect(state.routes.map((r) => r.name)).toEqual(["index"]);
  });

  test("a sign-out or deletion here lands on the Settings root; only a sign-out toasts", () => {
    expect(planMobileAccountLeave("signedOut")).toEqual({ navigation: "dismissToSettings", toast: "signedOut" });
    expect(planMobileAccountLeave("deleted")).toEqual({ navigation: "dismissToSettings", toast: null });
    // Expiry / remote sign-out: no tab switch, no toast.
    expect(planMobileAccountLeave("sessionEnded")).toEqual({ navigation: "resetStack", toast: null });
  });

  test("the page leaves once: the first reason wins", () => {
    const calls: string[] = [];
    const leave = createMobileAccountLeave({
      dismissToSettings: () => calls.push("dismissTo /settings"),
      resetStack: () => calls.push("reset"),
      showSignedOutToast: () => calls.push("toast signedOut"),
    });
    expect(leave("signedOut")).toBe(true);
    // The session effect then sees the session gone.
    expect(leave("sessionEnded")).toBe(false);
    expect(leave("deleted")).toBe(false);
    expect(calls).toEqual(["dismissTo /settings", "toast signedOut"]);

    const remote: string[] = [];
    const leaveRemote = createMobileAccountLeave({
      dismissToSettings: () => remote.push("dismissTo /settings"),
      resetStack: () => remote.push("reset"),
      showSignedOutToast: () => remote.push("toast signedOut"),
    });
    leaveRemote("sessionEnded");
    expect(remote).toEqual(["reset"]);
  });

  test("the sign-out toast has copy in every language", () => {
    expect(getMobileStrings("en").account.signedOut).toBe("Signed out");
    expect(getMobileStrings("zh").account.signedOut).toBe("已登出");
    expect(getMobileStrings("ja").account.signedOut).toBe("サインアウトしました");
  });

  test("the account page wires it to the session, its sign-out and deletion (no bare back())", () => {
    const source = readFileSync(
      path.join(import.meta.dir, "../screens/useMobileAccountPage.ts"),
      "utf8",
    );
    expect(source).toContain("shouldLeaveMobileAccountPages(");
    expect(source).toContain("isPending: sessionPending");
    expect(source).toContain("busy: deleting || cloudSignOut.signingOut");
    expect(source).toContain('dismissTo("/settings")');
    expect(source).toContain('onSignedOut: () => leaveAccount("signedOut")');
    expect(source).toContain('leaveAccount("deleted")');
    expect(source).toContain('leaveAccount("sessionEnded")');
    expect(source).not.toContain("router.back()");
  });
});
