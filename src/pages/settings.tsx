import { useState } from "react";
import { useConvexAuth } from "convex/react";
import { authClient } from "@/lib/auth-client";
import { useStores } from "@/data/context";
import { parseSourceKey } from "@/data/keys";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { AddSourceDialog } from "@/components/add-source-dialog";
import { SignInDialog } from "@/components/sign-in-dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { HugeiconsIcon } from "@hugeicons/react";
import { Add01Icon, Delete02Icon, CloudIcon } from "@hugeicons/core-free-icons";

export function SettingsPage() {
  const { isAuthenticated, isLoading: authLoading } = useConvexAuth();
  const { data: session } = authClient.useSession();
  const { useSettingsStore } = useStores();
  const {
    availableSources,
    installedSources,
    loading,
    uninstallSource,
  } = useSettingsStore();
  const [addSourceOpen, setAddSourceOpen] = useState(false);
  const [signInOpen, setSignInOpen] = useState(false);
  const [uninstalling, setUninstalling] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);

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

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      await authClient.signOut();
    } finally {
      setSigningOut(false);
    }
  };

  const user = session?.user;
  const initials = user?.name
    ? user.name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : user?.email?.[0]?.toUpperCase() ?? "?";

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
                <Avatar>
                  {user.image && <AvatarImage src={user.image} alt={user.name ?? "User"} />}
                  <AvatarFallback>{initials}</AvatarFallback>
                </Avatar>
                <div>
                  {user.name && <p className="font-medium">{user.name}</p>}
                  <p className="text-sm text-muted-foreground">{user.email}</p>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleSignOut}
                disabled={signingOut}
              >
                {signingOut ? <Spinner className="size-4" /> : "Sign Out"}
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
    </div>
  );
}
