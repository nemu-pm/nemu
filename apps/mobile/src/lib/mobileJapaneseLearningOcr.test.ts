import { describe, expect, test } from "bun:test";
import {
  MOBILE_JAPANESE_LEARNING_OCR_MAX_DETECTIONS,
  MOBILE_JAPANESE_LEARNING_OCR_MAX_ENCODED_IMAGE_CHARACTERS,
  MOBILE_JAPANESE_LEARNING_OCR_MAX_IMAGE_BYTES,
  assertMobileJapaneseLearningOcrEncodedImageLength,
  assertMobileJapaneseLearningOcrImageByteLength,
  bytesToBase64,
  describeJapaneseLearningOcrError,
  getMobileOcrApiBase,
  parseMobileOcrResponse,
  runMobileJapaneseLearningOcr,
  textFromMobileOcrDetections,
  type MobileOcrDetection,
} from "./mobileJapaneseLearningOcr";
import { getMobileStrings } from "./mobileI18n";

function detection(order: number, text: string): MobileOcrDetection {
  return {
    x1: 0,
    y1: 1,
    x2: 2,
    y2: 3,
    conf: 0.91,
    cls: 0,
    label: "ja",
    order,
    text,
  };
}

describe("mobile Japanese Learning OCR", () => {
  test("encodes bytes as base64 without relying on browser globals", () => {
    expect(bytesToBase64(new Uint8Array([77, 97, 110]))).toBe("TWFu");
    expect(bytesToBase64(new Uint8Array([77, 97]))).toBe("TWE=");
    expect(bytesToBase64(new Uint8Array([77]))).toBe("TQ==");
  });

  test("accepts exact OCR image limits and rejects the next byte or encoded character", () => {
    expect(() =>
      assertMobileJapaneseLearningOcrImageByteLength(
        MOBILE_JAPANESE_LEARNING_OCR_MAX_IMAGE_BYTES,
      ),
    ).not.toThrow();
    expect(() =>
      assertMobileJapaneseLearningOcrImageByteLength(
        MOBILE_JAPANESE_LEARNING_OCR_MAX_IMAGE_BYTES + 1,
      ),
    ).toThrow(/OCR image/);
    expect(() =>
      assertMobileJapaneseLearningOcrEncodedImageLength(
        MOBILE_JAPANESE_LEARNING_OCR_MAX_ENCODED_IMAGE_CHARACTERS,
      ),
    ).not.toThrow();
    expect(() =>
      assertMobileJapaneseLearningOcrEncodedImageLength(
        MOBILE_JAPANESE_LEARNING_OCR_MAX_ENCODED_IMAGE_CHARACTERS + 1,
      ),
    ).toThrow(/OCR encoded image/);
  });

  test("parses OCR SSE result events and orders transcript text", () => {
    const body = [
      `data: ${JSON.stringify({ type: "detections", detections: [] })}`,
      "",
      `data: ${JSON.stringify({ type: "result", detections: [detection(2, "二"), detection(1, "一")] })}`,
    ].join("\n");

    const detections = parseMobileOcrResponse(body);

    expect(detections).toHaveLength(2);
    expect(textFromMobileOcrDetections(detections)).toBe("一\n二");
  });

  test("accepts the exact detection-count limit and rejects the next detection", () => {
    const exact = Array.from(
      { length: MOBILE_JAPANESE_LEARNING_OCR_MAX_DETECTIONS },
      (_, index) => detection(index, "字"),
    );
    expect(
      parseMobileOcrResponse(JSON.stringify({ detections: exact })),
    ).toHaveLength(MOBILE_JAPANESE_LEARNING_OCR_MAX_DETECTIONS);
    expect(() =>
      parseMobileOcrResponse(
        JSON.stringify({ detections: [...exact, detection(exact.length, "超")] }),
      ),
    ).toThrow(/OCR detections/);
  });

  test("uses source page text without calling OCR", async () => {
    let fetchCalled = false;
    const result = await runMobileJapaneseLearningOcr(
      { text: "  こんにちは  " },
      {
        fetchImpl: ((() => {
          fetchCalled = true;
          return Promise.reject(new Error("unexpected fetch"));
        }) as unknown) as typeof fetch,
      },
    );

    expect(fetchCalled).toBe(false);
    expect(result).toEqual({
      source: "source-text",
      detections: [],
      text: "こんにちは",
    });
  });

  test("posts data URI images to the OCR endpoint", async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    const fetchImpl = ((url: string | URL | Request, init?: RequestInit) => {
      requests.push({ url: String(url), init });
      return Promise.resolve(
        new Response(
          `data: ${JSON.stringify({ type: "result", detections: [detection(1, "読めた")] })}\n\n`,
          { status: 200 },
        ),
      );
    }) as typeof fetch;

    const result = await runMobileJapaneseLearningOcr(
      { imageUri: "data:image/png;base64,QUJD" },
      { fetchImpl, ocrApiBase: "https://ocr.example/" },
    );

    expect(requests[0]?.url).toBe("https://ocr.example/ocr");
    expect(JSON.parse(String(requests[0]?.init?.body))).toMatchObject({
      imageBase64: "QUJD",
    });
    expect(result.text).toBe("読めた");
  });

  test("reads local page image URIs through the file reader", async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    const fetchImpl = ((url: string | URL | Request, init?: RequestInit) => {
      requests.push({ url: String(url), init });
      return Promise.resolve(
        new Response(
          `data: ${JSON.stringify({ type: "result", detections: [detection(1, "ローカル")] })}\n\n`,
          { status: 200 },
        ),
      );
    }) as typeof fetch;

    const result = await runMobileJapaneseLearningOcr(
      { imageUri: "file:///tmp/page.jpg" },
      {
        fetchImpl,
        ocrApiBase: "https://ocr.example",
        readFileBytes: async () => new Uint8Array([65, 66, 67]),
      },
    );

    expect(JSON.parse(String(requests[0]?.init?.body))).toMatchObject({
      imageBase64: "QUJD",
    });
    expect(result.text).toBe("ローカル");
  });

  test("propagates cancellation to the OCR request", async () => {
    const controller = new AbortController();
    let requestSignal: AbortSignal | null | undefined;
    const fetchImpl = ((_url: string | URL | Request, init?: RequestInit) => {
      requestSignal = init?.signal;
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener(
          "abort",
          () => reject(init.signal?.reason ?? new Error("aborted")),
          { once: true },
        );
      });
    }) as typeof fetch;

    const pending = runMobileJapaneseLearningOcr(
      { imageUri: "data:image/png;base64,QUJD" },
      {
        fetchImpl,
        ocrApiBase: "https://ocr.example",
        signal: controller.signal,
      },
    );
    await Promise.resolve();
    controller.abort(new Error("cancel OCR"));

    await expect(pending).rejects.toThrow("cancel OCR");
    expect(requestSignal?.aborted).toBe(true);
  });

  test("normalizes OCR API base URLs", () => {
    expect(getMobileOcrApiBase("https://ocr.example///")).toBe("https://ocr.example");
  });

  test("classifies 5xx / timeout / network OCR failures as service-unavailable", () => {
    const en = getMobileStrings("en");
    const wrapped =
      "Text detection failed. (OCR /ocr failed: 521 server error)";
    const unavailable = describeJapaneseLearningOcrError(wrapped, en);

    expect(unavailable.kind).toBe("unavailable");
    expect(unavailable.title).toBe("Text recognition is unavailable");
    expect(unavailable.description).toBe(
      "The OCR service did not respond. Try again in a moment.",
    );
    expect(unavailable.diagnostic).toContain("OCR /ocr failed: 521");

    for (const message of [
      "OCR /ocr failed: 503 Service Unavailable",
      "The request timed out.",
      "Network request failed",
    ]) {
      expect(describeJapaneseLearningOcrError(message, en).kind).toBe(
        "unavailable",
      );
    }

    expect(
      describeJapaneseLearningOcrError(new Error("fetch timeout"), en).kind,
    ).toBe("unavailable");
  });

  test("keeps localized zh/ja copy and a generic fallback for other failures", () => {
    const zh = getMobileStrings("zh");
    const ja = getMobileStrings("ja");
    const en = getMobileStrings("en");

    expect(describeJapaneseLearningOcrError("OCR /ocr failed: 521", zh)).toMatchObject({
      kind: "unavailable",
      title: "文字识别暂时不可用",
      description: "OCR 服务没有响应，请稍后重试。",
    });
    expect(describeJapaneseLearningOcrError("OCR /ocr failed: 521", ja)).toMatchObject({
      kind: "unavailable",
      title: "文字認識を利用できません",
    });

    const failed = describeJapaneseLearningOcrError(
      "OCR response did not include detections.",
      en,
    );
    expect(failed.kind).toBe("failed");
    expect(failed.title).toBe("Text recognition failed");
    expect(failed.description).toBe(
      "Something went wrong while recognizing text. Try again in a moment.",
    );
    expect(failed.diagnostic).toContain("detections");

    expect(describeJapaneseLearningOcrError(undefined, en).kind).toBe("failed");
    expect(describeJapaneseLearningOcrError(undefined, en).diagnostic).toBeNull();
  });
});
