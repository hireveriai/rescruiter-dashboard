"use client"

import { useEffect, useMemo, useState } from "react"

export function useAuthSearchParams() {
  const [search, setSearch] = useState("")

  useEffect(() => {
    const url = new URL(window.location.href)
    const hadUserId = url.searchParams.has("userId")
    const hadOrganizationId = url.searchParams.has("organizationId")

    if (hadUserId) {
      url.searchParams.delete("userId")
    }

    if (hadOrganizationId) {
      url.searchParams.delete("organizationId")
    }

    const nextSearch = url.search

    if (hadUserId || hadOrganizationId) {
      window.history.replaceState({}, "", `${url.pathname}${nextSearch}${url.hash}`)
    }

    const frame = window.requestAnimationFrame(() => {
      setSearch(nextSearch)
    })

    return () => {
      window.cancelAnimationFrame(frame)
    }
  }, [])

  return useMemo(() => new URLSearchParams(search), [search])
}
