"use client"

import { useEffect, useState } from "react"

export function useAuthSearchParams() {
  const [search, setSearch] = useState("")

  useEffect(() => {
    setSearch(window.location.search)
  }, [])

  return new URLSearchParams(search)
}
