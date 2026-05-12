import { SkeletonBlock, SkeletonPanel } from "./SkeletonPrimitives"

type TimelineSkeletonProps = {
  count?: number
  messages?: string[]
  className?: string
}

export default function TimelineSkeleton({ count = 4, messages = [], className = "" }: TimelineSkeletonProps) {
  return (
    <SkeletonPanel className={`p-5 ${className}`} aria-busy="true" aria-live="polite">
      <div className="space-y-5">
        {Array.from({ length: count }).map((_, index) => (
          <div key={index} className="grid grid-cols-[24px_1fr] gap-4">
            <div className="relative flex justify-center">
              <SkeletonBlock className="h-6 w-6 rounded-full" />
              {index < count - 1 ? <div className="absolute top-8 h-12 w-px bg-cyan-300/10" /> : null}
            </div>
            <div className="min-w-0 rounded-2xl border border-slate-800 bg-slate-950/30 p-4">
              {messages[index] ? (
                <p className="text-sm font-medium text-cyan-100">{messages[index]}</p>
              ) : (
                <SkeletonBlock className="h-4 rounded-full" style={{ width: index % 2 === 0 ? "58%" : "72%" }} />
              )}
              <SkeletonBlock className="mt-3 h-3 rounded-full" style={{ width: "90%" }} />
              <SkeletonBlock className="mt-2 h-3 rounded-full" style={{ width: "64%" }} />
            </div>
          </div>
        ))}
      </div>
    </SkeletonPanel>
  )
}
