import { ShieldCheck, Users2 } from "lucide-react";
import Link from "next/link";
import { logout } from "@/app/actions";
import { auth } from "@/auth";
import { Button } from "@/components/ui/button";
import { UserMenu } from "./user-menu";

export async function AppHeader() {
  const session = await auth();
  const name = session?.user?.name ?? session?.user?.email ?? "me";

  return (
    <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur supports-backdrop-filter:bg-background/60">
      <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-2 rounded-md font-semibold tracking-tight outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
          <span className="flex size-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <ShieldCheck aria-hidden className="size-4" />
          </span>
          app-fga
        </Link>
        <div className="flex items-center gap-1">
          <Button variant="ghost" render={<Link href="/teams" />}>
            <Users2 aria-hidden />
            <span className="max-sm:sr-only">Teams</span>
          </Button>
          <UserMenu name={name} onSignOut={logout} />
        </div>
      </div>
    </header>
  );
}
