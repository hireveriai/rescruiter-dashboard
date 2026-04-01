"use client"

import { useEffect, useMemo, useState } from "react"
import { useAuthSearchParams } from "@/lib/client/use-auth-search-params"

import { buildAuthUrl } from "@/lib/client/auth-query"
import { copyText } from "@/lib/client/copy-to-clipboard"

function getExpiryLabel(expiresAt, nowTick) {
  if (!expiresAt) {
    return "No expiry"
  }

  const expiresAtDate = new Date(expiresAt)
  const diffMs = expiresAtDate.getTime() - nowTick

  if (Number.isNaN(expiresAtDate.getTime()) || diffMs <= 0) {
    return "Expired"
  }

  const totalHours = Math.ceil(diffMs / (1000 * 60 * 60))
  return `Expires in ${totalHours}h`
}

function formatDate(dateValue) {
  if (!dateValue) {
    return "-"
  }

  const date = new Date(dateValue)
  if (Number.isNaN(date.getTime())) {
    return "-"
  }

  return date.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function getInterviewTypeLabel(item) {
  const accessType = String(item.accessType ?? "FLEXIBLE").toUpperCase()

  if (accessType === "SCHEDULED") {
    return item.startTime ? `Scheduled: ${formatDate(item.startTime)}` : "Scheduled"
  }

  return "Flexible"
}

function PendingInterviewsModal({ isOpen, onClose, interviews, onCopy, nowTick, copiedLink }) {
  if (!isOpen) {
    return null
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#020817]/80 px-4 backdrop-blur-md">
      <div className="relative w-full max-w-6xl overflow-hidden rounded-[28px] border border-cyan-400/20 bg-[radial-gradient(circle_at_top,_rgba(34,211,238,0.14),_transparent_34%),linear-gradient(180deg,rgba(15,23,42,0.98),rgba(9,14,28,0.98))] shadow-[0_0_80px_rgba(34,211,238,0.12)]">
        <div className="absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-cyan-300/70 to-transparent" />

        <div className="flex items-center justify-between border-b border-white/10 px-8 py-6">
          <div>
            <h3 className="text-2xl font-semibold text-white">All Pending Interviews</h3>
            <p className="mt-2 text-sm text-slate-400">
              Live invite queue sorted by newest invite first.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-cyan-400/25 bg-cyan-400/10 px-4 py-2 text-sm text-cyan-100 transition hover:bg-cyan-400/20"
          >
            Close
          </button>
        </div>

        <div className="max-h-[75vh] overflow-auto px-8 py-6">
          <div className="grid grid-cols-[1.1fr_1fr_1.3fr_1fr_0.9fr_0.8fr] gap-4 border-b border-white/10 pb-3 text-xs uppercase tracking-[0.24em] text-slate-500">
            <div>Candidate</div>
            <div>Job</div>
            <div>Interview Type</div>
            <div>Created</div>
            <div>Expiry</div>
            <div>Action</div>
          </div>

          <div className="mt-4 space-y-3">
            {interviews.length === 0 ? (
              <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-6 text-center text-slate-400">
                No pending interview invites
              </div>
            ) : (
              interviews.map((item) => (
                <div
                  key={item.inviteId}
                  className="grid grid-cols-[1.1fr_1fr_1.3fr_1fr_0.9fr_0.8fr] gap-4 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-4 text-sm text-slate-200 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
                >
                  <div className="font-medium text-white">{item.candidateName}</div>
                  <div className="text-slate-300">{item.jobTitle}</div>
                  <div className="text-cyan-200">{getInterviewTypeLabel(item)}</div>
                  <div className="text-slate-400">{formatDate(item.createdAt)}</div>
                  <div className="text-amber-300">{getExpiryLabel(item.expiresAt, nowTick)}</div>
                  <div>
                    <button
                      type="button"
                      onClick={() => onCopy(item.link)}
                      className="rounded-full border border-cyan-400/30 bg-cyan-400/10 px-3 py-1.5 text-cyan-100 transition hover:bg-cyan-400/20"
                    >
                      {copiedLink === item.link ? "Copied" : "Copy Link"}
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default function PendingInterviews() {
  const searchParams = useAuthSearchParams()
  const [interviews, setInterviews] = useState([])
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [nowTick, setNowTick] = useState(() => Date.now())
  const [copiedLink, setCopiedLink] = useState("")

  useEffect(() => {
    let isMounted = true

    fetch(buildAuthUrl("/api/dashboard/pipeline", searchParams))
      .then((res) => res.json())
      .then((data) => {
        if (isMounted && data.success) {
          setInterviews(data.data?.pendingInterviews ?? [])
        }
      })
      .catch((error) => {
        console.error("Failed to fetch pending interviews", error)
      })

    return () => {
      isMounted = false
    }
  }, [searchParams])

  useEffect(() => {
    const timer = setInterval(() => {
      setNowTick(Date.now())
    }, 60000)

    return () => {
      clearInterval(timer)
    }
  }, [])

  useEffect(() => {
    if (!copiedLink) {
      return
    }

    const timer = setTimeout(() => setCopiedLink(""), 1800)
    return () => clearTimeout(timer)
  }, [copiedLink])

  const sortedInterviews = useMemo(
    () =>
      [...interviews].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      ),
    [interviews]
  )

  const previewInterviews = sortedInterviews.slice(0, 3)

  async function handleCopy(link) {
    const copied = await copyText(link)

    if (copied) {
      setCopiedLink(link)
      return
    }

    console.error("Failed to copy interview link")
  }

  return (
    <>
      <div className="mt-10">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold">
            Pending Interviews
          </h2>

          <button
            type="button"
            className="text-sm text-blue-400"
            onClick={() => setIsModalOpen(true)}
          >
            View All
          </button>
        </div>

        <div className="overflow-hidden rounded-lg bg-[#111a2e]">
          <table className="w-full text-sm">
            <thead className="border-b border-gray-700 text-gray-400">
              <tr>
                <th className="p-4 text-left">Candidate</th>
                <th className="p-4 text-left">Job</th>
                <th className="p-4 text-left">Interview Type</th>
                <th className="p-4 text-left">Link Expiry</th>
                <th className="p-4 text-left">Action</th>
              </tr>
            </thead>

            <tbody>
              {previewInterviews.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-4 text-center text-gray-400">
                    No pending interview invites
                  </td>
                </tr>
              ) : (
                previewInterviews.map((item) => (
                  <tr key={item.inviteId} className="border-b border-gray-800">
                    <td className="p-4">{item.candidateName}</td>
                    <td className="p-4 text-gray-300">{item.jobTitle}</td>
                    <td className="p-4 text-cyan-200">{getInterviewTypeLabel(item)}</td>
                    <td className="p-4 text-yellow-400">{getExpiryLabel(item.expiresAt, nowTick)}</td>
                    <td className="p-4">
                      <button className="text-blue-400" onClick={() => handleCopy(item.link)}>
                        {copiedLink === item.link ? "Copied" : "Copy Link"}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <PendingInterviewsModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        interviews={sortedInterviews}
        onCopy={handleCopy}
        nowTick={nowTick}
        copiedLink={copiedLink}
      />
    </>
  )
}
