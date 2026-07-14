import { describe, expect, test } from "bun:test";
import { toSearchSourceDisplay } from "./mobileSearch";
import {
  getMobileInstalledSourceRouteRef,
  getMobileSourceDisplayRouteRef,
} from "./mobileSourceRouteRef";

describe("mobile source route refs", () => {
  test("uses installed registry refs instead of package manifest refs", () => {
    const display = toSearchSourceDisplay({
      id: "aidoku-community:registry-id",
      registryId: "aidoku-community",
      sourceId: "manifest.id",
      name: "Example",
      version: 1,
    });

    expect(
      getMobileSourceDisplayRouteRef(display, {
        registryId: "fallback-registry",
        sourceId: "fallback-source",
      }),
    ).toEqual({
      registryId: "aidoku-community",
      sourceId: "registry-id",
    });
  });

  test("falls back to route params before source metadata loads", () => {
    expect(
      getMobileSourceDisplayRouteRef(null, {
        registryId: "aidoku-community",
        sourceId: "en.example",
      }),
    ).toEqual({
      registryId: "aidoku-community",
      sourceId: "en.example",
    });
  });

  test("builds installed source route refs from registry ids", () => {
    expect(
      getMobileInstalledSourceRouteRef(
        {
          id: "aidoku-community:registry-id",
          registryId: "aidoku-community",
          sourceId: "manifest.id",
          name: "Example",
          version: 1,
        },
        {
          registryId: "fallback-registry",
          sourceId: "fallback-source",
        },
      ),
    ).toEqual({
      registryId: "aidoku-community",
      sourceId: "registry-id",
    });
  });
});
