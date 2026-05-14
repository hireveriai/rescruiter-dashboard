"use client"

import { useEffect, useMemo, useState } from "react"
import { useAuthSearchParams } from "@/lib/client/use-auth-search-params"

import { buildAuthUrl, hasAuthQuery } from "@/lib/client/auth-query"
import { openWarRoom } from "@/lib/client/war-room"
import { CardSkeleton } from "@/components/system/skeletons"
import RecordedInterviewCard from "@/components/interviews/RecordedInterviewCard"

function RecordedInterviewsModal({ isOpen, onClose, interviews, organizationId }) {
  if (!isOpen) {
    return null
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[#020817]/80 px-4 py-4 backdrop-blur-md sm:py-6" role="dialog" aria-modal="true">
      <div className="relative w-full max-w-6xl overflow-hidden rounded-[28px] border border-fuchsia-400/20 bg-[radial-gradient(circle_at_top,_rgba(168,85,247,0.16),_transparent_34%),linear-gradient(180deg,rgba(15,23,42,0.98),rgba(9,14,28,0.98))] shadow-[0_0_80px_rgba(168,85,247,0.16)]">
        <div className="absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-fuchsia-300/70 to-transparent" />

        <div className="flex items-center justify-between border-b border-white/10 px-8 py-6">
          <div>
            <h3 className="text-2xl font-semibold text-white">Cognitive Evidence Archive</h3>
            <p className="mt-2 text-sm text-slate-400">
              Interview replay evidence, behavioral telemetry, and forensic review entry points.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-fuchsia-400/25 bg-fuchsia-400/10 px-4 py-2 text-sm text-fuchsia-100 transition hover:bg-fuchsia-400/20"
          >
            Close
          </button>
        </div>

        <div className="max-h-[75vh] overflow-auto px-8 py-6">
          <div className="grid gap-4 lg:grid-cols-2">
            {interviews.length === 0 ? (
              <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-6 text-center text-slate-400 lg:col-span-2">
                No interview recordings available
              </div>
            ) : (
              interviews.map((item) => (
                <RecordedInterviewCard
                  key={item.recordingId}
                  item={item}
                  compact
                  onOpenWarRoom={() => openWarRoom(organizationId)}
                />
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default function RecordedInterviews({ initialRecordedInterviews, organizationId = "", isLoading = false }) {
  const searchParams = useAuthSearchParams()
  const [interviews, setInterviews] = useState([])
  const [isModalOpen, setIsModalOpen] = useState(false)
  const displayInterviews = initialRecordedInterviews !== undefined ? initialRecordedInterviews : interviews

  useEffect(() => {
    if (initialRecordedInterviews !== undefined) {
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
          setInterviews(data.data?.recordedInterviews ?? [])
        }
      })
      .catch((error) => {
        console.error("Failed to fetch recorded interviews", error)
      })

    return () => {
      isMounted = false
    }
  }, [initialRecordedInterviews, searchParams])

  const sortedInterviews = useMemo(
    () =>
      [...displayInterviews].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      ),
    [displayInterviews]
  )

  const previewInterviews = sortedInterviews.slice(0, 2)

  return (
    <>
      <div className="mt-10">
        <div className="flex justify-between items-center mb-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-300/70">Evidence Review</p>
            <h2 className="mt-1 flex flex-wrap items-center gap-2 text-xl font-semibold text-white">
              Recorded Interviews
              <span className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-200">
                Recent
              </span>
            </h2>
          </div>

          {sortedInterviews.length > previewInterviews.length ? (
            <button
              type="button"
              className="text-blue-400 text-sm"
              onClick={() => setIsModalOpen(true)}
            >
              View All
            </button>
          ) : null}
        </div>

        {isLoading ? (
          <CardSkeleton count={2} className="grid-cols-1 lg:grid-cols-2" />
        ) : (
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            {previewInterviews.length === 0 ? (
            <div className="rounded-[24px] border border-slate-800 bg-[#111a2e] p-5 text-center text-gray-400 shadow-md lg:col-span-2">
              No interview recordings available
            </div>
          ) : (
            previewInterviews.map((item) => (
              <RecordedInterviewCard
                key={item.recordingId}
                item={item}
                organizationId={organizationId}
                onOpenWarRoom={() => openWarRoom(organizationId)}
              />
            ))
          )}
          </div>
        )}
      </div>

      <RecordedInterviewsModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        interviews={sortedInterviews}
        organizationId={organizationId}
      />
    </>
  )
}




