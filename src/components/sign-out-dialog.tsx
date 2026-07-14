import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogFooter,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from "@/components/ui/responsive-dialog";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { useSignOut } from "@/sync/hooks";
import { authClient } from "@/lib/auth-client";
import { toast } from "sonner";

interface SignOutDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SignOutDialog({ open, onOpenChange }: SignOutDialogProps) {
  const { t } = useTranslation();
  const signOutSync = useSignOut();
  const [keepData, setKeepData] = useState(true); // Default to keeping data
  const [loading, setLoading] = useState(false);

  // Reset state when dialog closes
  const handleOpenChange = (newOpen: boolean) => {
    if (loading) return;
    if (!newOpen) {
      setKeepData(true);
    }
    onOpenChange(newOpen);
  };

  const handleSignOut = async () => {
    setLoading(true);
    const shouldKeepData = keepData;
    // Close dialog FIRST to avoid race condition where auth state changes
    // while dialog is still mounted (causing queries to fire without auth)
    handleOpenChange(false);
    // Then sign out asynchronously. The sync service captures the current
    // profile, confirms remote logout, and only then copies/clears local data.
    try {
      await signOutSync(shouldKeepData, async () => {
        const result = await authClient.signOut();
        if (result.error) {
          throw result.error;
        }
      });
    } catch (error) {
      toast.error(t("signOut.failed"));
      console.error("[SignOutDialog] Sign out failed:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ResponsiveDialog open={open} onOpenChange={handleOpenChange}>
      <ResponsiveDialogContent showCloseButton={false}>
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>{t("signOut.title")}</ResponsiveDialogTitle>
          <ResponsiveDialogDescription>
            {t("signOut.description")}
          </ResponsiveDialogDescription>
        </ResponsiveDialogHeader>

        <RadioGroup
          value={keepData ? "keep" : "clear"}
          onValueChange={(v) => setKeepData(v === "keep")}
        >
          <div className="flex items-start gap-3">
            <RadioGroupItem value="keep" id="keep" className="mt-0.5" />
            <div className="flex flex-col gap-1">
              <Label htmlFor="keep" className="font-medium cursor-pointer">
                {t("signOut.keepData")}
              </Label>
              <p className="text-sm text-muted-foreground">
                {t("signOut.keepDataDescription")}
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <RadioGroupItem value="clear" id="clear" className="mt-0.5" />
            <div className="flex flex-col gap-1">
              <Label htmlFor="clear" className="font-medium cursor-pointer">
                {t("signOut.removeData")}
              </Label>
              <p className="text-sm text-muted-foreground">
                {t("signOut.removeDataDescription")}
              </p>
            </div>
          </div>
        </RadioGroup>

        <ResponsiveDialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={loading}>
            {t("common.cancel")}
          </Button>
          <Button variant="destructive" onClick={handleSignOut} disabled={loading}>
            {loading ? t("signOut.signingOut") : t("signOut.title")}
          </Button>
        </ResponsiveDialogFooter>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
