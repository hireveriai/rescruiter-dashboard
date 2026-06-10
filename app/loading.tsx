import { VerisGlobeLoader } from "@/components/system/loaders"

export default function Loading() {
  return (
    <VerisGlobeLoader
      eyebrow="HireVeri Workspace"
      steps={[
        { label: "Opening dashboard", detail: "Loading recruiter workspace and organization access." },
        { label: "Syncing signals", detail: "Preparing candidates, interviews, reports, and VERIS metrics." },
        { label: "Building view", detail: "Assembling the latest hiring intelligence." },
        { label: "Workspace ready", detail: "Your recruiter data is ready for review." },
      ]}
      activeIndex={1}
    />
  )
}
