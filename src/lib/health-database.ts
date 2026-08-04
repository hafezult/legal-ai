import type { HealthProbe } from "./health-probes.ts"

/** Match Clerk/Supabase probe budgets so a hung Postgres cannot stall readiness. */
export const DATABASE_PROBE_TIMEOUT_MS = 2_500

export async function probeDatabase(args: {
  databaseUrl?: string | null
  query?: () => Promise<unknown>
  timeoutMs?: number
}): Promise<HealthProbe> {
  const databaseUrl =
    args.databaseUrl !== undefined ? args.databaseUrl : process.env.DATABASE_URL
  if (!databaseUrl) {
    return {
      status: "missing",
      configured: false,
      detail: "DATABASE_URL is not set.",
    }
  }

  const query = args.query
  if (!query) {
    return {
      status: "degraded",
      configured: true,
      detail: "Postgres configured but query probe failed.",
    }
  }

  const timeoutMs = args.timeoutMs ?? DATABASE_PROBE_TIMEOUT_MS

  try {
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      await Promise.race([
        query(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error("timed out")), timeoutMs)
        }),
      ])
    } finally {
      if (timer) clearTimeout(timer)
    }
    return {
      status: "ok",
      configured: true,
      detail: "Postgres reachable.",
    }
  } catch (error) {
    const timedOut = error instanceof Error && error.message === "timed out"
    return {
      status: "degraded",
      configured: true,
      detail: timedOut
        ? "Postgres configured but query probe timed out."
        : "Postgres configured but query probe failed.",
    }
  }
}
