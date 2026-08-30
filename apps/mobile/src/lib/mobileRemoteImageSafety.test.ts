import { describe, expect, test } from "bun:test";
import {
  MOBILE_REMOTE_IMAGE_MAX_BYTES,
  assertMobileRemoteImageByteLength,
} from "./mobileRemoteImageSafety";
import { MOBILE_DUAL_READER_MAX_ENCODED_BYTES } from "./mobileDualReaderImageSafety";
import { MOBILE_JAPANESE_LEARNING_OCR_MAX_IMAGE_BYTES } from "./mobileJapaneseLearningOcr";
import { MOBILE_COVER_UPLOAD_MAX_BYTES } from "./mobileCoverUpload";
import { MOBILE_READER_PAGE_PROCESSING_INPUT_MAX_BYTES } from "@/sources/mobileSourcePages";

describe("mobile remote image allocation safety", () => {
  test("keeps every image byte limit within the remote-image ceiling", () => {
    expect(MOBILE_DUAL_READER_MAX_ENCODED_BYTES).toBeLessThanOrEqual(
      MOBILE_REMOTE_IMAGE_MAX_BYTES,
    );
    expect(MOBILE_JAPANESE_LEARNING_OCR_MAX_IMAGE_BYTES).toBeLessThanOrEqual(
      MOBILE_REMOTE_IMAGE_MAX_BYTES,
    );
    expect(MOBILE_COVER_UPLOAD_MAX_BYTES).toBeLessThanOrEqual(
      MOBILE_REMOTE_IMAGE_MAX_BYTES,
    );
    expect(MOBILE_READER_PAGE_PROCESSING_INPUT_MAX_BYTES).toBeLessThanOrEqual(
      MOBILE_REMOTE_IMAGE_MAX_BYTES,
    );
  });

  test("accepts the byte boundary and rejects larger payloads", () => {
    expect(() =>
      assertMobileRemoteImageByteLength(MOBILE_REMOTE_IMAGE_MAX_BYTES),
    ).not.toThrow();
    expect(() =>
      assertMobileRemoteImageByteLength(MOBILE_REMOTE_IMAGE_MAX_BYTES + 1),
    ).toThrow("Remote image exceeds");
  });
});
