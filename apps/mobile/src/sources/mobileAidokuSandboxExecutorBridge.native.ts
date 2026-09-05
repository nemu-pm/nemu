import type {
  Chapter,
  Filter,
  HomeLayout,
  Listing,
  Manga,
  MangaPageResult,
} from "./aidokuContract";
import NemuAidokuModule from "../../modules/nemu-aidoku/src/NemuAidokuModule";
import {
  parseMobileAidokuSandboxResponse,
  stringifyMobileAidokuSandboxValue,
} from "./mobileAidokuSandboxProtocol";
import {
  sanitizeMobileAidokuOutput,
  type MobileAidokuOutputKind,
} from "./mobileAidokuOutputSafety";
import { withMobileSourceOperationTimeout } from "./mobileSourceOperationTimeout";
import type {
  MobileAidokuExecutorBridge,
  MobileAidokuExecutorLoadInput,
  MobileAidokuExecutorLoadResult,
  MobileAidokuExecutorSource,
} from "./mobileSourceExecutor";
import {
  markMobilePerformance,
  measureMobilePerformance,
} from "@/lib/mobilePerformance";
import { getMobileImageUriPolicy } from "@/lib/mobileImageUriPolicy";
import { sanitizeMobileErrorDiagnostic } from "@/lib/mobileSourceErrors";

type SandboxCapabilities = {
  id: string;
  staticListings: Listing[];
  hasListingProvider: boolean;
  hasHomeProvider: boolean;
  hasListings: boolean;
  isOnlySearch: boolean;
  handlesBasicLogin: boolean;
  handlesWebLogin: boolean;
  hasImageRequestProvider: boolean;
  hasImageProcessor: boolean;
};

type SandboxHomeResult = {
  layout: HomeLayout | null;
  partials: HomeLayout[];
};

let nextSandboxSessionId = 0;
const SANDBOX_SESSION_CREATE_TIMEOUT_MS = 40_000;
const SANDBOX_IMAGE_MAX_BYTES = 8 * 1024 * 1024;

function makeSandboxSessionId(): string {
  nextSandboxSessionId = (nextSandboxSessionId + 1) % Number.MAX_SAFE_INTEGER;
  return `aidoku-${Date.now().toString(36)}-${nextSandboxSessionId.toString(36)}`;
}

export function getMobileAidokuSandboxStatus(): {
  available: boolean;
  detail: string;
} {
  try {
    if (typeof NemuAidokuModule.getAidokuSandboxStatus !== "function") {
      return {
        available: false,
        detail: "This build does not include the isolated Aidoku runtime.",
      };
    }
    const status = NemuAidokuModule.getAidokuSandboxStatus();
    return {
      available: status.available === true,
      detail:
        status.detail?.trim() ||
        (status.available
          ? "Isolated Aidoku runtime is available."
          : "Isolated Aidoku runtime is unavailable."),
    };
  } catch (error) {
    return {
      available: false,
      detail:
        error instanceof Error
          ? error.message
          : "Isolated Aidoku runtime is unavailable.",
    };
  }
}

function validateCapabilities(value: SandboxCapabilities): SandboxCapabilities {
  if (
    !value ||
    typeof value.id !== "string" ||
    !Array.isArray(value.staticListings) ||
    typeof value.hasListingProvider !== "boolean" ||
    typeof value.hasHomeProvider !== "boolean" ||
    typeof value.hasListings !== "boolean" ||
    typeof value.isOnlySearch !== "boolean" ||
    typeof value.handlesBasicLogin !== "boolean" ||
    typeof value.handlesWebLogin !== "boolean" ||
    typeof value.hasImageRequestProvider !== "boolean" ||
    typeof value.hasImageProcessor !== "boolean"
  ) {
    throw new Error("The isolated Aidoku runtime returned invalid capabilities.");
  }
  return value;
}

function wrapSandboxSource({
  sessionId,
  capabilities,
  initialSettings,
}: {
  sessionId: string;
  capabilities: SandboxCapabilities;
  initialSettings: Record<string, unknown>;
}): MobileAidokuExecutorSource {
  let disposed = false;
  let settings = { ...initialSettings };

  const execute = async <T>(
    outputKind: MobileAidokuOutputKind,
    operation: Record<string, unknown>,
  ): Promise<T> => {
    if (disposed) throw new Error("The source session has already been disposed.");
    const operationKind =
      typeof operation.kind === "string" ? operation.kind : "unknown";
    const operationJson = stringifyMobileAidokuSandboxValue(
      operation,
      "Aidoku operation",
    );
    const startedAt = markMobilePerformance("mobile.aidoku.operation.start", {
      operation: operationKind,
    });
    try {
      const response = await withMobileSourceOperationTimeout(
        NemuAidokuModule.executeAidokuSandboxOperation(sessionId, operationJson),
      );
      const output = sanitizeMobileAidokuOutput(
        outputKind,
        parseMobileAidokuSandboxResponse<T>(response),
      );
      measureMobilePerformance("mobile.aidoku.operation.complete", startedAt, {
        operation: operationKind,
      });
      return output;
    } catch (error) {
      measureMobilePerformance("mobile.aidoku.operation.failed", startedAt, {
        operation: operationKind,
        category:
          error instanceof Error && error.name
            ? error.name
            : "unknown-error",
        // The bare `name` made every native sandbox failure log as a plain
        // "Error" with no way to tell a source HTTP timeout from a parse
        // failure. The message is sanitized (URLs/credentials redacted) the
        // same way user-facing diagnostics are.
        detail: sanitizeMobileErrorDiagnostic(error) ?? "",
      });
      throw error;
    }
  };

  return {
    id: capabilities.id,
    getSearchMangaList(query, page, filters) {
      return execute<MangaPageResult>("search", {
        kind: "search",
        query,
        page,
        filters,
      });
    },
    getMangaDetails(manga) {
      return execute<Manga>("details", { kind: "details", manga });
    },
    getChapterList(manga) {
      return execute<Chapter[]>("chapters", { kind: "chapters", manga });
    },
    getPageList(manga, chapter) {
      return execute("pages", { kind: "pages", manga, chapter });
    },
    getFilters() {
      return execute<Filter[]>("filters", { kind: "filters" });
    },
    getListings() {
      return execute<Listing[]>("listings", { kind: "listings" });
    },
    getMangaListForListing(listing, page) {
      return execute<MangaPageResult>("listing-page", {
        kind: "listing-page",
        listing,
        page,
      });
    },
    async hasListingProvider() {
      return capabilities.hasListingProvider;
    },
    async hasHomeProvider() {
      return capabilities.hasHomeProvider;
    },
    async hasListings() {
      return capabilities.hasListings;
    },
    async isOnlySearch() {
      return capabilities.isOnlySearch;
    },
    async handlesBasicLogin() {
      return capabilities.handlesBasicLogin;
    },
    async handlesWebLogin() {
      return capabilities.handlesWebLogin;
    },
    handleBasicLogin(key, username, password) {
      return execute<boolean>("boolean", {
        kind: "handle-basic-login",
        key,
        username,
        password,
      });
    },
    handleWebLogin(key, cookies) {
      return execute<boolean>("boolean", {
        kind: "handle-web-login",
        key,
        cookies,
      });
    },
    async handleNotification(notification) {
      await execute<null>("void", {
        kind: "handle-notification",
        notification,
      });
    },
    async getHome() {
      const response = await execute<SandboxHomeResult>("home", {
        kind: "home",
      });
      return response.layout;
    },
    async getHomeWithPartials(onPartial) {
      const response = await execute<SandboxHomeResult>("home", {
        kind: "home",
      });
      for (const partial of response.partials ?? []) onPartial(partial);
      return response.layout;
    },
    modifyImageRequest(url) {
      if (
        !capabilities.hasImageRequestProvider ||
        !getMobileImageUriPolicy(url, "source").allowed
      ) {
        return Promise.resolve({ url, headers: {} });
      }
      return execute<{ url: string; headers: Record<string, string> }>(
        "modify-image-request",
        {
          kind: "modify-image-request",
          url,
        },
      );
    },
    async hasImageProcessor() {
      return capabilities.hasImageProcessor;
    },
    async processPageImage(
      imageData,
      context,
      requestUrl,
      requestHeaders,
      responseCode,
      responseHeaders,
    ) {
      if (!capabilities.hasImageProcessor) return null;
      if (
        imageData.byteLength === 0 ||
        imageData.byteLength > SANDBOX_IMAGE_MAX_BYTES
      ) {
        throw new Error("Aidoku image input exceeds the isolated runtime safety limit.");
      }
      const output = await withMobileSourceOperationTimeout(
        NemuAidokuModule.processAidokuSandboxImage(
          sessionId,
          stringifyMobileAidokuSandboxValue(
            {
              kind: "process-page-image",
              context,
              requestUrl,
              requestHeaders,
              responseCode,
              responseHeaders,
            },
            "Aidoku image operation",
          ),
          imageData,
        ),
      );
      if (output == null) return null;
      if (!(output instanceof Uint8Array)) {
        throw new Error("The isolated Aidoku image runtime returned invalid bytes.");
      }
      if (output.byteLength === 0 || output.byteLength > SANDBOX_IMAGE_MAX_BYTES) {
        throw new Error("Aidoku processed image exceeds the safety limit.");
      }
      return output;
    },
    async updateSettings(nextSettings) {
      if (disposed) return;
      settings = { ...nextSettings };
      const response = await withMobileSourceOperationTimeout(
        NemuAidokuModule.updateAidokuSandboxSettings(
          sessionId,
          stringifyMobileAidokuSandboxValue(settings, "Aidoku settings"),
        ),
      );
      const parsed = JSON.parse(response) as { status?: string; detail?: string };
      if (parsed.status !== "updated") {
        throw new Error(parsed.detail || "Failed to update isolated Aidoku settings.");
      }
    },
    async dispose() {
      if (disposed) return;
      disposed = true;
      settings = {};
      await NemuAidokuModule.disposeAidokuSandboxSession(sessionId).catch(
        () => undefined,
      );
    },
  };
}

async function loadSandboxSource(
  input: MobileAidokuExecutorLoadInput,
): Promise<MobileAidokuExecutorLoadResult> {
  const status = getMobileAidokuSandboxStatus();
  if (!status.available) {
    return {
      status: "blocked",
      reason: "unsupported-platform",
      detail: status.detail,
    };
  }

  const sessionId = makeSandboxSessionId();
  try {
    const response = await withMobileSourceOperationTimeout(
      NemuAidokuModule.createAidokuSandboxSession(
        sessionId,
        input.packageUri,
        input.sourceKey,
        input.metadata.sourceId,
        input.metadata.version,
        stringifyMobileAidokuSandboxValue(input.settings, "Aidoku settings"),
      ),
      { timeoutMs: SANDBOX_SESSION_CREATE_TIMEOUT_MS },
    );
    const capabilities = validateCapabilities(
      sanitizeMobileAidokuOutput(
        "capabilities",
        parseMobileAidokuSandboxResponse<SandboxCapabilities>(response),
      ),
    );
    if (capabilities.id !== input.metadata.sourceId) {
      throw new Error(
        "The isolated Aidoku package identity does not match its installed metadata.",
      );
    }
    return {
      status: "ready",
      runtime: "native-aidoku",
      source: wrapSandboxSource({
        sessionId,
        capabilities,
        initialSettings: input.settings,
      }),
    };
  } catch (error) {
    await NemuAidokuModule.disposeAidokuSandboxSession(sessionId).catch(
      () => undefined,
    );
    return {
      status: "blocked",
      reason: "bridge-load-failed",
      detail:
        error instanceof Error
          ? error.message
          : "The isolated Aidoku runtime failed to load.",
    };
  }
}

export const mobileAidokuSandboxExecutorBridge: MobileAidokuExecutorBridge = {
  packageLoadMode: "native-file",
  loadSource: loadSandboxSource,
};
