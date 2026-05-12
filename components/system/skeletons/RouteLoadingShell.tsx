import { CardSkeleton, ChartSkeleton, MetricSkeleton, TableSkeleton, TimelineSkeleton } from "."
import { AIIntelligenceLoader } from "@/components/system/loaders"

type RouteLoadingShellProps = {
  title: string
  subtitle?: string
  tableColumns?: number
  mode?: "dashboard" | "table" | "reports" | "forensic"
  intelligenceVariant?: "dashboard" | "candidates" | "veris" | "interviews" | "reports" | "default"
  intelligenceSteps?: string[]
}

const defaultStepsByMode = {
  dashboard: [
    "Loading recruiter insights",
    "Synchronizing hiring intelligence",
    "Building AI recruiter insights",
    "Preparing workflow recommendations",
  ],
  table: [
    "Loading candidate registry",
    "Synchronizing workspace permissions",
    "Building cognition matrix",
    "Preparing recruiter view",
  ],
  reports: [
    "Loading organization analytics",
    "Correlating interview telemetry",
    "Preparing forensic analysis",
    "Building recruiter intelligence report",
  ],
  forensic: [
    "Loading candidate registry",
    "Running forensic resume correlation",
    "Building cognitive evaluation matrix",
    "Preparing forensic recommendations",
  ],
}

export default function RouteLoadingShell({
  title,
  subtitle = "Streaming recruiter workspace data.",
  tableColumns = 6,
  mode = "table",
  intelligenceVariant = mode === "forensic" ? "veris" : mode === "table" ? "default" : mode,
  intelligenceSteps,
}: RouteLoadingShellProps) {
  const steps = intelligenceSteps ?? defaultStepsByMode[mode]

  return (
    <div className="min-h-screen bg-[#08111f] text-white">
      <main className="mx-auto max-w-[1600px] px-4 py-8 sm:px-6 lg:px-8">
        <AIIntelligenceLoader
          title={title}
          steps={steps}
          variant={intelligenceVariant}
        />

        <div className="mt-8 grid gap-6">
          <MetricSkeleton count={mode === "dashboard" ? 4 : 3} className={mode === "dashboard" ? "grid-cols-2 lg:grid-cols-4" : "sm:grid-cols-3"} />
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
