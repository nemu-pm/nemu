import { describe, expect, test } from "bun:test";
import type { Setting } from "@/lib/settings";
import { resolveSettingsPagePath } from "./source-settings-navigation";

const schema: Setting[] = [
  {
    type: "group",
    title: "Account",
    items: [
      {
        type: "page",
        key: "advanced",
        title: "Advanced",
        items: [
          {
            type: "page",
            key: "privacy",
            title: "Privacy",
            items: [
              {
                type: "link",
                key: "policy",
                title: "Policy",
                url: "https://example.com",
              },
            ],
          },
        ],
      },
    ],
  },
];

describe("resolveSettingsPagePath", () => {
  test("resolves nested keys to current schema objects", () => {
    const resolved = resolveSettingsPagePath(schema, ["advanced", "privacy"]);
    expect(resolved.map((page) => page.title)).toEqual(["Advanced", "Privacy"]);

    const replacement = structuredClone(schema) as Setting[];
    const advanced = (replacement[0] as { items: Setting[] }).items[0] as {
      items: Setting[];
    };
    (advanced.items[0] as { title: string }).title = "Privacy (updated)";
    expect(
      resolveSettingsPagePath(replacement, ["advanced", "privacy"]).at(-1)
        ?.title,
    ).toBe("Privacy (updated)");
  });

  test("truncates removed, reparented, and ambiguous stale paths", () => {
    expect(resolveSettingsPagePath([], ["advanced"])).toEqual([]);
    expect(resolveSettingsPagePath(schema, ["privacy"])).toEqual([]);
    expect(
      resolveSettingsPagePath(
        [
          ...schema,
          { type: "page", key: "advanced", title: "Duplicate", items: [] },
        ],
        ["advanced"],
      ),
    ).toEqual([]);
  });

  test("caps hostile nesting depth", () => {
    let items: Setting[] = [];
    const path: string[] = [];
    for (let index = 39; index >= 0; index -= 1) {
      const key = `page-${index}`;
      items = [{ type: "page", key, title: key, items }];
      path.unshift(key);
    }
    expect(resolveSettingsPagePath(items, path)).toHaveLength(32);
  });
});
