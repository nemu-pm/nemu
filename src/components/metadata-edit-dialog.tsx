/**
 * Dialog for editing library entry metadata with field-level overrides.
 */

import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogHeader,
  ResponsiveDialogFooter,
  ResponsiveDialogTitle,
} from "@/components/ui/responsive-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CoverImage } from "@/components/cover-image";
import { MetadataMatchDrawer, type MatchedMetadata } from "./metadata-match-drawer";
import { TagInput, type Tag } from "emblor-maintained";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  SparklesIcon,
  ArrowReloadHorizontalIcon,
  Upload04Icon,
  Delete02Icon,
} from "@hugeicons/core-free-icons";
import type { MangaMetadata, ExternalIds } from "@/data/schema";
import type { LibraryEntry } from "@/data/view";
import { getEntryEffectiveMetadata, getEntryCover } from "@/data/view";
import { MangaStatus } from "@/lib/sources/types";
import { useCoverUpload, getR2PublicUrl } from "@/hooks/use-cover-upload";
import { proxyUrl } from "@/config";

interface MetadataEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entry: LibraryEntry;
  onSave: (
    metadata: Partial<MangaMetadata>,
    externalIds?: ExternalIds,
    coverUrl?: string | null  // null = clear override, undefined = no change
  ) => Promise<void>;
}

interface FormState {
  title: string;
  description: string;
  status: number;
  tags: Tag[];
  authors: Tag[];
  coverFile: File | null;
  coverUrl: string | null;
  coverPreview: string | null;
}

const toTags = (arr: string[] | undefined): Tag[] =>
  (arr ?? []).map((text, i) => ({ id: `${i}`, text }));

const fromTags = (tags: Tag[]): string[] => tags.map(t => t.text);

const STATUS_OPTIONS = [
  { value: MangaStatus.Unknown, label: "status.unknown" },
  { value: MangaStatus.Ongoing, label: "status.ongoing" },
  { value: MangaStatus.Completed, label: "status.completed" },
  { value: MangaStatus.Hiatus, label: "status.hiatus" },
  { value: MangaStatus.Cancelled, label: "status.cancelled" },
];

export function MetadataEditDialog({
  open,
  onOpenChange,
  entry,
  onSave,
}: MetadataEditDialogProps) {
  const { t } = useTranslation();
  const { uploadCover } = useCoverUpload();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const baseMetadata = entry.item.metadata;
  const baseCover = entry.item.metadata.cover;
  const currentOverrides = entry.item.overrides;
  
  // Memoize to prevent infinite loops from object reference changes
  const effectiveMetadata = useMemo(() => getEntryEffectiveMetadata(entry), [entry]);
  const effectiveCover = useMemo(() => getEntryCover(entry), [entry]);

  const [form, setForm] = useState<FormState>(() => ({
    title: effectiveMetadata.title,
    description: effectiveMetadata.description ?? "",
    status: effectiveMetadata.status ?? MangaStatus.Unknown,
    tags: toTags(effectiveMetadata.tags),
    authors: toTags(effectiveMetadata.authors),
    coverFile: null,
    coverUrl: currentOverrides?.coverUrl ?? null,
    coverPreview: effectiveCover ?? null,
  }));

  const [activeTagIndex, setActiveTagIndex] = useState<number | null>(null);
  const [activeAuthorIndex, setActiveAuthorIndex] = useState<number | null>(null);
  const [matchDrawerOpen, setMatchDrawerOpen] = useState(false);
  const [pendingExternalIds, setPendingExternalIds] = useState<ExternalIds | undefined>();
  const [saving, setSaving] = useState(false);

  // Reset form when dialog opens - use entry ID as stable dep
  const entryId = entry.item.libraryItemId;
  useEffect(() => {
    if (open) {
      const meta = getEntryEffectiveMetadata(entry);
      const cover = getEntryCover(entry);
      setForm({
        title: meta.title,
        description: meta.description ?? "",
        status: meta.status ?? MangaStatus.Unknown,
        tags: toTags(meta.tags),
        authors: toTags(meta.authors),
        coverFile: null,
        coverUrl: entry.item.overrides?.coverUrl ?? null,
        coverPreview: cover ?? null,
      });
      setActiveTagIndex(null);
      setActiveAuthorIndex(null);
      setPendingExternalIds(entry.item.externalIds);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, entryId]);

  useEffect(() => {
    return () => {
      if (form.coverPreview?.startsWith("blob:")) {
        URL.revokeObjectURL(form.coverPreview);
      }
    };
  }, [form.coverPreview]);

  const isOverridden = {
    title: form.title !== baseMetadata.title,
    description: (form.description || undefined) !== baseMetadata.description,
    status: form.status !== (baseMetadata.status ?? MangaStatus.Unknown),
    tags: JSON.stringify(fromTags(form.tags)) !== JSON.stringify(baseMetadata.tags ?? []),
    authors: JSON.stringify(fromTags(form.authors)) !== JSON.stringify(baseMetadata.authors ?? []),
    cover: form.coverFile !== null || form.coverUrl !== null || form.coverPreview !== baseCover,
  };

  const resetField = useCallback((field: keyof typeof isOverridden) => {
    switch (field) {
      case "title":
        setForm(f => ({ ...f, title: baseMetadata.title }));
        break;
      case "description":
        setForm(f => ({ ...f, description: baseMetadata.description ?? "" }));
        break;
      case "status":
        setForm(f => ({ ...f, status: baseMetadata.status ?? MangaStatus.Unknown }));
        break;
      case "tags":
        setForm(f => ({ ...f, tags: toTags(baseMetadata.tags) }));
        setActiveTagIndex(null);
        break;
      case "authors":
        setForm(f => ({ ...f, authors: toTags(baseMetadata.authors) }));
        setActiveAuthorIndex(null);
        break;
      case "cover":
        if (form.coverPreview?.startsWith("blob:")) {
          URL.revokeObjectURL(form.coverPreview);
        }
        setForm(f => ({ ...f, coverFile: null, coverUrl: null, coverPreview: baseCover ?? null }));
        break;
    }
  }, [baseMetadata, baseCover, form.coverPreview]);

  // Stable setTags callbacks to prevent emblor infinite loops
  const setTagsCallback = useCallback((newTags: React.SetStateAction<Tag[]>) => {
    setForm(f => ({
      ...f,
      tags: typeof newTags === "function" ? newTags(f.tags) : newTags,
    }));
  }, []);
  
  const setAuthorsCallback = useCallback((newTags: React.SetStateAction<Tag[]>) => {
    setForm(f => ({
      ...f,
      authors: typeof newTags === "function" ? newTags(f.authors) : newTags,
    }));
  }, []);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (form.coverPreview?.startsWith("blob:")) {
      URL.revokeObjectURL(form.coverPreview);
    }
    const previewUrl = URL.createObjectURL(file);
    setForm(f => ({ ...f, coverFile: file, coverUrl: null, coverPreview: previewUrl }));
  }, [form.coverPreview]);

  const handleMatchSelect = useCallback(async (match: MatchedMetadata) => {
    const { metadata, externalIds } = match;
    
    // Update non-cover fields immediately
    setForm(f => ({
      ...f,
      title: metadata.title || f.title,
      description: metadata.description ?? f.description,
      status: metadata.status ?? f.status,
      tags: metadata.tags ? toTags(metadata.tags) : f.tags,
      authors: metadata.authors ? toTags(metadata.authors) : f.authors,
    }));
    setPendingExternalIds(prev => ({ ...prev, ...externalIds }));
    
    // Download cover image to blob if provided (use proxy for CORS)
    if (metadata.cover) {
      try {
        const response = await fetch(proxyUrl(metadata.cover));
        if (!response.ok) throw new Error("Failed to fetch cover");
        const blob = await response.blob();
        const file = new File([blob], "cover.webp", { type: blob.type });
        
        // Revoke old preview if needed
        if (form.coverPreview?.startsWith("blob:")) {
          URL.revokeObjectURL(form.coverPreview);
        }
        const previewUrl = URL.createObjectURL(blob);
        
        setForm(f => ({
          ...f,
          coverFile: file,
          coverUrl: null,
          coverPreview: previewUrl,
        }));
      } catch (e) {
        console.error("[MetadataEdit] Failed to download cover:", e);
        // Fallback: use external URL directly
        setForm(f => ({
          ...f,
          coverFile: null,
          coverUrl: metadata.cover ?? null,
          coverPreview: metadata.cover ?? f.coverPreview,
        }));
      }
    }
  }, [form.coverPreview]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const overrides: Partial<MangaMetadata> = {};
      if (isOverridden.title) overrides.title = form.title;
      if (isOverridden.description) overrides.description = form.description || undefined;
      if (isOverridden.status) overrides.status = form.status;
      if (isOverridden.tags) overrides.tags = form.tags.length > 0 ? fromTags(form.tags) : undefined;
      if (isOverridden.authors) overrides.authors = form.authors.length > 0 ? fromTags(form.authors) : undefined;

      let coverUrl: string | null | undefined;
      if (form.coverFile) {
        // Upload local file to R2
        const key = await uploadCover(form.coverFile);
        coverUrl = getR2PublicUrl(key);
      } else if (form.coverUrl) {
        // External URL (fallback from auto-fetch) - download via proxy and upload to R2
        try {
          const response = await fetch(proxyUrl(form.coverUrl));
          if (!response.ok) throw new Error("Failed to fetch");
          const blob = await response.blob();
          const file = new File([blob], "cover.webp", { type: blob.type });
          const key = await uploadCover(file);
          coverUrl = getR2PublicUrl(key);
        } catch (e) {
          console.error("[MetadataEdit] Failed to upload external cover:", e);
          // Last resort: use external URL directly
          coverUrl = form.coverUrl;
        }
      } else if (!isOverridden.cover && currentOverrides?.coverUrl) {
        // User cleared the override - pass null to remove it
        coverUrl = null;
      }

      await onSave(overrides, pendingExternalIds, coverUrl);
      onOpenChange(false);
    } catch (e) {
      console.error("[MetadataEdit] Save error:", e);
    } finally {
      setSaving(false);
    }
  }, [form, isOverridden, uploadCover, onSave, onOpenChange, pendingExternalIds, currentOverrides]);

  const tagInputStyles = {
    inlineTagsContainer: "tag-input-nemu",
    tag: { body: "tag-nemu", closeButton: "tag-nemu-close" },
    input: "!text-sm",
  };

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogContent 
        className="sm:max-w-lg max-h-[90vh] overflow-hidden flex flex-col [&_input]:!text-sm [&_textarea]:!text-sm"
        showCloseButton={false}
      >
        <ResponsiveDialogHeader className="pr-0">
          <div className="flex items-center justify-between gap-2">
            <ResponsiveDialogTitle>
              {t("metadata.editTitle")}
            </ResponsiveDialogTitle>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setMatchDrawerOpen(true)}
              className="h-8 gap-1.5 shrink-0"
            >
              <HugeiconsIcon icon={SparklesIcon} className="size-4" />
              {t("metadata.smartMatch.title")}
            </Button>
          </div>
        </ResponsiveDialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto -mx-6 px-6 space-y-4">
          {/* Cover section - horizontal on desktop, stacked on mobile */}
          <div className="flex flex-col sm:flex-row gap-4">
            {/* Cover */}
            <div className="flex gap-3 sm:block sm:w-28 shrink-0">
              <div className="relative w-20 sm:w-full group/cover">
                <CoverImage
                  src={form.coverPreview ?? undefined}
                  alt={form.title}
                  className="w-full aspect-[3/4] rounded-lg object-cover"
                />
                
                {/* Desktop: hover overlay with buttons */}
                <div className="absolute inset-0 bg-black/60 rounded-lg opacity-0 sm:group-hover/cover:opacity-100 transition-opacity hidden sm:flex flex-col items-center justify-center gap-2 p-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    className="w-full text-xs"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <HugeiconsIcon icon={Upload04Icon} className="size-3.5 mr-1" />
                    {t("metadata.uploadImage")}
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="w-full text-xs"
                    onClick={() => resetField("cover")}
                    disabled={!isOverridden.cover}
                  >
                    <HugeiconsIcon icon={Delete02Icon} className="size-3.5 mr-1" />
                    {t("common.clear")}
                  </Button>
                </div>
              </div>

              {/* Mobile only: label and buttons */}
              <div className="flex flex-col gap-2 flex-1 sm:hidden">
                <span className="text-sm font-medium">{t("metadata.cover")}</span>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <HugeiconsIcon icon={Upload04Icon} className="size-4 mr-1.5" />
                  {t("metadata.uploadImage")}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={() => resetField("cover")}
                  disabled={!isOverridden.cover}
                >
                  <HugeiconsIcon icon={Delete02Icon} className="size-4 mr-1.5" />
                  {t("common.clear")}
                </Button>
              </div>

              {/* Hidden file input */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleFileSelect}
              />
            </div>

            {/* Title + Status on desktop right side */}
            <div className="flex-1 min-w-0 space-y-4 sm:block hidden">
              <FieldWrapper
                label={t("metadata.title")}
                isOverridden={isOverridden.title}
                onReset={() => resetField("title")}
              >
                <Input
                  value={form.title}
                  onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  placeholder={isOverridden.title ? baseMetadata.title : undefined}
                />
              </FieldWrapper>

              <FieldWrapper
                label={t("metadata.status")}
                isOverridden={isOverridden.status}
                onReset={() => resetField("status")}
              >
                <Tabs
                  value={String(form.status)}
                  onValueChange={v => setForm(f => ({ ...f, status: Number(v) }))}
                >
                  <TabsList className="w-full">
                    {STATUS_OPTIONS.map(opt => (
                      <TabsTrigger key={opt.value} value={String(opt.value)} className="flex-1 text-xs">
                        {t(opt.label)}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                </Tabs>
              </FieldWrapper>
            </div>
          </div>

          {/* Mobile-only: Title + Status below cover */}
          <div className="sm:hidden space-y-4">
            <FieldWrapper
              label={t("metadata.title")}
              isOverridden={isOverridden.title}
              onReset={() => resetField("title")}
            >
              <Input
                value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                placeholder={isOverridden.title ? baseMetadata.title : undefined}
              />
            </FieldWrapper>

            <FieldWrapper
              label={t("metadata.status")}
              isOverridden={isOverridden.status}
              onReset={() => resetField("status")}
            >
              <Tabs
                value={String(form.status)}
                onValueChange={v => setForm(f => ({ ...f, status: Number(v) }))}
              >
                <TabsList className="w-full">
                  {STATUS_OPTIONS.map(opt => (
                    <TabsTrigger key={opt.value} value={String(opt.value)} className="flex-1 text-xs">
                      {t(opt.label)}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
            </FieldWrapper>
          </div>

          {/* Rest of the fields - always full width */}
          <FieldWrapper
            label={t("metadata.authors")}
            isOverridden={isOverridden.authors}
            onReset={() => resetField("authors")}
          >
            <TagInput
              key="authors"
              tags={form.authors}
              setTags={setAuthorsCallback}
              placeholder={t("metadata.addAuthor")}
              activeTagIndex={activeAuthorIndex}
              setActiveTagIndex={setActiveAuthorIndex}
              styleClasses={tagInputStyles}
            />
          </FieldWrapper>

          <FieldWrapper
            label={t("metadata.description")}
            isOverridden={isOverridden.description}
            onReset={() => resetField("description")}
          >
            <Textarea
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder={isOverridden.description ? baseMetadata.description : undefined}
              rows={3}
              className="resize-none"
            />
          </FieldWrapper>

          <FieldWrapper
            label={t("metadata.tags")}
            isOverridden={isOverridden.tags}
            onReset={() => resetField("tags")}
          >
            <TagInput
              key="tags"
              tags={form.tags}
              setTags={setTagsCallback}
              placeholder={t("metadata.addTag")}
              activeTagIndex={activeTagIndex}
              setActiveTagIndex={setActiveTagIndex}
              styleClasses={tagInputStyles}
            />
          </FieldWrapper>
        </div>

        <ResponsiveDialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? t("common.saving") : t("common.save")}
          </Button>
        </ResponsiveDialogFooter>

        <MetadataMatchDrawer
          open={matchDrawerOpen}
          onOpenChange={setMatchDrawerOpen}
          initialQuery={form.title}
          currentMetadata={effectiveMetadata}
          authors={fromTags(form.authors)}
          onSelect={handleMatchSelect}
        />
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}

// ============================================================================

interface FieldWrapperProps {
  label: string;
  isOverridden: boolean;
  onReset: () => void;
  children: React.ReactNode;
}

function FieldWrapper({ label, isOverridden, onReset, children }: FieldWrapperProps) {
  const { t } = useTranslation();
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{label}</span>
        {isOverridden && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onReset}
            className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground"
          >
            <HugeiconsIcon icon={ArrowReloadHorizontalIcon} className="size-3.5 mr-1" />
            {t("common.reset")}
          </Button>
        )}
      </div>
      {children}
    </div>
  );
}
