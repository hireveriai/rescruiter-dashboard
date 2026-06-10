import { VerisGlobeLoader } from "@/components/system/loaders"

type LoadingOverlayProps = {
  visible: boolean
  title?: string
  message?: string
}

export default function LoadingOverlay({
  visible,
  title = "Processing request",
  message = "Keeping the workspace responsive while this isolated action completes.",
}: LoadingOverlayProps) {
  if (!visible) {
    return null
  }

  return (
    <div className="fixed inset-0 z-[140]">
      <VerisGlobeLoader
        eyebrow={title}
        steps={[
          { label: title, detail: message },
          { label: "Processing", detail: "Keeping the workspace locked while the request completes." },
          { label: "Updating view", detail: "Preparing the latest recruiter data for display." },
          { label: "Ready", detail: "The workspace is ready to continue." },
        ]}
        activeIndex={1}
        fullscreen
      />
    </div>
  )
}
