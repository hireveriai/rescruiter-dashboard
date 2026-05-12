import { CardSkeleton, ChartSkeleton, MetricSkeleton, TableSkeleton, TimelineSkeleton } from "."

type RouteLoadingShellProps = {
  title: string
  subtitle?: string
  tableColumns?: number
  mode?: "dashboard" | "table" | "reports" | "forensic"
}

export default function RouteLoadingShell({
  title,
  subtitle = "Streaming recruiter workspace data.",
  tableColumns = 6,
  mode = "table",
}: RouteLoadingShellProps) {
  return (
    <div className="min-h-screen bg-[#08111f] text-white">
      <main className="mx-auto max-w-[1600px] px-4 py-8 sm:px-6 lg:px-8">
        <section className="rounded-[28px] border border-slate-800 bg-[linear-gradient(180deg,rgba(15,23,42,0.96),rgba(8,17,31,0.98))] p-8 shadow-[0_24px_80px_rgba(2,6,23,0.45)]">
          <p className="text-xs font-semibold uppercase tracking-[0.32em] text-cyan-300/75">{title}</p>
          <div className="mt-4 grid gap-6 xl:grid-cols-[1fr_0.75fr] xl:items-end">
            <div>
              <div className="h-10 max-w-xl rounded-2xl border border-cyan-300/10 bg-slate-900/70" />
              <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-400">{subtitle}</p>
            </div>
            <MetricSkeleton count={mode === "dashboard" ? 4 : 3} className={mode === "dashboard" ? "grid-cols-2 lg:grid-cols-4" : "sm:grid-cols-3"} />
          </div>
        </section>

        <div className="mt-8 grid gap-6">
          {mode === "reports" ? <ChartSkeleton title="Streaming analytics" /> : null}
          {mode === "forensic" ? (
            <TimelineSkeleton
              messages={[
                "Loading behavioral telemetry...",
                "Preparing cognitive analysis...",
                "Building forensic timeline...",
              ]}
            />
          ) : null}
          {mode === "dashboard" ? <CardSkeleton count={3} className="grid-cols-1 md:grid-cols-3" /> : null}
          <div className="overflow-hidden rounded-[28px] border border-slate-800 bg-[#0f172a]">
            <table className="w-full min-w-[980px] text-sm">
              <thead className="bg-slate-950/20 text-slate-400">
                <tr>
                  {Array.from({ length: tableColumns }).map((_, index) => (
                    <th key={index} className="p-5 text-left font-medium">
                      <span className="sr-only">Column {index + 1}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <TableSkeleton rows={6} columns={tableColumns} showAvatar showStatusChip />
            </table>
          </div>
        </div>
      </main>
    </div>
  )
}
