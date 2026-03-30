/* @refresh skip */
import { StrictMode, useEffect, useState, useMemo, memo } from "react"
import { createRoot } from "react-dom/client"
import { RouterProvider } from "@tanstack/react-router"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { ConvexReactClient } from "convex/react"
import { ConvexBetterAuthProvider } from "@convex-dev/better-auth/react"
import { ThemeProvider, useTheme } from "next-themes"
import { authClient } from "@/lib/auth-client"
import { themeStore } from "@/stores/theme"

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

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem storageKey="nemu:theme">
          <ThemeSync />
          <ConvexBetterAuthProvider client={convex} authClient={authClient}>
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
