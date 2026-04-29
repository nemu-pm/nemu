import { Skeleton } from "@/components/ui/skeleton";

/**
 * Mirrors the real PageHeader's mobile structure: a sticky bar at top
 * (safe-area aware, no body) plus an inline title row in normal flow.
 * This keeps the skeleton-to-loaded transition from popping the layout.
 */
function SkeletonHeader({ children }: { children: React.ReactNode }) {
  return (
    <>
      <div
        className="sticky top-0 z-40 bg-background"
        style={{ paddingTop: "var(--nemu-safe-top, 0px)" }}
      >
        <div className="min-h-[2.75rem]" />
      </div>
      <div className="flex items-center justify-between min-h-[2.5rem]">
        {children}
      </div>
    </>
  );
}

export function BrowsePageSkeleton() {
  return (
    <div className="space-y-6">
      <SkeletonHeader>
        <div className="flex items-center gap-2">
          <Skeleton className="h-8 w-32" />
        </div>
        <Skeleton className="h-9 w-28" />
      </SkeletonHeader>

      <div className="space-y-6">
        {/* 2 language sections */}
        {[1, 2].map((section) => (
          <section key={section}>
            <Skeleton className="mb-3 h-4 w-24" />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {/* 6 source cards per section */}
              {[1, 2, 3, 4, 5, 6].map((card) => (
                <div key={card} className="source-card">
                  <div className="source-card-icon">
                    <Skeleton className="size-full" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <Skeleton className="h-5 w-32" />
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

export function SettingsPageSkeleton() {
  return (
    <div className="space-y-6">
      <SkeletonHeader>
        <Skeleton className="h-8 w-32" />
      </SkeletonHeader>

      {/* Cloud Sync Card */}
      <div className="rounded-lg border bg-card">
        <div className="border-b p-6">
          <div className="flex items-center gap-2">
            <Skeleton className="h-5 w-5" />
          <Skeleton className="h-6 w-32" />
          </div>
        </div>
        <div className="p-6">
          <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Skeleton className="size-9 rounded-full" />
            <div className="space-y-2">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-3 w-32" />
            </div>
            </div>
            <Skeleton className="h-9 w-20" />
          </div>
        </div>
      </div>

      {/* Installed Sources Card */}
      <div className="rounded-lg border bg-card">
        <div className="flex items-center justify-between border-b p-6">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-9 w-28" />
        </div>
        <div className="p-6">
          <div className="space-y-2">
            {[1, 2, 3].map((source) => (
              <div
                key={source}
                className="flex items-center justify-between rounded-lg border p-3"
              >
                <div className="flex items-center gap-3">
                  <Skeleton className="size-10 rounded-md" />
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Skeleton className="size-8 rounded-md" />
                  <Skeleton className="size-8 rounded-md" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Appearance Card */}
      <div className="rounded-lg border bg-card">
        <div className="border-b p-6">
          <Skeleton className="h-6 w-32" />
        </div>
        <div className="space-y-6 p-6">
          <div className="space-y-2">
            <div>
            <Skeleton className="h-5 w-24" />
              <Skeleton className="mt-1 h-4 w-64" />
            </div>
            <Skeleton className="h-10 w-48" />
          </div>
          <div className="space-y-2">
            <div>
            <Skeleton className="h-5 w-24" />
              <Skeleton className="mt-1 h-4 w-64" />
            </div>
            <Skeleton className="h-10 w-64" />
          </div>
        </div>
      </div>

      {/* Data Management Card */}
      <div className="rounded-lg border bg-card">
        <div className="border-b p-6">
          <Skeleton className="h-6 w-40" />
        </div>
        <div className="space-y-4 p-6">
          {[1, 2].map((item) => (
            <div key={item} className="flex items-center justify-between">
              <div className="space-y-2">
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-4 w-64" />
              </div>
              <Skeleton className="h-9 w-20" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function MangaPageSkeleton() {
  return (
    <div className="space-y-8">
      <SkeletonHeader>
        <div className="flex items-center gap-2">
          <Skeleton className="size-8 rounded-md" />
          <Skeleton className="h-8 w-32" />
        </div>
      </SkeletonHeader>

      {/* Hero section */}
      <div className="flex flex-col gap-6 md:flex-row">
        {/* Cover */}
        <div className="shrink-0">
          <Skeleton className="mx-auto aspect-[3/4] w-48 rounded-lg shadow-xl md:w-56" />
        </div>

        {/* Info */}
        <div className="flex-1 space-y-4">
          <Skeleton className="h-9 w-3/4" />
          <Skeleton className="h-5 w-48" />
          <div className="flex flex-wrap gap-1.5">
            {[1, 2, 3, 4, 5].map((tag) => (
              <Skeleton key={tag} className="h-6 w-20 rounded-full" />
            ))}
          </div>
          <div className="space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />
          </div>
          <div className="flex flex-wrap gap-3 pt-2">
            <Skeleton className="h-11 w-40" />
            <Skeleton className="h-11 w-36" />
          </div>
        </div>
      </div>

      {/* Chapters */}
      <section>
        <div className="mb-4 flex items-baseline gap-2">
          <Skeleton className="h-7 w-40" />
          <Skeleton className="h-4 w-12" />
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((chapter) => (
            <Skeleton key={chapter} className="h-12 rounded-md" />
          ))}
        </div>
      </section>
    </div>
  );
}

export function SourceBrowsePageSkeleton() {
  return (
    <div className="space-y-4">
      <SkeletonHeader>
        <div className="flex items-center gap-2">
          <Skeleton className="size-8 rounded-md" />
          <Skeleton className="h-8 w-48" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="size-9 rounded-md" />
          <Skeleton className="size-9 rounded-md" />
        </div>
      </SkeletonHeader>

      {/* Listings header */}
      <div className="flex flex-wrap gap-2">
        {[1, 2, 3, 4].map((listing) => (
          <Skeleton key={listing} className="h-9 w-24 rounded-md" />
        ))}
      </div>

      {/* Content - manga gallery skeleton */}
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 sm:gap-4 md:grid-cols-5 lg:grid-cols-6">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((item) => (
          <div key={item} className="space-y-2">
            <Skeleton className="aspect-[3/4] w-full rounded-lg" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function LibraryPageSkeleton() {
  return (
    <div className="space-y-4">
      <SkeletonHeader>
        <Skeleton className="h-8 w-32" />
      </SkeletonHeader>

      <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 sm:gap-4 md:grid-cols-5 lg:grid-cols-6">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((manga) => (
          <div key={manga} className="space-y-2">
            <Skeleton className="aspect-[3/4] w-full rounded-lg" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        ))}
      </div>
    </div>
  );
}

