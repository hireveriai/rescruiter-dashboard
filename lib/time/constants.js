export const DEFAULT_ORG_TIMEZONE = "Asia/Kolkata"
export const DEFAULT_ORG_TIMEZONE_LABEL = "India Standard Time"

export const ORG_TIMEZONE_OPTIONS = [
  { value: "Asia/Kolkata", label: "India Standard Time", badge: "IST" },
  { value: "America/New_York", label: "Eastern Time", badge: "ET" },
  { value: "America/Chicago", label: "Central Time", badge: "CT" },
  { value: "America/Denver", label: "Mountain Time", badge: "MT" },
  { value: "America/Los_Angeles", label: "Pacific Time", badge: "PT" },
  { value: "Europe/London", label: "United Kingdom", badge: "UK" },
  { value: "Europe/Berlin", label: "Central Europe", badge: "CET" },
  { value: "Asia/Dubai", label: "Dubai", badge: "GST" },
  { value: "Asia/Singapore", label: "Singapore", badge: "SGT" },
  { value: "UTC", label: "UTC", badge: "UTC" },
]

export function getTimezoneOption(timezone) {
  return (
    ORG_TIMEZONE_OPTIONS.find((option) => option.value === timezone) ?? {
      value: timezone || DEFAULT_ORG_TIMEZONE,
      label: timezone || DEFAULT_ORG_TIMEZONE_LABEL,
      badge: timezone || "ORG",
    }
  )
}
