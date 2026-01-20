import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

export function MessageListLoading() {
  return (
    <div className="flex flex-col gap-4 w-full max-w-3xl mx-auto">
      {Array.from({ length: 5 }).map((_, i) => (
        <div
          key={i}
          className={cn(
            "flex gap-2",
            i % 2 === 0 ? "justify-end" : "justify-start"
          )}
        >
          {i % 2 === 0 ? (
            // Human message skeleton (right-aligned)
            <Skeleton className="h-10 w-64 rounded-3xl" />
          ) : (
            // Assistant message skeleton (left-aligned)
            <>
              <Skeleton className="h-8 w-8 rounded-full" />
              <div className="flex flex-col gap-2">
                <Skeleton className="h-20 w-96 rounded-2xl" />
                <Skeleton className="h-8 w-64 rounded-2xl" />
              </div>
            </>
          )}
        </div>
      ))}
    </div>
  );
}

export function ThreadLoading() {
  return (
    <div className="flex w-full h-screen overflow-hidden">
      {/* Sidebar skeleton */}
      <div className="hidden lg:flex flex-col border-r bg-background items-start justify-start gap-6 h-screen w-[300px] shrink-0 p-4">
        <div className="flex items-center justify-between w-full">
          <Skeleton className="h-8 w-8 rounded" />
          <Skeleton className="h-6 w-32" />
        </div>
        <div className="flex flex-col w-full gap-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      </div>

      {/* Main content skeleton */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Header skeleton */}
        <div className="flex items-center justify-between gap-3 p-2 z-10 relative border-b bg-background">
          <div className="flex items-center gap-2">
            <Skeleton className="h-8 w-8 rounded-full" />
            <Skeleton className="h-4 w-24" />
          </div>
          <div className="flex items-center gap-2">
            <Skeleton className="h-8 w-8 rounded" />
            <Skeleton className="h-8 w-8 rounded" />
          </div>
        </div>

        {/* Messages area skeleton */}
        <div className="relative flex-1 overflow-hidden">
          <div className="absolute px-4 inset-0 overflow-y-scroll">
            <div className="pt-8 pb-16 max-w-3xl mx-auto flex flex-col gap-4 w-full">
              <MessageListLoading />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
