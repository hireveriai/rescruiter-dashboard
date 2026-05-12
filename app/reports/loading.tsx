import RouteLoadingShell from "@/components/system/skeletons/RouteLoadingShell"

export default function Loading() {
  return (
    <RouteLoadingShell
      title="HireVeri Reports"
      mode="reports"
      tableColumns={5}
      intelligenceVariant="reports"
      intelligenceSteps={[
        "Loading organization analytics",
        "Correlating interview telemetry",
        "Preparing recruiter intelligence analytics",
        "Building forensic report modules",
      ]}
    />
  )
}
