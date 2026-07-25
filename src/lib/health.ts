import { isIndexingSecretStrong } from "@/lib/indexing/secret"
import { probeClerk, probeSupabaseStorage } from "@/lib/health-probes"
import { prisma } from "@/lib/prisma"

export {
  getLivenessReport,
  type LivenessReport,
} from "@/lib/health-liveness"

export type { HealthProbe, ProbeStatus } from "@/lib/health-probes"

import type { HealthProbe } from "@/lib/health-probes"

export type HealthReport = {
  status: "ok" | "degraded"
  checkedAt: string
  probes: {
    database: HealthProbe
    clerk: HealthProbe
    storage: HealthProbe
    openai: HealthProbe
    indexing: HealthProbe
    upstash: HealthProbe
  }
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

  const [clerk, storage] = await Promise.all([
    probeClerk({
      publishableKey: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
      secretKey: process.env.CLERK_SECRET_KEY,
    }),
    probeSupabaseStorage({
      url: process.env.NEXT_PUBLIC_SUPABASE_URL,
      serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    }),
  ])

  const probes: HealthReport["probes"] = {
    database,
    clerk,
    storage,
    openai: configuredProbe(
      Boolean(process.env.OPENAI_API_KEY),
      "OpenAI API key present.",
      "OPENAI_API_KEY missing — retrieval and drafting stay offline."
    ),
    indexing: (() => {
      const secret = process.env.INDEXING_SECRET
      if (!secret?.trim()) {
        return {
          status: "missing" as const,
          configured: false,
          detail:
            "INDEXING_SECRET missing — HTTP indexing route stays locked outside development.",
        }
      }
      if (!isIndexingSecretStrong(secret)) {
        return {
          status: "degraded" as const,
          configured: true,
          detail:
            "INDEXING_SECRET is too weak (<32 chars or placeholder) — HTTP indexing route rejects it outside development.",
        }
      }
      return {
        status: "ok" as const,
        configured: true,
        detail: "Indexing secret present for the optional HTTP trigger route.",
      }
    })(),
    upstash: configuredProbe(
      Boolean(
        process.env.UPSTASH_REDIS_REST_URL?.trim() &&
          process.env.UPSTASH_REDIS_REST_TOKEN?.trim()
      ),
      "Upstash Redis REST configured for shared rate limits.",
      "Upstash unset — expensive actions use in-process rate limits."
    ),
  }

  // Optional AI/indexing/Upstash probes stay informational; missing keys must not
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
