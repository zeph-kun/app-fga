import { Skeleton } from "@/components/ui/skeleton";

/** Same shape as the page: a single card. */
export default function Loading() {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-16" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-64 w-full max-w-md rounded-xl" />
    </main>
  );
}
