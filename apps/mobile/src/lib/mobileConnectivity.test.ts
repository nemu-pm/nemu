import { describe, expect, test } from "bun:test";
import {
  classifyMobileNetworkState,
  shouldRetryAfterMobileConnectivityChange,
} from "./mobileConnectivity";

describe("mobile connectivity helpers", () => {
  test("classifies explicit connectivity", () => {
    expect(
      classifyMobileNetworkState({
        isConnected: true,
        isInternetReachable: true,
      }),
    ).toBe("online");
    expect(
      classifyMobileNetworkState({
        isConnected: false,
        isInternetReachable: false,
      }),
    ).toBe("offline");
  });

  test("treats an unreachable-but-connected network as offline", () => {
    expect(
      classifyMobileNetworkState({
        isConnected: true,
        isInternetReachable: false,
      }),
    ).toBe("offline");
  });

  test("keeps missing probe fields as unknown, not offline", () => {
    expect(classifyMobileNetworkState({})).toBe("unknown");
    expect(
      classifyMobileNetworkState({ isInternetReachable: undefined }),
    ).toBe("unknown");
  });

  test("iOS reachability mirroring still reads online", () => {
    // On iOS isInternetReachable always equals isConnected.
    expect(
      classifyMobileNetworkState({
        isConnected: true,
        isInternetReachable: undefined,
      }),
    ).toBe("online");
  });

  test("retries only on an explicit offline-to-online transition", () => {
    expect(
      shouldRetryAfterMobileConnectivityChange({
        previous: "offline",
        next: "online",
      }),
    ).toBe(true);
    expect(
      shouldRetryAfterMobileConnectivityChange({
        previous: "unknown",
        next: "online",
      }),
    ).toBe(false);
    expect(
      shouldRetryAfterMobileConnectivityChange({
        previous: null,
        next: "online",
      }),
    ).toBe(false);
    expect(
      shouldRetryAfterMobileConnectivityChange({
        previous: "offline",
        next: "unknown",
      }),
    ).toBe(false);
    expect(
      shouldRetryAfterMobileConnectivityChange({
        previous: "online",
        next: "online",
      }),
    ).toBe(false);
  });
});
