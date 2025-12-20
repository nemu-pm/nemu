import { useState } from "react";
import { useAuth } from "@/sync/hooks";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { SignInDialog } from "@/components/sign-in-dialog";

export function AuthButton() {
  const { isAuthenticated, isLoading } = useAuth();
  const [signInOpen, setSignInOpen] = useState(false);

  // Hide completely when authenticated
  if (isAuthenticated) return null;

  if (isLoading) {
    return (
      <Button variant="ghost" size="sm" disabled>
        <Spinner className="size-4" />
      </Button>
    );
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setSignInOpen(true)}>
        Sign In
      </Button>
      <SignInDialog open={signInOpen} onOpenChange={setSignInOpen} />
    </>
  );
}
