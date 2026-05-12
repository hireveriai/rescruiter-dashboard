import { SkeletonBlock, SkeletonPanel } from "./SkeletonPrimitives"

type ChartSkeletonProps = {
  height?: number
  title?: string
  className?: string
}

export default function ChartSkeleton({ height = 260, title = "Streaming analytics", className = "" }: ChartSkeletonProps) {
  return (
    <SkeletonPanel className={`p-5 ${className}`} aria-busy="true">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-slate-300">{title}</p>
          <SkeletonBlock className="mt-3 h-3 rounded-full" style={{ width: "190px" }} />
        </div>
        <SkeletonBlock className="h-9 w-24 rounded-full" />
      </div>

      <div className="mt-6 flex items-end gap-3" style={{ height }}>
        {[42, 68, 54, 82, 61, 74, 49, 88].map((value, index) => (
          <SkeletonBlock
            key={index}
            className="w-full rounded-t-2xl rounded-b-md"
            style={{ height: `${value}%`, animationDelay: `${index * 90}ms` }}
          />
        ))}
      </div>
    </SkeletonPanel>
  )
}
