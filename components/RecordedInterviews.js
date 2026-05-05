"use client"

import { useEffect, useMemo, useState } from "react"
import { useAuthSearchParams } from "@/lib/client/use-auth-search-params"

import { buildAuthUrl, hasAuthQuery } from "@/lib/client/auth-query"
import { formatDateTime } from "@/lib/client/date-format"
import { openWarRoom } from "@/lib/client/war-room"

function getRetentionLabel(days) {
  return `${days ?? 30} days retention`
}

function RecordedInterviewsModal({ isOpen, onClose, interviews }) {
  if (!isOpen) {
    return null
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#020817]/80 px-4 backdrop-blur-md">
      <div className="relative w-full max-w-6xl overflow-hidden rounded-[28px] border border-fuchsia-400/20 bg-[radial-gradient(circle_at_top,_rgba(168,85,247,0.16),_transparent_34%),linear-gradient(180deg,rgba(15,23,42,0.98),rgba(9,14,28,0.98))] shadow-[0_0_80px_rgba(168,85,247,0.16)]">
        <div className="absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-fuchsia-300/70 to-transparent" />

        <div className="flex items-center justify-between border-b border-white/10 px-8 py-6">
          <div>
            <h3 className="text-2xl font-semibold text-white">All Recorded Interviews</h3>
            <p className="mt-2 text-sm text-slate-400">
              Candidate recordings sorted by newest capture first.
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
          <div className="grid grid-cols-[1.1fr_1fr_1.6fr_0.9fr_0.9fr] gap-4 border-b border-white/10 pb-3 text-xs uppercase tracking-[0.24em] text-slate-500">
            <div>Candidate</div>
            <div>Job</div>
            <div>Transcript Preview</div>
            <div>Recorded</div>
            <div>Retention</div>
          </div>

          <div className="mt-4 space-y-3">
            {interviews.length === 0 ? (
              <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-6 text-center text-slate-400">
                No interview recordings available
              </div>
            ) : (
              interviews.map((item) => (
                <div
                  key={item.recordingId}
                  className="grid grid-cols-[1.1fr_1fr_1.6fr_0.9fr_0.9fr] gap-4 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-4 text-sm text-slate-200 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
                >
                  <div className="font-medium text-white">{item.candidateName}</div>
                  <div className="text-slate-300">{item.jobTitle}</div>
                  <div className="text-slate-400">{item.transcriptPreview}</div>
                  <div className="whitespace-nowrap text-slate-400">{formatDateTime(item.createdAt)}</div>
                  <div className="text-fuchsia-200">{getRetentionLabel(item.retentionDays)}</div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default function RecordedInterviews({ initialRecordedInterviews, organizationId = "" }) {
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

  const previewInterviews = sortedInterviews.slice(0, 3)

  return (
    <>
      <div className="mt-10">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold">
            Recorded Interviews
          </h2>

          <button
            type="button"
            className="text-blue-400 text-sm"
            onClick={() => setIsModalOpen(true)}
          >
            View All
          </button>
        </div>

        <div className="grid grid-cols-3 gap-4">
          {previewInterviews.length === 0 ? (
            <div className="col-span-3 rounded-lg bg-[#111a2e] p-5 text-center text-gray-400 shadow-md">
              No interview recordings available
            </div>
          ) : (
            previewInterviews.map((item) => (
              <div
                key={item.recordingId}
                className="bg-[#111a2e] p-5 rounded-lg shadow-md"
              >
                <div className="text-lg font-semibold">
                  {item.candidateName}
                </div>

                <div className="text-gray-400 text-sm mb-3">
                  {item.jobTitle}
                </div>

                <div className="text-sm text-gray-300 mb-2">
                  Recorded: <span className="whitespace-nowrap text-blue-400">{formatDateTime(item.createdAt)}</span>
                </div>

                <div className="text-sm text-gray-300 mb-4">
                  Retention: <span className="text-fuchsia-300">{getRetentionLabel(item.retentionDays)}</span>
                </div>

                <div className="text-sm text-slate-400 mb-4 min-h-[48px]">
                  {item.transcriptPreview}
                </div>

                <div className="flex gap-2">
                  <button className="bg-blue-500/70 px-3 py-1 rounded text-sm cursor-default">
                    View Recording
                  </button>

                  <button
                    type="button"
                    className="cursor-pointer border border-blue-400 px-3 py-1 rounded text-sm text-blue-400 transition hover:bg-blue-500/10"
                    onClick={() => openWarRoom(organizationId)}
                  >
                    War Room
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <RecordedInterviewsModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        interviews={sortedInterviews}
      />
    </>
  )
}




