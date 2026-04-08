"use client"

import { useEffect, useMemo, useState } from "react"

export function useAuthSearchParams() {
  const [search, setSearch] = useState("")

  useEffect(() => {
    const currentSearch = window.location.search
    const params = new URLSearchParams(currentSearch)
    let targetSearch = currentSearch

    if (!params.get("userId") || !params.get("organizationId")) {
      let fallback = null

      try {
        const storedAuth = window.sessionStorage.getItem("hireveri-auth")
        if (storedAuth) {
          const parsed = JSON.parse(storedAuth)
          if (parsed?.userId && parsed?.organizationId) {
            fallback = {
              userId: parsed.userId,
              organizationId: parsed.organizationId,
            }
          }
        }
      } catch (error) {
        console.warn("Failed to parse cached auth params", error)
      }

      if (!fallback) {
        try {
          const cachedOverview = window.sessionStorage.getItem("hireveri-overview")
          if (cachedOverview) {
            const parsedOverview = JSON.parse(cachedOverview)
            const profile = parsedOverview?.profile
            if (profile?.userId && profile?.organizationId) {
              fallback = {
                userId: profile.userId,
                organizationId: profile.organizationId,
              }
            }
          }
        } catch (error) {
          console.warn("Failed to parse cached recruiter overview", error)
        }
      }

      if (fallback) {
        params.set("userId", fallback.userId)
        params.set("organizationId", fallback.organizationId)
        targetSearch = `?${params.toString()}`
      }
    }

    const frame = window.requestAnimationFrame(() => {
      setSearch(targetSearch)
    })

    return () => {
      window.cancelAnimationFrame(frame)
    }
  }, [])

  return useMemo(() => new URLSearchParams(search), [search])
}
