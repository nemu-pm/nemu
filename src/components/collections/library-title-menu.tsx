import { useMemo } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import type { TitleMenuProps } from "@/components/page-header";
import type { LocalCollection } from "@/data/schema";

interface UseLibraryTitleMenuOptions {
  collections: LocalCollection[];
  currentCollectionId?: string;
  onManage: () => void;
}

export function useLibraryTitleMenu({
  collections,
  currentCollectionId,
  onManage,
}: UseLibraryTitleMenuOptions): TitleMenuProps {
  const navigate = useNavigate();
  const { t } = useTranslation();

  return useMemo(() => ({
    items: [
      {
        id: "all",
        label: t("collections.all"),
        checked: currentCollectionId === undefined,
        onSelect: () => {
          navigate({ to: "/" });
        },
      },
      ...collections.map((collection) => ({
        id: collection.collectionId,
        label: collection.name,
        checked: collection.collectionId === currentCollectionId,
        onSelect: () => {
          navigate({
            to: "/library/collection/$id",
            params: { id: collection.collectionId },
          });
        },
      })),
    ],
    footer: [
      {
        id: "manage",
        label: t("collections.manage"),
        onSelect: onManage,
      },
    ],
  }), [collections, currentCollectionId, navigate, onManage, t]);
}
