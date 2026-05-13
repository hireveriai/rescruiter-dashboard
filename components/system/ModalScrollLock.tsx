"use client"

import { useEffect } from "react"

const MODAL_SELECTOR = [
  "[aria-modal='true']",
  "[data-modal-root='true']",
  ".fixed.inset-0.z-50",
  ".fixed.inset-0.z-\\[50\\]",
  ".fixed.inset-0.z-\\[60\\]",
  ".fixed.inset-0.z-\\[70\\]",
].join(",")

function hasOpenModal() {
  return Boolean(document.querySelector(MODAL_SELECTOR))
}

export default function ModalScrollLock() {
  useEffect(() => {
    const originalOverflow = document.body.style.overflow
    const originalPaddingRight = document.body.style.paddingRight

    function syncBodyLock() {
      if (hasOpenModal()) {
        const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth
        document.body.style.overflow = "hidden"
        if (scrollbarWidth > 0) {
          document.body.style.paddingRight = `${scrollbarWidth}px`
        }
        return
      }

      document.body.style.overflow = originalOverflow
      document.body.style.paddingRight = originalPaddingRight
    }

    const observer = new MutationObserver(syncBodyLock)
    observer.observe(document.body, {
      attributes: true,
      childList: true,
      subtree: true,
    })

    syncBodyLock()

    return () => {
      observer.disconnect()
      document.body.style.overflow = originalOverflow
      document.body.style.paddingRight = originalPaddingRight
    }
  }, [])

  return null
}
