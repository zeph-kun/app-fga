import { Skeleton } from "@/components/ui/skeleton";

/** Shown while a page fetches: same shape as the final layout, so nothing jumps. */
export default function Loading() {
  return (
    <>
      <div className="h-14 border-b" />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8" aria-busy="true" aria-label="Loading">
        <div className="flex flex-col gap-10">
          <div className="flex flex-col gap-3">
            <Skeleton className="h-7 w-28" />
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <Skeleton className="h-[74px] rounded-xl" />
              <Skeleton className="h-[74px] rounded-xl" />
              <Skeleton className="hidden h-[74px] rounded-xl lg:block" />
            </div>
          </div>
          <div className="flex flex-col gap-3">
            <Skeleton className="h-7 w-36" />
            <div className="flex flex-col gap-px overflow-hidden rounded-xl border">
              <Skeleton className="h-[62px] rounded-none" />
              <Skeleton className="h-[62px] rounded-none" />
              <Skeleton className="h-[62px] rounded-none" />
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
