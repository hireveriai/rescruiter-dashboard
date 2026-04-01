"use client"

import { useEffect, useMemo, useState } from "react"

export function useAuthSearchParams() {
  const [search, setSearch] = useState("")

  useEffect(() => {
    setSearch(window.location.search)
  }, [])

  return useMemo(() => new URLSearchParams(search), [search])
}