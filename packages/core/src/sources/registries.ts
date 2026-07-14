/**
 * Built-in Aidoku URL registries — the single source of truth for the default
 * registry list shared by web and mobile.
 *
 * Web re-exports `AIDOKU_REGISTRIES` as-is (`as const`, readonly literal); it
 * only iterates the list (`for…of`, `.some`, field reads). Mobile re-exports a
 * mutable spread copy so its `fetchAllAidokuRegistrySources` default param
 * (`registries: AidokuRegistryDefinition[] = AIDOKU_REGISTRIES`) stays
 * assignable. Neither app mutates the list — this is config, not state — so the
 * spread copy is behavior-identical to the prior per-app inline definitions.
 */

export type AidokuRegistryDefinition = {
  id: string;
  name: string;
  indexUrl: string;
};

export const AIDOKU_REGISTRIES = [
  {
    id: "aidoku-community",
    name: "Aidoku Community",
    indexUrl: "https://aidoku-community.github.io/sources/index.min.json",
  },
  {
    id: "aidoku-zh",
    name: "Aidoku ZH",
    indexUrl:
      "https://raw.githubusercontent.com/suiyuran/aidoku-zh-sources/main/public/index.min.json",
  },
] as const satisfies readonly AidokuRegistryDefinition[];