import {
  createRouter,
  createRootRouteWithContext,
  createRoute,
  Outlet,
  Link,
  useRouterState,
  useRouter,
} from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import { hapticPress } from "@/lib/haptics";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Home01Icon,
  Search01Icon,
  Settings02Icon,
  ArrowLeft01Icon,
  Globe02Icon,
} from "@hugeicons/core-free-icons";
import { FadingOverlay } from "@/components/fading-overlay";
import { useTranslation } from "react-i18next";
import type { BrowsableSource } from "@/lib/sources/aidoku/adapter";
import type { TachiyomiBrowsableSource } from "@/lib/sources/tachiyomi/adapter";
import type { MangaSource } from "@/lib/sources/types";
import type { Listing, Filter, HomeLayout } from "@nemu.pm/aidoku-runtime";
import type { FilterState } from "@nemu.pm/tachiyomi-runtime";
import type { GenericListing } from "@/components/browse";

import { lazy, Suspense } from "react";
import { PageTitleProvider } from "@/components/page-title";

// Library page loaded eagerly (landing page)
import { LibraryPage } from "./pages/library";

// All other pages lazy-loaded for code splitting
const LibraryMangaPage = lazy(() => import("./pages/library-manga").then(m => ({ default: m.LibraryMangaPage })));
const BrowsePage = lazy(() => import("./pages/browse").then(m => ({ default: m.BrowsePage })));
const SourceBrowsePage = lazy(() => import("./pages/source-browse").then(m => ({ default: m.SourceBrowsePage })));
const SearchPage = lazy(() => import("./pages/search").then(m => ({ default: m.SearchPage })));
const SettingsPage = lazy(() => import("./pages/settings").then(m => ({ default: m.SettingsPage })));
const MangaPage = lazy(() => import("./pages/manga").then(m => ({ default: m.MangaPage })));
const ReaderPage = lazy(() => import("./pages/reader").then(m => ({ default: m.ReaderPage })));
const DebugPopoverDrawerPage = lazy(() => import("./pages/debug-popover-drawer").then(m => ({ default: m.DebugPopoverDrawerPage })));

// Router context type - passed from provider
export interface RouterContext {
  getSource: (registryId: string, sourceId: string) => Promise<MangaSource | null>;
}

// Root route with context
const rootRoute = createRootRouteWithContext<RouterContext>()({
  component: RootLayout,
});

function RootLayout() {
  return (
    <PageTitleProvider>
      <Outlet />
    </PageTitleProvider>
  );
}

// Shell layout route
const shellRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: "_shell",
  component: ShellLayout,
});

function ShellLayout() {
  const router = useRouter();
  const routerState = useRouterState();
  const { t } = useTranslation();

  const navItems = [
    { to: "/", icon: Home01Icon, labelKey: "nav.library" },
    { to: "/browse", icon: Globe02Icon, labelKey: "nav.browse" },
    { to: "/search", icon: Search01Icon, labelKey: "nav.search" },
    { to: "/settings", icon: Settings02Icon, labelKey: "nav.settings" },
  ] as const;

  const isSubPage = !navItems.some(item => item.to === routerState.location.pathname);

  const handleBack = () => {
    router.history.back();
  };

  return (
    <div className="relative min-h-dvh bg-background text-foreground" data-vaul-drawer-wrapper>
      {/* Desktop: Left Dock */}
      <nav className="desktop-dock fixed left-4 top-1/2 z-40 hidden -translate-y-1/2 flex-col gap-1 rounded-2xl p-2 md:flex">
        {/* Back button - animated expand/collapse */}
        <div
          className={cn(
            "grid overflow-hidden transition-[grid-template-rows] duration-200",
            isSubPage ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
          )}
        >
          <div className="min-h-0">
            <button
              onClick={() => {
                hapticPress()
                handleBack()
              }}
              className="group flex size-11 items-center justify-center rounded-xl text-muted-foreground transition-colors duration-200 hover:bg-primary/10 hover:text-primary active:scale-95"
            >
              <HugeiconsIcon icon={ArrowLeft01Icon} className="size-5" />
              <span className="pointer-events-none absolute left-full ml-3 whitespace-nowrap rounded-lg bg-foreground/90 px-2.5 py-1.5 text-xs font-medium text-background opacity-0 shadow-lg transition-all duration-200 group-hover:opacity-100">
                {t("common.back")}
              </span>
            </button>
            <div className="mx-2 mb-1 h-px bg-border/50" />
          </div>
        </div>
        {navItems.map((item) => (
          <DesktopDockLink key={item.to} to={item.to} icon={item.icon} labelKey={item.labelKey} />
        ))}
      </nav>

      {/* Fading gradient overlays */}
      <FadingOverlay />

      {/* Scrollable Content Area - uses native window scroll for router scroll restoration */}
      <div className="min-h-dvh">
        <div className="mx-auto max-w-6xl px-4 pb-28 pt-6 md:pb-6 md:pl-20">
          <Suspense>
            <Outlet />
          </Suspense>
        </div>
      </div>

      {/* Mobile: Bottom Tab Bar */}
      <nav className="fixed inset-x-0 bottom-0 z-40 flex justify-center pb-[max(env(safe-area-inset-bottom),12px)] md:hidden">
        <div className="mobile-tab-bar flex items-center rounded-[22px] px-3 py-2">
          {/* Back button - animated expand/collapse */}
          <div
            className={cn(
              "grid overflow-hidden transition-all duration-200",
              isSubPage ? "grid-cols-[1fr] mr-2" : "grid-cols-[0fr]"
            )}
          >
            <div className="min-w-0">
              <button
                onClick={() => {
                  hapticPress()
                  handleBack()
                }}
                className="flex size-9 items-center justify-center rounded-xl text-muted-foreground transition-colors duration-200 hover:bg-muted hover:text-foreground active:scale-95"
              >
                <HugeiconsIcon icon={ArrowLeft01Icon} className="size-5" />
              </button>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {navItems.map((item) => (
              <MobileNavLink key={item.to} to={item.to} icon={item.icon} labelKey={item.labelKey} />
            ))}
          </div>
        </div>
      </nav>
    </div>
  );
}

function DesktopDockLink({
  to,
  icon,
  labelKey,
}: {
  to: string;
  icon: typeof Home01Icon;
  labelKey: string;
} & { tabIndex?: number; "aria-hidden"?: boolean }) {
  const routerState = useRouterState();
  const { t } = useTranslation();
  const isActive = routerState.location.pathname === to;

  return (
    <Link
      to={to}
      onClick={hapticPress}
      className={cn(
        "group relative flex size-11 items-center justify-center rounded-xl transition-all duration-200",
        isActive
          ? "bg-primary/15 text-primary"
          : "text-muted-foreground hover:bg-primary/10 hover:text-primary active:scale-95"
      )}
    >
      <HugeiconsIcon
        icon={icon}
        className={cn(
          "size-5 transition-transform duration-200",
          isActive && "scale-110"
        )}
        strokeWidth={isActive ? 2.5 : 2}
      />
      {/* Tooltip */}
      <span className={cn(
        "pointer-events-none absolute left-full ml-3 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-xs font-medium shadow-lg transition-all duration-200",
        "bg-foreground/90 text-background opacity-0 group-hover:opacity-100"
      )}>
        {t(labelKey)}
      </span>
      {/* Active indicator */}
      {isActive && (
        <span className="absolute -left-1 h-5 w-1 rounded-full bg-primary" />
      )}
    </Link>
  );
}

function MobileNavLink({
  to,
  icon,
  labelKey,
}: {
  to: string;
  icon: typeof Home01Icon;
  labelKey: string;
} & { tabIndex?: number; "aria-hidden"?: boolean }) {
  const routerState = useRouterState();
  const { t } = useTranslation();
  const isActive = routerState.location.pathname === to;

  return (
    <Link
      to={to}
      onClick={hapticPress}
      className={cn(
        "relative flex flex-col items-center justify-center gap-0.5 rounded-2xl px-5 py-2 transition-all duration-200",
        isActive
          ? "bg-primary/15 text-primary"
          : "text-muted-foreground active:scale-95"
      )}
    >
      <HugeiconsIcon
        icon={icon}
        className={cn(
          "size-6 transition-transform duration-200",
          isActive && "scale-105"
        )}
        strokeWidth={isActive ? 2.5 : 2}
      />
      <span className={cn(
        "text-[10px] font-medium tracking-wide",
        isActive && "font-semibold"
      )}>
        {t(labelKey)}
      </span>
    </Link>
  );
}

// ============================================================================
// Loader data types - discriminated union for Aidoku vs Tachiyomi
// ============================================================================

export interface AidokuLoaderData {
  type: "aidoku";
  source: BrowsableSource;
  listings: Listing[];
  filters: Filter[];
  hasHomeProvider: boolean;
  onlySearch: boolean;
  initialHome: HomeLayout | null;
}

export interface TachiyomiLoaderData {
  type: "tachiyomi";
  source: TachiyomiBrowsableSource;
  listings: GenericListing[];
  filters: FilterState[];
}

export type SourceBrowseLoaderData = AidokuLoaderData | TachiyomiLoaderData;

// Routes
const libraryRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: "/",
  component: LibraryPage,
});

const searchRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: "/search",
  validateSearch: (search: Record<string, unknown>) => ({
    q: (search.q as string) || "",
  }),
  component: SearchPage,
});

const settingsRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: "/settings",
  component: SettingsPage,
});

// Debug route - file is gitignored, only works locally when present
const debugPageModules = import.meta.glob<{ DualReadDebugPage: React.ComponentType }>(
  "./pages/dual-read-debug.tsx"
);
const debugPageLoader = debugPageModules["./pages/dual-read-debug.tsx"];
const LazyDualReadDebugPage = debugPageLoader
  ? lazy(() => debugPageLoader().then((m) => ({ default: m.DualReadDebugPage })))
  : null;
const dualReadDebugRoute = LazyDualReadDebugPage
  ? createRoute({
      getParentRoute: () => shellRoute,
      path: "/debug/dual-read",
      component: () => (
        <Suspense fallback={<div className="p-8 text-white/50">Loading debug page...</div>}>
          <LazyDualReadDebugPage />
        </Suspense>
      ),
    })
  : null;

// Browse routes - layout pattern with index
const browseLayoutRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: "/browse",
  component: () => <Outlet />,
});

const browseIndexRoute = createRoute({
  getParentRoute: () => browseLayoutRoute,
  path: "/",
  component: BrowsePage,
});

// Search params for source browse page (persisted in URL for scroll restoration)
export interface SourceBrowseSearch {
  tab?: number;      // Selected listing index (0 = home if hasHomeProvider)
  q?: string;        // Search query (presence activates search mode)
  // filters could be added here but they're complex - keeping as local state for now
}

/**
 * Type guard to check if a source is an Aidoku BrowsableSource
 */
function isAidokuBrowsableSource(source: MangaSource): source is BrowsableSource {
  const browsable = source as BrowsableSource;
  return typeof browsable.hasHomeProvider === "function" &&
         typeof browsable.getHome === "function" &&
         typeof browsable.isOnlySearch === "function";
}

/**
 * Type guard to check if a source is a Tachiyomi BrowsableSource
 */
function isTachiyomiBrowsableSource(source: MangaSource): source is TachiyomiBrowsableSource {
  const browsable = source as TachiyomiBrowsableSource;
  return typeof browsable.supportsLatest === "boolean" &&
         typeof browsable.getFilters === "function" &&
         typeof browsable.resetFilters === "function";
}

const sourceBrowseRoute = createRoute({
  getParentRoute: () => browseLayoutRoute,
  path: "$registryId/$sourceId",
  validateSearch: (search: Record<string, unknown>): SourceBrowseSearch => ({
    tab: typeof search.tab === "number" ? search.tab : undefined,
    q: typeof search.q === "string" ? search.q : undefined,
  }),
  loader: async ({ params, context }): Promise<SourceBrowseLoaderData> => {
    const { registryId, sourceId } = params;
    const { getSource } = context;

    const loadedSource = await getSource(registryId, sourceId);
    if (!loadedSource) {
      throw new Error("Source not found");
    }

    // Detect source type and return appropriate data
    if (isTachiyomiBrowsableSource(loadedSource)) {
      // Tachiyomi source
      const [listings, filters] = await Promise.all([
        loadedSource.getListings(),
        loadedSource.getFilters(),
      ]);

      return {
        type: "tachiyomi",
        source: loadedSource,
        listings,
        filters,
      };
    } else if (isAidokuBrowsableSource(loadedSource)) {
      // Aidoku source
      const [hasHomeProvider, onlySearch, listings, filters] = await Promise.all([
        loadedSource.hasHomeProvider(),
        loadedSource.isOnlySearch(),
        loadedSource.getListings(),
        loadedSource.getFilters(),
      ]);

      // Fetch initial home content if source provides home (critical for scroll restoration)
      let initialHome: HomeLayout | null = null;
      if (hasHomeProvider && !onlySearch) {
        try {
          initialHome = await loadedSource.getHome(false); // Use cache if available
        } catch {
          // Ignore errors - home will be loaded in component
        }
      }

      return {
        type: "aidoku",
        source: loadedSource,
        listings,
        filters,
        hasHomeProvider,
        onlySearch,
        initialHome,
      };
    } else {
      throw new Error("Source does not support browsing");
    }
  },
  staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  component: SourceBrowsePage,
});

// Library manga detail search params
export interface LibraryMangaSearch {
  source?: string; // source link id
}

// Library manga detail route
const libraryMangaRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: "/library/$id",
  validateSearch: (search: Record<string, unknown>): LibraryMangaSearch => ({
    source: typeof search.source === "string" ? search.source : undefined,
  }),
  component: LibraryMangaPage,
});

// Source manga route (for browsing, not in library yet)
const mangaRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: "/sources/$registryId/$sourceId/$mangaId",
  component: MangaPage,
});

// Reader route (outside shell - fullscreen, needs own Suspense for lazy load)
const readerRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/sources/$registryId/$sourceId/$mangaId/$chapterId",
  validateSearch: (search: Record<string, unknown>) => {
    const raw = search.page;
    const parsed =
      typeof raw === "number"
        ? raw
        : typeof raw === "string"
          ? Number.parseInt(raw, 10)
          : NaN;
    const page = Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
    return { page };
  },
  component: () => <Suspense><ReaderPage /></Suspense>,
});

// Debug popover + drawer test route
const debugPopoverDrawerRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/debug/popover-drawer",
  component: () => <Suspense><DebugPopoverDrawerPage /></Suspense>,
});

// Route tree
const shellChildren = [
  libraryRoute,
  libraryMangaRoute,
  browseLayoutRoute.addChildren([browseIndexRoute, sourceBrowseRoute]),
  searchRoute,
  settingsRoute,
  mangaRoute,
  ...(dualReadDebugRoute ? [dualReadDebugRoute] : []),
];
const routeTree = rootRoute.addChildren([
  shellRoute.addChildren(shellChildren),
  readerRoute,
  debugPopoverDrawerRoute,
]);

// Create router factory - context will be provided by RouterProvider
export function createAppRouter() {
  return createRouter({
    routeTree,
    scrollRestoration: true,
    defaultPreload: "intent",
    context: {
      // Will be overridden by RouterProvider
      getSource: async () => null,
    },
  });
}

export const router = createAppRouter();

// Type declarations
declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
