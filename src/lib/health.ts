import { prisma } from "@/lib/prisma"

export type ProbeStatus = "ok" | "degraded" | "missing"

export type HealthProbe = {
  status: ProbeStatus
  configured: boolean
  detail: string
}

export type HealthReport = {
  status: "ok" | "degraded"
  checkedAt: string
  probes: {
    database: HealthProbe
    clerk: HealthProbe
    storage: HealthProbe
    openai: HealthProbe
    indexing: HealthProbe
  }
}

export type LivenessReport = {
  status: "ok"
  checkedAt: string
}

/** Probes that must be healthy for the deployment to be considered ready. */
const CRITICAL_PROBES = ["database", "clerk", "storage"] as const

function configuredProbe(
  configured: boolean,
  readyDetail: string,
  missingDetail: string
): HealthProbe {
  return configured
    ? { status: "ok", configured: true, detail: readyDetail }
    : { status: "missing", configured: false, detail: missingDetail }
}

/**
 * Cheap public liveness signal for load balancers.
 * Does not touch Postgres or external services.
 */
export function getLivenessReport(): LivenessReport {
  return {
    status: "ok",
    checkedAt: new Date().toISOString(),
  }
}

export async function getHealthReport(): Promise<HealthReport> {
  let database: HealthProbe = {
    status: "missing",
    configured: Boolean(process.env.DATABASE_URL),
    detail: process.env.DATABASE_URL
      ? "Configured but unreachable."
      : "DATABASE_URL is not set.",
  }

  if (process.env.DATABASE_URL) {
    try {
      await prisma.$queryRaw`SELECT 1`
      database = {
        status: "ok",
        configured: true,
        detail: "Postgres reachable.",
      }
    } catch {
      database = {
        status: "degraded",
        configured: true,
        detail: "Postgres configured but query probe failed.",
      }
    }
  }

  const probes: HealthReport["probes"] = {
    database,
    clerk: configuredProbe(
      Boolean(
        process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY
      ),
      "Clerk keys present.",
      "Clerk publishable or secret key missing."
    ),
    storage: configuredProbe(
      Boolean(
        process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
      ),
      "Supabase storage credentials present.",
      "Supabase URL or service role key missing."
    ),
    openai: configuredProbe(
      Boolean(process.env.OPENAI_API_KEY),
      "OpenAI API key present.",
      "OPENAI_API_KEY missing — retrieval and drafting stay offline."
    ),
    indexing: configuredProbe(
      Boolean(process.env.INDEXING_SECRET),
      "Indexing secret present for the optional HTTP trigger route.",
      "INDEXING_SECRET missing — HTTP indexing route stays locked outside development."
    ),
  }

  // Optional AI/indexing probes stay informational; missing keys must not
  // mark the whole deployment unhealthy for load balancers / Settings banner.
  const degraded = CRITICAL_PROBES.some((key) => {
    const probe = probes[key]
    return probe.status === "degraded" || probe.status === "missing"
  })

  return {
    status: degraded ? "degraded" : "ok",
    checkedAt: new Date().toISOString(),
    probes,
  }
}
