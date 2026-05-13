"use client"

import GlobalIntelligenceBar from "./GlobalIntelligenceBar"

type NavigationProgressProps = {
  active?: boolean
  message?: string
}

export default function NavigationProgress({
  active = true,
  message = "Preparing recruiter insights...",
}: NavigationProgressProps) {
  return <GlobalIntelligenceBar active={active} visible={active} message={message} />
}
