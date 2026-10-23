import { TimerOff } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Access ended" };

/** Where a User lands when their time-limited access ends while they are reading the Document. */
export default async function AccessEndedPage({ searchParams }: PageProps<"/access-ended">) {
  const { title } = await searchParams;
  const name = typeof title === "string" ? title.slice(0, 120) : undefined;

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 px-4 py-16 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <TimerOff aria-hidden className="size-6" />
      </span>
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold tracking-tight">Your access has ended</h1>
        <p className="max-w-sm text-muted-foreground">
          {name ? `Your time-limited access to “${name}” is over.` : "Your time-limited access to this document is over."}{" "}
          Ask its Owner to share it with you again if you still need it.
        </p>
      </div>
      <Link href="/" className={cn(buttonVariants())}>
        Back to your workspace
      </Link>
    </main>
  );
}
