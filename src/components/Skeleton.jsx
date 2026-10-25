export default function Skeleton({ className = "" }) {
  return (
    <div className={`animate-pulse rounded-xl bg-lamp/15 ${className}`} />
  );
}

export function StoryCardSkeleton() {
  return (
    <div className="p-4 card">
      <Skeleton className="h-4 w-20 rounded-full" />
      <Skeleton className="mt-3 h-4 w-full" />
      <Skeleton className="mt-1 h-4 w-3/4" />
      <div className="mt-3 flex items-center gap-2">
        <Skeleton className="h-6 w-6 rounded-full" />
        <Skeleton className="h-3 w-24" />
      </div>
    </div>
  );
}
