/*
 * Platform entry for the registry-index cache. Keep this stem free of logic:
 * Metro resolves `./mobileRegistryIndexCache` from `mobileRegistryIndexCache.native.ts`
 * back to the `.native.ts` file itself (platform extensions win), so the native
 * adapter must import the implementation from the sibling `-Core` module.
 */
export * from "./mobileRegistryIndexCacheCore";
