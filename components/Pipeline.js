"use client"

import { useEffect, useState } from "react"
import { useAuthSearchParams } from "@/lib/client/use-auth-search-params"

import { buildAuthUrl, hasAuthQuery } from "@/lib/client/auth-query"

const FALLBACK_PIPELINE = {
  pending: 0,
  inProgress: 0,
  completed: 0,
  flagged: 0,
}

export default function Pipeline({ initialPipeline }) {
  const searchParams = useAuthSearchParams()
  const [pipeline, setPipeline] = useState(FALLBACK_PIPELINE)
  const displayPipeline = initialPipeline ?? pipeline

  useEffect(() => {
    if (initialPipeline) {
      return
    }

    if (!hasAuthQuery(searchParams)) {
      return
    }

    let isMounted = true

    fetch(buildAuthUrl("/api/dashboard/pipeline", searchParams), {
      credentials: "include",
      cache: "no-store",
    })
      .then((res) => res.json())
      .then((data) => {
        if (isMounted && data.success) {
          setPipeline(data.data?.pipeline ?? FALLBACK_PIPELINE)
        }
      })
      .catch((error) => {
        console.error("Failed to fetch interview pipeline", error)
      })

    return () => {
      isMounted = false
    }
  }, [initialPipeline, searchParams])

  const cards = [
    { title: "Pending", count: displayPipeline.pending, color: "bg-blue-500" },
    { title: "In Progress", count: displayPipeline.inProgress, color: "bg-indigo-500" },
    { title: "Completed", count: displayPipeline.completed, color: "bg-green-500" },
    { title: "Flagged", count: displayPipeline.flagged, color: "bg-red-500" },
  ]

  return (
    <div className="mt-8">
      <h2 className="text-xl font-semibold mb-4">
        Interview Pipeline
      </h2>

      <div className="grid grid-cols-4 gap-4">
        {cards.map((item) => (
          <div
            key={item.title}
            className="bg-[#111a2e] rounded-lg p-5 shadow-md"
          >
            <div className="flex justify-between items-center">
              <span className="text-gray-400 text-sm">
                {item.title}
              </span>

              <div className={`w-3 h-3 rounded-full ${item.color}`}></div>
            </div>

            <div className="text-3xl font-bold mt-3">
              {item.count}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}




