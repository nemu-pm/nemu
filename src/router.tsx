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
import type { MangaSource } from "@/lib/sources/types";
import type { Listing, Filter } from "@/lib/sources/aidoku/types";

// Pages
import { LibraryPage } from "./pages/library";
import { BrowsePage } from "./pages/browse";
import { SourceBrowsePage } from "./pages/source-browse";
import { SearchPage } from "./pages/search";
import { SettingsPage } from "./pages/settings";
import { MangaPage } from "./pages/manga";
import { ReaderPage } from "./pages/reader";

// Router context type - passed from provider
export interface RouterContext {
  getSource: (registryId: string, sourceId: string) => Promise<MangaSource | null>;
}

// Root route with context
const rootRoute = createRootRouteWithContext<RouterContext>()({
  component: () => <Outlet />,
});

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
    <div className="relative h-dvh bg-background text-foreground" data-vaul-drawer-wrapper>
      {/* Desktop: Left Dock */}
      <nav className="desktop-dock fixed left-4 top-1/2 z-50 hidden -translate-y-1/2 flex-col gap-1 rounded-2xl p-2 md:flex">
        {/* Back button - animated expand/collapse */}
        <div
          className={cn(
            "grid overflow-hidden transition-[grid-template-rows] duration-200",
            isSubPage ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
          )}
        >
          <div className="min-h-0">
            <button
              onClick={handleBack}
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
          <Outlet />
        </div>
      </div>

      {/* Mobile: Bottom Tab Bar */}
      <nav className="fixed inset-x-0 bottom-0 z-50 flex justify-center pb-[max(env(safe-area-inset-bottom),12px)] md:hidden">
        <div className="mobile-tab-bar flex items-center gap-2 rounded-[22px] px-3 py-2">
          {/* Back button - animated expand/collapse */}
          <div
            className={cn(
              "grid overflow-hidden transition-[grid-template-columns] duration-200",
              isSubPage ? "grid-cols-[1fr]" : "grid-cols-[0fr]"
            )}
          >
            <div className="min-w-0">
              <button
                onClick={handleBack}
                className="flex size-9 items-center justify-center rounded-xl text-muted-foreground transition-colors duration-200 hover:bg-muted hover:text-foreground active:scale-95"
              >
                <HugeiconsIcon icon={ArrowLeft01Icon} className="size-5" />
              </button>
            </div>
          </div>
          {navItems.map((item) => (
            <MobileNavLink key={item.to} to={item.to} icon={item.icon} labelKey={item.labelKey} />
          ))}
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
}) {
  const routerState = useRouterState();
  const { t } = useTranslation();
  const isActive = routerState.location.pathname === to;

  return (
    <Link
      to={to}
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
}) {
  const routerState = useRouterState();
  const { t } = useTranslation();
  const isActive = routerState.location.pathname === to;

  return (
    <Link
      to={to}
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

// Loader data type for source browse
export interface SourceBrowseLoaderData {
  source: BrowsableSource;
  listings: Listing[];
  filters: Filter[];
  hasHomeProvider: boolean;
  onlySearch: boolean;
  initialHome: import("@/lib/sources/aidoku/types").HomeLayout | null;
}

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

    const browsable = loadedSource as BrowsableSource;
    if (!browsable.getListings || !browsable.getFilters) {
      throw new Error("Source does not support browsing");
    }

    const [hasHomeProvider, onlySearch, listings, filters] = await Promise.all([
      browsable.hasHomeProvider(),
      browsable.isOnlySearch(),
      browsable.getListings(),
      browsable.getFilters(),
    ]);

    // Fetch initial home content if source provides home (critical for scroll restoration)
    let initialHome = null;
    if (hasHomeProvider && !onlySearch) {
      try {
        initialHome = await browsable.getHome(false); // Use cache if available
      } catch {
        // Ignore errors - home will be loaded in component
      }
    }

    return {
      source: browsable,
      listings,
      filters,
      hasHomeProvider,
      onlySearch,
      initialHome,
    };
  },
  staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  component: SourceBrowsePage,
});

// Manga route with registryId
const mangaRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: "/sources/$registryId/$sourceId/$mangaId",
  component: MangaPage,
});

// Reader route (outside shell - fullscreen)
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
  component: ReaderPage,
});

// Route tree
const routeTree = rootRoute.addChildren([
  shellRoute.addChildren([
    libraryRoute,
    browseLayoutRoute.addChildren([browseIndexRoute, sourceBrowseRoute]),
    searchRoute,
    settingsRoute,
    mangaRoute,
  ]),
  readerRoute,
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
