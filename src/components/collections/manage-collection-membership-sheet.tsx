import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useStores } from "@/data/context";
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
import { CollectionsManagerDialog } from "./collections-manager-dialog";

interface ManageCollectionMembershipSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  libraryItemId: string;
}

export function ManageCollectionMembershipSheet({
  open,
  onOpenChange,
  libraryItemId,
}: ManageCollectionMembershipSheetProps) {
  const { t } = useTranslation();
  const { useCollectionsStore } = useStores();
  const { collections, membership, addBooksTo, removeBooksFrom } = useCollectionsStore();
  const [managerOpen, setManagerOpen] = useState(false);
  const initialSelected = useMemo(() => {
    const next = new Set<string>();
    for (const collection of collections) {
      if (membership.get(collection.collectionId)?.has(libraryItemId)) {
        next.add(collection.collectionId);
      }
    }
    return next;
  }, [collections, libraryItemId, membership]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const wasOpenRef = useRef(false);

  useEffect(() => {
    if (open && !wasOpenRef.current) {
      setSelected(new Set(initialSelected));
    }
    wasOpenRef.current = open;
  }, [initialSelected, open]);

  const toggleCollection = (collectionId: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(collectionId)) {
        next.delete(collectionId);
      } else {
        next.add(collectionId);
      }
      return next;
    });
  };

  return (
    <>
      <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
        <ResponsiveDialogContent className="sm:max-w-lg">
          <ResponsiveDialogHeader>
            <ResponsiveDialogTitle>{t("collections.membershipTitle")}</ResponsiveDialogTitle>
            <ResponsiveDialogDescription>
              {t("collections.membershipDescription")}
            </ResponsiveDialogDescription>
          </ResponsiveDialogHeader>

          <div className="max-h-[50vh] space-y-2 overflow-y-auto">
            {collections.length === 0 ? (
              <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                {t("collections.membershipEmpty")}
              </div>
            ) : (
              collections.map((collection) => {
                const checked = selected.has(collection.collectionId);
                const bookCount = membership.get(collection.collectionId)?.size ?? 0;
                return (
                  <button
                    type="button"
                    key={collection.collectionId}
                    role="checkbox"
                    aria-checked={checked}
                    className="flex w-full items-center justify-between gap-3 rounded-xl border p-3 text-left transition-colors hover:bg-accent/30"
                    onClick={() => toggleCollection(collection.collectionId)}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{collection.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {t("collections.bookCount", { count: bookCount })}
                      </div>
                    </div>
                    <Checkbox
                      checked={checked}
                      className="pointer-events-none"
                      aria-hidden="true"
                    />
                  </button>
                );
              })
            )}
          </div>

          <ResponsiveDialogFooter className="flex-col sm:flex-row sm:items-center sm:justify-between">
            <Button variant="outline" onClick={() => setManagerOpen(true)}>
              {t("collections.manage")}
            </Button>

            <div className="flex flex-col gap-2 sm:flex-row">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                {t("common.cancel")}
              </Button>
              <Button
                onClick={async () => {
                  const collectionIds = new Set(collections.map((collection) => collection.collectionId));
                  const idsToAdd = [...selected].filter((collectionId) => !initialSelected.has(collectionId));
                  const idsToRemove = [...initialSelected].filter(
                    (collectionId) => !selected.has(collectionId) && collectionIds.has(collectionId)
                  );
                  await Promise.all([
                    ...idsToAdd.map((collectionId) => addBooksTo(collectionId, [libraryItemId])),
                    ...idsToRemove.map((collectionId) => removeBooksFrom(collectionId, [libraryItemId])),
                  ]);
                  onOpenChange(false);
                }}
              >
                {t("common.save")}
              </Button>
            </div>
          </ResponsiveDialogFooter>
        </ResponsiveDialogContent>
      </ResponsiveDialog>

      <CollectionsManagerDialog
        open={managerOpen}
        onOpenChange={setManagerOpen}
        nested
        onCollectionCreated={(collectionId) => {
          setSelected((current) => new Set(current).add(collectionId));
        }}
        onCollectionRemoved={(collectionId) => {
          setSelected((current) => {
            const next = new Set(current);
            next.delete(collectionId);
            return next;
          });
        }}
      />
    </>
  );
}
