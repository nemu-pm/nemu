import { describe, it, expect } from "bun:test";
import { shouldOfferImportLocalLibraryPrompt } from "./importPrompt";

describe("shouldOfferImportLocalLibraryPrompt", () => {
  const base = {
    hasDecision: false,
    offeredThisSession: false,
    hasLocalLegacyLibrary: true,
    cloudProbeOk: true,
    cloudIsEmpty: true,
    localCanonicalEntryCount: 0,
  };

  it("offers only when all conditions are satisfied", () => {
    expect(shouldOfferImportLocalLibraryPrompt(base)).toBe(true);
  });

  it("does not offer when user already made a decision", () => {
    expect(shouldOfferImportLocalLibraryPrompt({ ...base, hasDecision: true })).toBe(false);
  });

  it("does not offer when already offered this session", () => {
    expect(shouldOfferImportLocalLibraryPrompt({ ...base, offeredThisSession: true })).toBe(false);
  });

  it("does not offer when there is no legacy local library", () => {
    expect(shouldOfferImportLocalLibraryPrompt({ ...base, hasLocalLegacyLibrary: false })).toBe(false);
  });

  it("does not offer when cloud emptiness can't be confirmed", () => {
    expect(shouldOfferImportLocalLibraryPrompt({ ...base, cloudProbeOk: false })).toBe(false);
  });

  it("does not offer when cloud is not empty", () => {
    expect(shouldOfferImportLocalLibraryPrompt({ ...base, cloudIsEmpty: false })).toBe(false);
  });

  it("does not offer when local canonical already has entries", () => {
    expect(shouldOfferImportLocalLibraryPrompt({ ...base, localCanonicalEntryCount: 1 })).toBe(false);
  });
});


