import { useState } from "react";
import { useQuery } from "convex/react";
import { authClient } from "@/lib/auth-client";
import { useStores, useAuth } from "@/data/context";
import { parseSourceKey } from "@/data/keys";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { AddSourceDialog } from "@/components/add-source-dialog";
import { SignInDialog } from "@/components/sign-in-dialog";
import { SignOutDialog } from "@/components/sign-out-dialog";
import { HugeiconsIcon } from "@hugeicons/react";
import { Add01Icon, Delete02Icon, CloudIcon } from "@hugeicons/core-free-icons";
import { api } from "../../convex/_generated/api";

type OAuthProvider = "github" | "google" | "apple";

const providerIcons: Record<OAuthProvider, React.ReactNode> = {
  google: (
    <svg className="size-4" viewBox="0 0 24 24">
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
  github: (
    <svg className="size-4" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
    </svg>
  ),
  apple: (
    <svg className="size-4" viewBox="0 0 24 24" fill="currentColor">
      <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
    </svg>
  ),
};

export function SettingsPage() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { data: session } = authClient.useSession();
  const oauthProvider = useQuery(api.auth.getOAuthProvider, isAuthenticated ? {} : "skip");
  const { useSettingsStore } = useStores();
  const {
    availableSources,
    installedSources,
    loading,
    uninstallSource,
  } = useSettingsStore();
  const [addSourceOpen, setAddSourceOpen] = useState(false);
  const [signInOpen, setSignInOpen] = useState(false);
  const [signOutOpen, setSignOutOpen] = useState(false);
  const [uninstalling, setUninstalling] = useState<string | null>(null);

  const installedSourcesInfo = installedSources.map((installed) => {
    // installed.id is composite key (registryId:sourceId)
    const { registryId, sourceId } = parseSourceKey(installed.id);
    const info = availableSources.find(
      (s) => s.id === sourceId && s.registryId === registryId
    );
    return {
      ...installed,
      sourceId,
      name: info?.name ?? sourceId,
      icon: info?.icon,
    };
  });

  const handleUninstall = async (registryId: string, sourceId: string) => {
    setUninstalling(`${registryId}:${sourceId}`);
    try {
      await uninstallSource(registryId, sourceId);
    } finally {
      setUninstalling(null);
    }
  };

  if (loading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <div className="text-center">
          <Spinner className="mx-auto mb-4 size-8" />
          <p className="text-muted-foreground">Loading settings...</p>
        </div>
      </div>
    );
  }

  const user = session?.user;
  const provider = oauthProvider as OAuthProvider | null;
  const displayName = user?.name && user.name !== user.email ? user.name : null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Settings</h1>
      </div>

      {/* Account / Cloud Sync */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <HugeiconsIcon icon={CloudIcon} className="size-5" />
            Cloud Sync
          </CardTitle>
        </CardHeader>
        <CardContent>
          {authLoading ? (
            <div className="flex items-center gap-3">
              <Spinner className="size-4" />
              <span className="text-sm text-muted-foreground">Loading...</span>
            </div>
          ) : isAuthenticated && user ? (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {provider && (
                  <div className="flex size-9 items-center justify-center rounded-full bg-muted">
                    {providerIcons[provider]}
                  </div>
                )}
                <div>
                  <p className="font-medium">{displayName ?? user.email}</p>
                  {displayName && (
                    <p className="text-sm text-muted-foreground">{user.email}</p>
                  )}
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSignOutOpen(true)}
              >
                Sign Out
              </Button>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <p className="text-sm text-muted-foreground">
                Sign in to sync your library and reading progress across devices.
              </p>
              <Button size="sm" className="w-fit" onClick={() => setSignInOpen(true)}>
                Sign In
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Installed Sources */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle>Installed Sources</CardTitle>
          <Button size="sm" onClick={() => setAddSourceOpen(true)}>
            <HugeiconsIcon icon={Add01Icon} className="size-4" />
            Add Source
          </Button>
        </CardHeader>
        <CardContent>
          {installedSourcesInfo.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No sources installed. Add a source to start reading manga.
            </p>
          ) : (
            <div className="space-y-2">
              {installedSourcesInfo.map((source) => (
                <div
                  key={source.id}
                  className="flex items-center justify-between rounded-lg border p-3"
                >
                  <div className="flex items-center gap-3">
                    {source.icon ? (
                      <img
                        src={source.icon}
                        alt=""
                        className="size-10 rounded-md object-cover"
                      />
                    ) : (
                      <div className="size-10 rounded-md bg-muted" />
                    )}
                    <div>
                      <p className="font-medium">{source.name}</p>
                      <p className="text-sm text-muted-foreground">
                        v{source.version} • {source.registryId}
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => handleUninstall(source.registryId, source.sourceId)}
                    disabled={uninstalling === source.id}
                  >
                    {uninstalling === source.id ? (
                      <Spinner className="size-4" />
                    ) : (
                      <HugeiconsIcon icon={Delete02Icon} className="size-4" />
                    )}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <AddSourceDialog open={addSourceOpen} onOpenChange={setAddSourceOpen} />
      <SignInDialog open={signInOpen} onOpenChange={setSignInOpen} />
      <SignOutDialog open={signOutOpen} onOpenChange={setSignOutOpen} />
    </div>
  );
}
