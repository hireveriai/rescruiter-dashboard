import { VerisGlobeLoader } from "@/components/system/loaders"

export default function Loading() {
  return (
    <VerisGlobeLoader
      eyebrow="Dashboard"
      steps={[
        { label: "Syncing dashboard", detail: "Loading hiring workflow, alerts, and workspace metrics." },
        { label: "Reading pipeline", detail: "Preparing candidate and interview activity." },
        { label: "Building overview", detail: "Assembling recruiter intelligence cards." },
        { label: "Dashboard ready", detail: "Your dashboard is ready for review." },
      ]}
      activeIndex={1}
    />
  )
}
