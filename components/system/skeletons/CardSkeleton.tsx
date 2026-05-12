import { SkeletonBlock, SkeletonLabel, SkeletonPanel } from "./SkeletonPrimitives"

type CardSkeletonProps = {
  count?: number
  className?: string
  compact?: boolean
}

export default function CardSkeleton({ count = 3, className = "", compact = false }: CardSkeletonProps) {
  return (
    <div className={`grid gap-4 ${className}`} aria-busy="true" aria-live="polite">
      {Array.from({ length: count }).map((_, index) => (
        <SkeletonPanel key={index} className={compact ? "p-4" : "p-5"}>
          <div className="flex items-start justify-between gap-4">
            <div className="w-full min-w-0">
              <SkeletonLabel width={index % 2 === 0 ? "44%" : "58%"} />
              <SkeletonBlock className="mt-4 h-6 rounded-lg" style={{ width: index % 2 === 0 ? "70%" : "52%" }} />
            </div>
            <SkeletonBlock className="h-10 w-10 shrink-0 rounded-2xl" />
          </div>
          <div className="mt-5 space-y-3">
            <SkeletonBlock className="h-3 rounded-full" />
            <SkeletonBlock className="h-3 rounded-full" style={{ width: "82%" }} />
            {!compact ? <SkeletonBlock className="h-3 rounded-full" style={{ width: "64%" }} /> : null}
          </div>
        </SkeletonPanel>
      ))}
    </div>
  )
}
