import { SkeletonBlock } from "./SkeletonPrimitives"

type TableSkeletonProps = {
  rows?: number
  columns?: number
  showAvatar?: boolean
  showStatusChip?: boolean
  className?: string
}

export default function TableSkeleton({
  rows = 5,
  columns = 5,
  showAvatar = false,
  showStatusChip = true,
  className = "",
}: TableSkeletonProps) {
  return (
    <tbody className={className} aria-busy="true" aria-live="polite">
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <tr key={rowIndex} className="border-t border-slate-800/80">
          {Array.from({ length: columns }).map((_, columnIndex) => {
            const isIdentity = showAvatar && columnIndex === 0
            const isChip = showStatusChip && columnIndex === 2

            return (
              <td key={columnIndex} className="p-4 align-middle">
                {isIdentity ? (
                  <div className="flex items-center gap-3">
                    <SkeletonBlock className="h-9 w-9 shrink-0 rounded-full" />
                    <div className="min-w-0 flex-1 space-y-2">
                      <SkeletonBlock className="h-3 rounded-full" style={{ width: "72%" }} />
                      <SkeletonBlock className="h-2.5 rounded-full" style={{ width: "48%" }} />
                    </div>
                  </div>
                ) : isChip ? (
                  <SkeletonBlock className="h-7 rounded-full" style={{ width: rowIndex % 2 === 0 ? "92px" : "118px" }} />
                ) : (
                  <SkeletonBlock
                    className="h-3 rounded-full"
                    style={{ width: `${48 + ((rowIndex + columnIndex) % 4) * 12}%` }}
                  />
                )}
              </td>
            )
          })}
        </tr>
      ))}
    </tbody>
  )
}
