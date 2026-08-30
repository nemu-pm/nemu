/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as _lib from "../_lib.js";
import type * as ai_metadata from "../ai_metadata.js";
import type * as auth from "../auth.js";
import type * as authMobileOriginBridge from "../authMobileOriginBridge.js";
import type * as collections from "../collections.js";
import type * as history from "../history.js";
import type * as http from "../http.js";
import type * as japanese_learning from "../japanese_learning.js";
import type * as library from "../library.js";
import type * as lww from "../lww.js";
import type * as nemu_chat from "../nemu_chat.js";
import type * as prompts_nemu_chat from "../prompts/nemu_chat.js";
import type * as proxy from "../proxy.js";
import type * as r2 from "../r2.js";
import type * as settings from "../settings.js";
import type * as settingsLimits from "../settingsLimits.js";
import type * as sync from "../sync.js";
import type * as syncCompatibility from "../syncCompatibility.js";
import type * as syncGeneration from "../syncGeneration.js";
import type * as syncReset from "../syncReset.js";
import type * as tts from "../tts.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  _lib: typeof _lib;
  ai_metadata: typeof ai_metadata;
  auth: typeof auth;
  authMobileOriginBridge: typeof authMobileOriginBridge;
  collections: typeof collections;
  history: typeof history;
  http: typeof http;
  japanese_learning: typeof japanese_learning;
  library: typeof library;
  lww: typeof lww;
  nemu_chat: typeof nemu_chat;
  "prompts/nemu_chat": typeof prompts_nemu_chat;
  proxy: typeof proxy;
  r2: typeof r2;
  settings: typeof settings;
  settingsLimits: typeof settingsLimits;
  sync: typeof sync;
  syncCompatibility: typeof syncCompatibility;
  syncGeneration: typeof syncGeneration;
  syncReset: typeof syncReset;
  tts: typeof tts;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  betterAuth: import("@convex-dev/better-auth/_generated/component.js").ComponentApi<"betterAuth">;
  r2: import("@convex-dev/r2/_generated/component.js").ComponentApi<"r2">;
};
