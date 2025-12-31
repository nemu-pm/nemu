/**
 * Smart Match Drawer
 *
 * New flow:
 * 1. Auto-search all providers on open (results stored)
 * 2. If exact matches found → per-field selection UI
 * 3. If no matches → manual search (results already loaded)
 * 4. Manual selection → adds to exact matches → same merge UI
 */

import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useAction } from "convex/react";
import { api } from "../../convex/_generated/api";
import {
  ResponsiveDialogNested,
  ResponsiveDialogContent,
  ResponsiveDialogHeader,
  ResponsiveDialogFooter,
  ResponsiveDialogTitle,
} from "@/components/ui/responsive-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { CoverImage } from "@/components/cover-image";
import { MangaStatusBadge } from "@/components/manga-status-badge";
import { Spinner } from "@/components/ui/spinner";
import { ExpandableText } from "@/components/ui/expandable-text";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Search01Icon,
  CheckmarkCircle02Icon,
  SparklesIcon,
} from "@hugeicons/core-free-icons";
import { cn } from "@/lib/utils";
import {
  useSmartMatchStore,
  searchAllProviders,
  searchProviders,
  findExactMatches,
  isTextInLanguage,
  areAuthorsInLanguage,
  getAITabsNeeded,
  fetchChineseTitleFromGemini,
  fetchLocalizedDescription,
  type Provider,
  type ProviderSearchResult,
  type MetadataField,
  type ExactMatch,
  type AIField,
  type EffectiveLanguage,
  type GeminiFunctions,
} from "@/lib/metadata";
import { SELECTION_NO_CHANGE, SELECTION_AI, type SelectionProvider } from "@/lib/metadata/types";
import { translateTags } from "@/lib/metadata/translations";
import { metadataLanguageStore, getEffectiveMetadataLanguage } from "@/stores/metadata-language";
import { languageStore } from "@/stores/language";
import type { MangaMetadata, ExternalIds } from "@/data/schema";
import * as OpenCC from "opencc-js";

// Traditional → Simplified Chinese converter
const t2sConverter = OpenCC.Converter({ from: "tw", to: "cn" });

export interface MatchedMetadata {
  metadata: MangaMetadata;
  externalIds: ExternalIds;
}

interface MetadataMatchDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialQuery: string;
  currentMetadata: MangaMetadata;
  authors?: string[];
  onSelect: (match: MatchedMetadata) => void;
}

type ViewMode = "searching" | "merge" | "manual";

// Field display order - cover first, then matches edit dialog order
const FIELD_ORDER: MetadataField[] = ["cover", "title", "status", "authors", "description", "tags"];

const FIELD_LABELS: Record<MetadataField, string> = {
  title: "metadata.title",
  cover: "metadata.cover",
  description: "metadata.description",
  status: "metadata.status",
  authors: "metadata.authors",
  tags: "metadata.tags",
};

const PROVIDER_FULL_NAMES: Record<Provider, string> = {
  mangaupdates: "MangaUpdates",
  anilist: "AniList",
  mal: "MyAnimeList",
};

// Short names for merge field tabs (to save space)
const PROVIDER_SHORT_NAMES: Record<Provider, string> = {
  mangaupdates: "MU",
  anilist: "AniList",
  mal: "MAL",
};

// =============================================================================
// Cover Selection - Show all covers side by side
// =============================================================================

interface CoverSelectionProps {
  currentValue: string;
  t: (key: string) => string;
}

function CoverSelection({ currentValue, t }: CoverSelectionProps) {
  const selection = useSmartMatchStore(s => s.fieldSelections.get("cover"));
  const selectFieldProvider = useSmartMatchStore(s => s.selectFieldProvider);
  
  if (!selection || selection.options.length === 0) {
    return null;
  }
  
  const selectedProvider = selection.selectedProvider;
  
  return (
    <div className="space-y-2">
      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
        {t(FIELD_LABELS.cover)}
      </span>
      
      <div className="flex gap-3 overflow-x-auto pt-1 pb-2">
        {/* No Change option - always show */}
        <button
          onClick={() => selectFieldProvider("cover", SELECTION_NO_CHANGE)}
          className={cn(
            "shrink-0 space-y-1.5 transition-opacity",
            selectedProvider === SELECTION_NO_CHANGE ? "opacity-100" : "opacity-50 hover:opacity-75"
          )}
        >
          {currentValue ? (
            <CoverImage
              src={currentValue}
              alt={t("common.noChange")}
              className={cn(
                "w-24 sm:w-32 aspect-[2/3] rounded-lg object-cover transition-all",
                selectedProvider === SELECTION_NO_CHANGE && "outline outline-2 outline-primary -outline-offset-2"
              )}
            />
          ) : (
            <div className={cn(
              "w-24 sm:w-32 aspect-[2/3] rounded-lg bg-muted/50 flex items-center justify-center transition-all",
              selectedProvider === SELECTION_NO_CHANGE && "outline outline-2 outline-primary -outline-offset-2"
            )}>
              <span className="text-xs text-muted-foreground">{t("common.none")}</span>
            </div>
          )}
          <p className={cn(
            "text-xs text-center",
            selectedProvider === SELECTION_NO_CHANGE ? "text-primary font-medium" : "text-muted-foreground"
          )}>
            {t("common.noChange")}
          </p>
        </button>
        
        {/* Provider covers */}
        {selection.options.map((option) => (
          <button
            key={option.provider}
            onClick={() => selectFieldProvider("cover", option.provider)}
            className={cn(
              "shrink-0 space-y-1.5 transition-opacity",
              selectedProvider === option.provider ? "opacity-100" : "opacity-50 hover:opacity-75"
            )}
          >
            <CoverImage
              src={option.displayValue}
              alt={PROVIDER_FULL_NAMES[option.provider]}
              className={cn(
                "w-24 sm:w-32 aspect-[2/3] rounded-lg object-cover transition-all",
                selectedProvider === option.provider && "outline outline-2 outline-primary -outline-offset-2"
              )}
            />
            <p className={cn(
              "text-xs text-center",
              selectedProvider === option.provider ? "text-primary font-medium" : "text-muted-foreground"
            )}>
              {PROVIDER_FULL_NAMES[option.provider]}
            </p>
          </button>
        ))}
      </div>
    </div>
  );
}

// =============================================================================
// Merge Field Row - Provider tabs show localized values directly
// =============================================================================

interface MergeFieldRowProps {
  field: MetadataField;
  currentValue: string;
  /** For status field - the raw status number */
  currentStatus?: number;
  t: (key: string) => string;
  /** Effective metadata language (en/ja/zh) */
  effectiveLang: EffectiveLanguage;
}

/** Display tags/authors with glassmorphic pill style */
function TagPills({ values, className }: { values: string[]; className?: string }) {
  if (values.length === 0) return null;
  return (
    <div className={cn("flex flex-wrap gap-1.5", className)}>
      {values.map((value, i) => (
        <span key={i} className="tag-nemu">
          {value}
        </span>
      ))}
    </div>
  );
}

/** Render the appropriate content for a field value */
function FieldContent({
  field,
  value,
  rawValue,
  loading,
  expanded,
  setExpanded,
  t,
}: {
  field: MetadataField;
  value: string;
  rawValue: unknown;
  loading?: boolean;
  expanded: boolean;
  setExpanded: (v: boolean) => void;
  t: (key: string) => string;
}) {
  if (loading) {
    return (
      <div className="rounded-lg bg-muted/30 px-3 py-4 flex items-center justify-center">
        <Spinner className="size-5" />
      </div>
    );
  }

  // Status - use MangaStatusBadge
  if (field === "status" && typeof rawValue === "number") {
    return (
      <div className="rounded-lg bg-muted/30 px-3 py-2.5">
        <MangaStatusBadge status={rawValue} className="text-[11px] px-2.5 py-1" />
      </div>
    );
  }

  // Tags/Authors - use pill display
  if (field === "tags" || field === "authors") {
    const items = value.split(", ").filter(Boolean);
    if (items.length === 0) {
      return (
        <div className="rounded-lg bg-muted/30 px-3 py-2">
          <p className="text-sm text-muted-foreground">{t("common.none")}</p>
        </div>
      );
    }
    return (
      <div className="rounded-lg bg-muted/30 px-3 py-2.5">
        <TagPills values={items} />
      </div>
    );
  }

  // Description - with expand/collapse and proper whitespace
  if (field === "description") {
    return (
      <ExpandableText
        value={value}
        lines={3}
        expanded={expanded}
        onExpandedChange={setExpanded}
        containerClassName="rounded-lg bg-muted/30 p-3"
        textClassName="text-sm leading-relaxed whitespace-pre-wrap"
      />
    );
  }

  // Default text display
  return (
    <div className="rounded-lg bg-muted/30 px-3 py-2">
      <p className="text-sm">{value}</p>
    </div>
  );
}

function MergeFieldRow({ field, currentValue, currentStatus, t, effectiveLang }: MergeFieldRowProps) {
  const selection = useSmartMatchStore(s => s.fieldSelections.get(field));
  const aiData = useSmartMatchStore(s => s.aiData);
  const selectFieldProvider = useSmartMatchStore(s => s.selectFieldProvider);
  const [expanded, setExpanded] = useState(false);
  
  // Skip cover - handled separately
  if (field === "cover") return null;
  
  if (!selection || selection.options.length === 0) {
    return null;
  }
  
  const selectedProvider = selection.selectedProvider;
  const isStatus = field === "status";
  const isTags = field === "tags";
  
  // Build tab options: No Change + Provider values + AI tab (description only, or Chinese title fallback)
  const tabOptions: { id: string; label: string; value: string; rawValue: unknown; loading?: boolean }[] = [];
  
  // Always add "No Change" option
  tabOptions.push({
    id: SELECTION_NO_CHANGE,
    label: t("common.noChange"),
    value: currentValue || t("common.none"),
    rawValue: isStatus ? currentStatus : currentValue,
  });
  
  // Add provider options (already localized from store)
  for (const option of selection.options) {
    let displayVal = option.displayValue;
    // For tags, translate if not English
    if (isTags && effectiveLang !== "en" && Array.isArray(option.value)) {
      displayVal = translateTags(option.value, effectiveLang).join(", ");
    }
    // For title/description in Chinese mode, convert Traditional → Simplified
    if ((field === "title" || field === "description") && effectiveLang === "zh" && displayVal) {
      displayVal = t2sConverter(displayVal);
    }
    tabOptions.push({
      id: option.provider,
      label: PROVIDER_SHORT_NAMES[option.provider],
      value: displayVal,
      rawValue: option.value,
    });
  }
  
  // Add AI tab for:
  // - description (always for non-English)
  // - title (only for Chinese when no provider has it)
  const showAITab = effectiveLang !== "en" && (
    field === "description" ||
    (field === "title" && effectiveLang === "zh")
  );
  
  if (showAITab) {
    const aiField: AIField = field === "title" ? "chineseTitle" : "description";
    const data = aiData.get(aiField);
    
    // Only show AI tab if loading or has value
    if (data?.loading || data?.value) {
      // Convert Traditional → Simplified for Chinese mode
      const aiValue = (effectiveLang === "zh" && data.value) ? t2sConverter(data.value) : (data.value || "");
      tabOptions.push({
        id: SELECTION_AI,
        label: "✨ AI",
        value: aiValue,
        rawValue: data.value,
        loading: data.loading,
      });
    }
  }
  
  if (tabOptions.length === 0) return null;
  
  // Current tab value - must be a valid tab option
  const validTabIds = new Set(tabOptions.map(o => o.id));
  const currentTabValue: string = 
    selectedProvider && validTabIds.has(selectedProvider) 
      ? selectedProvider 
      : (tabOptions[0]?.id || SELECTION_NO_CHANGE);
  
  return (
    <div className="space-y-2">
      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
        {t(FIELD_LABELS[field])}
      </span>
      
      <Tabs
        value={currentTabValue}
        onValueChange={(v) => selectFieldProvider(field, v as SelectionProvider)}
      >
        <TabsList className="w-full h-8 flex-wrap">
          {tabOptions.map((opt) => (
            <TabsTrigger
              key={opt.id}
              value={opt.id}
              className="flex-1 text-xs h-7 min-w-0 gap-1"
            >
              {opt.loading && <Spinner className="size-3" />}
              <span className="truncate">{opt.label}</span>
            </TabsTrigger>
          ))}
        </TabsList>
        
        {tabOptions.map((opt) => (
          <TabsContent key={opt.id} value={opt.id} className="mt-2">
            <FieldContent
              field={field}
              value={opt.value}
              rawValue={opt.rawValue}
              loading={opt.loading}
              expanded={expanded}
              setExpanded={setExpanded}
              t={t}
            />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

// =============================================================================
// Manual Search Result Card - Clean selected state
// =============================================================================

interface SearchResultCardProps {
  result: ProviderSearchResult;
  isSelected: boolean;
  onSelect: () => void;
}

function SearchResultCard({ result, isSelected, onSelect }: SearchResultCardProps) {
  return (
    <button
      onClick={onSelect}
      className={cn(
        "w-full flex gap-3 p-3 rounded-xl text-left transition-all duration-150",
        isSelected
          ? "bg-primary/15"
          : "bg-muted/30 hover:bg-muted/50"
      )}
    >
      <div className="relative shrink-0">
        <CoverImage
          src={result.coverUrl}
          alt={result.title}
          className="w-14 h-20 rounded-lg object-cover"
        />
        {isSelected && (
          <div className="absolute -top-1 -right-1 size-5 bg-primary rounded-full flex items-center justify-center shadow-md">
            <HugeiconsIcon icon={CheckmarkCircle02Icon} className="size-3.5 text-primary-foreground" />
          </div>
        )}
      </div>
      
      <div className="flex-1 min-w-0 space-y-1.5">
        <h4 className={cn(
          "font-medium line-clamp-2 text-sm leading-tight",
          isSelected && "text-primary"
        )}>
          {result.title}
        </h4>
        <div className="flex items-center gap-1.5 flex-wrap">
          <MangaStatusBadge 
            status={result.metadata.status} 
            className="text-[9px] px-2 py-0.5 gap-1.5 [&>span:first-child]:h-1.5 [&>span:first-child]:w-1.5"
          />
          {result.metadata.authors?.slice(0, 1).map((author, i) => (
            <span key={i} className="text-[10px] text-muted-foreground">
              {author}
            </span>
          ))}
        </div>
        {result.metadata.description && (
          <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
            {result.metadata.description.slice(0, 120)}
          </p>
        )}
      </div>
    </button>
  );
}

// =============================================================================
// Main Component
// =============================================================================

export function MetadataMatchDrawer({
  open,
  onOpenChange,
  initialQuery,
  currentMetadata,
  authors,
  onSelect,
}: MetadataMatchDrawerProps) {
  const { t } = useTranslation();
  
  // AI actions
  const findJapaneseTitle = useAction(api.ai_metadata.findJapaneseTitle);
  const findChineseTitle = useAction(api.ai_metadata.findChineseTitle);
  const findJapaneseDescription = useAction(api.ai_metadata.findJapaneseDescription);
  const findChineseDescription = useAction(api.ai_metadata.findChineseDescription);
  
  // Metadata language preference
  const metadataLangPref = metadataLanguageStore?.((s) => s.preference) ?? "auto";
  const appLang = languageStore?.((s) => s.language) ?? "en";
  const effectiveLang = getEffectiveMetadataLanguage(metadataLangPref, appLang);
  
  // Get stable store actions (these don't change)
  const storeReset = useSmartMatchStore(s => s.reset);
  const storeSetPhase = useSmartMatchStore(s => s.setPhase);
  const storeSetLastSearchQuery = useSmartMatchStore(s => s.setLastSearchQuery);
  const storeSetExactMatches = useSmartMatchStore(s => s.setExactMatches);
  const storeSetError = useSmartMatchStore(s => s.setError);
  const storeGetMergedMetadata = useSmartMatchStore(s => s.getMergedMetadata);
  const storeSetAIData = useSmartMatchStore(s => s.setAIData);
  const storeInitAIDataLoading = useSmartMatchStore(s => s.initAIDataLoading);
  const storeSelectFieldProvider = useSmartMatchStore(s => s.selectFieldProvider);
  
  // Get reactive state
  const phaseMessage = useSmartMatchStore(s => s.phaseMessage);
  const lastSearchQuery = useSmartMatchStore(s => s.lastSearchQuery);
  const exactMatches = useSmartMatchStore(s => s.exactMatches);
  const fieldSelections = useSmartMatchStore(s => s.fieldSelections);
  const results = useSmartMatchStore(s => s.results);
  
  // Derived reactive values
  const hasAnyResults = results.size > 0 && Array.from(results.values()).some(r => r.length > 0);
  const hasExactMatches = exactMatches.length > 0;
  // Truncate to max 10 results per provider
  const muResults = (results.get("mangaupdates") || []).slice(0, 10);
  const alResults = (results.get("anilist") || []).slice(0, 10);
  const malResults = (results.get("mal") || []).slice(0, 10);
  
  const [viewMode, setViewMode] = useState<ViewMode>("searching");
  const [manualTab, setManualTab] = useState<Provider>("mangaupdates");
  const [manualSelected, setManualSelected] = useState<ProviderSearchResult | null>(null);
  const [manualQuery, setManualQuery] = useState(initialQuery);
  const [isSearching, setIsSearching] = useState(false);
  const hasSearchedRef = useRef(false);
  
  // Get current field values for display
  const currentValues = useMemo(() => ({
    title: currentMetadata.title || "",
    cover: currentMetadata.cover || "",
    description: currentMetadata.description || "",
    status: "", // Status uses MangaStatusBadge, not text
    authors: currentMetadata.authors?.join(", ") || "",
    tags: currentMetadata.tags?.join(", ") || "",
  }), [currentMetadata]);
  
  // Reset on open
  useEffect(() => {
    if (open) {
      storeReset();
      setViewMode("searching");
      setManualSelected(null);
      setManualQuery(initialQuery);
      hasSearchedRef.current = false;
    }
  }, [open, initialQuery, storeReset]);
  
  // Update manual query to last search query
  useEffect(() => {
    if (lastSearchQuery) {
      setManualQuery(lastSearchQuery);
    }
  }, [lastSearchQuery]);
  
  // Check if current metadata is already in the target language
  const currentAlreadyLocalized = useMemo(() => ({
    title: isTextInLanguage(currentMetadata.title, effectiveLang),
    authors: areAuthorsInLanguage(currentMetadata.authors, effectiveLang),
    description: isTextInLanguage(currentMetadata.description, effectiveLang),
  }), [currentMetadata, effectiveLang]);

  // Apply auto-selections when entering merge view
  const hasAppliedAutoSelectRef = useRef(false);
  useEffect(() => {
    if (viewMode !== "merge" || hasAppliedAutoSelectRef.current) return;
    hasAppliedAutoSelectRef.current = true;
    
    // If current metadata is already in target language, select "No Change"
    if (currentAlreadyLocalized.title) {
      storeSelectFieldProvider("title", SELECTION_NO_CHANGE);
    }
    if (currentAlreadyLocalized.authors) {
      storeSelectFieldProvider("authors", SELECTION_NO_CHANGE);
    }
    if (currentAlreadyLocalized.description) {
      storeSelectFieldProvider("description", SELECTION_NO_CHANGE);
    }
  }, [viewMode, currentAlreadyLocalized, storeSelectFieldProvider]);

  // Reset ref when drawer closes
  useEffect(() => {
    if (!open) {
      hasAppliedAutoSelectRef.current = false;
    }
  }, [open]);

  // Fetch AI data (Gemini) when entering merge view with non-English language
  const aiFetchedRef = useRef(false);
  useEffect(() => {
    if (viewMode !== "merge" || effectiveLang === "en" || exactMatches.length === 0) {
      aiFetchedRef.current = false;
      return;
    }
    if (aiFetchedRef.current) return;
    aiFetchedRef.current = true;
    
    // Determine which AI tabs are needed
    const aiNeeded = getAITabsNeeded(exactMatches, effectiveLang);
    const fieldsToLoad: AIField[] = [];
    
    if (aiNeeded.chineseTitle) fieldsToLoad.push("chineseTitle");
    if (aiNeeded.description) fieldsToLoad.push("description");
    
    if (fieldsToLoad.length === 0) return;
    
    // Initialize loading state
    storeInitAIDataLoading(fieldsToLoad);
    
    // Build Gemini functions
    const gemini: GeminiFunctions = {
      findChineseTitle,
      findJapaneseDescription,
      findChineseDescription,
    };
    
    // Fetch Chinese title if needed
    if (aiNeeded.chineseTitle) {
      fetchChineseTitleFromGemini(exactMatches, gemini).then(value => {
        storeSetAIData("chineseTitle", { loading: false, value });
        if (value && !currentAlreadyLocalized.title) {
          // Auto-select AI if found and current isn't already localized
          storeSelectFieldProvider("title", SELECTION_AI);
        } else if (!value) {
          // AI returned null - if currently selected AI, switch to first provider
          const sel = useSmartMatchStore.getState().fieldSelections.get("title");
          if (sel?.selectedProvider === SELECTION_AI && sel.options.length > 0) {
            storeSelectFieldProvider("title", sel.options[0].provider);
          }
        }
      });
    }
    
    // Fetch description
    if (aiNeeded.description) {
      fetchLocalizedDescription(exactMatches, effectiveLang, gemini).then(value => {
        storeSetAIData("description", { loading: false, value });
        if (value && !currentAlreadyLocalized.description) {
          // Auto-select AI if found and current isn't already localized
          storeSelectFieldProvider("description", SELECTION_AI);
        } else if (!value) {
          // AI returned null - if currently selected AI, switch to first provider
          const sel = useSmartMatchStore.getState().fieldSelections.get("description");
          if (sel?.selectedProvider === SELECTION_AI && sel.options.length > 0) {
            storeSelectFieldProvider("description", sel.options[0].provider);
          }
        }
      });
    }
  }, [
    viewMode, effectiveLang, exactMatches, currentAlreadyLocalized,
    findChineseTitle, findJapaneseDescription, findChineseDescription,
    storeInitAIDataLoading, storeSetAIData, storeSelectFieldProvider
  ]);
  
  // AI search wrapper
  const aiSearch = useCallback(async (title: string, authorsHint?: string[]): Promise<string | null> => {
    try {
      return await findJapaneseTitle({ title, authors: authorsHint });
    } catch (e) {
      console.error("[SmartMatch] AI search error:", e);
      return null;
    }
  }, [findJapaneseTitle]);
  
  // Run smart match on open
  useEffect(() => {
    if (!open || hasSearchedRef.current) return;
    hasSearchedRef.current = true;
    
    async function runSmartMatch() {
      storeSetPhase("searching", t("metadata.smartMatch.searching"));
      const ALL_PROVIDERS: Provider[] = ["mangaupdates", "anilist", "mal"];
      
      try {
        // Search all providers with initial query
        await searchAllProviders(initialQuery, useSmartMatchStore.getState());
        
        // Check for exact matches - get FRESH state after search
        let matches = findExactMatches(initialQuery, useSmartMatchStore.getState());
        
        // If we found some matches, use canonical title to search missing providers
        if (matches.length > 0 && matches.length < ALL_PROVIDERS.length) {
          // Get canonical title from first match (prioritize MU > AL > MAL)
          const priorityOrder: Provider[] = ["mangaupdates", "anilist", "mal"];
          const sortedMatches = [...matches].sort(
            (a, b) => priorityOrder.indexOf(a.provider) - priorityOrder.indexOf(b.provider)
          );
          const canonicalTitle = sortedMatches[0].metadata.title;
          
          if (canonicalTitle && canonicalTitle !== initialQuery) {
            storeSetLastSearchQuery(canonicalTitle); // Store for manual search
            
            // Find providers without matches and re-search
            const matchedProviders = new Set(matches.map(m => m.provider));
            const missingProviders = ALL_PROVIDERS.filter(p => !matchedProviders.has(p));
            
            if (missingProviders.length > 0) {
              console.log("[SmartMatch] Re-searching missing providers with:", canonicalTitle);
              await searchProviders(canonicalTitle, missingProviders, useSmartMatchStore.getState());
              matches = findExactMatches(canonicalTitle, useSmartMatchStore.getState());
            }
          }
        }
        
        // If still no matches, try AI fallback
        if (matches.length === 0) {
          storeSetPhase("ai-fallback", t("metadata.smartMatch.aiLookup"));
          const aiTitle = await aiSearch(initialQuery, authors);
          
          if (aiTitle && aiTitle !== initialQuery) {
            storeSetLastSearchQuery(aiTitle);
            storeSetPhase("ai-retry", t("metadata.smartMatch.aiRetry"));
            
            // Search all providers with AI title
            await searchAllProviders(aiTitle, useSmartMatchStore.getState());
            matches = findExactMatches(aiTitle, useSmartMatchStore.getState());
            
            // If we found some matches, use canonical title to search missing providers
            if (matches.length > 0 && matches.length < ALL_PROVIDERS.length) {
              const matchedProviders = new Set(matches.map(m => m.provider));
              const missingProviders = ALL_PROVIDERS.filter(p => !matchedProviders.has(p));
              
              if (missingProviders.length > 0) {
                const canonicalTitle = matches[0].metadata.title;
                if (canonicalTitle && canonicalTitle !== aiTitle) {
                  console.log("[SmartMatch] Re-searching missing providers with:", canonicalTitle);
                  await searchProviders(canonicalTitle, missingProviders, useSmartMatchStore.getState());
                  matches = findExactMatches(canonicalTitle, useSmartMatchStore.getState());
                }
              }
            }
          }
        }
        
        if (matches.length > 0) {
          storeSetExactMatches(matches, effectiveLang);
          storeSetPhase("complete");
          setViewMode("merge"); // Show before/after merge view
        } else {
          storeSetPhase("manual");
          setViewMode("manual"); // Show manual search view
        }
      } catch (e) {
        console.error("[SmartMatch] Error:", e);
        storeSetError(e instanceof Error ? e.message : String(e));
        storeSetPhase("error");
        setViewMode("manual");
      }
    }
    
    runSmartMatch();
  }, [open, initialQuery, authors, aiSearch, storeSetPhase, storeSetLastSearchQuery, storeSetExactMatches, storeSetError, t]);
  
  // Manual search
  const handleManualSearch = useCallback(async () => {
    if (!manualQuery.trim()) return;
    setIsSearching(true);
    setManualSelected(null);
    try {
      const store = useSmartMatchStore.getState();
      await searchAllProviders(manualQuery, store);
    } finally {
      setIsSearching(false);
    }
  }, [manualQuery]);
  
  // Select manual result → add to exact matches and go to merge
  const handleManualSelect = useCallback((result: ProviderSearchResult) => {
    setManualSelected(result);
  }, []);
  
  const handleUseManualSelection = useCallback(() => {
    if (!manualSelected) return;
    
    // Clear all previous auto-matches, use only the manual selection
    const match: ExactMatch = {
      provider: manualSelected.provider,
      externalId: manualSelected.externalId,
      metadata: manualSelected.metadata,
      result: manualSelected,
    };
    
    storeSetExactMatches([match], effectiveLang);
    setViewMode("merge");
  }, [manualSelected, storeSetExactMatches, effectiveLang]);
  
  // Apply merged metadata
  const handleApply = useCallback(() => {
    const { metadata, externalIds } = storeGetMergedMetadata();
    
    // Convert Traditional → Simplified Chinese for title/description
    if (effectiveLang === "zh") {
      if (metadata.title) metadata.title = t2sConverter(metadata.title);
      if (metadata.description) metadata.description = t2sConverter(metadata.description);
    }
    
    // Translate tags if not English
    if (effectiveLang !== "en" && metadata.tags) {
      metadata.tags = translateTags(metadata.tags, effectiveLang);
    }
    
    onSelect({ metadata, externalIds });
    onOpenChange(false);
  }, [storeGetMergedMetadata, onSelect, onOpenChange, effectiveLang]);
  
  // Check if there are any changes to apply
  const hasChanges = useMemo(() => {
    for (const field of FIELD_ORDER) {
      const selection = fieldSelections.get(field);
      if (!selection?.selectedProvider) continue;
      if (selection.selectedProvider === SELECTION_NO_CHANGE) continue;
      
      const option = selection.options.find(o => o.provider === selection.selectedProvider);
      if (!option?.displayValue) continue;
      
      // For status, compare the raw numeric values
      if (field === "status") {
        if (option.value !== currentMetadata.status) return true;
      } else if (option.displayValue !== currentValues[field]) {
        return true;
      }
    }
    return false;
  }, [fieldSelections, currentValues, currentMetadata.status]);
  
  const currentResults = manualTab === "mangaupdates" ? muResults 
    : manualTab === "anilist" ? alResults 
    : malResults;
  
  return (
    <ResponsiveDialogNested open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogContent className="max-w-xl max-h-[85vh] overflow-hidden flex flex-col" showCloseButton={false}>
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle className="flex items-center gap-2">
            <HugeiconsIcon icon={SparklesIcon} className="size-5 text-primary" />
            {t("metadata.smartMatch.title")}
          </ResponsiveDialogTitle>
        </ResponsiveDialogHeader>

        {/* Searching View */}
        {viewMode === "searching" && (
          <div className="flex-1 flex flex-col items-center justify-center py-16 gap-4">
            <div className="relative">
              <div className="absolute inset-0 rounded-full bg-primary/20 animate-ping" />
              <Spinner className="size-10 text-primary relative" />
            </div>
            <p className="font-medium text-center">{phaseMessage || t("metadata.smartMatch.searching")}</p>
          </div>
        )}

        {/* Merge View */}
        {viewMode === "merge" && (
          <div className="flex-1 min-h-0 overflow-y-auto -mx-6 px-6">
            {/* Field rows in order */}
            <div className="space-y-4">
              {/* Cover first - special component */}
              <CoverSelection currentValue={currentValues.cover} t={t} />
              
              {/* Other fields */}
              {FIELD_ORDER.filter(f => f !== "cover").map((field) => (
                <MergeFieldRow
                  key={field}
                  field={field}
                  currentValue={currentValues[field]}
                  currentStatus={field === "status" ? currentMetadata.status : undefined}
                  t={t}
                  effectiveLang={effectiveLang}
                />
              ))}
              
              {!hasChanges && (
                <div className="py-8 text-center text-muted-foreground">
                  <p>{t("metadata.smartMatch.noChanges")}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Manual Search View */}
        {viewMode === "manual" && (
          <>
            {/* Search input */}
            <div className="flex gap-2">
              <div className="relative flex-1">
                <HugeiconsIcon
                  icon={Search01Icon}
                  className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground"
                />
                <Input
                  value={manualQuery}
                  onChange={(e) => setManualQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleManualSearch()}
                  placeholder={t("metadata.searchPlaceholder")}
                  className="pl-9"
                />
              </div>
              <Button onClick={handleManualSearch} disabled={!manualQuery.trim() || isSearching}>
                {isSearching ? <Spinner className="size-4" /> : t("common.search")}
              </Button>
            </div>

            {/* Provider tabs */}
            <Tabs
              value={manualTab}
              onValueChange={(v) => setManualTab(v as Provider)}
              className="mt-3"
            >
              <TabsList className="w-full justify-start">
                <TabsTrigger value="mangaupdates" className="flex-1 gap-1.5">
                  {PROVIDER_FULL_NAMES.mangaupdates}
                  {muResults.length > 0 && (
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                      {muResults.length}
                    </Badge>
                  )}
                </TabsTrigger>
                <TabsTrigger value="anilist" className="flex-1 gap-1.5">
                  {PROVIDER_FULL_NAMES.anilist}
                  {alResults.length > 0 && (
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                      {alResults.length}
                    </Badge>
                  )}
                </TabsTrigger>
                <TabsTrigger value="mal" className="flex-1 gap-1.5">
                  {PROVIDER_FULL_NAMES.mal}
                  {malResults.length > 0 && (
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                      {malResults.length}
                    </Badge>
                  )}
                </TabsTrigger>
              </TabsList>
            </Tabs>

            {/* Results - Fixed height list */}
            <div className="h-[520px] overflow-y-auto mt-3 -mx-6 px-6">
              {isSearching ? (
                <div className="space-y-2">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="flex gap-3 p-3 rounded-xl bg-muted/30">
                      <Skeleton className="w-14 h-20 rounded-lg shrink-0" />
                      <div className="flex-1 space-y-2 py-1">
                        <Skeleton className="h-4 w-3/4" />
                        <Skeleton className="h-3 w-1/3" />
                        <Skeleton className="h-3 w-full" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : currentResults.length === 0 ? (
                <div className="py-16 text-center text-muted-foreground">
                  <p>{hasAnyResults ? t("metadata.noResults") : t("metadata.searchPrompt")}</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {currentResults.map((result) => (
                    <SearchResultCard
                      key={`${result.provider}-${result.externalId}`}
                      result={result}
                      isSelected={
                        manualSelected?.provider === result.provider &&
                        manualSelected?.externalId === result.externalId
                      }
                      onSelect={() => handleManualSelect(result)}
                    />
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        <ResponsiveDialogFooter>
          {viewMode === "searching" && (
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              {t("common.cancel")}
            </Button>
          )}

          {viewMode === "merge" && (
            <>
              <Button variant="ghost" onClick={() => setViewMode("manual")}>
                {t("metadata.smartMatch.searchManually")}
              </Button>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                {t("common.cancel")}
              </Button>
              <Button onClick={handleApply} disabled={!hasChanges}>
                {t("common.apply")}
              </Button>
            </>
          )}

          {viewMode === "manual" && (
            <>
              {hasExactMatches ? (
                <Button variant="ghost" onClick={() => setViewMode("merge")}>
                  {t("common.back")}
                </Button>
              ) : (
                <Button variant="outline" onClick={() => onOpenChange(false)}>
                  {t("common.cancel")}
                </Button>
              )}
              <Button onClick={handleUseManualSelection} disabled={!manualSelected}>
                {t("common.select")}
              </Button>
            </>
          )}
        </ResponsiveDialogFooter>
      </ResponsiveDialogContent>
    </ResponsiveDialogNested>
  );
}
