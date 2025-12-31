import { useState, useMemo } from "react";
import { motion } from "motion/react";
import { useTranslation } from "react-i18next";
import { useStores, useAuth, useSyncStore } from "@/data/context";
import { parseSourceKey } from "@/data/keys";
import type { SyncStore } from "@/stores/sync";
import { languageStore } from "@/stores/language";
import { themeStore } from "@/stores/theme";
import { metadataLanguageStore, type MetadataLanguage } from "@/stores/metadata-language";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { SettingsPageSkeleton } from "@/components/page-skeletons";
import { PageHeader } from "@/components/page-header";
import {
  Tabs,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { AddSourceDialog } from "@/components/add-source-dialog";
import { SignInDialog } from "@/components/sign-in-dialog";
import { SignOutDialog } from "@/components/sign-out-dialog";
import { SourceSettings } from "@/components/source-settings";
import { PluginSettings } from "@/components/plugin-settings";
import { ClearDataDialog } from "@/components/clear-data-dialog";
import { AboutDialog } from "@/components/about-dialog";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogHeader,
  ResponsiveDialogFooter,
  ResponsiveDialogTitle,
  ResponsiveDialogDescription,
} from "@/components/ui/responsive-dialog";
import { HugeiconsIcon } from "@hugeicons/react";
import { Add01Icon, Delete02Icon, CloudIcon, Settings02Icon, Recycle03Icon, InformationCircleIcon, ArrowRight01Icon } from "@hugeicons/core-free-icons";
import { usePluginRegistry } from "@/lib/plugins";
import { hapticPress } from "@/lib/haptics";

type OAuthProvider = "google" | "apple";

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
  apple: (
    <svg className="size-4" viewBox="0 0 24 24" fill="currentColor">
      <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
    </svg>
  ),
};

export function SettingsPage() {
  const { t } = useTranslation();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const syncStore = useSyncStore() as SyncStore;
  const user = syncStore((state) => state.user);
  const oauthProvider = syncStore((state) => state.oauthProvider);
  const { useSettingsStore } = useStores();
  const {
    availableSources,
    installedSources,
    loading,
    uninstallSource,
    reloadSource,
  } = useSettingsStore();
  const currentLanguage = languageStore ? languageStore((state) => state.language) : "en";
  const currentTheme = themeStore ? themeStore((state) => state.theme) : "system";
  const currentMetadataLanguage = metadataLanguageStore ? metadataLanguageStore((state) => state.preference) : "auto";
  const [addSourceOpen, setAddSourceOpen] = useState(false);
  const [signInOpen, setSignInOpen] = useState(false);
  const [signOutOpen, setSignOutOpen] = useState(false);
  const [uninstalling, setUninstalling] = useState<string | null>(null);
  // Source settings - separate open state from data so data persists during exit animation
  const [settingsSourceOpen, setSettingsSourceOpen] = useState(false);
  const [settingsSourceData, setSettingsSourceData] = useState<{
    key: string;
    registryId: string;
    sourceId: string;
    name: string;
    icon?: string;
    version?: number;
  } | null>(null);
  const [clearMode, setClearMode] = useState<"cache" | "all" | null>(null);
  // Plugin settings - separate open state from data so data persists during exit animation
  const [settingsPluginOpen, setSettingsPluginOpen] = useState(false);
  const [settingsPluginId, setSettingsPluginId] = useState<string | null>(null);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [uninstallConfirm, setUninstallConfirm] = useState<{
    registryId: string;
    sourceId: string;
    name: string;
  } | null>(null);

  // Plugins
  const pluginsMap = usePluginRegistry((s) => s.plugins);
  const enabledState = usePluginRegistry((s) => s.enabledState);
  const setPluginEnabled = usePluginRegistry((s) => s.setEnabled);
  const plugins = useMemo(() => Array.from(pluginsMap.values()), [pluginsMap]);

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

  const handleUninstallConfirm = async () => {
    if (!uninstallConfirm) return;
    const { registryId, sourceId } = uninstallConfirm;
    setUninstalling(`${registryId}:${sourceId}`);
    try {
      await uninstallSource(registryId, sourceId);
    } finally {
      setUninstalling(null);
      setUninstallConfirm(null);
    }
  };

  const provider = oauthProvider;
  const displayName = user?.name && user.name !== user.email ? user.name : null;

  if (loading) {
    return <SettingsPageSkeleton />;
  }

  return (
    <div className="space-y-6">
      <PageHeader title={t("nav.settings")} />
      {/* Account / Cloud Sync */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <HugeiconsIcon icon={CloudIcon} className="size-5" />
            {t("settings.cloudSync")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {authLoading ? (
            <div className="flex items-center gap-3">
              <Spinner className="size-4" />
              <span className="text-sm text-muted-foreground">{t("settings.loadingAuth")}</span>
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
                {t("settings.signOut")}
              </Button>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <p className="text-sm text-muted-foreground">
                {t("settings.signInDescription")}
              </p>
              <Button size="sm" className="w-fit" onClick={() => setSignInOpen(true)}>
                {t("settings.signIn")}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Installed Sources */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle>{t("settings.installedSources")}</CardTitle>
          <Button size="sm" onClick={() => setAddSourceOpen(true)}>
            <HugeiconsIcon icon={Add01Icon} className="size-4" />
            {t("settings.addSource")}
          </Button>
        </CardHeader>
        <CardContent>
          {installedSourcesInfo.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t("settings.noSources")}
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
                      <div className="flex items-center gap-1">
                        <p className="font-medium">{source.name}</p>
                        <Badge variant="secondary">v{source.version}</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {source.registryId}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => {
                        setSettingsSourceData({
                          key: source.id,
                          registryId: source.registryId,
                          sourceId: source.sourceId,
                          name: source.name,
                          icon: source.icon,
                          version: source.version,
                        });
                        setSettingsSourceOpen(true);
                      }}
                    >
                      <HugeiconsIcon icon={Settings02Icon} className="size-4" />
                    </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => setUninstallConfirm({
                      registryId: source.registryId,
                      sourceId: source.sourceId,
                      name: source.name,
                    })}
                  >
                    <HugeiconsIcon icon={Delete02Icon} className="size-4" />
                  </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Reader Plugins */}
      <Card>
        <CardHeader>
          <CardTitle>
            {t("settings.plugins")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {plugins.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t("settings.noPlugins")}
            </p>
          ) : (
            <div className="space-y-2">
              {plugins.map((plugin) => {
                const isEnabled = enabledState[plugin.manifest.id] ?? plugin.manifest.defaultEnabled ?? true;
                const hasSettings = plugin.settingsSchema && plugin.settingsSchema.length > 0;
                return (
                  <div
                    key={plugin.manifest.id}
                    className="flex items-center justify-between rounded-lg border p-3"
                  >
                    <div className="flex items-center gap-3">
                      {plugin.manifest.icon ? (
                        plugin.manifest.icon
                      ) : (
                        <div className="size-10 rounded-md bg-muted" />
                      )}
                      <div>
                        <p className="font-medium">{plugin.manifest.name}</p>
                        {plugin.manifest.description && (
                          <p className="text-sm text-muted-foreground">
                            {plugin.manifest.description}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {hasSettings && (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => {
                            setSettingsPluginId(plugin.manifest.id);
                            setSettingsPluginOpen(true);
                          }}
                          disabled={!isEnabled}
                        >
                          <HugeiconsIcon icon={Settings02Icon} className="size-4" />
                        </Button>
                      )}
                      <Switch
                        checked={isEnabled}
                        onCheckedChange={(checked) => setPluginEnabled(plugin.manifest.id, checked)}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Appearance */}
      <Card>
        <CardHeader>
          <CardTitle>{t("settings.appearance")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <div>
              <p className="font-medium">{t("settings.language")}</p>
              <p className="text-sm text-muted-foreground">
                {t("settings.languageDescription")}
              </p>
            </div>
            <Tabs
              value={currentLanguage}
              onValueChange={(value) => {
                if (value === "en" || value === "zh" || value === "ja") {
                  languageStore?.getState().setLanguage(value);
                }
              }}
            >
              <TabsList>
                <TabsTrigger value="en">{t("settings.languageEnglish")}</TabsTrigger>
                <TabsTrigger value="zh">{t("settings.languageChinese")}</TabsTrigger>
                <TabsTrigger value="ja">{t("settings.languageJapanese")}</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
          <div className="space-y-2">
            <div>
              <p className="font-medium">{t("settings.theme")}</p>
              <p className="text-sm text-muted-foreground">
                {t("settings.themeDescription")}
              </p>
            </div>
            <Tabs
              value={currentTheme}
              onValueChange={(value) => {
                if (value === "system" || value === "light" || value === "dark") {
                  themeStore?.getState().setTheme(value);
                }
              }}
            >
              <TabsList>
                <TabsTrigger value="system">{t("settings.themeSystem")}</TabsTrigger>
                <TabsTrigger value="light">{t("settings.themeLight")}</TabsTrigger>
                <TabsTrigger value="dark">{t("settings.themeDark")}</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
          <div className="space-y-2">
            <div>
              <p className="font-medium">{t("settings.metadataLanguage")}</p>
              <p className="text-sm text-muted-foreground">
                {t("settings.metadataLanguageDescription")}
              </p>
            </div>
            <Tabs
              value={currentMetadataLanguage}
              onValueChange={(value) => {
                if (value === "auto" || value === "en" || value === "zh" || value === "ja") {
                  metadataLanguageStore?.getState().setPreference(value as MetadataLanguage);
                }
              }}
            >
              <TabsList>
                <TabsTrigger value="auto">{t("settings.metadataLanguageAuto")}</TabsTrigger>
                <TabsTrigger value="en">English</TabsTrigger>
                <TabsTrigger value="zh">中文</TabsTrigger>
                <TabsTrigger value="ja">日本語</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </CardContent>
      </Card>

      {/* Data Management */}
      <Card>
        <CardHeader>
          <CardTitle>{t("settings.dataManagement")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">{t("settings.clearCache")}</p>
              <p className="text-sm text-muted-foreground">
                {t("settings.clearCacheDescription")}
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={() => setClearMode("cache")}>
              <HugeiconsIcon icon={Recycle03Icon} className="size-4" />
              {t("settings.clear")}
            </Button>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">{t("settings.clearAllData")}</p>
              <p className="text-sm text-muted-foreground">
                {t("settings.clearAllDataDescription")}
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={() => setClearMode("all")}>
              <HugeiconsIcon icon={Delete02Icon} className="size-4" />
              {t("settings.clear")}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* About */}
      <motion.div
        whileTap={{ scale: 0.97 }}
        transition={{ type: "spring", stiffness: 400, damping: 25 }}
      >
        <Card
          className="!py-0 cursor-default hover:bg-accent/50"
          onClick={() => {
            hapticPress()
            setAboutOpen(true)
          }}
        >
          <CardContent className="flex items-center gap-3 px-4 py-2.5">
            <HugeiconsIcon icon={InformationCircleIcon} className="size-5 text-muted-foreground" />
            <span className="flex-1 font-medium text-sm">
              {t("settings.about")}{" "}
              <span
                className="text-primary"
                style={{
                  fontFamily: "'Noto Serif JP Variable', serif",
                  fontWeight: 500,
                  letterSpacing: "-0.02em",
                  fontFeatureSettings: '"palt" 1',
                }}
              >
                nemu
              </span>
            </span>
            <HugeiconsIcon icon={ArrowRight01Icon} className="size-4 text-muted-foreground" />
          </CardContent>
        </Card>
      </motion.div>

      <AddSourceDialog open={addSourceOpen} onOpenChange={setAddSourceOpen} />
      <SignInDialog open={signInOpen} onOpenChange={setSignInOpen} />
      <SignOutDialog open={signOutOpen} onOpenChange={setSignOutOpen} />
      
      <SourceSettings
        open={settingsSourceOpen}
        onOpenChange={setSettingsSourceOpen}
        sourceKey={settingsSourceData?.key ?? ""}
        sourceName={settingsSourceData?.name ?? ""}
        sourceIcon={settingsSourceData?.icon}
        sourceVersion={settingsSourceData?.version}
        reloadSource={async () => {
          if (settingsSourceData) {
            await reloadSource(settingsSourceData.registryId, settingsSourceData.sourceId);
          }
        }}
      />

      <ClearDataDialog
        open={clearMode !== null}
        onOpenChange={(open) => !open && setClearMode(null)}
        mode={clearMode ?? "cache"}
      />

      <PluginSettings
        open={settingsPluginOpen}
        onOpenChange={setSettingsPluginOpen}
        pluginId={settingsPluginId ?? ""}
      />

      <ResponsiveDialog
        open={!!uninstallConfirm}
        onOpenChange={(open) => !open && setUninstallConfirm(null)}
      >
        <ResponsiveDialogContent showCloseButton={false}>
          <ResponsiveDialogHeader>
            <ResponsiveDialogTitle>{t("settings.uninstallSource")}</ResponsiveDialogTitle>
            <ResponsiveDialogDescription>
              {t("settings.uninstallSourceDescription", { name: uninstallConfirm?.name })}
            </ResponsiveDialogDescription>
          </ResponsiveDialogHeader>
          <ResponsiveDialogFooter>
            <Button
              variant="outline"
              onClick={() => setUninstallConfirm(null)}
            >
              {t("common.cancel")}
            </Button>
            <Button
              variant="destructive"
              onClick={handleUninstallConfirm}
              disabled={uninstalling !== null}
            >
              {uninstalling ? <Spinner className="size-4" /> : t("settings.uninstall")}
            </Button>
          </ResponsiveDialogFooter>
        </ResponsiveDialogContent>
      </ResponsiveDialog>

      <AboutDialog open={aboutOpen} onOpenChange={setAboutOpen} />
    </div>
  );
}
