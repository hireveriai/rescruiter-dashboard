"use client"

import Link from "next/link"
import { ArrowLeft } from "lucide-react"

type BackToDashboardLinkProps = {
  className?: string
  label?: string
}

const defaultClassName =
  "inline-flex w-fit items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-950/50 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:border-cyan-400/40 hover:bg-slate-900 hover:text-white"

export default function BackToDashboardLink({
  className = defaultClassName,
  label = "Go Back to Dashboard",
}: BackToDashboardLinkProps) {
  return (
    <Link href="/" className={className}>
      <ArrowLeft aria-hidden="true" className="h-4 w-4 shrink-0" strokeWidth={2.25} />
      <span className="leading-none">{label}</span>
    </Link>
  )
}
