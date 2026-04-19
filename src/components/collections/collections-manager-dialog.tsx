import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useStores } from "@/data/context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogFooter,
  ResponsiveDialogHeader,
  ResponsiveDialogNested,
  ResponsiveDialogTitle,
} from "@/components/ui/responsive-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Add01Icon,
  Delete02Icon,
  Edit02Icon,
  MoreHorizontalCircle01Icon,
} from "@hugeicons/core-free-icons";

type CollectionSummary = {
  collectionId: string;
  name: string;
  bookCount: number;
};

interface CollectionsManagerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  nested?: boolean;
  onCollectionCreated?: (collectionId: string) => void;
  onCollectionRemoved?: (collectionId: string) => void;
}

export function CollectionsManagerDialog({
  open,
  onOpenChange,
  nested = false,
  onCollectionCreated,
  onCollectionRemoved,
}: CollectionsManagerDialogProps) {
  const { t } = useTranslation();
  const { useCollectionsStore } = useStores();
  const { collections, membership, create, rename, remove } = useCollectionsStore();
  const [createOpen, setCreateOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState<CollectionSummary | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CollectionSummary | null>(null);
  const [draftName, setDraftName] = useState("");
  const [creatingName, setCreatingName] = useState("");
  const [creating, setCreating] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const DialogRoot = nested ? ResponsiveDialogNested : ResponsiveDialog;
  const collectionRows = useMemo(
    () =>
      collections.map((collection) => ({
        collectionId: collection.collectionId,
        name: collection.name,
        bookCount: membership.get(collection.collectionId)?.size ?? 0,
      })),
    [collections, membership]
  );

  useEffect(() => {
    if (open) return;
    setCreateOpen(false);
    setRenameTarget(null);
    setDeleteTarget(null);
    setDraftName("");
    setCreatingName("");
    setCreating(false);
    setRenaming(false);
    setDeleting(false);
  }, [open]);

  const openRename = (collection: CollectionSummary) => {
    setDraftName(collection.name);
    setRenameTarget(collection);
  };

  return (
    <>
      <DialogRoot open={open} onOpenChange={onOpenChange}>
        <ResponsiveDialogContent className="sm:max-w-lg">
          <ResponsiveDialogHeader>
            <ResponsiveDialogTitle>{t("collections.manageTitle")}</ResponsiveDialogTitle>
            <ResponsiveDialogDescription>
              {t("collections.manageDescription")}
            </ResponsiveDialogDescription>
          </ResponsiveDialogHeader>

          <div className="max-h-[50vh] space-y-2 overflow-y-auto">
            {collectionRows.length === 0 ? (
              <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
                {t("collections.emptyManager")}
              </div>
            ) : (
              collectionRows.map((collection) => (
                <div
                  key={collection.collectionId}
                  className="group flex items-center gap-3 rounded-xl border p-3 transition-colors hover:bg-accent/30"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{collection.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {t("collections.bookCount", { count: collection.bookCount })}
                    </div>
                  </div>

                  <div className="hidden items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 sm:flex">
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="ghost"
                      aria-label={t("collections.renameAction", { name: collection.name })}
                      onClick={() => openRename(collection)}
                    >
                      <HugeiconsIcon icon={Edit02Icon} className="size-4" />
                    </Button>
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="ghost"
                      aria-label={t("collections.deleteAction", { name: collection.name })}
                      onClick={() => setDeleteTarget(collection)}
                    >
                      <HugeiconsIcon icon={Delete02Icon} className="size-4" />
                    </Button>
                  </div>

                  <div className="sm:hidden">
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        className="inline-flex rounded-md p-1.5 outline-none hover:bg-accent"
                        aria-label={t("collections.moreActions", { name: collection.name })}
                      >
                        <HugeiconsIcon icon={MoreHorizontalCircle01Icon} className="size-4" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-auto min-w-[140px]">
                        <DropdownMenuItem onClick={() => openRename(collection)}>
                          {t("common.edit")}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          variant="destructive"
                          onClick={() => setDeleteTarget(collection)}
                        >
                          {t("common.delete")}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              ))
            )}
          </div>

          <ResponsiveDialogFooter className="flex-col sm:flex-row sm:items-center sm:justify-between">
            <Button variant="outline" onClick={() => setCreateOpen(true)} disabled={creating || renaming || deleting}>
              <HugeiconsIcon icon={Add01Icon} className="size-4" />
              {t("collections.addNew")}
            </Button>

            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={creating || renaming || deleting}>
              {t("common.done")}
            </Button>
          </ResponsiveDialogFooter>
        </ResponsiveDialogContent>
      </DialogRoot>

      <ResponsiveDialogNested open={createOpen} onOpenChange={setCreateOpen}>
        <ResponsiveDialogContent className="sm:max-w-sm">
          <ResponsiveDialogHeader>
            <ResponsiveDialogTitle>{t("collections.createTitle")}</ResponsiveDialogTitle>
            <ResponsiveDialogDescription>
              {t("collections.createDescription")}
            </ResponsiveDialogDescription>
          </ResponsiveDialogHeader>

          <Input
            value={creatingName}
            onChange={(event) => setCreatingName(event.target.value)}
            placeholder={t("collections.createPlaceholder")}
            autoFocus
            disabled={creating}
          />

          <ResponsiveDialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={creating}>
              {t("common.cancel")}
            </Button>
            <Button
              onClick={async () => {
                const nextName = creatingName.trim();
                if (!nextName || creating) return;
                setCreating(true);
                try {
                  const created = await create(nextName);
                  setCreatingName("");
                  setCreateOpen(false);
                  onCollectionCreated?.(created.collectionId);
                } finally {
                  setCreating(false);
                }
              }}
              disabled={!creatingName.trim() || creating}
            >
              {t("common.create")}
            </Button>
          </ResponsiveDialogFooter>
        </ResponsiveDialogContent>
      </ResponsiveDialogNested>

      <ResponsiveDialogNested
        open={renameTarget !== null}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            setRenameTarget(null);
            setDraftName("");
          }
        }}
      >
        <ResponsiveDialogContent className="sm:max-w-sm">
          <ResponsiveDialogHeader>
            <ResponsiveDialogTitle>{t("collections.renameTitle")}</ResponsiveDialogTitle>
            <ResponsiveDialogDescription>
              {t("collections.renameDescription")}
            </ResponsiveDialogDescription>
          </ResponsiveDialogHeader>

          <Input
            value={draftName}
            onChange={(event) => setDraftName(event.target.value)}
            autoFocus
            disabled={renaming}
          />

          <ResponsiveDialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setRenameTarget(null);
                setDraftName("");
              }}
              disabled={renaming}
            >
              {t("common.cancel")}
            </Button>
            <Button
              onClick={async () => {
                if (!renameTarget) return;
                const nextName = draftName.trim();
                if (!nextName || renaming) return;
                setRenaming(true);
                try {
                  await rename(renameTarget.collectionId, nextName);
                  setRenameTarget(null);
                  setDraftName("");
                } finally {
                  setRenaming(false);
                }
              }}
              disabled={!draftName.trim() || renaming}
            >
              {t("common.save")}
            </Button>
          </ResponsiveDialogFooter>
        </ResponsiveDialogContent>
      </ResponsiveDialogNested>

      <ResponsiveDialogNested
        open={deleteTarget !== null}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setDeleteTarget(null);
        }}
      >
        <ResponsiveDialogContent className="sm:max-w-sm">
          <ResponsiveDialogHeader>
            <ResponsiveDialogTitle>{t("collections.deleteTitle")}</ResponsiveDialogTitle>
            <ResponsiveDialogDescription>
              {t("collections.deleteDescription")}
            </ResponsiveDialogDescription>
          </ResponsiveDialogHeader>

          <ResponsiveDialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={deleting}>
              {t("common.cancel")}
            </Button>
            <Button
              variant="destructive"
              onClick={async () => {
                if (!deleteTarget || deleting) return;
                setDeleting(true);
                try {
                  const collectionId = deleteTarget.collectionId;
                  await remove(collectionId);
                  setDeleteTarget(null);
                  onCollectionRemoved?.(collectionId);
                } finally {
                  setDeleting(false);
                }
              }}
              disabled={deleting}
            >
              {t("common.delete")}
            </Button>
          </ResponsiveDialogFooter>
        </ResponsiveDialogContent>
      </ResponsiveDialogNested>
    </>
  );
}
