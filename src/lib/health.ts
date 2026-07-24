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

function configuredProbe(
  configured: boolean,
  readyDetail: string,
  missingDetail: string
): HealthProbe {
  return configured
    ? { status: "ok", configured: true, detail: readyDetail }
    : { status: "missing", configured: false, detail: missingDetail }
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
      Boolean(process.env.INDEXING_SECRET && process.env.NEXT_PUBLIC_APP_URL),
      "Indexing secret and app URL present.",
      "INDEXING_SECRET or NEXT_PUBLIC_APP_URL missing."
    ),
  }

  const degraded = Object.values(probes).some(
    (probe) => probe.status === "degraded" || probe.status === "missing"
  )

  return {
    status: degraded ? "degraded" : "ok",
    checkedAt: new Date().toISOString(),
    probes,
  }
}
