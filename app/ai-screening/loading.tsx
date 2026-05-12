import RouteLoadingShell from "@/components/system/skeletons/RouteLoadingShell"

export default function Loading() {
  return (
    <RouteLoadingShell
      title="VERIS Screening"
      mode="forensic"
      tableColumns={9}
      intelligenceVariant="veris"
      intelligenceSteps={[
        "Loading candidate registry",
        "Running forensic resume correlation",
        "Building cognitive evaluation matrix",
        "Preparing forensic recommendations",
      ]}
    />
  )
}
