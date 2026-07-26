export type ProbeStatus = "ok" | "degraded" | "missing"

export type HealthProbe = {
  status: ProbeStatus
  configured: boolean
  detail: string
}

export type FetchLike = (
  input: string,
  init?: { method?: string; headers?: Record<string, string>; signal?: AbortSignal }
) => Promise<{ ok: boolean; status: number }>

const DEFAULT_TIMEOUT_MS = 2_500

async function withTimeout(
  fetchImpl: FetchLike,
  url: string,
  init: { method?: string; headers?: Record<string, string> },
  timeoutMs: number
): Promise<{ ok: boolean; status: number } | { error: string }> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetchImpl(url, { ...init, signal: controller.signal })
    return { ok: response.ok, status: response.status }
  } catch (error) {
    const message =
      error instanceof Error && error.name === "AbortError"
        ? "timed out"
        : "network error"
    return { error: message }
  } finally {
    clearTimeout(timer)
  }
}

/** Bounded Clerk Backend API probe (users list, limit 1). */
export async function probeClerk(
  args: {
    publishableKey?: string | null
    secretKey?: string | null
    fetchImpl?: FetchLike
    timeoutMs?: number
  } = {}
): Promise<HealthProbe> {
  const publishable = args.publishableKey?.trim()
  const secret = args.secretKey?.trim()
  if (!publishable || !secret) {
    return {
      status: "missing",
      configured: false,
      detail: "Clerk publishable or secret key missing.",
    }
  }

  const fetchImpl = args.fetchImpl ?? (fetch as FetchLike)
  const result = await withTimeout(
    fetchImpl,
    "https://api.clerk.com/v1/users?limit=1",
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${secret}`,
        "Clerk-API-Version": "2024-10-01",
      },
    },
    args.timeoutMs ?? DEFAULT_TIMEOUT_MS
  )

  if ("error" in result) {
    return {
      status: "degraded",
      configured: true,
      detail: `Clerk API probe ${result.error}.`,
    }
  }

  if (result.status === 401 || result.status === 403) {
    return {
      status: "degraded",
      configured: true,
      detail: "Clerk secret key rejected by API.",
    }
  }

  if (!result.ok) {
    return {
      status: "degraded",
      configured: true,
      detail: `Clerk API probe returned HTTP ${result.status}.`,
    }
  }

  return {
    status: "ok",
    configured: true,
    detail: "Clerk API reachable with configured secret.",
  }
}

/** Bounded Supabase Storage API probe (list buckets). */
export async function probeSupabaseStorage(
  args: {
    url?: string | null
    serviceRoleKey?: string | null
    fetchImpl?: FetchLike
    timeoutMs?: number
  } = {}
): Promise<HealthProbe> {
  const base = args.url?.trim()?.replace(/\/$/, "")
  const key = args.serviceRoleKey?.trim()
  if (!base || !key) {
    return {
      status: "missing",
      configured: false,
      detail: "Supabase URL or service role key missing.",
    }
  }

  const fetchImpl = args.fetchImpl ?? (fetch as FetchLike)
  const result = await withTimeout(
    fetchImpl,
    `${base}/storage/v1/bucket`,
    {
      method: "GET",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
      },
    },
    args.timeoutMs ?? DEFAULT_TIMEOUT_MS
  )

  if ("error" in result) {
    return {
      status: "degraded",
      configured: true,
      detail: `Supabase storage probe ${result.error}.`,
    }
  }

  if (result.status === 401 || result.status === 403) {
    return {
      status: "degraded",
      configured: true,
      detail: "Supabase service role key rejected by storage API.",
    }
  }

  if (!result.ok) {
    return {
      status: "degraded",
      configured: true,
      detail: `Supabase storage probe returned HTTP ${result.status}.`,
    }
  }

  return {
    status: "ok",
    configured: true,
    detail: "Supabase storage API reachable with configured credentials.",
  }
}
