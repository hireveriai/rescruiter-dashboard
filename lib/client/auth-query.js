export function getAuthQuery(searchParams) {
  const params = new URLSearchParams()
  const userId = searchParams?.get("userId")
  const organizationId = searchParams?.get("organizationId")

  if (userId) {
    params.set("userId", userId)
  }

  if (organizationId) {
    params.set("organizationId", organizationId)
  }

  return params.toString()
}

export function buildAuthUrl(path, searchParams) {
  const query = getAuthQuery(searchParams)

  if (!query) {
    return path
  }

  return path.includes("?") ? `${path}&${query}` : `${path}?${query}`
}
