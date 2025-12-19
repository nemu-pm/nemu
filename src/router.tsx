import {
  createRouter,
  createRootRoute,
  createRoute,
  Outlet,
  Link,
  useRouterState,
} from "@tanstack/react-router";
import { useEffect } from "react";
import { useSourcesStore } from "@/stores/sources";
import { useLibraryStore } from "@/stores/library";
import { cn } from "@/lib/utils";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Home01Icon,
  Search01Icon,
  Settings02Icon,
} from "@hugeicons/core-free-icons";

// Pages
import { LibraryPage } from "./pages/library";
import { SearchPage } from "./pages/search";
import { SettingsPage } from "./pages/settings";
import { MangaPage } from "./pages/manga";
import { ReaderPage } from "./pages/reader";

// Root route
const rootRoute = createRootRoute({
  component: () => <Outlet />,
});

// Shell layout route
const shellRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: "_shell",
  component: ShellLayout,
});

function ShellLayout() {
  const { initialize: initSources } = useSourcesStore();
  const { load: loadLibrary } = useLibraryStore();

  useEffect(() => {
    initSources();
    loadLibrary();
  }, [initSources, loadLibrary]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Navbar */}
      <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2">
            <span className="text-xl font-bold tracking-tight text-primary">
              nemu
            </span>
          </Link>

          {/* Navigation */}
          <nav className="flex items-center gap-1">
            <NavLink to="/" icon={Home01Icon} label="Library" />
            <NavLink to="/search" icon={Search01Icon} label="Search" />
            <NavLink to="/settings" icon={Settings02Icon} label="Settings" />
          </nav>
        </div>
      </header>

      {/* Content */}
      <main className="mx-auto max-w-6xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}

function NavLink({
  to,
  icon,
  label,
}: {
  to: string;
  icon: typeof Home01Icon;
  label: string;
}) {
  const routerState = useRouterState();
  const isActive = routerState.location.pathname === to;

  return (
    <Link
      to={to}
      className={cn(
        "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
        isActive
          ? "bg-primary/10 text-primary"
          : "text-muted-foreground hover:bg-muted hover:text-foreground"
      )}
    >
      <HugeiconsIcon icon={icon} className="size-4" />
      <span className="hidden sm:inline">{label}</span>
    </Link>
  );
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
  component: ReaderPage,
});

// Route tree
const routeTree = rootRoute.addChildren([
  shellRoute.addChildren([libraryRoute, searchRoute, settingsRoute, mangaRoute]),
  readerRoute,
]);

// Create router
export const router = createRouter({ routeTree });

// Type declarations
declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
