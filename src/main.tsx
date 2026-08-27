/* @refresh skip */
import { StrictMode, useEffect, useState, useMemo, memo } from "react"
import { createRoot } from "react-dom/client"
import { RouterProvider } from "@tanstack/react-router"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { ConvexReactClient } from "convex/react"
import {
  ConvexBetterAuthProvider,
  type AuthClient as ConvexAuthClient,
} from "@convex-dev/better-auth/react"
import { ThemeProvider, useTheme } from "next-themes"
import { authClient } from "@/lib/auth-client"
import { themeStore } from "@/stores/theme"
import { sweepLegacyCacheEntriesOnce } from "@/data/cache"

import "./index.css"
import "./lib/i18n"
import "./lib/plugins/init" // Initialize reader plugins
import { router, type RouterContext } from "./router"
import { ErrorBoundary } from "./components/error-boundary"
import { DataServicesProvider, useStores } from "@/data/context"
import { SyncSetup } from "./sync/setup"
import { Toaster } from "./components/ui/sonner"
import { WelcomeWizard, useWelcomeWizard } from "./components/welcome-wizard"
import { SourceInstallDialog } from "./components/source-install-dialog"
import { CloudflareBypassDialog } from "./components/cloudflare-bypass-dialog"
import { SignInDialog } from "./components/sign-in-dialog"
import { useAuthGate } from "./lib/auth-gate"

const convex = new ConvexReactClient(import.meta.env.VITE_CONVEX_URL as string)

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      gcTime: 30 * 60 * 1000, // 30 minutes (keep in cache longer for scroll restoration)
    },
  },
})

function ThemeSync() {
  const { setTheme: setNextTheme } = useTheme();
  
  useEffect(() => {
    if (!themeStore) return;
    
    const unsubscribe = themeStore.subscribe((state) => {
      setNextTheme(state.theme);
    });
    
    return unsubscribe;
  }, [setNextTheme]);
  
  return null;
}

function ToastPosition() {
  const [position, setPosition] = useState<"top-center" | "bottom-right">("bottom-right");

  useEffect(() => {
    const updatePosition = () => {
      setPosition(window.innerWidth < 768 ? "top-center" : "bottom-right");
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    return () => window.removeEventListener("resize", updatePosition);
  }, []);

  return <Toaster position={position} />;
}

function AuthGateDialog() {
  const open = useAuthGate((s) => s.open)
  const dismiss = useAuthGate((s) => s.dismiss)
  return <SignInDialog open={open} onOpenChange={(v) => { if (!v) dismiss() }} />
}

function WelcomeWizardWrapper() {
  const { shouldShow, markCompleted } = useWelcomeWizard();
  
  // Skip wizard on utility routes (debug, etc.)
  const pathname = window.location.pathname;
  const skipRoutes = ["/debug"];
  const shouldSkip = skipRoutes.some(r => pathname.startsWith(r));
  
  const handleComplete = () => {
    markCompleted();
    router.navigate({ to: "/browse" });
  };
  
  return <WelcomeWizard open={shouldShow && !shouldSkip} onComplete={handleComplete} />;
}

// Router wrapper - MEMOIZED to prevent parent re-renders from cascading
const RouterWithContext = memo(function RouterWithContext() {
  const stores = useStores();
  const { useSettingsStore } = stores;
  const getSource = useSettingsStore((s) => s.getSource);

  const routerContext = useMemo<RouterContext>(
    () => ({ getSource }),
    [getSource]
  );

  return (
    <>
      <RouterProvider router={router} context={routerContext} />
      <WelcomeWizardWrapper />
    </>
  );
});

/**
 * better-auth 1.6.23 × @convex-dev/better-auth 0.12.5 type mismatch.
 *
 * `ConvexBetterAuthProvider` declares `authClient: AuthClient`, and that
 * `AuthClient` is one specific instantiation of better-auth's client generic:
 * `ReturnType<typeof createAuthClient<BetterAuthClientPlugin & { plugins:
 * (CrossDomainClient | ConvexClient | BetterAuthClientPlugin)[] }>>`
 * (@convex-dev/better-auth/dist/react/index.d.ts). Ours is a different
 * instantiation — `createAuthClient({ baseURL, plugins: [convexClient(),
 * crossDomainClient()] })` in `@/lib/auth-client` — and better-auth derives the
 * whole client type from the options object, so the two deeply-inferred types
 * are structurally unrelated even though the runtime object is exactly what the
 * provider consumes. Removing the cast requires an upstream change: the prop
 * has to be widened (or the option type exported so callers can instantiate the
 * same generic).
 *
 * Until then the cast stays, but not blind. `ProviderAuthClientContract` is
 * what `ConvexBetterAuthProvider` actually calls on the client, checked with
 * `satisfies`, so a release that renames or drops any of it fails `bun run
 * typecheck` instead of silently handing the provider an incompatible object.
 * The plugin-provided members it also calls (`convex.token`,
 * `crossDomain.oneTimeToken.verify`, `updateSession`) cannot join that check:
 * better-auth does not merge plugin endpoint/action types into
 * `createAuthClient`'s return type — the same gap `getAuthHeaders()` documents
 * in `@/lib/auth-client` for `getCookie`.
 */
type ProviderAuthClientMethod = (...args: never[]) => unknown

interface ProviderAuthClientContract {
  useSession: ProviderAuthClientMethod
  getSession: ProviderAuthClientMethod
}

const convexProviderAuthClient = (
  authClient satisfies ProviderAuthClientContract
) as unknown as ConvexAuthClient

// Profile namespacing orphaned every cache entry written by an older build.
// Collect them once, off the startup critical path.
const scheduleIdle: (callback: () => void) => void =
  typeof requestIdleCallback === "function"
    ? (callback) => { requestIdleCallback(() => callback()) }
    : (callback) => { setTimeout(callback, 5000) }
scheduleIdle(() => { void sweepLegacyCacheEntriesOnce() })

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem storageKey="nemu:theme">
          <ThemeSync />
          <ConvexBetterAuthProvider
            client={convex}
            authClient={convexProviderAuthClient}
          >
            <DataServicesProvider>
              <SyncSetup />
              <SourceInstallDialog />
              <CloudflareBypassDialog />
              <AuthGateDialog />
              <RouterWithContext />
              <ToastPosition />
            </DataServicesProvider>
          </ConvexBetterAuthProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  </StrictMode>
)
