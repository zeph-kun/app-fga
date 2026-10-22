import { SearchX } from "lucide-react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function NotFound() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 px-4 py-16 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <SearchX aria-hidden className="size-6" />
      </span>
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold tracking-tight">Not found</h1>
        <p className="max-w-sm text-muted-foreground">
          This page doesn’t exist, or it hasn’t been shared with you.
        </p>
      </div>
      <Link href="/" className={cn(buttonVariants())}>
        Back to your workspace
      </Link>
    </main>
  );
}
