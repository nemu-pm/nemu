import { describe, expect, test } from "bun:test";
import { getMobileStrings } from "./mobileI18n";
import { mobileReaderPluginRowSubtitle } from "./mobileReaderPluginSheet";
import { getMobileReaderPluginStates } from "./mobileReaderPlugins";

const en = getMobileStrings("en");

function plugin(id: string) {
  const found = getMobileReaderPluginStates({ installedSources: [] }, en, {
    includeDebugSettings: true,
  }).find(
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

  test("a plugin with nothing to configure reads its description, not 0 settings", () => {
    const releaseDualRead = getMobileReaderPluginStates({ installedSources: [] }, en).find(
      (candidate) => candidate.id === "dual-reader",
    )!;
    expect(mobileReaderPluginRowSubtitle(releaseDualRead, en)).toBe(
      en.reader.pluginDualReadDescription,
    );
    expect(mobileReaderPluginRowSubtitle(releaseDualRead, en)).not.toContain("0");
  });
});
