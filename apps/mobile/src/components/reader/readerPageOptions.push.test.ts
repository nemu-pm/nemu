import { describe, expect, test } from "bun:test";
import { getMobileStrings } from "@/lib/mobileI18n";
import { readerPageTurnLabel } from "./readerPageOptions";

describe("the Page Turning picker names Push", () => {
  test("in every language", () => {
    expect(readerPageTurnLabel("push", getMobileStrings("en"))).toBe("Push");
    expect(readerPageTurnLabel("push", getMobileStrings("zh"))).toBe("推移");
    expect(readerPageTurnLabel("push", getMobileStrings("ja"))).toBe("プッシュ");
    expect(readerPageTurnLabel("slide", getMobileStrings("en"))).toBe("Slide");
    expect(readerPageTurnLabel("curl", getMobileStrings("en"))).toBe("Curl");
  });
});
