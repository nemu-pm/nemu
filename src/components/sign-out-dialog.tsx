import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  const signOutSync = useSignOut();
  const [clearLocal, setClearLocal] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSignOut = async () => {
    setLoading(true);
    try {
      await signOutSync(clearLocal);
      await authClient.signOut();
      onOpenChange(false);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Sign Out</DialogTitle>
          <DialogDescription>
            Choose what happens to your data on this device.
          </DialogDescription>
        </DialogHeader>

        <RadioGroup
          value={clearLocal ? "clear" : "keep"}
          onValueChange={(v) => setClearLocal(v === "clear")}
        >
          <div className="flex items-start gap-3">
            <RadioGroupItem value="keep" id="keep" className="mt-0.5" />
            <div className="flex flex-col gap-1">
              <Label htmlFor="keep" className="font-medium cursor-pointer">
                Keep data on this device
              </Label>
              <p className="text-sm text-muted-foreground">
                You can sign back in anytime to sync again.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <RadioGroupItem value="clear" id="clear" className="mt-0.5" />
            <div className="flex flex-col gap-1">
              <Label htmlFor="clear" className="font-medium cursor-pointer">
                Remove data from this device
              </Label>
              <p className="text-sm text-muted-foreground">
                Your cloud data will stay safe.
              </p>
            </div>
          </div>
        </RadioGroup>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={handleSignOut} disabled={loading}>
            {loading ? "Signing out..." : "Sign Out"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

