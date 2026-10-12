import { describe, expect, test } from "bun:test";
import { getMobileStrings } from "./mobileI18n";
import { mobileReaderPluginRowSubtitle } from "./mobileReaderPluginSheet";
import { getMobileReaderPluginStates } from "./mobileReaderPlugins";

const en = getMobileStrings("en");

function plugin(id: string) {
  const found = getMobileReaderPluginStates({ installedSources: [] }, en).find(
    (candidate) => candidate.id === id,
  );
  if (!found) throw new Error(`missing plugin ${id}`);
  return found;
}

describe("reader plugin sheet rows", () => {
  test("the secondary line is a sentence-case settings count", () => {
    expect(mobileReaderPluginRowSubtitle(plugin("japanese-learning"), en)).toBe(
      "6 settings",
    );
    expect(mobileReaderPluginRowSubtitle(plugin("dual-reader"), en)).toBe(
      "1 setting",
    );
    expect(
      mobileReaderPluginRowSubtitle(plugin("dual-reader"), getMobileStrings("zh")),
    ).toBe("1 项设置");
  });
});
