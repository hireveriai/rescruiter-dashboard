"use client"

const PREFIX = "hireveri:json-cache:"
const DEFAULT_MAX_AGE_MS = 5 * 60 * 1000

function getCacheKey(key) {
  return `${PREFIX}${key}`
}

export function readSessionJsonCache(key, maxAgeMs = DEFAULT_MAX_AGE_MS) {
  if (typeof window === "undefined") {
    return null
  }

  try {
    const raw = window.sessionStorage.getItem(getCacheKey(key))
    const cached = raw ? JSON.parse(raw) : null

    if (!cached || Date.now() - Number(cached.cachedAt) > maxAgeMs) {
      return null
    }

    return cached.value ?? null
  } catch {
    return null
  }
}

export function hasSessionJsonCache(key, maxAgeMs = DEFAULT_MAX_AGE_MS) {
  return readSessionJsonCache(key, maxAgeMs) !== null
}

export function writeSessionJsonCache(key, value) {
  if (typeof window === "undefined") {
    return
  }

  try {
    window.sessionStorage.setItem(
      getCacheKey(key),
      JSON.stringify({
        cachedAt: Date.now(),
        value,
      })
    )
  } catch {
    // Session storage is a performance aid only.
  }
}
