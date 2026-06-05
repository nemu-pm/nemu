import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useStores } from "@/data/context";
import { getEntryEffectiveMetadata } from "@/data/view";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogFooter,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from "@/components/ui/responsive-dialog";

interface AddBooksSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  collectionId: string;
}

export function AddBooksSheet({ open, onOpenChange, collectionId }: AddBooksSheetProps) {
  const { t } = useTranslation();
  const { useLibraryStore, useCollectionsStore } = useStores();
  const { entries } = useLibraryStore();
  const { membership, addBooksTo, removeBooksFrom } = useCollectionsStore();
  const initialSelected = useMemo(
    () => new Set(membership.get(collectionId) ?? []),
    [collectionId, membership]
  );
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const wasOpenRef = useRef(false);

  useEffect(() => {
    if (open && !wasOpenRef.current) {
      setSelected(new Set(initialSelected));
    }
    wasOpenRef.current = open;
  }, [initialSelected, open]);

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogContent className="sm:max-w-lg">
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>{t("collections.addBooksTitle")}</ResponsiveDialogTitle>
          <ResponsiveDialogDescription>
            {t("collections.addBooksDescription")}
          </ResponsiveDialogDescription>
        </ResponsiveDialogHeader>

        <div className="max-h-[50vh] space-y-2 overflow-y-auto">
          {entries.map((entry) => {
            const metadata = getEntryEffectiveMetadata(entry);
            const checked = selected.has(entry.item.libraryItemId);
            return (
              <button
                type="button"
                key={entry.item.libraryItemId}
                role="checkbox"
                aria-checked={checked}
                className="flex w-full items-center justify-between gap-3 rounded-xl border p-3 text-left transition-colors hover:bg-accent/30"
                onClick={() => {
                  setSelected((current) => {
                    const next = new Set(current);
                    if (next.has(entry.item.libraryItemId)) {
                      next.delete(entry.item.libraryItemId);
                    } else {
                      next.add(entry.item.libraryItemId);
                    }
                    return next;
                  });
                }}
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{metadata.title}</div>
                  {metadata.authors?.[0] && (
                    <div className="truncate text-xs text-muted-foreground">{metadata.authors[0]}</div>
                  )}
                </div>
                <Checkbox
                  checked={checked}
                  className="pointer-events-none"
                  aria-hidden="true"
                />
              </button>
            );
          })}
        </div>

        <ResponsiveDialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button
            onClick={async () => {
              const idsToAdd = [...selected].filter((id) => !initialSelected.has(id));
              const idsToRemove = [...initialSelected].filter((id) => !selected.has(id));
              await Promise.all([
                idsToAdd.length > 0 ? addBooksTo(collectionId, idsToAdd) : Promise.resolve(),
                idsToRemove.length > 0 ? removeBooksFrom(collectionId, idsToRemove) : Promise.resolve(),
              ]);
              onOpenChange(false);
            }}
          >
            {t("common.save")}
          </Button>
        </ResponsiveDialogFooter>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
