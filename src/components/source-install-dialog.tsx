/**
 * Global dialog shown when a source is being installed.
 * Non-dismissible - user must wait for installation to complete.
 */
import { useTranslation } from "react-i18next";
import { useSourceInstallStore } from "@/stores/source-install";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
  ResponsiveDialogDescription,
} from "@/components/ui/responsive-dialog";

export function SourceInstallDialog() {
  const { t } = useTranslation();
  const installing = useSourceInstallStore((s) => s.installing);

  return (
    <ResponsiveDialog open={!!installing} dismissible={false}>
      <ResponsiveDialogContent showCloseButton={false}>
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>
            {t("sources.installing")}
          </ResponsiveDialogTitle>
          <ResponsiveDialogDescription>
            {installing?.name
              ? t("sources.installingDescription", { name: installing.name })
              : t("sources.installingDescriptionGeneric")}
          </ResponsiveDialogDescription>
        </ResponsiveDialogHeader>
        <div className="flex items-center justify-center gap-4 py-4">
          {installing?.icon && (
            <img
              src={installing.icon}
              alt=""
              className="size-12 rounded-lg object-cover"
            />
          )}
          <div className="relative">
            <div className="size-10 rounded-full border-4 border-muted" />
            <div className="absolute inset-0 size-10 rounded-full border-4 border-t-primary animate-spin" />
          </div>
        </div>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}

