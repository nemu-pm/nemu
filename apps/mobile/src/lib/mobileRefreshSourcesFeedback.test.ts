import { describe, expect, test } from "bun:test";
import { getMobileStrings } from "./mobileI18n";
import {
  getMobileRefreshSourcesErrorTitle,
  isMobileRefreshSourcesCancellation,
  MOBILE_REFRESH_SOURCES_TOAST_ID,
  showMobileRefreshSourcesErrorToast,
} from "./mobileRefreshSourcesFeedback";
import type { MobileToastOptions } from "@/components/MobileToastContext";

function abortError(message = "The registry catalog fetch was aborted.") {
  const error = new Error(message);
  error.name = "AbortError";
  return error;
}

describe("refresh sources feedback", () => {
  test("cancellations are silent (scheduler aborts, DOMException-like aborts)", () => {
    expect(isMobileRefreshSourcesCancellation(abortError())).toBe(true);
    expect(isMobileRefreshSourcesCancellation({ name: "AbortError", message: "x" })).toBe(true);
    expect(isMobileRefreshSourcesCancellation(new Error("Network request failed"))).toBe(false);
    expect(isMobileRefreshSourcesCancellation(null)).toBe(false);

    const shown: MobileToastOptions[] = [];
    const result = showMobileRefreshSourcesErrorToast({
      toast: { show: (o) => { shown.push(o); return "id"; } },
      strings: getMobileStrings("en"),
      error: abortError(),
      onRetry: () => {},
    });
    expect(result).toBe(false);
    expect(shown).toHaveLength(0);
  });

  test("network vs other failure titles, in every language", () => {
    const network = new Error("Network request failed");
    const other = new Error("Invalid registry index JSON");
    expect(getMobileRefreshSourcesErrorTitle(network, getMobileStrings("en"))).toBe(
      "Couldn't refresh sources. Check your connection and try again.",
    );
    expect(getMobileRefreshSourcesErrorTitle(other, getMobileStrings("en"))).toBe(
      "Couldn't refresh sources. Try again in a moment.",
    );
    expect(getMobileRefreshSourcesErrorTitle(network, getMobileStrings("zh"))).toBe(
      "无法刷新来源，请检查网络连接后重试。",
    );
    expect(getMobileRefreshSourcesErrorTitle(other, getMobileStrings("zh"))).toBe(
      "无法刷新来源，请稍后重试。",
    );
    expect(getMobileRefreshSourcesErrorTitle(network, getMobileStrings("ja"))).toBe(
      "ソースを更新できませんでした。接続を確認してからもう一度お試しください。",
    );
    expect(getMobileRefreshSourcesErrorTitle(other, getMobileStrings("ja"))).toBe(
      "ソースを更新できませんでした。しばらくしてからもう一度お試しください。",
    );
  });

  test("shows one danger toast with Retry, 6s, no technical detail", () => {
    const shown: MobileToastOptions[] = [];
    let retried = 0;
    const strings = getMobileStrings("en");
    const result = showMobileRefreshSourcesErrorToast({
      toast: { show: (o) => { shown.push(o); return o.id ?? ""; } },
      strings,
      error: new Error("TypeError: fetch failed at https://example.com/index.min.json"),
      onRetry: () => { retried += 1; },
    });
    expect(result).toBe(true);
    expect(shown).toHaveLength(1);
    const [options] = shown;
    expect(options.id).toBe(MOBILE_REFRESH_SOURCES_TOAST_ID);
    expect(options.id).toBe("refresh-sources");
    expect(options.tone).toBe("danger");
    expect(options.duration).toBe("long");
    expect(options.detail).toBeUndefined();
    expect(options.action?.label).toBe(strings.common.retry);
    options.action?.onPress();
    expect(retried).toBe(1);
  });
});
