/**
 * Source Management Dialog
 *
 * Main dialog for managing sources:
 * - DnD reorderable list of current sources
 * - Add source button opens nested dialog
 * - Delete sources with confirmation
 */

import { useState, useCallback, useMemo, useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useStores } from "@/data/context";
import {
  ResponsiveDialog,
  ResponsiveDialogNested,
  ResponsiveDialogContent,
  ResponsiveDialogHeader,
  ResponsiveDialogFooter,
  ResponsiveDialogTitle,
  ResponsiveDialogDescription,
} from "@/components/ui/responsive-dialog";
import { Button } from "@/components/ui/button";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Add01Icon,
  Delete02Icon,
  DragDropVerticalIcon,
} from "@hugeicons/core-free-icons";
import { cn } from "@/lib/utils";
import { SourceAddDrawer } from "./source-add-drawer";
import type { LibraryEntry } from "@/data/view";
import type { LocalSourceLink } from "@/data/schema";
import { hasSWR } from "@/lib/sources";
import { useSortedSources } from "@/hooks/use-sorted-sources";

// =============================================================================
// Types
// =============================================================================

interface SourceManageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entry: LibraryEntry;
}

// =============================================================================
// Sortable Source Item
// =============================================================================

interface SortableSourceItemProps {
  source: LocalSourceLink;
  sourceInfo?: { name: string; icon?: string };
  mangaTitle?: string;
  onDelete: () => void;
  canDelete: boolean;
}

function SortableSourceItem({
  source,
  sourceInfo,
  mangaTitle,
  onDelete,
  canDelete,
}: SortableSourceItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: source.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex items-center gap-3 rounded-lg border-2 border-border bg-background p-3",
        isDragging && "opacity-50 shadow-lg"
      )}
    >
      {/* Drag handle */}
      <button
        className="cursor-grab touch-none text-muted-foreground hover:text-foreground"
        {...attributes}
        {...listeners}
      >
        <HugeiconsIcon icon={DragDropVerticalIcon} className="size-5" />
      </button>

      {/* Source info */}
      <div className="flex items-center gap-3 flex-1 min-w-0">
        {sourceInfo?.icon && (
          <img src={sourceInfo.icon} alt="" className="size-8 rounded shrink-0" />
        )}
        <div className="min-w-0">
          <p className="font-medium truncate">
            {sourceInfo?.name ?? source.sourceId}
          </p>
          {mangaTitle && (
            <p className="text-xs text-muted-foreground truncate">
              {mangaTitle}
            </p>
          )}
        </div>
      </div>

      {/* Delete button */}
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={onDelete}
        disabled={!canDelete}
        className="shrink-0 text-muted-foreground hover:text-destructive"
      >
        <HugeiconsIcon icon={Delete02Icon} className="size-4" />
      </Button>
    </div>
  );
}

// =============================================================================
// Main Component
// =============================================================================

export function SourceManageDialog({
  open,
  onOpenChange,
  entry,
}: SourceManageDialogProps) {
  const { t } = useTranslation();
  const { useSettingsStore, useLibraryStore } = useStores();
  const { availableSources, getSource } = useSettingsStore();
  const { removeSource, reorderSources } = useLibraryStore();

  const [addDrawerOpen, setAddDrawerOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [sourceToDelete, setSourceToDelete] = useState<LocalSourceLink | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [mangaTitles, setMangaTitles] = useState<Record<string, string>>({});

  // Sort sources by sourceOrder at display time (data layer stores unsorted)
  const sources = useSortedSources(entry.sources, entry.item.sourceOrder);
  const sourceIds = useMemo(() => sources.map((s) => s.id), [sources]);

  // Load manga titles from source cache
  useEffect(() => {
    if (!open) return;

    (async () => {
      const titles: Record<string, string> = {};
      await Promise.all(
        sources.map(async (source) => {
          const sourceObj = await getSource(source.registryId, source.sourceId);
          if (!sourceObj) return;
          // Try cached first, then fetch
          const manga = hasSWR(sourceObj)
            ? await sourceObj.getCachedManga(source.sourceMangaId)
            : await sourceObj.getManga(source.sourceMangaId);
          if (manga?.title) {
            titles[source.id] = manga.title;
          }
        })
      );
      setMangaTitles(titles);
    })();
  }, [open, sources, getSource]);

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Get source info
  const getSourceInfo = useCallback(
    (source: LocalSourceLink) => {
      return availableSources.find(
        (s) => s.id === source.sourceId && s.registryId === source.registryId
      );
    },
    [availableSources]
  );

  // Handle drag end
  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const oldIndex = sourceIds.indexOf(active.id as string);
      const newIndex = sourceIds.indexOf(over.id as string);

      if (oldIndex !== -1 && newIndex !== -1) {
        const newOrder = arrayMove(sourceIds, oldIndex, newIndex);
        reorderSources(entry.item.libraryItemId, newOrder);
      }
    },
    [sourceIds, reorderSources, entry.item.libraryItemId]
  );

  // Handle delete click
  const handleDeleteClick = useCallback((source: LocalSourceLink) => {
    setSourceToDelete(source);
    setDeleteConfirmOpen(true);
  }, []);

  // Handle delete confirm
  const handleDeleteConfirm = useCallback(async () => {
    if (!sourceToDelete) return;

    setDeleting(true);
    try {
      await removeSource(
        entry.item.libraryItemId,
        sourceToDelete.registryId,
        sourceToDelete.sourceId,
        sourceToDelete.sourceMangaId
      );
      setDeleteConfirmOpen(false);
      setSourceToDelete(null);
    } catch (e) {
      console.error("[SourceManage] Delete error:", e);
    } finally {
      setDeleting(false);
    }
  }, [sourceToDelete, removeSource, entry.item.libraryItemId]);

  const canDeleteSource = sources.length > 1;

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogContent className="sm:max-w-md max-h-[85vh] overflow-hidden flex flex-col" showCloseButton={false}>
        <ResponsiveDialogHeader className="pr-0">
          <div className="flex items-center justify-between gap-2">
            <ResponsiveDialogTitle>
              {t("sources.manageSources")}
            </ResponsiveDialogTitle>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setAddDrawerOpen(true)}
              className="h-8 gap-1.5 shrink-0"
            >
              <HugeiconsIcon icon={Add01Icon} className="size-4" />
              {t("sources.addSource")}
            </Button>
          </div>
        </ResponsiveDialogHeader>

        {/* Source list with DnD */}
        <div className="flex-1 min-h-0 overflow-y-auto -mx-6 px-6">
          {sources.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">
              {t("sources.noSources")}
            </div>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={sourceIds}
                strategy={verticalListSortingStrategy}
              >
                <div className="space-y-2">
                  {sources.map((source) => (
                    <SortableSourceItem
                      key={source.id}
                      source={source}
                      sourceInfo={getSourceInfo(source)}
                      mangaTitle={mangaTitles[source.id]}
                      onDelete={() => handleDeleteClick(source)}
                      canDelete={canDeleteSource}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}

          {/* Helper text */}
          {sources.length > 1 && (
            <p className="text-xs text-muted-foreground mt-4 text-center">
              {t("sources.dragToReorder")}
            </p>
          )}
        </div>

        <ResponsiveDialogFooter>
          <Button onClick={() => onOpenChange(false)}>
            {t("common.done")}
          </Button>
        </ResponsiveDialogFooter>

        {/* Nested: Add Source Drawer */}
        <SourceAddDrawer
          open={addDrawerOpen}
          onOpenChange={setAddDrawerOpen}
          entry={entry}
          nested
        />

        {/* Nested: Delete Confirmation */}
        <ResponsiveDialogNested
          open={deleteConfirmOpen}
          onOpenChange={setDeleteConfirmOpen}
        >
          <ResponsiveDialogContent>
            <ResponsiveDialogHeader>
              <ResponsiveDialogTitle>
                {t("sources.removeSource")}
              </ResponsiveDialogTitle>
              <ResponsiveDialogDescription>
                {t("sources.removeSourceDescription", {
                  name: sourceToDelete
                    ? getSourceInfo(sourceToDelete)?.name ?? sourceToDelete.sourceId
                    : "",
                })}
              </ResponsiveDialogDescription>
            </ResponsiveDialogHeader>
            <ResponsiveDialogFooter>
              <Button
                variant="outline"
                onClick={() => setDeleteConfirmOpen(false)}
              >
                {t("common.cancel")}
              </Button>
              <Button
                variant="destructive"
                onClick={handleDeleteConfirm}
                disabled={deleting}
              >
                {deleting ? t("common.removing") : t("common.remove")}
              </Button>
            </ResponsiveDialogFooter>
          </ResponsiveDialogContent>
        </ResponsiveDialogNested>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}

