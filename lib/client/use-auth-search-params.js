"use client"

import { useEffect, useMemo, useState } from "react"

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function isUuid(value) {
  return UUID_REGEX.test(String(value || "").trim())
}

export function useAuthSearchParams() {
  const [search, setSearch] = useState("")

  useEffect(() => {
    const currentSearch = window.location.search
    const params = new URLSearchParams(currentSearch)
    let targetSearch = currentSearch

    if (!isUuid(params.get("userId")) || !isUuid(params.get("organizationId"))) {
      let fallback = null

      try {
        const storedAuth = window.sessionStorage.getItem("hireveri-auth")
        if (storedAuth) {
          const parsed = JSON.parse(storedAuth)
          if (isUuid(parsed?.userId) && isUuid(parsed?.organizationId)) {
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
            if (isUuid(profile?.userId) && isUuid(profile?.organizationId)) {
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
