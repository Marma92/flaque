/**
 * Lightweight loading placeholders in the flaque palette. Decorative only
 * (aria-hidden) — pair with an sr-only / role=status label where needed.
 */
type SkeletonProps = {
  className?: string;
};

export function Skeleton({ className = "" }: SkeletonProps): JSX.Element {
  return <div className={`animate-pulse rounded-lg bg-flaque-clay/30 ${className}`} aria-hidden="true" />;
}

type SkeletonCardGridProps = {
  /** Full grid class string (cols, gap, margin) so the skeleton matches the real grid. */
  className: string;
  count?: number;
};

/** Grid of cover-card placeholders (square art + two text lines). */
export function SkeletonCardGrid({ className, count = 6 }: SkeletonCardGridProps): JSX.Element {
  return (
    <div className={className} aria-hidden="true">
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="flex flex-col gap-1.5">
          <Skeleton className="aspect-square w-full" />
          <Skeleton className="h-2.5 w-3/4" />
          <Skeleton className="h-2 w-1/2" />
        </div>
      ))}
    </div>
  );
}
