"use client"

import { useOrgTimezone } from "@/components/OrgTimezoneProvider"
import {
  formatOrgDate,
  formatOrgDateTime,
  formatOrgTime,
  formatRelativeTime,
} from "@/lib/time"

export function OrgDateTime({ value, timezone, timezoneLabel, className = "" }) {
  const context = useOrgTimezone()
  const resolvedTimezone = timezone || context.timezone

  return (
    <span className={className} title={timezoneLabel || context.timezoneLabel}>
      {formatOrgDateTime(value, resolvedTimezone)}
    </span>
  )
}

export function OrgDate({ value, timezone, className = "" }) {
  const context = useOrgTimezone()
  return <span className={className}>{formatOrgDate(value, timezone || context.timezone)}</span>
}

export function OrgTime({ value, timezone, className = "" }) {
  const context = useOrgTimezone()
  return <span className={className}>{formatOrgTime(value, timezone || context.timezone)}</span>
}

export function RelativeTime({ value, className = "" }) {
  return <span className={className}>{formatRelativeTime(value)}</span>
}
