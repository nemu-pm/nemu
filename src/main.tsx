import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { RouterProvider } from "@tanstack/react-router"
import { ConvexReactClient } from "convex/react"
import { ConvexBetterAuthProvider } from "@convex-dev/better-auth/react"
import { authClient } from "@/lib/auth-client"

import "./index.css"
import { router } from "./router"
import { ErrorBoundary } from "./components/error-boundary"
import { DataProvider } from "./data/context"

const convex = new ConvexReactClient(import.meta.env.VITE_CONVEX_URL as string)

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <ConvexBetterAuthProvider client={convex} authClient={authClient}>
        <DataProvider>
          <RouterProvider router={router} />
        </DataProvider>
      </ConvexBetterAuthProvider>
    </ErrorBoundary>
  </StrictMode>
)
