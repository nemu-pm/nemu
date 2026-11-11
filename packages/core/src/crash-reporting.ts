/**
 * Privacy scrubbing for crash and error reports (Sentry), shared by the web
 * app and the mobile app. Runs on every event, breadcrumb and span before it
 * leaves the device.
 *
 * What a user reads must not be recoverable from a report, so every URL that
 * is not nemu's own (source sites, image hosts, self-hosted servers) becomes a
 * placeholder, nemu's own page URLs keep only their first path segment (the
 * rest names a source, title or chapter), and query strings, fragments and
 * userinfo are always dropped. Credentials (auth headers, cookies, bearer and
 * basic tokens, JWTs, `token=`/`password=`-style pairs, better-auth one-time
 * tokens), email addresses and IPv4 addresses are replaced in any text.
 *
 * The functions are structural (no Sentry types) and return the same object,
 * edited in place, so they work with both `@sentry/react` and
 * `@sentry/react-native`.
 */

export const CRASH_REPORT_REDACTED = "[redacted]";

/** nemu's own hosts: their URLs keep the path (queries are still dropped). */
const FIRST_PARTY_HOST_SUFFIXES = ["nemu.pm", "convex.cloud", "convex.site"] as const;

/** Hosts that serve the web app's pages: only the first path segment is kept. */
const DEFAULT_PAGE_HOSTS = ["nemu.pm", "www.nemu.pm"] as const;

/** nemu's own deep-link schemes: the scheme and host (the action) are kept. */
const APP_LINK_SCHEMES = new Set(["nemu", "aidoku", "neko"]);

const WEB_SCHEMES = new Set(["http", "https", "ws", "wss"]);

/** Request headers kept on an event; every other header is dropped. */
const KEPT_REQUEST_HEADERS = new Set(["user-agent", "referer"]);

/** Breadcrumb data keys kept for HTTP breadcrumbs. */
const KEPT_HTTP_BREADCRUMB_KEYS = new Set(["method", "status_code", "url"]);

/** Span attributes that name a host, a path or a query on their own. */
const DROPPED_SPAN_DATA_KEYS = new Set([
  "server.address",
  "server.port",
  "url.domain",
  "url.path",
  "url.query",
  "url.fragment",
  "http.query",
  "http.fragment",
  "network.peer.address",
  "network.peer.port",
]);

const MAX_DEPTH = 8;
const MAX_CONSOLE_MESSAGE_LENGTH = 300;

export type CrashReportScrubOptions = {
  /**
   * Extra hosts (`host` or `host:port`) serving the web app's pages, e.g. the
   * current origin of a preview deployment or the dev server.
   */
  pageHosts?: readonly string[];
};

type Scrubber = {
  pageHosts: ReadonlySet<string>;
};

function createScrubber(options: CrashReportScrubOptions | undefined): Scrubber {
  const pageHosts = new Set<string>(DEFAULT_PAGE_HOSTS);
  for (const host of options?.pageHosts ?? []) {
    const value = host.trim().toLowerCase();
    if (value) pageHosts.add(value);
  }
  return { pageHosts };
}

function isFirstPartyHost(hostname: string): boolean {
  return FIRST_PARTY_HOST_SUFFIXES.some(
    (suffix) => hostname === suffix || hostname.endsWith(`.${suffix}`),
  );
}

function isRouteParamSegment(segment: string): boolean {
  return /^[$:][\w-]+$/.test(segment) || /^\[[^\]/]+\]$/.test(segment);
}

/**
 * A page path with everything after the first segment replaced, except route
 * templates (`$id`, `:id`, `[id]`), which name no content.
 */
export function scrubPagePath(path: string): string {
  const pathname = path.split(/[?#]/, 1)[0] ?? "";
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length === 0) return pathname.startsWith("/") ? "/" : "";
  const kept = segments.map((segment, index) => {
    if (index === 0 || isRouteParamSegment(segment)) return segment;
    return CRASH_REPORT_REDACTED;
  });
  return `/${kept.join("/")}`;
}

const URL_PARTS = /^([a-z][a-z0-9+.-]*):\/\/([^/?#]*)([^?#]*)/i;

function scrubUrlWith(scrubber: Scrubber, raw: string): string {
  const match = URL_PARTS.exec(raw);
  if (!match) return raw;
  const scheme = match[1]!.toLowerCase();
  const authority = match[2]!;
  const path = match[3]!;

  if (WEB_SCHEMES.has(scheme)) {
    const hostPort = authority.slice(authority.lastIndexOf("@") + 1).toLowerCase();
    const hostname = hostPort.replace(/:\d+$/, "").replace(/^\[|\]$/g, "");
    if (scrubber.pageHosts.has(hostPort) || scrubber.pageHosts.has(hostname)) {
      return `${scheme}://${hostPort}${scrubPagePath(path)}`;
    }
    if (isFirstPartyHost(hostname)) return `${scheme}://${hostPort}${path}`;
    return `${scheme}://${CRASH_REPORT_REDACTED}`;
  }
  // The app's own bundle (`app:///main.jsbundle`): no user content.
  if (scheme === "app") return `${scheme}://${authority}${path}`;
  if (APP_LINK_SCHEMES.has(scheme)) {
    return `${scheme}://${authority.slice(authority.lastIndexOf("@") + 1)}`;
  }
  return `${scheme}://${CRASH_REPORT_REDACTED}`;
}

/** One URL with its query, fragment and userinfo dropped and its host judged. */
export function scrubCrashReportUrl(url: string, options?: CrashReportScrubOptions): string {
  return scrubUrlWith(createScrubber(options), url);
}

// Brackets are allowed so IPv6 hosts and already-redacted parts stay in one match.
const URL_IN_TEXT = /\b[a-z][a-z0-9+.-]*:\/\/[^\s"'`<>(){}|\\^]+/gi;
const TRAILING_PUNCTUATION = /[.,;:!?]+$/;
const AUTH_SCHEME = /\b(Bearer|Basic|Token)\s+[A-Za-z0-9._~+/=-]{4,}/gi;
const JWT = /\beyJ[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]*/g;
// `key=value`, `key: value`, `"key":"value"` for credential-like keys
// (accessToken, session_token, better-auth.session_token, password, ott, …).
const SECRET_PAIR =
  /(\b[\w.-]*(?:token|secret|passw(?:or)?d|api[_-]?key|cookie|authorization|credential)[\w.-]*|\bott)(["']?\s*[=:]\s*["']?)((?:(?:Bearer|Basic|Token)\s+)?(?:\[redacted\]|[^\s"'&,;}\]]+))/gi;
const EMAIL = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}\b/g;
const IPV4 = /\b(?:25[0-5]|2[0-4]\d|1?\d?\d)(?:\.(?:25[0-5]|2[0-4]\d|1?\d?\d)){3}\b/g;

function scrubTextWith(scrubber: Scrubber, text: string): string {
  if (!text) return text;
  return text
    .replace(URL_IN_TEXT, (match) => {
      const trailing = TRAILING_PUNCTUATION.exec(match)?.[0] ?? "";
      const url = trailing ? match.slice(0, -trailing.length) : match;
      return scrubUrlWith(scrubber, url) + trailing;
    })
    .replace(AUTH_SCHEME, (_match, scheme: string) => `${scheme} ${CRASH_REPORT_REDACTED}`)
    .replace(JWT, CRASH_REPORT_REDACTED)
    .replace(SECRET_PAIR, (match, key: string, separator: string, _value, offset: number, whole: string) => {
      // A parser's "Unexpected token: <" names syntax, not a credential.
      if (/unexpected\s+$/i.test(whole.slice(Math.max(0, offset - 12), offset))) return match;
      return `${key}${separator}${CRASH_REPORT_REDACTED}`;
    })
    .replace(EMAIL, "[email]")
    .replace(IPV4, "[ip]");
}

/** Free text (messages, exception values) with URLs and credentials replaced. */
export function scrubCrashReportText(text: string, options?: CrashReportScrubOptions): string {
  return scrubTextWith(createScrubber(options), text);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isCredentialKey(key: string): boolean {
  return /token|secret|passw(?:or)?d|api[_-]?key|cookie|authorization|credential|^ott$/i.test(key);
}

function scrubValue(scrubber: Scrubber, value: unknown, depth: number): unknown {
  if (typeof value === "string") return scrubTextWith(scrubber, value);
  if (depth >= MAX_DEPTH) return value;
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      value[index] = scrubValue(scrubber, value[index], depth + 1);
    }
    return value;
  }
  if (isRecord(value)) {
    for (const key of Object.keys(value)) {
      if (isCredentialKey(key) && value[key] != null) {
        value[key] = CRASH_REPORT_REDACTED;
        continue;
      }
      value[key] = scrubValue(scrubber, value[key], depth + 1);
    }
  }
  return value;
}

function scrubPageLocation(scrubber: Scrubber, value: unknown): unknown {
  if (typeof value !== "string") return value;
  if (value.startsWith("/")) return scrubPagePath(value);
  return scrubUrlWith(scrubber, value);
}

type BreadcrumbLike = {
  category?: string;
  type?: string;
  level?: string;
  message?: string;
  data?: Record<string, unknown>;
};

function scrubBreadcrumbWith<T extends BreadcrumbLike>(scrubber: Scrubber, breadcrumb: T): T | null {
  const category = breadcrumb.category ?? "";

  if (category === "console") {
    // Logged arguments can carry anything (titles, URLs, responses): keep
    // only warnings and errors, as a short scrubbed line.
    if (breadcrumb.level !== "warning" && breadcrumb.level !== "error") return null;
    delete breadcrumb.data;
    if (typeof breadcrumb.message === "string") {
      breadcrumb.message = scrubTextWith(scrubber, breadcrumb.message).slice(
        0,
        MAX_CONSOLE_MESSAGE_LENGTH,
      );
    }
    return breadcrumb;
  }

  if (category === "fetch" || category === "xhr" || category === "http") {
    if (breadcrumb.data) {
      for (const key of Object.keys(breadcrumb.data)) {
        if (!KEPT_HTTP_BREADCRUMB_KEYS.has(key)) delete breadcrumb.data[key];
      }
      if (typeof breadcrumb.data.url === "string") {
        breadcrumb.data.url = scrubUrlWith(scrubber, breadcrumb.data.url);
      }
    }
    if (typeof breadcrumb.message === "string") {
      breadcrumb.message = scrubTextWith(scrubber, breadcrumb.message);
    }
    return breadcrumb;
  }

  if (category === "navigation" && breadcrumb.data) {
    breadcrumb.data.from = scrubPageLocation(scrubber, breadcrumb.data.from);
    breadcrumb.data.to = scrubPageLocation(scrubber, breadcrumb.data.to);
  }

  if (category.startsWith("ui.") && typeof breadcrumb.message === "string") {
    // DOM selectors carry attribute values (alt, title, aria-label: a cover's
    // alt text is the title being read). Keep the attribute names only.
    breadcrumb.message = breadcrumb.message.replace(
      /\[([\w-]+)=(?:"[^"]*"|'[^']*'|[^\]]*)\]/g,
      "[$1]",
    );
  }

  if (category === "touch") {
    // React Native touch breadcrumbs name the touched element by its label.
    breadcrumb.message = "Touch event";
    const path = breadcrumb.data?.path;
    if (Array.isArray(path)) {
      for (const element of path) {
        if (isRecord(element)) delete element.label;
      }
    }
  }

  if (typeof breadcrumb.message === "string") {
    breadcrumb.message = scrubTextWith(scrubber, breadcrumb.message);
  }
  if (breadcrumb.data) {
    // Screen and view titles (native `ui.lifecycle` breadcrumbs) name the
    // title being read on detail and reader screens.
    delete breadcrumb.data.title;
    scrubValue(scrubber, breadcrumb.data, 0);
  }
  return breadcrumb;
}

/** A breadcrumb scrubbed in place, or null to drop it. */
export function scrubCrashReportBreadcrumb<T extends BreadcrumbLike>(
  breadcrumb: T,
  options?: CrashReportScrubOptions,
): T | null {
  return scrubBreadcrumbWith(createScrubber(options), breadcrumb);
}

type SpanLike = {
  description?: string;
  op?: string;
  data?: Record<string, unknown>;
};

function scrubSpanWith<T extends SpanLike>(scrubber: Scrubber, span: T): T {
  if (typeof span.description === "string") {
    span.description = span.description.startsWith("/")
      ? scrubPagePath(span.description)
      : scrubTextWith(scrubber, span.description);
  }
  if (span.data) {
    for (const key of Object.keys(span.data)) {
      if (DROPPED_SPAN_DATA_KEYS.has(key)) delete span.data[key];
    }
    for (const key of ["url", "http.url", "url.full"]) {
      if (typeof span.data[key] === "string") {
        span.data[key] = scrubUrlWith(scrubber, span.data[key] as string);
      }
    }
    scrubValue(scrubber, span.data, 0);
  }
  return span;
}

/** A span (performance trace) scrubbed in place. */
export function scrubCrashReportSpan<T extends SpanLike>(span: T, options?: CrashReportScrubOptions): T {
  return scrubSpanWith(createScrubber(options), span);
}

type FrameLike = { filename?: string; abs_path?: string };

function scrubFrameLocation(scrubber: Scrubber, value: string | undefined): string | undefined {
  // Only web URLs can name a third-party script (a source's code). nemu's own
  // scripts and bundle paths stay intact so stack traces still symbolicate.
  if (!value) return value;
  const match = URL_PARTS.exec(value);
  if (!match || !WEB_SCHEMES.has(match[1]!.toLowerCase())) return value;
  const hostPort = match[2]!.slice(match[2]!.lastIndexOf("@") + 1).toLowerCase();
  const hostname = hostPort.replace(/:\d+$/, "");
  if (scrubber.pageHosts.has(hostPort) || scrubber.pageHosts.has(hostname) || isFirstPartyHost(hostname)) {
    return `${match[1]}://${hostPort}${match[3]}`;
  }
  return scrubUrlWith(scrubber, value);
}

type EventLike = {
  message?: unknown;
  logentry?: { message?: string; params?: unknown[] };
  exception?: {
    values?: Array<{
      value?: string;
      stacktrace?: { frames?: FrameLike[] };
    }>;
  };
  threads?: { values?: Array<{ stacktrace?: { frames?: FrameLike[] } }> };
  request?: {
    url?: string;
    headers?: Record<string, string>;
    cookies?: unknown;
    query_string?: unknown;
    data?: unknown;
    env?: unknown;
  };
  breadcrumbs?: BreadcrumbLike[];
  transaction?: string;
  spans?: SpanLike[];
  user?: unknown;
  server_name?: unknown;
  extra?: Record<string, unknown>;
  contexts?: Record<string, unknown>;
  tags?: Record<string, unknown>;
};

/**
 * An event (error or transaction) scrubbed in place: no user, no server name,
 * no device hash, no cookies or request body, only the User-Agent and a
 * scrubbed Referer header, and every URL and credential in its text replaced.
 */
export function scrubCrashReportEvent<T extends object>(event: T, options?: CrashReportScrubOptions): T {
  const scrubber = createScrubber(options);
  const target = event as EventLike;

  delete target.user;
  delete target.server_name;

  if (typeof target.message === "string") {
    target.message = scrubTextWith(scrubber, target.message);
  }
  if (target.logentry) {
    if (typeof target.logentry.message === "string") {
      target.logentry.message = scrubTextWith(scrubber, target.logentry.message);
    }
    if (target.logentry.params) scrubValue(scrubber, target.logentry.params, 0);
  }

  for (const exception of target.exception?.values ?? []) {
    if (typeof exception.value === "string") {
      exception.value = scrubTextWith(scrubber, exception.value);
    }
    for (const frame of exception.stacktrace?.frames ?? []) {
      frame.filename = scrubFrameLocation(scrubber, frame.filename);
      frame.abs_path = scrubFrameLocation(scrubber, frame.abs_path);
    }
  }
  for (const thread of target.threads?.values ?? []) {
    for (const frame of thread.stacktrace?.frames ?? []) {
      frame.filename = scrubFrameLocation(scrubber, frame.filename);
      frame.abs_path = scrubFrameLocation(scrubber, frame.abs_path);
    }
  }

  if (target.request) {
    const request = target.request;
    delete request.cookies;
    delete request.query_string;
    delete request.data;
    delete request.env;
    if (typeof request.url === "string") request.url = scrubUrlWith(scrubber, request.url);
    if (request.headers) {
      const headers: Record<string, string> = {};
      for (const [name, value] of Object.entries(request.headers)) {
        const lower = name.toLowerCase();
        if (!KEPT_REQUEST_HEADERS.has(lower)) continue;
        headers[name] = lower === "referer" ? scrubUrlWith(scrubber, value) : value;
      }
      request.headers = headers;
    }
  }

  if (target.breadcrumbs) {
    target.breadcrumbs = target.breadcrumbs
      .map((breadcrumb) => scrubBreadcrumbWith(scrubber, breadcrumb))
      .filter((breadcrumb): breadcrumb is BreadcrumbLike => breadcrumb !== null);
  }

  if (typeof target.transaction === "string") {
    target.transaction = target.transaction.startsWith("/")
      ? scrubPagePath(target.transaction)
      : scrubTextWith(scrubber, target.transaction);
  }
  for (const span of target.spans ?? []) scrubSpanWith(scrubber, span);

  if (target.extra) scrubValue(scrubber, target.extra, 0);
  if (target.contexts) {
    // A hash of the device's vendor ID and the app: a stable per-device ID.
    const app = target.contexts.app;
    if (isRecord(app)) delete app.device_app_hash;
    scrubValue(scrubber, target.contexts, 0);
  }
  if (target.tags) scrubValue(scrubber, target.tags, 0);

  return event;
}
