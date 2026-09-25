import { sanitizeMobileAidokuOutput } from "./mobileAidokuOutputSafety";

export type MobileSourceImageRequestShape = {
  url: string;
  headers: Record<string, string>;
};

/**
 * Native's one decoration path for source-owned image requests
 * (`decorateAidokuSourceImageRequest`): the source's scoped cookies for this
 * url plus, when the jar contributed any, the User-Agent a `cf_clearance` is
 * bound to. Resolves null when the url is not a public destination.
 */
export type MobileSourceImageRequestDecorator = (
  sourceKey: string,
  url: string,
  headers: Record<string, string>,
) => Promise<Record<string, string> | null>;

/**
 * Hands a source-owned image request that never went through the sandbox's
 * `modify-image-request` (a source with no image-request hook, or a page that
 * arrived with its headers) to native for the same decoration the hooked path
 * gets there.
 *
 * Never throws and never widens anything on its own: a url the image policy
 * refuses, a missing native entry point, a native failure, or an output that
 * fails the `modify-image-request` output bounds all fall back to the
 * source's own headers, unchanged. Cookies are only ever attached by native,
 * from `sourceKey`'s own jar, for this url.
 */
export async function decorateMobileSourceImageRequest(
  request: MobileSourceImageRequestShape,
  options: {
    sourceKey: string;
    isAllowedUrl: (url: string) => boolean;
    decorate: MobileSourceImageRequestDecorator | undefined;
  },
): Promise<MobileSourceImageRequestShape> {
  const undecorated = { url: request.url, headers: { ...request.headers } };
  if (!options.decorate || !options.isAllowedUrl(request.url)) return undecorated;
  try {
    // The input is bounded like a hook's result before native sees it.
    sanitizeMobileAidokuOutput("modify-image-request", undecorated);
    const headers = await options.decorate(
      options.sourceKey,
      undecorated.url,
      undecorated.headers,
    );
    if (!headers) return undecorated;
    return sanitizeMobileAidokuOutput("modify-image-request", {
      url: undecorated.url,
      headers,
    });
  } catch {
    return undecorated;
  }
}
