import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useStores } from "@/data/context";
import { Keys, parseSourceKey } from "@/data/keys";
import { languageStore, type Language } from "@/stores/language";
import { formatLanguageDisplay } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Checkbox } from "@/components/ui/checkbox";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogHeader,
  ResponsiveDialogFooter,
  ResponsiveDialogTitle,
  ResponsiveDialogDescription,
} from "@/components/ui/responsive-dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

// Stylized nemu logo with custom font rendering
function NemuLogo({ className }: { className?: string }) {
  return (
    <span 
      className={className}
      style={{
        fontFamily: "'Noto Serif JP Variable', serif",
        fontWeight: 500,
        letterSpacing: "-0.02em",
        fontFeatureSettings: '"palt" 1',
      }}
    >
      nemu
    </span>
  );
}

// Welcome header with app icon
function WelcomeHeader() {
  return (
    <div className="relative flex items-center justify-center py-6">
      {/* App icon with subtle glow - matches about dialog */}
      <div className="relative group">
        {/* Soft ambient glow */}
        <div className="absolute inset-0 rounded-2xl bg-[#6b8cce]/30 blur-2xl scale-125" />

        {/* Icon container - cute squish animation on press */}
        <div
          className="relative size-20 rounded-2xl overflow-hidden shadow-lg ring-1 ring-white/10 transition-all duration-300 [transition-timing-function:cubic-bezier(0.34,1.56,0.64,1)] active:scale-[0.82] active:rotate-[-4deg] cursor-pointer select-none"
        >
          <img
            src="/icon.jpg"
            alt="nemu"
            className="size-full object-cover pointer-events-none"
          />
        </div>
      </div>
    </div>
  );
}

const WELCOME_COMPLETED_KEY = "nemu:welcome-completed";

type Step = "welcome" | "language" | "sources" | "done";

interface RecommendedSourceRef {
  registryId: string;
  sourceId: string;
}

const ENGLISH_SOURCES: RecommendedSourceRef[] = [
  { registryId: "aidoku-community", sourceId: "multi.mangaplus" },
  { registryId: "aidoku-community", sourceId: "multi.mangadex" },
  { registryId: "aidoku-community", sourceId: "ja.shonenjumpplus" },
];

const CHINESE_SOURCES: RecommendedSourceRef[] = [
  { registryId: "aidoku-zh", sourceId: "zh.manhuaren" },
  { registryId: "aidoku-community", sourceId: "zh.copymanga" },
  { registryId: "aidoku-community", sourceId: "ja.shonenjumpplus" },
];

const JAPANESE_SOURCES: RecommendedSourceRef[] = [
  { registryId: "aidoku-community", sourceId: "ja.shonenjumpplus" },
  { registryId: "aidoku-community", sourceId: "multi.mangaplus" },
  { registryId: "aidoku-community", sourceId: "multi.mangadex" },
];

export function useWelcomeWizard() {
  const [shouldShow, setShouldShow] = useState(false);

  useEffect(() => {
    try {
      const completed = localStorage.getItem(WELCOME_COMPLETED_KEY);
      if (!completed) {
        setShouldShow(true);
      }
    } catch {
      // localStorage not available
    }
  }, []);

  const markCompleted = useCallback(() => {
    try {
      localStorage.setItem(WELCOME_COMPLETED_KEY, "true");
    } catch {
      // Ignore
    }
    setShouldShow(false);
  }, []);

  return { shouldShow, markCompleted };
}

interface WelcomeWizardProps {
  open: boolean;
  onComplete: () => void;
}

export function WelcomeWizard({ open, onComplete }: WelcomeWizardProps) {
  const { t, i18n } = useTranslation();
  const { useSettingsStore } = useStores();
  const { installSource, availableSources, loading: sourcesLoading } = useSettingsStore();
  
  const [step, setStep] = useState<Step>("welcome");
  const [selectedLanguage, setSelectedLanguage] = useState<Language>(
    () => languageStore?.getState().language ?? "en"
  );
  const [selectedSources, setSelectedSources] = useState<Set<string>>(new Set());
  const [installing, setInstalling] = useState(false);
  const [skipConfirm, setSkipConfirm] = useState(false);

  // Initialize selected sources based on language
  useEffect(() => {
    const sources = selectedLanguage === "zh" ? CHINESE_SOURCES 
      : selectedLanguage === "ja" ? JAPANESE_SOURCES 
      : ENGLISH_SOURCES;
    setSelectedSources(new Set(sources.map((s) => Keys.source(s.registryId, s.sourceId))));
  }, [selectedLanguage]);

  const recommendedSourceRefs = selectedLanguage === "zh" ? CHINESE_SOURCES 
    : selectedLanguage === "ja" ? JAPANESE_SOURCES 
    : ENGLISH_SOURCES;

  // Get enriched source info from availableSources
  const getSourceInfo = (ref: RecommendedSourceRef) => {
    return availableSources.find(
      s => s.registryId === ref.registryId && s.id === ref.sourceId
    );
  };

  const handleLanguageChange = (lang: Language) => {
    setSelectedLanguage(lang);
    languageStore?.getState().setLanguage(lang);
    i18n.changeLanguage(lang);
  };

  const toggleSource = (key: string) => {
    setSelectedSources(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const formatLang = (languages: string[] | undefined) => {
    return formatLanguageDisplay(languages, t, selectedLanguage);
  };

  const handleInstallSources = async () => {
    if (selectedSources.size === 0) {
      setStep("done");
      return;
    }

    setInstalling(true);
    try {
      for (const key of selectedSources) {
        const { registryId, sourceId } = parseSourceKey(key);
        // Check if already installed
        const isInstalled = availableSources.find(
          s => s.registryId === registryId && s.id === sourceId
        )?.installed;
        
        if (!isInstalled) {
          try {
            await installSource(registryId, sourceId);
          } catch (e) {
            console.error(`Failed to install ${key}:`, e);
          }
        }
      }
    } finally {
      setInstalling(false);
      setStep("done");
    }
  };

  const handleNext = () => {
    switch (step) {
      case "welcome":
        setStep("language");
        break;
      case "language":
        setStep("sources");
        break;
      case "sources":
        handleInstallSources();
        break;
      case "done":
        onComplete();
        break;
    }
  };

  const handleSkip = () => {
    if (skipConfirm) {
      onComplete();
    } else {
      setSkipConfirm(true);
    }
  };

  return (
    <ResponsiveDialog open={open} dismissible={false}>
      <ResponsiveDialogContent className="sm:max-w-md">
        {step === "welcome" && (
          <>
            <WelcomeHeader />
            <ResponsiveDialogHeader className="text-center">
              <ResponsiveDialogTitle className="text-2xl">
                {t("welcome.titlePrefix")}<NemuLogo className="text-primary" />
              </ResponsiveDialogTitle>
              <ResponsiveDialogDescription>
                {t("welcome.description")}
              </ResponsiveDialogDescription>
            </ResponsiveDialogHeader>
            <div className="py-2">
              <p className="text-sm text-muted-foreground text-center">
                {t("welcome.intro")}
              </p>
            </div>
            <ResponsiveDialogFooter>
              <Button variant="ghost" onClick={handleSkip}>
                {skipConfirm ? t("welcome.confirmSkip") : t("welcome.skip")}
              </Button>
              <Button onClick={handleNext}>
                {t("welcome.getStarted")}
              </Button>
            </ResponsiveDialogFooter>
          </>
        )}

        {step === "language" && (
          <>
            <ResponsiveDialogHeader>
              <ResponsiveDialogTitle>
                {t("welcome.languageTitle")}
              </ResponsiveDialogTitle>
              <ResponsiveDialogDescription>
                {t("welcome.languageDescription")}
              </ResponsiveDialogDescription>
            </ResponsiveDialogHeader>
            <div className="py-2">
              <Tabs value={selectedLanguage} onValueChange={(v) => handleLanguageChange(v as Language)}>
                <TabsList className="w-full">
                  <TabsTrigger value="en" className="flex-1">English</TabsTrigger>
                  <TabsTrigger value="zh" className="flex-1">中文</TabsTrigger>
                  <TabsTrigger value="ja" className="flex-1">日本語</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
            <ResponsiveDialogFooter>
              <Button variant="ghost" onClick={handleSkip}>
                {skipConfirm ? t("welcome.confirmSkip") : t("welcome.skip")}
              </Button>
              <Button onClick={handleNext}>
                {t("common.next")}
              </Button>
            </ResponsiveDialogFooter>
          </>
        )}

        {step === "sources" && (
          <>
            <ResponsiveDialogHeader>
              <ResponsiveDialogTitle>
                {t("welcome.sourcesTitle")}
              </ResponsiveDialogTitle>
              <ResponsiveDialogDescription>
                {t("welcome.sourcesDescription")}
              </ResponsiveDialogDescription>
            </ResponsiveDialogHeader>
            <div className="space-y-2 py-2">
              {sourcesLoading || availableSources.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 gap-3">
                  <Spinner className="size-6" />
                  <p className="text-sm text-muted-foreground">{t("welcome.loadingSources")}</p>
                </div>
              ) : (
                <>
                  {recommendedSourceRefs.map((ref) => {
                    const key = `${ref.registryId}:${ref.sourceId}`;
                    const isSelected = selectedSources.has(key);
                    const info = getSourceInfo(ref);
                    if (!info) return null; // Source not found in registry
                    return (
                      <label
                        key={key}
                        className="flex items-center justify-between rounded-lg border p-3 cursor-pointer hover:bg-muted/50 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={() => toggleSource(key)}
                          />
                          {info.icon ? (
                            <img
                              src={info.icon}
                              alt=""
                              className="size-8 rounded-md object-cover"
                            />
                          ) : (
                            <div className="size-8 rounded-md bg-muted" />
                          )}
                          <div>
                            <p className="text-sm font-medium">{info.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {formatLang(info.languages)}
                            </p>
                          </div>
                        </div>
                      </label>
                    );
                  })}
                  <p className="text-xs text-muted-foreground pt-2">
                    {t("welcome.sourcesHint")}
                  </p>
                </>
              )}
            </div>
            <ResponsiveDialogFooter>
              <Button variant="ghost" onClick={handleSkip}>
                {skipConfirm ? t("welcome.confirmSkip") : t("welcome.skip")}
              </Button>
              <Button 
                onClick={handleNext} 
                disabled={installing || sourcesLoading || availableSources.length === 0}
              >
                {installing ? (
                  <>
                    <Spinner className="size-4" />
                    {t("welcome.installing")}
                  </>
                ) : (
                  t("welcome.installAndContinue")
                )}
              </Button>
            </ResponsiveDialogFooter>
          </>
        )}

        {step === "done" && (
          <>
            <ResponsiveDialogHeader>
              <ResponsiveDialogTitle>
                {t("welcome.doneTitle")}
              </ResponsiveDialogTitle>
              <ResponsiveDialogDescription>
                {t("welcome.doneDescription")}
              </ResponsiveDialogDescription>
            </ResponsiveDialogHeader>
            <div className="space-y-4 py-2">
              <p className="text-sm text-muted-foreground">
                {t("welcome.syncHint")}
              </p>
            </div>
            <ResponsiveDialogFooter>
              <Button onClick={handleNext} className="w-full sm:w-auto">
                {t("welcome.startReading")}
              </Button>
            </ResponsiveDialogFooter>
          </>
        )}
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}

