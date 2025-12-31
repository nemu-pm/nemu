import React, { createContext, useCallback, useContext, useMemo, useState } from "react";
import { useRouterState } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { formatDocumentTitle, type TitleParts } from "@/lib/page-title";

export type TitleScope = "pathname" | "location";

type Override = {
  scope: TitleScope;
  key: string;
  parts: TitleParts;
};

type PageTitleContextValue = {
  setOverride: (override: Override) => void;
  clearOverride: (override: Pick<Override, "scope" | "key">) => void;
};

const PageTitleContext = createContext<PageTitleContextValue | null>(null);

function usePageTitleContext(): PageTitleContextValue {
  const ctx = useContext(PageTitleContext);
  if (!ctx) throw new Error("usePageTitle must be used within <PageTitleProvider />");
  return ctx;
}

function getLocationKey(location: { pathname: string; searchStr?: string; hash?: string; href?: string }) {
  if (location.href) return location.href;
  return `${location.pathname}${location.searchStr ?? ""}${location.hash ?? ""}`;
}

function titleFallbackForPathname(
  pathname: string,
  getQuery: (k: string) => string | null,
  t: (k: string, opts?: Record<string, unknown>) => string
): TitleParts {
  if (pathname === "/") return [t("nav.library")];
  if (pathname === "/browse" || pathname === "/browse/") return [t("nav.browse")];
  if (pathname.startsWith("/browse/")) return [t("nav.browse")];
  if (pathname === "/search") {
    const q = (getQuery("q") ?? "").trim();
    return q ? [`${t("nav.search")}: ${q}`] : [t("nav.search")];
  }
  if (pathname === "/settings") return [t("nav.settings")];
  if (pathname.startsWith("/library/")) return [t("nav.library")];
  if (pathname.startsWith("/sources/")) {
    const segs = pathname.split("/").filter(Boolean);
    // /sources/:registryId/:sourceId/:mangaId
    if (segs.length === 4) return [t("titles.manga")];
    // /sources/:registryId/:sourceId/:mangaId/:chapterId
    if (segs.length >= 5) return [t("titles.reader")];
    return [t("nav.browse")];
  }
  if (pathname === "/debug/drawer-scroll") return [t("titles.debug")];
  if (pathname === "/debug/dual-read") return [t("plugins.dualRead.name"), t("titles.debug")];
  return [];
}

function PageTitleSync({ override }: { override: Override | null }) {
  const { t } = useTranslation();

  const location = useRouterState({ select: (s) => s.location });
  const pathname = location.pathname;
  const locationKey = getLocationKey(location);

  const getQuery = useCallback(
    (k: string) => {
      // TanStack Router usually provides `searchStr`, but in case it changes, fall back to window.
      const searchStr =
        typeof location.searchStr === "string"
          ? location.searchStr
          : typeof window !== "undefined"
            ? window.location.search
            : "";
      try {
        return new URLSearchParams(searchStr.startsWith("?") ? searchStr : `?${searchStr}`).get(k);
      } catch {
        return null;
      }
    },
    [location.searchStr]
  );

  const fallbackParts = useMemo(
    () => titleFallbackForPathname(pathname, getQuery, t),
    [pathname, getQuery, t]
  );

  const effectiveParts = useMemo(() => {
    if (!override) return fallbackParts;
    const currentKey = override.scope === "pathname" ? pathname : locationKey;
    if (override.key !== currentKey) return fallbackParts;
    return override.parts;
  }, [override, fallbackParts, pathname, locationKey]);

  const title = useMemo(() => formatDocumentTitle(effectiveParts), [effectiveParts]);

  React.useEffect(() => {
    if (typeof document === "undefined") return;
    document.title = title;
  }, [title]);

  return null;
}

export function PageTitleProvider({ children }: { children: React.ReactNode }) {
  const [override, setOverrideState] = useState<Override | null>(null);

  const setOverride = useCallback((o: Override) => {
    setOverrideState(o);
  }, []);

  const clearOverride = useCallback((o: Pick<Override, "scope" | "key">) => {
    setOverrideState((prev) => {
      if (!prev) return prev;
      if (prev.scope !== o.scope) return prev;
      if (prev.key !== o.key) return prev;
      return null;
    });
  }, []);

  const value = useMemo<PageTitleContextValue>(
    () => ({ setOverride, clearOverride }),
    [setOverride, clearOverride]
  );

  return (
    <PageTitleContext.Provider value={value}>
      <PageTitleSync override={override} />
      {children}
    </PageTitleContext.Provider>
  );
}

export function usePageTitle(parts: TitleParts, opts?: { scope?: TitleScope }) {
  const { setOverride, clearOverride } = usePageTitleContext();
  const location = useRouterState({ select: (s) => s.location });

  const scope: TitleScope = opts?.scope ?? "pathname";
  const key = scope === "pathname" ? location.pathname : getLocationKey(location);

  const signature = (parts ?? []).map((p) => (p == null ? "" : String(p))).join("\u0000");

  const partsRef = React.useRef<TitleParts>(parts);
  partsRef.current = parts;

  React.useEffect(() => {
    setOverride({ scope, key, parts: partsRef.current });
    return () => {
      clearOverride({ scope, key });
    };
  }, [scope, key, signature, setOverride, clearOverride]);
}


