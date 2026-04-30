import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { authClient } from "@/lib/auth-client";
import { Capacitor } from "@capacitor/core";
import { Button } from "@/components/ui/button";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogFooter,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from "@/components/ui/responsive-dialog";
import { Spinner } from "@/components/ui/spinner";

interface SignInDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type Provider = "google" | "apple";

const providers: { id: Provider; name: string; icon: React.ReactNode }[] = [
  {
    id: "google",
    name: "Google",
    icon: (
      <svg className="size-5" viewBox="0 0 24 24">
        <path
          fill="currentColor"
          d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        />
        <path
          fill="currentColor"
          d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        />
        <path
          fill="currentColor"
          d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        />
        <path
          fill="currentColor"
          d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        />
      </svg>
    ),
  },
  {
    id: "apple",
    name: "Apple",
    icon: (
      <svg className="size-5" viewBox="0 0 24 24" fill="currentColor">
        <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
      </svg>
    ),
  },
];

export function SignInDialog({ open, onOpenChange }: SignInDialogProps) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState<Provider | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleOAuth = async (provider: Provider) => {
    setLoading(provider);
    setError(null);

    try {
      if (Capacitor.isNativePlatform()) {
        // Capacitor flow: do NOT redirect the webview off-origin (that
        // breaks the SPA shell and loses state). Ask better-auth for the
        // OAuth URL via `disableRedirect`, open it in SFSafariViewController
        // (or Android Custom Tab) via @capacitor/browser, and let the
        // `nemu://` deep link from auth callback bring us back. The deep
        // link is handled in src/lib/native-init.ts and dispatched as
        // `nemu:deep-link`, which we listen for below.
        const callbackURL = "nemu://auth/callback";
        const result = await authClient.signIn.social({
          provider,
          callbackURL,
          disableRedirect: true,
        }) as unknown as { data?: { url?: string }; error?: { message?: string } };
        const url = result?.data?.url;
        if (!url) {
          throw new Error(result?.error?.message || "Could not start OAuth flow");
        }
        const { Browser } = await import("@capacitor/browser");
        await Browser.open({ url, presentationStyle: "popover" });
        // The deep-link handler in native-init.ts closes the browser and
        // dispatches `nemu:deep-link`; the useEffect below clears loading
        // state and refreshes the session.
        return;
      }
      await authClient.signIn.social({ provider });
      // OAuth redirects, so we won't reach here
    } catch (err) {
      setError(err instanceof Error ? err.message : t("signIn.failed"));
      setLoading(null);
    }
  };

  // Receive the OAuth callback when the deep link fires (Capacitor only).
  // The crossDomain server plugin appends ?ott=<token> to the callback
  // redirect URL. We must verify this one-time token against the backend
  // before the session is available — the crossDomainClient fetch plugin
  // stores the returned session cookie in localStorage automatically.
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    const onLink = async (e: Event) => {
      const detail = (e as CustomEvent<{ url?: string }>).detail;
      if (!detail?.url) return;
      try {
        const u = new URL(detail.url);
        // Surface any error from the provider; otherwise process the token.
        const errParam = u.searchParams.get("error");
        if (errParam) {
          setError(errParam);
          setLoading(null);
          return;
        }
        // Exchange the one-time token for a session cookie.
        // The crossDomain server plugin stores session tokens as OTTs and
        // appends ?ott=<token> to the redirect URL after OAuth callback.
        // The verify endpoint returns the session and sets the cookie header
        // which crossDomainClient's fetchPlugin persists in localStorage.
        const ott = u.searchParams.get("ott");
        if (ott) {
          await authClient.$fetch("/cross-domain/one-time-token/verify", {
            method: "POST",
            body: { token: ott },
          });
        }
        // Now the crossDomainClient has the cookie; refresh session state.
        void authClient.getSession();
        setLoading(null);
        onOpenChange(false);
      } catch {
        setLoading(null);
      }
    };
    window.addEventListener("nemu:deep-link", onLink as EventListener);

    // If the user dismisses the in-app browser without completing OAuth,
    // no deep-link fires. Listen for the browser closing to clear loading.
    let browserListener: { remove(): void } | null = null;
    import("@capacitor/browser").then(async ({ Browser }) => {
      browserListener = await Browser.addListener("browserFinished", () => {
        setLoading(null);
      });
    }).catch(() => { /* @capacitor/browser not available */ });

    return () => {
      window.removeEventListener("nemu:deep-link", onLink as EventListener);
      browserListener?.remove();
    };
  }, [onOpenChange]);

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogContent className="sm:max-w-md" showCloseButton={false}>
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>{t("signIn.title")}</ResponsiveDialogTitle>
          <ResponsiveDialogDescription>
            {t("signIn.description")}
          </ResponsiveDialogDescription>
        </ResponsiveDialogHeader>

        <div className="flex flex-col gap-3 py-4">
          {providers.map((provider) => (
            <Button
              key={provider.id}
              variant="outline"
              size="lg"
              onClick={() => handleOAuth(provider.id)}
              disabled={loading !== null}
              className="w-full justify-start gap-3"
            >
              {loading === provider.id ? (
                <Spinner className="size-5" />
              ) : (
                provider.icon
              )}
              {t("signIn.continueWith", { provider: provider.name })}
            </Button>
          ))}
        </div>

        {error && (
          <p className="text-sm text-destructive text-center">{error}</p>
        )}

        <ResponsiveDialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading !== null}>
            {t("common.cancel")}
          </Button>
        </ResponsiveDialogFooter>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
