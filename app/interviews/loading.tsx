import { VerisGlobeLoader } from "@/components/system/loaders"

export default function Loading() {
  return (
    <VerisGlobeLoader
      eyebrow="Interviews"
      steps={[
        { label: "Loading interviews", detail: "Fetching active, scheduled, and completed interviews." },
        { label: "Syncing telemetry", detail: "Preparing scorecards, recovery status, and recruiter actions." },
        { label: "Building register", detail: "Organizing interview operations for review." },
        { label: "Interviews ready", detail: "Interview data is ready for review." },
      ]}
      activeIndex={1}
    />
  )
}
