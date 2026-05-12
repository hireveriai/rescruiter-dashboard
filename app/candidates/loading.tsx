import RouteLoadingShell from "@/components/system/skeletons/RouteLoadingShell"

export default function Loading() {
  return (
    <RouteLoadingShell
      title="Candidate Registry"
      tableColumns={7}
      intelligenceVariant="candidates"
      intelligenceSteps={[
        "Loading candidate registry",
        "Loading candidate cognition matrix",
        "Synchronizing profile signals",
        "Preparing recruiter shortlist view",
      ]}
    />
  )
}
