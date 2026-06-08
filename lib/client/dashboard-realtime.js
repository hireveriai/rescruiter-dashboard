const REALTIME_ENDPOINT_PATH = "/realtime/v1/websocket"
const HEARTBEAT_INTERVAL_MS = 25000
const RECONNECT_BASE_MS = 1000
const RECONNECT_MAX_MS = 15000

const DASHBOARD_TABLES = [
  "dashboard_realtime_events",
  "interviews",
  "job_positions",
  "candidates",
  "candidate_job_matches",
  "screening_runs",
  "candidate_recruiter_decisions",
]

function getSupabaseRealtimeUrl() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !anonKey || typeof WebSocket === "undefined") {
    return null
  }

  try {
    const url = new URL(supabaseUrl)
    url.protocol = url.protocol === "http:" ? "ws:" : "wss:"
    url.pathname = REALTIME_ENDPOINT_PATH
    url.searchParams.set("apikey", anonKey)
    url.searchParams.set("vsn", "1.0.0")
    return url.toString()
  } catch {
    return null
  }
}

function readCookie(name) {
  if (typeof document === "undefined") {
    return null
  }

  return document.cookie
    .split(";")
    .map((entry) => entry.trim())
    .find((entry) => entry.startsWith(`${name}=`))
    ?.slice(name.length + 1) ?? null
}

function getSupabaseAccessToken() {
  if (typeof document === "undefined") {
    return null
  }

  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? null
  const tokenCookie = readCookie("access_token") || readCookie("accessToken") || readCookie("authToken")
  if (tokenCookie) {
    return decodeURIComponent(tokenCookie)
  }

  const authCookieName = document.cookie
    .split(";")
    .map((entry) => entry.trim().split("=")[0])
    .find((name) => name.startsWith("sb-") && name.endsWith("-auth-token"))
  const authCookie = authCookieName ? readCookie(authCookieName) : null

  if (!authCookie) {
    return anonKey
  }

  try {
    const parsed = JSON.parse(decodeURIComponent(authCookie))
    return parsed?.access_token ?? parsed?.currentSession?.access_token ?? anonKey
  } catch {
    return anonKey
  }
}

function buildJoinPayload(organizationId) {
  const changes = DASHBOARD_TABLES.map((table) => ({
    event: "*",
    schema: "public",
    table,
    filter: `organization_id=eq.${organizationId}`,
  }))

  return {
    config: {
      broadcast: { self: false },
      presence: { key: "" },
      postgres_changes: changes,
    },
    access_token: getSupabaseAccessToken(),
  }
}

function isRealtimeChange(message) {
  if (!Array.isArray(message) || message.length < 5) {
    return false
  }

  const event = message[3]
  const payload = message[4]
  return event === "postgres_changes" || Boolean(payload?.data?.type === "postgres_changes")
}

export function connectDashboardRealtime({ organizationId, onChange, onStatus }) {
  const realtimeUrl = getSupabaseRealtimeUrl()

  if (!realtimeUrl || !organizationId) {
    onStatus?.("disabled")
    return () => {}
  }

  let socket = null
  let heartbeatTimer = null
  let reconnectTimer = null
  let closed = false
  let ref = 1
  let reconnectAttempt = 0
  const topic = `realtime:dashboard:${organizationId}`

  function nextRef() {
    ref += 1
    return String(ref)
  }

  function send(event, payload, targetTopic = topic) {
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return
    }

    socket.send(JSON.stringify([null, nextRef(), targetTopic, event, payload]))
  }

  function stopHeartbeat() {
    if (heartbeatTimer) {
      window.clearInterval(heartbeatTimer)
      heartbeatTimer = null
    }
  }

  function scheduleReconnect() {
    if (closed || reconnectTimer) {
      return
    }

    const delay = Math.min(RECONNECT_MAX_MS, RECONNECT_BASE_MS * 2 ** reconnectAttempt)
    reconnectAttempt += 1
    reconnectTimer = window.setTimeout(() => {
      reconnectTimer = null
      connect()
    }, delay)
  }

  function connect() {
    stopHeartbeat()
    socket = new WebSocket(realtimeUrl)
    onStatus?.("connecting")

    socket.addEventListener("open", () => {
      reconnectAttempt = 0
      onStatus?.("connected")
      send("phx_join", buildJoinPayload(organizationId))
      heartbeatTimer = window.setInterval(() => {
        send("heartbeat", {}, "phoenix")
      }, HEARTBEAT_INTERVAL_MS)
    })

    socket.addEventListener("message", (event) => {
      try {
        const message = JSON.parse(event.data)
        if (isRealtimeChange(message)) {
          onChange?.(message[4])
        }
      } catch {
        // Ignore non-JSON frames from proxies or transient socket diagnostics.
      }
    })

    socket.addEventListener("close", () => {
      stopHeartbeat()
      onStatus?.("disconnected")
      scheduleReconnect()
    })

    socket.addEventListener("error", () => {
      onStatus?.("error")
      socket?.close()
    })
  }

  connect()

  return () => {
    closed = true
    stopHeartbeat()
    if (reconnectTimer) {
      window.clearTimeout(reconnectTimer)
    }
    socket?.close()
  }
}
