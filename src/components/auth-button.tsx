import { useState } from "react";
import { useConvexAuth } from "convex/react";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Spinner } from "@/components/ui/spinner";
import { SignInDialog } from "@/components/sign-in-dialog";

export function AuthButton() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const { data: session } = authClient.useSession();
  const [signInOpen, setSignInOpen] = useState(false);

  if (isLoading) {
    return (
      <Button variant="ghost" size="icon" disabled>
        <Spinner className="size-4" />
      </Button>
    );
  }

  if (!isAuthenticated || !session?.user) {
    return (
      <>
        <Button variant="outline" size="sm" onClick={() => setSignInOpen(true)}>
          Sign In
        </Button>
        <SignInDialog open={signInOpen} onOpenChange={setSignInOpen} />
      </>
    );
  }

  const user = session.user;
  const initials = user.name
    ? user.name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : user.email?.[0]?.toUpperCase() ?? "?";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="ghost" size="icon" className="rounded-full p-0">
            <Avatar size="sm">
              {user.image && <AvatarImage src={user.image} alt={user.name ?? "User"} />}
              <AvatarFallback>{initials}</AvatarFallback>
            </Avatar>
          </Button>
        }
      />
      <DropdownMenuContent align="end" className="w-56">
        <div className="flex items-center gap-2 px-2 py-1.5">
          <Avatar size="sm">
            {user.image && <AvatarImage src={user.image} alt={user.name ?? "User"} />}
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>
          <div className="flex flex-col min-w-0">
            {user.name && (
              <span className="text-sm font-medium truncate">{user.name}</span>
            )}
            <span className="text-xs text-muted-foreground truncate">
              {user.email}
            </span>
          </div>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => authClient.signOut()}
          className="text-destructive"
        >
          Sign Out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

