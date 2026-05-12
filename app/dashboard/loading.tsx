import RouteLoadingShell from "@/components/system/skeletons/RouteLoadingShell"

export default function Loading() {
  return (
    <RouteLoadingShell
      title="Recruiter Dashboard"
      mode="dashboard"
      tableColumns={6}
      intelligenceVariant="dashboard"
      intelligenceSteps={[
        "Loading recruiter insights",
        "Synchronizing hiring intelligence",
        "Building AI recruiter insights",
        "Preparing workflow recommendations",
      ]}
    />
  )
}
