"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"

import { buildAuthUrl, hasAuthQuery } from "@/lib/client/auth-query"
import { useAuthSearchParams } from "@/lib/client/use-auth-search-params"

import CreateJobModal from "./CreateJobModal"
import SendInterviewModal from "./SendInterviewModal"

const quickActions = [
  {
    id: "create-job",
    title: "Create Job",
    description: "Open a new role and configure the interview track.",
    tone: "primary",
  },
  {
    id: "send-link",
    title: "Send Interview Link",
    description: "Generate secure interview access for a candidate.",
    tone: "secondary",
  },
  {
    id: "upload-candidate",
    title: "Upload Candidate",
    description: "Review the full candidate registry and uploaded profiles.",
    tone: "neutral",
    href: "/candidates",
  },
  {
    id: "generate-report",
    title: "Generate Report",
    description: "Reporting workflows will be enabled in a later release.",
    tone: "disabled",
    disabled: true,
  },
]

function getCardClasses(tone, disabled) {
  if (disabled || tone === "disabled") {
    return "border-slate-800 bg-slate-950/30 text-slate-500"
  }

  if (tone === "primary") {
    return "border-blue-500/20 bg-[linear-gradient(135deg,rgba(59,130,246,0.22),rgba(37,99,235,0.08))] text-white hover:border-blue-400/40 hover:bg-[linear-gradient(135deg,rgba(59,130,246,0.28),rgba(37,99,235,0.12))]"
  }

  if (tone === "secondary") {
    return "border-cyan-500/20 bg-[linear-gradient(135deg,rgba(34,211,238,0.16),rgba(15,23,42,0.3))] text-white hover:border-cyan-400/40 hover:bg-[linear-gradient(135deg,rgba(34,211,238,0.22),rgba(15,23,42,0.45))]"
  }

  return "border-slate-700 bg-slate-900/65 text-white hover:border-slate-500 hover:bg-slate-900/90"
}

export default function Sidebar({ initialProfile = null }) {
  const searchParams = useAuthSearchParams()
  const [user, setUser] = useState(initialProfile)
  const [profileError, setProfileError] = useState("")
  const [openCreateJob, setOpenCreateJob] = useState(false)
  const [openSendInterview, setOpenSendInterview] = useState(false)

  useEffect(() => {
    let isMounted = true

    function handleOpenCreateJobEvent() {
      setOpenCreateJob(true)
    }

    if (!initialProfile && hasAuthQuery(searchParams)) {
      fetch(buildAuthUrl("/api/me", searchParams), {
        credentials: "include",
        cache: "no-store",
      })
        .then((res) => res.json())
        .then((data) => {
          if (!isMounted) {
            return
          }

          if (data.success) {
            setUser(data.data)
            setProfileError("")
            return
          }

          setUser(data.data ?? null)
          setProfileError(data.error?.message || data.message || "Recruiter profile could not be loaded")
        })
        .catch((error) => {
          console.error("Failed to fetch recruiter profile", error)
          if (isMounted) {
            setProfileError("Recruiter profile could not be loaded")
          }
        })
    }

    window.addEventListener("hireveri:open-create-job", handleOpenCreateJobEvent)

    return () => {
      isMounted = false
      window.removeEventListener("hireveri:open-create-job", handleOpenCreateJobEvent)
    }
  }, [initialProfile, searchParams])

  const initials = useMemo(
    () =>
      user?.name
        ?.split(" ")
        .map((part) => part[0])
        .join("") || "..",
    [user]
  )

  const handleAction = (id) => {
    if (id === "create-job") {
      setOpenCreateJob(true)
      return
    }

    if (id === "send-link") {
      setOpenSendInterview(true)
    }
  }

  return (
    <>
      <aside className="mt-10 rounded-[24px] border border-slate-800 bg-[#0f172a] p-5 shadow-[0_18px_60px_rgba(2,6,23,0.28)] xl:p-4">
        <h2 className="text-[1.9rem] font-semibold leading-none text-white xl:text-[1.7rem]">Recruiter</h2>

        <div className="mt-5 flex items-center gap-3 rounded-2xl border border-slate-800 bg-slate-950/30 p-4 xl:p-3.5">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-blue-500/15 text-xl font-semibold text-blue-300 xl:h-12 xl:w-12 xl:text-lg">
            {initials}
          </div>

          <div className="min-w-0 flex-1">
            <div className="truncate text-[1.1rem] font-semibold leading-tight text-white xl:text-base">
              {user?.name || "Loading..."}
            </div>
            <div className="truncate text-sm text-slate-400 xl:text-[13px]">{user?.organization || ""}</div>
          </div>
        </div>

        {profileError ? (
          <div className="mt-4 rounded-2xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
            {profileError}
          </div>
        ) : null}

        <div className="mt-7">
          <h3 className="text-xs font-medium uppercase tracking-[0.34em] text-slate-500">Quick Actions</h3>

          <div className="mt-4 grid gap-3">
            {quickActions.map((action) => {
              const className = [
                "group block rounded-2xl border p-4 text-left transition xl:p-3.5",
                getCardClasses(action.tone, action.disabled),
                action.disabled ? "cursor-not-allowed" : "cursor-pointer",
              ].join(" ")

              const content = (
                <>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[1.02rem] font-semibold leading-tight xl:text-[15px]">{action.title}</p>
                      <p className="mt-2 text-sm leading-6 text-inherit/80 xl:text-[13px] xl:leading-5">{action.description}</p>
                    </div>
                    <span className="shrink-0 pt-0.5 text-sm text-inherit/60 transition group-hover:text-inherit">?</span>
                  </div>
                </>
              )

              if (action.disabled) {
                return (
                  <div key={action.id} className={className} aria-disabled="true">
                    {content}
                  </div>
                )
              }

              if (action.href) {
                return (
                  <Link key={action.id} href={buildAuthUrl(action.href, searchParams)} className={className}>
                    {content}
                  </Link>
                )
              }

              return (
                <button key={action.id} type="button" className={className} onClick={() => handleAction(action.id)}>
                  {content}
                </button>
              )
            })}
          </div>
        </div>
      </aside>

      <CreateJobModal open={openCreateJob} setOpen={setOpenCreateJob} />
      <SendInterviewModal isOpen={openSendInterview} onClose={() => setOpenSendInterview(false)} />
    </>
  )
}
