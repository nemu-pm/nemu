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
    // Then sign out asynchronously
    // keepData=true: copy user profile → local, then delete user profile
    // keepData=false: just delete user profile
    await signOutSync(shouldKeepData);
    await authClient.signOut();
  };

  return (
    <ResponsiveDialog open={open} onOpenChange={handleOpenChange}>
      <ResponsiveDialogContent showCloseButton={!loading}>
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

