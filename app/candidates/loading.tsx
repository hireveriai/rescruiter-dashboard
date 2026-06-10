import { VerisGlobeLoader } from "@/components/system/loaders"

export default function Loading() {
  return (
    <VerisGlobeLoader
      eyebrow="Candidates"
      steps={[
        { label: "Loading candidates", detail: "Fetching candidate profiles and screening history." },
        { label: "Syncing scores", detail: "Preparing VERIS scores and status." },
        { label: "Building registry", detail: "Organizing the candidate pipeline view." },
        { label: "Candidates ready", detail: "Candidate data is ready for review." },
      ]}
      activeIndex={1}
    />
  )
}
