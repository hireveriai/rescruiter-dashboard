"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useAuthSearchParams } from "@/lib/client/use-auth-search-params"

import { buildAuthUrl, hasAuthQuery } from "@/lib/client/auth-query"
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

function BaseModalShell({ title, subtitle, children, onClose, width = "max-w-2xl" }) {
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/80 px-4 backdrop-blur-md">
      <div className={`w-full ${width} rounded-[28px] border border-cyan-400/20 bg-[linear-gradient(180deg,rgba(15,23,42,0.98),rgba(9,14,28,0.98))] p-6 shadow-[0_0_80px_rgba(34,211,238,0.12)]`}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-2xl font-semibold text-white">{title}</h3>
            {subtitle ? <p className="mt-2 text-sm text-slate-400">{subtitle}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-cyan-400/25 bg-cyan-400/10 px-4 py-2 text-sm text-cyan-100 transition hover:bg-cyan-400/20"
          >
            Close
          </button>
        </div>
        <div className="mt-6">{children}</div>
      </div>
    </div>
  )
}

function NoticeModal({ open, title, message, onClose, tone = "error" }) {
  if (!open) {
    return null
  }

  const toneClass = tone === "success"
    ? "border-emerald-400/25 bg-emerald-500/10 text-emerald-100"
    : "border-rose-400/25 bg-rose-500/10 text-rose-100"

  return (
    <BaseModalShell title={title} subtitle={null} onClose={onClose} width="max-w-xl">
      <div className={`rounded-2xl border p-4 text-sm ${toneClass}`}>
        {message}
      </div>
      <div className="mt-5 flex justify-end">
        <button
          type="button"
          onClick={onClose}
          className="rounded-2xl bg-white px-5 py-2.5 text-sm font-medium text-slate-900 transition hover:bg-slate-100"
        >
          OK
        </button>
      </div>
    </BaseModalShell>
  )
}

function DateTimeField({ label, value, onChange }) {
  return (
    <div>
      <label className="mb-2 block text-sm text-gray-400">{label}</label>
      <input
        type="datetime-local"
        className="w-full rounded-2xl border border-slate-700 bg-slate-950/80 px-4 py-3 text-white outline-none transition focus:border-cyan-400/60"
        value={value}
        onChange={onChange}
      />
    </div>
  )
}

function EditInterviewModal({ isOpen, item, form, onChange, onClose, onSave, saving }) {
  if (!isOpen || !item) {
    return null
  }

  return (
    <BaseModalShell
      title="Edit Interview Invite"
      subtitle="Update access type or reschedule the current pending interview link."
      onClose={onClose}
    >
      <div className="grid gap-5">
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm text-slate-300">
          <p className="font-medium text-white">{item.candidateName}</p>
          <p className="mt-1 text-slate-400">{item.jobTitle}</p>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/55 p-4">
          <p className="mb-3 text-sm font-medium text-slate-300">Interview Access Type</p>

          <label className="mb-2 flex items-center gap-3 rounded-xl border border-transparent px-3 py-2 text-sm text-slate-200 transition hover:border-cyan-500/20 hover:bg-slate-800/60">
            <input
              type="radio"
              value="FLEXIBLE"
              checked={form.accessType === "FLEXIBLE"}
              onChange={() => onChange({ accessType: "FLEXIBLE" })}
              className="h-4 w-4 accent-cyan-400"
            />
            <span>Flexible (24h access)</span>
          </label>

          <label className="flex items-center gap-3 rounded-xl border border-transparent px-3 py-2 text-sm text-slate-200 transition hover:border-cyan-500/20 hover:bg-slate-800/60">
            <input
              type="radio"
              value="SCHEDULED"
              checked={form.accessType === "SCHEDULED"}
              onChange={() => onChange({ accessType: "SCHEDULED" })}
              className="h-4 w-4 accent-cyan-400"
            />
            <span>Scheduled (specific time window)</span>
          </label>
        </div>

        {form.accessType === "SCHEDULED" ? (
          <div className="grid gap-4 md:grid-cols-2">
            <DateTimeField label="Start Time" value={form.startTime} onChange={(e) => onChange({ startTime: e.target.value })} />
            <DateTimeField label="End Time" value={form.endTime} onChange={(e) => onChange({ endTime: e.target.value })} />
          </div>
        ) : null}

        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-2xl border border-slate-700 bg-slate-900/70 px-4 py-2.5 text-sm text-slate-200 transition hover:border-slate-500 hover:text-white"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={saving}
            className="rounded-2xl bg-gradient-to-r from-cyan-500 via-blue-500 to-indigo-500 px-5 py-2.5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </div>
    </BaseModalShell>
  )
}

function DeleteInterviewModal({ isOpen, item, reason, onReasonChange, onClose, onConfirm, deleting }) {
  if (!isOpen || !item) {
    return null
  }

  return (
    <BaseModalShell
      title="Delete Interview Invite"
      subtitle="This will revoke the interview link so it can no longer be used by the candidate."
      onClose={onClose}
    >
      <div className="grid gap-5">
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm text-slate-300">
          <p className="font-medium text-white">{item.candidateName}</p>
          <p className="mt-1 text-slate-400">{item.jobTitle}</p>
          <p className="mt-2 text-xs uppercase tracking-[0.18em] text-amber-300/80">
            {getInterviewTypeLabel(item)}
          </p>
        </div>

        <div>
          <label className="mb-2 block text-sm text-slate-300">Reason for cancellation</label>
          <textarea
            value={reason}
            onChange={(e) => onReasonChange(e.target.value)}
            rows={4}
            placeholder="Candidate not available"
            className="w-full rounded-2xl border border-slate-700 bg-slate-950/80 px-4 py-3 text-white outline-none transition placeholder:text-slate-500 focus:border-rose-400/60"
          />
        </div>

        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-2xl border border-slate-700 bg-slate-900/70 px-4 py-2.5 text-sm text-slate-200 transition hover:border-slate-500 hover:text-white"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={deleting}
            className="rounded-2xl border border-rose-400/30 bg-rose-500/10 px-5 py-2.5 text-sm font-medium text-rose-100 transition hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {deleting ? "Deleting..." : "Delete Invite"}
          </button>
        </div>
      </div>
    </BaseModalShell>
  )
}

function PendingInterviewsModal({ isOpen, onClose, interviews, onCopy, onEdit, onDelete, nowTick, copiedLink, busyInviteId }) {
  if (!isOpen) {
    return null
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#020817]/80 px-4 backdrop-blur-md">
      <div className="relative w-full max-w-6xl overflow-hidden rounded-[28px] border border-cyan-400/20 bg-[radial-gradient(circle_at_top,_rgba(34,211,238,0.14),_transparent_34%),linear-gradient(180deg,rgba(15,23,42,0.98),rgba(9,14,28,0.98))] shadow-[0_0_80px_rgba(34,211,238,0.12)]">
        <div className="absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-cyan-300/70 to-transparent" />

        <div className="flex items-center justify-between border-b border-white/10 px-8 py-6">
          <div>
            <h3 className="text-2xl font-semibold text-white">All Invited Interviews</h3>
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
          <div className="grid grid-cols-[1.1fr_1fr_1.25fr_1fr_0.9fr_1.25fr] gap-4 border-b border-white/10 pb-3 text-xs uppercase tracking-[0.24em] text-slate-500">
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
                No invited interviews
              </div>
            ) : (
              interviews.map((item) => (
                <div
                  key={item.inviteId}
                  className="grid grid-cols-[1.1fr_1fr_1.25fr_1fr_0.9fr_1.25fr] gap-4 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-4 text-sm text-slate-200 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
                >
                  <div className="font-medium text-white">{item.candidateName}</div>
                  <div className="text-slate-300">{item.jobTitle}</div>
                  <div className="text-cyan-200">{getInterviewTypeLabel(item)}</div>
                  <div className="text-slate-400">{formatDate(item.createdAt)}</div>
                  <div className="text-amber-300">{getExpiryLabel(item.expiresAt, nowTick)}</div>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => onCopy(item.link)} className="rounded-full border border-cyan-400/30 bg-cyan-400/10 px-3 py-1.5 text-cyan-100 transition hover:bg-cyan-400/20">
                      {copiedLink === item.link ? "Copied" : "Copy"}
                    </button>
                    <button type="button" onClick={() => onEdit(item)} className="rounded-full border border-indigo-400/30 bg-indigo-400/10 px-3 py-1.5 text-indigo-100 transition hover:bg-indigo-400/20">
                      Edit
                    </button>
                    <button type="button" disabled={busyInviteId === item.inviteId} onClick={() => onDelete(item)} className="rounded-full border border-rose-400/30 bg-rose-500/10 px-3 py-1.5 text-rose-100 transition hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-60">
                      {busyInviteId === item.inviteId ? "Deleting..." : "Delete"}
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

export default function PendingInterviews({ initialPendingInterviews }) {
  const searchParams = useAuthSearchParams()
  const [interviews, setInterviews] = useState(() => initialPendingInterviews ?? [])
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editItem, setEditItem] = useState(null)
  const [editForm, setEditForm] = useState({ accessType: "FLEXIBLE", startTime: "", endTime: "" })
  const [savingEdit, setSavingEdit] = useState(false)
  const [deleteItem, setDeleteItem] = useState(null)
  const [deleteReason, setDeleteReason] = useState("Candidate not available")
  const [busyInviteId, setBusyInviteId] = useState("")
  const [notice, setNotice] = useState({ open: false, title: "", message: "", tone: "error" })
  const [nowTick, setNowTick] = useState(() => Date.now())
  const [copiedLink, setCopiedLink] = useState("")
  const hasInitial = initialPendingInterviews !== undefined

  const loadPendingInterviews = useCallback(async () => {
    if (!hasAuthQuery(searchParams)) {
      return
    }

    const response = await fetch(buildAuthUrl("/api/dashboard/pipeline", searchParams), {
      credentials: "include",
      cache: "no-store",
    })

    const data = await response.json()

    if (!response.ok) {
      throw new Error(data?.error?.message || data?.message || "Failed to fetch pending interviews")
    }

    setInterviews(data.data?.pendingInterviews ?? [])
  }, [searchParams])

  useEffect(() => {
    if (hasInitial) {
      return
    }

    let isMounted = true

    loadPendingInterviews().catch((error) => {
      if (isMounted) {
        console.error("Failed to fetch pending interviews", error)
      }
    })

    return () => {
      isMounted = false
    }
  }, [hasInitial, loadPendingInterviews])

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

  function handleEditOpen(item) {
    setEditItem(item)
    setEditForm({
      accessType: String(item.accessType ?? "FLEXIBLE").toUpperCase(),
      startTime: item.startTime ? new Date(item.startTime).toISOString().slice(0, 16) : "",
      endTime: item.endTime ? new Date(item.endTime).toISOString().slice(0, 16) : "",
    })
  }

  function handleDeleteOpen(item) {
    setDeleteItem(item)
    setDeleteReason("Candidate not available")
  }

  async function handleEditSave() {
    if (!editItem) {
      return
    }

    if (editForm.accessType === "SCHEDULED" && (!editForm.startTime || !editForm.endTime)) {
      setNotice({
        open: true,
        title: "Update Required",
        message: "Start time and end time are required for scheduled interviews.",
        tone: "error",
      })
      return
    }

    try {
      setSavingEdit(true)

      const response = await fetch(buildAuthUrl(`/api/interview/manage/${editItem.inviteId}`, searchParams), {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          accessType: editForm.accessType,
          startTime: editForm.accessType === "SCHEDULED" ? new Date(editForm.startTime).toISOString() : null,
          endTime: editForm.accessType === "SCHEDULED" ? new Date(editForm.endTime).toISOString() : null,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data?.error?.message || data?.message || "Failed to update interview invite")
      }

      setEditItem(null)
      await loadPendingInterviews()
    } catch (error) {
      setNotice({
        open: true,
        title: "Unable to update invite",
        message: error instanceof Error ? error.message : "Failed to update interview invite",
        tone: "error",
      })
    } finally {
      setSavingEdit(false)
    }
  }

  async function handleDeleteConfirm() {
    if (!deleteItem) {
      return
    }

    try {
      setBusyInviteId(deleteItem.inviteId)

      const response = await fetch(buildAuthUrl(`/api/interview/manage/${deleteItem.inviteId}`, searchParams), {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({ reason: deleteReason.trim() || null }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data?.error?.message || data?.message || "Failed to revoke interview invite")
      }

      setDeleteItem(null)
      setDeleteReason("Candidate not available")
      await loadPendingInterviews()
      setNotice({
        open: true,
        title: "Interview invite deleted",
        message: "The interview link was revoked successfully.",
        tone: "success",
      })
    } catch (error) {
      setNotice({
        open: true,
        title: "Unable to delete invite",
        message: error instanceof Error ? error.message : "Failed to revoke interview invite",
        tone: "error",
      })
    } finally {
      setBusyInviteId("")
    }
  }

  return (
    <>
      <div className="mt-10">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold">
            Invited Interviews
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
                    No invited interviews
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
                      <div className="flex flex-wrap gap-3 text-xs sm:text-sm">
                        <button className="text-blue-400" onClick={() => handleCopy(item.link)}>
                          {copiedLink === item.link ? "Copied" : "Copy"}
                        </button>
                        <button className="text-indigo-300" onClick={() => handleEditOpen(item)}>
                          Edit
                        </button>
                        <button className="text-rose-300" onClick={() => handleDeleteOpen(item)}>
                          {busyInviteId === item.inviteId ? "Deleting..." : "Delete"}
                        </button>
                      </div>
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
        onEdit={handleEditOpen}
        onDelete={handleDeleteOpen}
        nowTick={nowTick}
        copiedLink={copiedLink}
        busyInviteId={busyInviteId}
      />

      <EditInterviewModal
        isOpen={Boolean(editItem)}
        item={editItem}
        form={editForm}
        onChange={(patch) => setEditForm((current) => ({ ...current, ...patch }))}
        onClose={() => setEditItem(null)}
        onSave={handleEditSave}
        saving={savingEdit}
      />

      <DeleteInterviewModal
        isOpen={Boolean(deleteItem)}
        item={deleteItem}
        reason={deleteReason}
        onReasonChange={setDeleteReason}
        onClose={() => setDeleteItem(null)}
        onConfirm={handleDeleteConfirm}
        deleting={Boolean(deleteItem) && busyInviteId === deleteItem?.inviteId}
      />

      <NoticeModal
        open={notice.open}
        title={notice.title}
        message={notice.message}
        tone={notice.tone}
        onClose={() => setNotice((current) => ({ ...current, open: false }))}
      />
    </>
  )
}
