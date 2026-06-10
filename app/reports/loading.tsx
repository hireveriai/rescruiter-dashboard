import { VerisGlobeLoader } from "@/components/system/loaders"

export default function Loading() {
  return (
    <VerisGlobeLoader
      eyebrow="Reports"
      steps={[
        { label: "Loading reports", detail: "Fetching hiring analytics and forensic signals." },
        { label: "Reading metrics", detail: "Preparing funnel and risk data." },
        { label: "Building report", detail: "Assembling executive insight sections." },
        { label: "Reports ready", detail: "Recruiter analytics are ready for review." },
      ]}
      activeIndex={1}
    />
  )
}
