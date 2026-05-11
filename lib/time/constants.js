export const DEFAULT_ORG_TIMEZONE = "Asia/Kolkata"
export const DEFAULT_ORG_TIMEZONE_LABEL = "India Standard Time"

export const ORG_TIMEZONE_OPTIONS = [
  { value: "Asia/Kolkata", label: "India Standard Time", badge: "IST", flag: "🇮🇳" },
  { value: "America/New_York", label: "Eastern Time", badge: "ET", flag: "🇺🇸" },
  { value: "America/Chicago", label: "Central Time", badge: "CT", flag: "🇺🇸" },
  { value: "America/Denver", label: "Mountain Time", badge: "MT", flag: "🇺🇸" },
  { value: "America/Los_Angeles", label: "Pacific Time", badge: "PT", flag: "🇺🇸" },
  { value: "Europe/London", label: "United Kingdom", badge: "UK", flag: "🇬🇧" },
  { value: "Europe/Berlin", label: "Central Europe", badge: "CET", flag: "🇩🇪" },
  { value: "Asia/Dubai", label: "Dubai", badge: "GST", flag: "🇦🇪" },
  { value: "Asia/Singapore", label: "Singapore", badge: "SGT", flag: "🇸🇬" },
  { value: "UTC", label: "UTC", badge: "UTC", flag: "🌐" },
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
