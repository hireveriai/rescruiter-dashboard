import RouteLoadingShell from "@/components/system/skeletons/RouteLoadingShell"

export default function Loading() {
  return (
    <RouteLoadingShell
      title="Interview Registry"
      tableColumns={8}
      intelligenceVariant="interviews"
      intelligenceSteps={[
        "Loading interview registry",
        "Synchronizing interview telemetry",
        "Building behavioral timeline",
        "Preparing session intelligence",
      ]}
    />
  )
}
