/**
 * Dialog for fetching and selecting metadata from external providers
 * (MangaUpdates, AniList, MAL)
 */

import { useState, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useAction } from "convex/react";
import { api } from "../../convex/_generated/api";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogHeader,
  ResponsiveDialogFooter,
  ResponsiveDialogTitle,
  ResponsiveDialogDescription,
} from "@/components/ui/responsive-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { CoverImage } from "@/components/cover-image";
import { HugeiconsIcon } from "@hugeicons/react";
import { Search01Icon, CheckmarkCircle02Icon, Alert02Icon } from "@hugeicons/core-free-icons";
import { cn } from "@/lib/utils";
import { searchAniListRaw, mapAniListToMetadata, type ALMedia } from "@/lib/metadata/providers/anilist";
import { searchJikanRaw, mapJikanToMetadata, type JikanManga } from "@/lib/metadata/providers/jikan";
import type { MangaMetadata, ExternalIds } from "@/data/schema";
import { MangaStatus } from "@/lib/sources/types";

type Provider = "mangaupdates" | "anilist" | "mal";

interface MUSearchResult {
  seriesId: number;
  title: string;
  url: string;
  description?: string;
  cover?: string;
  type?: string;
  year?: string;
  status?: string;
  genres?: string[];
  associatedNames?: string[];
  authors?: Array<{ name: string; type: string }>;
}

interface SearchResult {
  provider: Provider;
  externalId: number;
  title: string;
  cover?: string;
  description?: string;
  status?: string;
  year?: string;
  url?: string;
  // For conversion
  raw: MUSearchResult | ALMedia | JikanManga;
}

interface MetadataFetchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentTitle: string;
  onSelect: (metadata: MangaMetadata, externalIds: ExternalIds) => Promise<void>;
}

/** Map status string to display badge */
function getStatusBadge(status?: string | number) {
  if (status == null) return null;
  
  // Handle number (our MangaStatus enum)
  if (typeof status === "number") {
    switch (status) {
      case MangaStatus.Ongoing: return { label: "Ongoing", variant: "default" as const };
      case MangaStatus.Completed: return { label: "Completed", variant: "secondary" as const };
      case MangaStatus.Hiatus: return { label: "Hiatus", variant: "outline" as const };
      case MangaStatus.Cancelled: return { label: "Cancelled", variant: "destructive" as const };
      default: return null;
    }
  }
  
  // Handle string (from raw API response)
  const statusLower = status.toLowerCase();
  if (statusLower.includes("ongoing") || statusLower.includes("publishing") || statusLower.includes("releasing")) {
    return { label: "Ongoing", variant: "default" as const };
  }
  if (statusLower.includes("complete") || statusLower.includes("finished")) {
    return { label: "Completed", variant: "secondary" as const };
  }
  if (statusLower.includes("hiatus")) {
    return { label: "Hiatus", variant: "outline" as const };
  }
  if (statusLower.includes("discontinue") || statusLower.includes("cancel")) {
    return { label: "Cancelled", variant: "destructive" as const };
  }
  return null;
}

/** Truncate description for preview */
function truncateDescription(desc?: string, maxLen = 150): string {
  if (!desc) return "";
  // Strip HTML tags first
  const clean = desc.replace(/<br\s*\/?>/gi, " ").replace(/<[^>]+>/g, "").trim();
  if (clean.length <= maxLen) return clean;
  return clean.slice(0, maxLen).trim() + "…";
}

/** Convert raw search result to unified format */
function toSearchResult(provider: Provider, raw: MUSearchResult | ALMedia | JikanManga): SearchResult {
  if (provider === "mangaupdates") {
    const r = raw as MUSearchResult;
    return {
      provider,
      externalId: r.seriesId,
      title: r.title,
      cover: r.cover,
      description: r.description,
      status: r.status,
      year: r.year,
      url: r.url,
      raw,
    };
  }
  
  if (provider === "anilist") {
    const r = raw as ALMedia;
    return {
      provider,
      externalId: r.id,
      title: r.title.romaji || r.title.english || r.title.native || "",
      cover: r.coverImage?.extraLarge || r.coverImage?.large,
      description: r.description,
      status: r.status,
      url: r.siteUrl,
      raw,
    };
  }
  
  // MAL
  const r = raw as JikanManga;
  return {
    provider,
    externalId: r.mal_id,
    title: r.title,
    cover: r.images?.webp?.large_image_url || r.images?.jpg?.large_image_url,
    description: r.synopsis,
    status: r.status,
    url: r.url,
    raw,
  };
}

/** Convert selected result to MangaMetadata */
function toMetadata(result: SearchResult): MangaMetadata {
  if (result.provider === "mangaupdates") {
    const r = result.raw as MUSearchResult;
    // Map status string to enum
    let status: number = MangaStatus.Unknown;
    if (r.status) {
      const statusLower = r.status.toLowerCase();
      if (statusLower.includes("ongoing")) status = MangaStatus.Ongoing;
      else if (statusLower.includes("complete")) status = MangaStatus.Completed;
      else if (statusLower.includes("hiatus")) status = MangaStatus.Hiatus;
      else if (statusLower.includes("discontinue") || statusLower.includes("cancel")) status = MangaStatus.Cancelled;
    }
    
    const authors = r.authors?.filter(a => a.type === "Author").map(a => a.name);
    const artists = r.authors?.filter(a => a.type === "Artist").map(a => a.name);
    
    return {
      title: r.title,
      cover: r.cover,
      authors: authors?.length ? authors : undefined,
      artists: artists?.length ? artists : undefined,
      description: r.description,
      tags: r.genres,
      status,
      url: r.url,
    };
  }
  
  if (result.provider === "anilist") {
    return mapAniListToMetadata(result.raw as ALMedia);
  }
  
  return mapJikanToMetadata(result.raw as JikanManga);
}

export function MetadataFetchDialog({
  open,
  onOpenChange,
  currentTitle,
  onSelect,
}: MetadataFetchDialogProps) {
  const { t } = useTranslation();
  const searchMangaUpdates = useAction(api.metadata.searchMangaUpdates);
  
  const [query, setQuery] = useState(currentTitle);
  const [activeTab, setActiveTab] = useState<Provider>("mangaupdates");
  const [results, setResults] = useState<Record<Provider, SearchResult[]>>({
    mangaupdates: [],
    anilist: [],
    mal: [],
  });
  const [loading, setLoading] = useState<Record<Provider, boolean>>({
    mangaupdates: false,
    anilist: false,
    mal: false,
  });
  const [errors, setErrors] = useState<Record<Provider, string | null>>({
    mangaupdates: null,
    anilist: null,
    mal: null,
  });
  const [selected, setSelected] = useState<SearchResult | null>(null);
  const [applying, setApplying] = useState(false);
  
  // Initialize query when dialog opens
  const handleOpenChange = useCallback((open: boolean) => {
    if (open) {
      setQuery(currentTitle);
      setSelected(null);
    }
    onOpenChange(open);
  }, [currentTitle, onOpenChange]);
  
  // Search a specific provider
  const searchProvider = useCallback(async (provider: Provider, searchQuery: string) => {
    if (!searchQuery.trim()) return;
    
    setLoading(prev => ({ ...prev, [provider]: true }));
    setErrors(prev => ({ ...prev, [provider]: null }));
    
    try {
      if (provider === "mangaupdates") {
        // Use Convex action for MangaUpdates (CORS)
        const data = await searchMangaUpdates({ query: searchQuery, maxResults: 10 });
        setResults(prev => ({
          ...prev,
          mangaupdates: data.results.map((r: MUSearchResult) => toSearchResult("mangaupdates", r)),
        }));
      } else if (provider === "anilist") {
        const data = await searchAniListRaw(searchQuery);
        setResults(prev => ({
          ...prev,
          anilist: data.map(r => toSearchResult("anilist", r)),
        }));
      } else {
        const data = await searchJikanRaw(searchQuery);
        setResults(prev => ({
          ...prev,
          mal: data.map(r => toSearchResult("mal", r)),
        }));
      }
    } catch (e) {
      console.error(`[MetadataFetch] ${provider} search error:`, e);
      setErrors(prev => ({
        ...prev,
        [provider]: e instanceof Error ? e.message : String(e),
      }));
    } finally {
      setLoading(prev => ({ ...prev, [provider]: false }));
    }
  }, [searchMangaUpdates]);
  
  // Search all providers
  const searchAll = useCallback(() => {
    if (!query.trim()) return;
    searchProvider("mangaupdates", query);
    searchProvider("anilist", query);
    searchProvider("mal", query);
  }, [query, searchProvider]);
  
  // Handle search on Enter
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      searchAll();
    }
  }, [searchAll]);
  
  // Apply selected metadata
  const handleApply = useCallback(async () => {
    if (!selected) return;
    
    setApplying(true);
    try {
      const metadata = toMetadata(selected);
      const externalIds: ExternalIds = {};
      
      if (selected.provider === "mangaupdates") {
        externalIds.mangaUpdates = selected.externalId;
      } else if (selected.provider === "anilist") {
        externalIds.aniList = selected.externalId;
      } else {
        externalIds.mal = selected.externalId;
      }
      
      await onSelect(metadata, externalIds);
      onOpenChange(false);
    } catch (e) {
      console.error("[MetadataFetch] Apply error:", e);
    } finally {
      setApplying(false);
    }
  }, [selected, onSelect, onOpenChange]);
  
  const currentResults = results[activeTab];
  const currentLoading = loading[activeTab];
  const currentError = errors[activeTab];
  const hasSearched = useMemo(() => 
    Object.values(results).some(r => r.length > 0) || 
    Object.values(loading).some(l => l) ||
    Object.values(errors).some(e => e != null),
    [results, loading, errors]
  );
  
  return (
    <ResponsiveDialog open={open} onOpenChange={handleOpenChange}>
      <ResponsiveDialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>
            {t("metadata.fetchTitle")}
          </ResponsiveDialogTitle>
          <ResponsiveDialogDescription>
            {t("metadata.fetchDescription")}
          </ResponsiveDialogDescription>
        </ResponsiveDialogHeader>
        
        {/* Search input */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <HugeiconsIcon 
              icon={Search01Icon} 
              className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" 
            />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={t("metadata.searchPlaceholder")}
              className="pl-9"
            />
          </div>
          <Button onClick={searchAll} disabled={!query.trim()}>
            {t("common.search")}
          </Button>
        </div>
        
        {/* Provider tabs */}
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as Provider)} className="flex-1 min-h-0 flex flex-col">
          <TabsList className="w-full justify-start">
            <TabsTrigger value="mangaupdates" className="flex-1">
              MangaUpdates
              {results.mangaupdates.length > 0 && (
                <Badge variant="secondary" className="ml-2">{results.mangaupdates.length}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="anilist" className="flex-1">
              AniList
              {results.anilist.length > 0 && (
                <Badge variant="secondary" className="ml-2">{results.anilist.length}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="mal" className="flex-1">
              MAL
              {results.mal.length > 0 && (
                <Badge variant="secondary" className="ml-2">{results.mal.length}</Badge>
              )}
            </TabsTrigger>
          </TabsList>
          
          {/* Results */}
          <div className="flex-1 min-h-0 overflow-y-auto mt-4">
            {!hasSearched ? (
              <div className="py-12 text-center text-muted-foreground">
                <p>{t("metadata.searchPrompt")}</p>
              </div>
            ) : currentLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="flex gap-3 p-3 rounded-lg border">
                    <Skeleton className="size-16 rounded shrink-0" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-4 w-3/4" />
                      <Skeleton className="h-3 w-1/2" />
                      <Skeleton className="h-3 w-full" />
                    </div>
                  </div>
                ))}
              </div>
            ) : currentError ? (
              <div className="py-12 text-center">
                <HugeiconsIcon icon={Alert02Icon} className="size-8 mx-auto mb-2 text-destructive" />
                <p className="text-destructive">{currentError}</p>
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="mt-3"
                  onClick={() => searchProvider(activeTab, query)}
                >
                  {t("common.retry")}
                </Button>
              </div>
            ) : currentResults.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground">
                <p>{t("metadata.noResults")}</p>
              </div>
            ) : (
              <div className="space-y-2">
                {currentResults.map((result) => {
                  const isSelected = selected?.provider === result.provider && selected?.externalId === result.externalId;
                  const statusBadge = getStatusBadge(result.status);
                  
                  return (
                    <button
                      key={`${result.provider}-${result.externalId}`}
                      onClick={() => setSelected(isSelected ? null : result)}
                      className={cn(
                        "w-full flex gap-3 p-3 rounded-lg border text-left transition-colors",
                        isSelected 
                          ? "border-primary bg-primary/5 ring-1 ring-primary" 
                          : "hover:bg-muted/50"
                      )}
                    >
                      <CoverImage
                        src={result.cover}
                        alt={result.title}
                        className="size-16 rounded shrink-0 object-cover"
                      />
                      <div className="flex-1 min-w-0 space-y-1">
                        <div className="flex items-start gap-2">
                          <h4 className="font-medium line-clamp-1 flex-1">{result.title}</h4>
                          {isSelected && (
                            <HugeiconsIcon icon={CheckmarkCircle02Icon} className="size-5 text-primary shrink-0" />
                          )}
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                          {statusBadge && (
                            <Badge variant={statusBadge.variant} className="text-xs">
                              {statusBadge.label}
                            </Badge>
                          )}
                          {result.year && (
                            <span className="text-xs text-muted-foreground">{result.year}</span>
                          )}
                        </div>
                        {result.description && (
                          <p className="text-xs text-muted-foreground line-clamp-2">
                            {truncateDescription(result.description)}
                          </p>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </Tabs>
        
        <ResponsiveDialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button onClick={handleApply} disabled={!selected || applying}>
            {applying ? t("metadata.applying") : t("metadata.apply")}
          </Button>
        </ResponsiveDialogFooter>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}

