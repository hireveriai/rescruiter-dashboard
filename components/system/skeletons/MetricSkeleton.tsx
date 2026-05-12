import { SkeletonBlock, SkeletonLabel, SkeletonPanel } from "./SkeletonPrimitives"

type MetricSkeletonProps = {
  count?: number
  className?: string
}

export default function MetricSkeleton({ count = 4, className = "" }: MetricSkeletonProps) {
  return (
    <div className={`grid gap-4 ${className}`} aria-busy="true" aria-live="polite">
      {Array.from({ length: count }).map((_, index) => (
        <SkeletonPanel key={index} className="p-5">
          <div className="flex items-center justify-between gap-4">
            <SkeletonLabel width={index % 2 === 0 ? "42%" : "54%"} />
            <SkeletonBlock className="h-3 w-3 rounded-full border-blue-300/20 bg-blue-400/20" />
          </div>
          <SkeletonBlock className="mt-4 h-9 rounded-lg" style={{ width: index === 3 ? "42%" : "34%" }} />
        </SkeletonPanel>
      ))}
    </div>
  )
}
