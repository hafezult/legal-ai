export type AggregateProbe = {
  status: "ok" | "degraded" | "missing"
}

/** Probes that must be healthy for the deployment to be considered ready. */
export const CRITICAL_HEALTH_PROBES = ["database", "clerk", "storage"] as const

export type CriticalHealthProbe = (typeof CRITICAL_HEALTH_PROBES)[number]

/**
 * Aggregate readiness: optional OpenAI/indexing/Upstash never flip overall status.
 */
export function aggregateHealthStatus<
  TProbes extends Record<string, AggregateProbe>,
>(
  probes: TProbes,
  criticalKeys: readonly (keyof TProbes & string)[] = CRITICAL_HEALTH_PROBES as unknown as readonly (keyof TProbes & string)[]
): "ok" | "degraded" {
  const degraded = criticalKeys.some((key) => {
    const probe = probes[key]
    return probe.status === "degraded" || probe.status === "missing"
  })
  return degraded ? "degraded" : "ok"
}
