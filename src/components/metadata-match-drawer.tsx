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
import { Spinner } from "@/components/ui/spinner";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Search01Icon,
  CheckmarkCircle02Icon,
  SparklesIcon,
  ArrowDown01Icon,
  ArrowUp01Icon,
} from "@hugeicons/core-free-icons";
import { cn } from "@/lib/utils";
import {
  useSmartMatchStore,
  searchAllProviders,
  searchProviders,
  findExactMatches,
  type Provider,
  type ProviderSearchResult,
  type MetadataField,
  type ExactMatch,
} from "@/lib/metadata";
import type { MangaMetadata, ExternalIds } from "@/data/schema";
import { MangaStatus } from "@/lib/sources/types";

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
const FIELD_ORDER: MetadataField[] = ["cover", "title", "status", "authors", "artists", "description", "tags"];

const FIELD_LABELS: Record<MetadataField, string> = {
  title: "metadata.title",
  cover: "metadata.cover",
  description: "metadata.description",
  status: "metadata.status",
  authors: "metadata.authors",
  artists: "metadata.artists",
  tags: "metadata.tags",
};

const PROVIDER_FULL_NAMES: Record<Provider, string> = {
  mangaupdates: "MangaUpdates",
  anilist: "AniList",
  mal: "MyAnimeList",
};

// Special value for "no change" option - use type assertion to allow comparison
const NO_CHANGE = "__no_change__" as const;
type SelectionValue = Provider | typeof NO_CHANGE;

function getStatusLabel(status: number | undefined, t: (key: string) => string): string {
  switch (status) {
    case MangaStatus.Ongoing: return t("status.ongoing");
    case MangaStatus.Completed: return t("status.completed");
    case MangaStatus.Hiatus: return t("status.hiatus");
    case MangaStatus.Cancelled: return t("status.cancelled");
    default: return t("status.unknown");
  }
}

function getStatusBadgeVariant(status: number | undefined): "default" | "secondary" | "outline" | "destructive" {
  switch (status) {
    case MangaStatus.Ongoing: return "default";
    case MangaStatus.Completed: return "secondary";
    case MangaStatus.Hiatus: return "outline";
    case MangaStatus.Cancelled: return "destructive";
    default: return "outline";
  }
}

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
  
  const selectedProvider = selection.selectedProvider as SelectionValue;
  
  return (
    <div className="space-y-2">
      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
        {t(FIELD_LABELS.cover)}
      </span>
      
      <div className="flex gap-3 overflow-x-auto pt-1 pb-2">
        {/* No Change option - always show if current value exists */}
        {currentValue && (
          <button
            onClick={() => selectFieldProvider("cover", NO_CHANGE as unknown as Provider)}
            className={cn(
              "shrink-0 space-y-1.5 transition-opacity",
              selectedProvider === NO_CHANGE ? "opacity-100" : "opacity-50 hover:opacity-75"
            )}
          >
            <CoverImage
              src={currentValue}
              alt={t("common.noChange")}
              className={cn(
                "w-24 sm:w-32 aspect-[2/3] rounded-lg object-cover transition-all",
                selectedProvider === NO_CHANGE && "ring-2 ring-primary shadow-lg"
              )}
            />
            <p className={cn(
              "text-xs text-center",
              selectedProvider === NO_CHANGE ? "text-primary font-medium" : "text-muted-foreground"
            )}>
              {t("common.noChange")}
            </p>
          </button>
        )}
        
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
                selectedProvider === option.provider && "ring-2 ring-primary shadow-lg"
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
// Merge Field Row - With No Change option
// =============================================================================

interface MergeFieldRowProps {
  field: MetadataField;
  currentValue: string;
  t: (key: string) => string;
}

function MergeFieldRow({ field, currentValue, t }: MergeFieldRowProps) {
  const selection = useSmartMatchStore(s => s.fieldSelections.get(field));
  const selectFieldProvider = useSmartMatchStore(s => s.selectFieldProvider);
  const [expanded, setExpanded] = useState(false);
  
  // Skip cover - handled separately
  if (field === "cover") return null;
  
  if (!selection || selection.options.length === 0) {
    return null;
  }
  
  const selectedProvider = selection.selectedProvider as SelectionValue;
  const isLongText = field === "description";
  const isStatus = field === "status";
  
  // Build tab options: No Change + ALL provider values
  const tabOptions: { id: string; label: string; value: string }[] = [];
  
  // Add "No Change" if current value exists
  if (currentValue) {
    tabOptions.push({
      id: NO_CHANGE,
      label: t("common.noChange"),
      value: currentValue,
    });
  }
  
  // Add ALL provider options
  for (const option of selection.options) {
    // For status, localize the display value
    let displayVal = option.displayValue;
    if (isStatus && typeof option.value === "number") {
      displayVal = getStatusLabel(option.value, t);
    }
    tabOptions.push({
      id: option.provider,
      label: PROVIDER_FULL_NAMES[option.provider],
      value: displayVal,
    });
  }
  
  if (tabOptions.length === 0) return null;
  
  // Current tab value - use selected provider, or NO_CHANGE if it's selected
  const currentTabValue: string = selectedProvider === NO_CHANGE ? NO_CHANGE : (selectedProvider || tabOptions[0]?.id || NO_CHANGE);
  
  return (
    <div className="space-y-2">
      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
        {t(FIELD_LABELS[field])}
      </span>
      
      <Tabs
        value={currentTabValue}
        onValueChange={(v) => selectFieldProvider(field, v as unknown as Provider)}
      >
        <TabsList className="w-full h-8 flex-wrap">
          {tabOptions.map((opt) => (
            <TabsTrigger
              key={opt.id}
              value={opt.id}
              className="flex-1 text-xs h-7 min-w-0"
            >
              <span className="truncate">{opt.label}</span>
            </TabsTrigger>
          ))}
        </TabsList>
        
        {tabOptions.map((opt) => (
          <TabsContent key={opt.id} value={opt.id} className="mt-2">
            {isLongText ? (
              <Collapsible open={expanded} onOpenChange={setExpanded}>
                <div className="rounded-lg bg-muted/30 p-3">
                  <CollapsibleContent>
                    <p className="text-sm leading-relaxed">{opt.value}</p>
                  </CollapsibleContent>
                  {!expanded && (
                    <p className="text-sm leading-relaxed line-clamp-3">{opt.value}</p>
                  )}
                </div>
                {opt.value.length > 150 && (
                  <CollapsibleTrigger className="w-full mt-1.5 py-1 text-xs flex items-center justify-center gap-1 text-muted-foreground hover:text-foreground transition-colors rounded hover:bg-muted/50">
                    <HugeiconsIcon icon={expanded ? ArrowUp01Icon : ArrowDown01Icon} className="size-3" />
                    {expanded ? t("common.collapse") : t("common.expand")}
                  </CollapsibleTrigger>
                )}
              </Collapsible>
            ) : (
              <div className="rounded-lg bg-muted/30 px-3 py-2">
                <p className="text-sm">{opt.value}</p>
              </div>
            )}
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
  t: (key: string) => string;
}

function SearchResultCard({ result, isSelected, onSelect, t }: SearchResultCardProps) {
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
          <Badge variant={getStatusBadgeVariant(result.metadata.status)} className="text-[10px] px-1.5 py-0">
            {getStatusLabel(result.metadata.status, t)}
          </Badge>
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
  const findJapaneseTitle = useAction(api.ai_metadata.findJapaneseTitle);
  
  // Get stable store actions (these don't change)
  const storeReset = useSmartMatchStore(s => s.reset);
  const storeSetPhase = useSmartMatchStore(s => s.setPhase);
  const storeSetLastSearchQuery = useSmartMatchStore(s => s.setLastSearchQuery);
  const storeSetExactMatches = useSmartMatchStore(s => s.setExactMatches);
  const storeSetError = useSmartMatchStore(s => s.setError);
  const storeGetMergedMetadata = useSmartMatchStore(s => s.getMergedMetadata);
  
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
  
  // Get current field values for comparison (localized for status)
  const currentValues = useMemo(() => ({
    title: currentMetadata.title || "",
    cover: currentMetadata.cover || "",
    description: currentMetadata.description || "",
    status: getStatusLabel(currentMetadata.status, t),
    authors: currentMetadata.authors?.join(", ") || "",
    artists: currentMetadata.artists?.join(", ") || "",
    tags: currentMetadata.tags?.join(", ") || "",
  }), [currentMetadata, t]);
  
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
          storeSetExactMatches(matches);
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
    
    storeSetExactMatches([match]);
    setViewMode("merge");
  }, [manualSelected, storeSetExactMatches]);
  
  // Apply merged metadata
  const handleApply = useCallback(() => {
    const { metadata, externalIds } = storeGetMergedMetadata();
    onSelect({ metadata, externalIds });
    onOpenChange(false);
  }, [storeGetMergedMetadata, onSelect, onOpenChange]);
  
  // Check if there are any changes to apply
  const hasChanges = useMemo(() => {
    for (const field of FIELD_ORDER) {
      const selection = fieldSelections.get(field);
      if (!selection?.selectedProvider) continue;
      if ((selection.selectedProvider as SelectionValue) === NO_CHANGE) continue;
      
      const option = selection.options.find(o => o.provider === selection.selectedProvider);
      if (!option?.displayValue) continue;
      
      // For status, compare the raw values
      if (field === "status") {
        const currentStatus = getStatusLabel(currentMetadata.status, t);
        const newStatus = getStatusLabel(option.value as number, t);
        if (newStatus !== currentStatus) return true;
      } else if (option.displayValue !== currentValues[field]) {
        return true;
      }
    }
    return false;
  }, [fieldSelections, currentValues, currentMetadata.status, t]);
  
  const currentResults = manualTab === "mangaupdates" ? muResults 
    : manualTab === "anilist" ? alResults 
    : malResults;
  
  return (
    <ResponsiveDialogNested open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogContent className="max-w-xl max-h-[85vh] overflow-hidden flex flex-col">
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
                  t={t}
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
                      t={t}
                    />
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        <ResponsiveDialogFooter>
          {viewMode === "searching" && (
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              {t("common.cancel")}
            </Button>
          )}

          {viewMode === "merge" && (
            <>
              <Button variant="ghost" onClick={() => setViewMode("manual")}>
                {t("metadata.smartMatch.searchManually")}
              </Button>
              <Button onClick={handleApply} disabled={!hasChanges}>
                {t("common.select")}
              </Button>
            </>
          )}

          {viewMode === "manual" && (
            <>
              {hasExactMatches && (
                <Button variant="ghost" onClick={() => setViewMode("merge")}>
                  {t("common.back")}
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
