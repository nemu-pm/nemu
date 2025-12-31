import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useStores } from "@/data/context";
import { parseSourceKey } from "@/data/keys";
import { languageStore } from "@/stores/language";
import { groupSourcesByLanguage } from "@/lib/sources/language-priority";
import { AddSourceDialog } from "@/components/add-source-dialog";
import { BrowsePageSkeleton } from "@/components/page-skeletons";
import { PageHeader } from "@/components/page-header";
import { NoSourcesEmpty } from "@/components/no-sources-empty";
import { HugeiconsIcon } from "@hugeicons/react";
import { Add01Icon, Globe02Icon } from "@hugeicons/core-free-icons";
import { hapticPress } from "@/lib/haptics";

type SourceInfo = {
  id: string;
  registryId: string;
  rawSourceId: string;
  name: string;
  icon?: string;
  languages?: string[];
};

function formatSectionLabel(
  langCode: string,
  t: (key: string) => string,
  appLanguage: string | undefined
): string {
  if (langCode === "other") {
    return t("browse.otherLanguages") || "Other";
  }
  
  // Try i18n first (languages.en, languages.ja, languages.multi, etc.)
  const i18nKey = `languages.${langCode}`;
  const translated = t(i18nKey);
  if (translated && translated !== i18nKey) {
    return translated;
  }
  
  // Fallback to Intl.DisplayNames
  const displayLang = appLanguage || "en";
  try {
    const displayName = new Intl.DisplayNames([displayLang], {
      type: "language",
    }).of(langCode);
    if (displayName) {
      return displayName.charAt(0).toUpperCase() + displayName.slice(1);
    }
  } catch {
    // fallback
  }
  return langCode.toUpperCase();
}

export function BrowsePage() {
  const { t } = useTranslation();
  const { useSettingsStore } = useStores();
  const { availableSources, installedSources, loading } = useSettingsStore();
  const appLanguage = languageStore ? languageStore((state) => state.language) : undefined;
  const [addSourceOpen, setAddSourceOpen] = useState(false);

  const installedSourcesInfo: SourceInfo[] = useMemo(() => {
    return installedSources.map((installed) => {
      const { registryId, sourceId } = parseSourceKey(installed.id);
      const info = availableSources.find(
        (s) => s.id === sourceId && s.registryId === registryId
      );
      return {
        ...installed,
        rawSourceId: sourceId,
        name: info?.name ?? sourceId,
        icon: info?.icon,
        languages: info?.languages,
      };
    });
  }, [installedSources, availableSources]);

  const groupedSources = useMemo(() => {
    return groupSourcesByLanguage(installedSourcesInfo, appLanguage);
  }, [installedSourcesInfo, appLanguage]);

  if (loading) {
    return <BrowsePageSkeleton />;
  }

  // Empty state: no sources installed
  if (installedSourcesInfo.length === 0) {
    return (
      <NoSourcesEmpty
        icon={Globe02Icon}
        titleKey="browse.noSources"
        descriptionKey="browse.noSourcesDescription"
        buttonKey="browse.addSource"
      />
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("nav.browse")}
        action={{
          label: t("browse.addSource"),
          icon: <HugeiconsIcon icon={Add01Icon} className="size-4" />,
          onClick: () => setAddSourceOpen(true),
        }}
      />

      <div className="space-y-6">
        {groupedSources.map((section) => (
          <section key={section.label}>
            <h2 className="mb-3 text-sm font-medium text-muted-foreground">
              {formatSectionLabel(section.label, t, appLanguage)}
            </h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {section.sources.map((source) => (
                <Link
                  key={source.id}
                  to="/browse/$registryId/$sourceId"
                  params={{
                    registryId: source.registryId,
                    sourceId: source.rawSourceId,
                  }}
                  className="source-card"
                  onClick={hapticPress}
                >
                  <div className="source-card-icon">
                    {source.icon ? (
                      <img src={source.icon} alt="" />
                    ) : (
                      <HugeiconsIcon icon={Globe02Icon} className="size-6 text-muted-foreground" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="source-card-title">{source.name}</p>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>

      <AddSourceDialog open={addSourceOpen} onOpenChange={setAddSourceOpen} />
    </div>
  );
}

