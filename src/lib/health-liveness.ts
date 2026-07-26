export type LivenessReport = {
  status: "ok"
  checkedAt: string
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
