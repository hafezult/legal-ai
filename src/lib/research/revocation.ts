/** Message when mid-flight research loses write access before return. */
export const RESEARCH_ACCESS_REVOKED_MESSAGE =
  "Access was revoked before research results could be returned. Retrieved sources were discarded."

/** Message when mid-flight research loses write access before persistence. */
export const RESEARCH_PERSIST_REVOKED_MESSAGE =
  "Access was revoked before the research session could be saved. Results were discarded."

export type ResearchSensitivePayload = {
  /** Cleared on revoke so mid-flight returns do not echo the prompt. */
  query?: string
  answer: string
  chunks: unknown[]
  authorities: {
    cases: string[]
    statutes: string[]
    cpr: string[]
    practiceDirs: string[]
    statutory: string[]
  }
  sessionId: string
  retrievalCount: number
  error?: string
}

/**
 * Fail closed: strip retrieved/generated research content after access is
 * revoked mid-flight so the caller never receives matter excerpts.
 */
export function redactResearchOnRevocation<T extends ResearchSensitivePayload>(
  output: T,
  message: string = RESEARCH_ACCESS_REVOKED_MESSAGE
): T {
  return {
    ...output,
    query: "",
    answer: "",
    chunks: [],
    authorities: {
      cases: [],
      statutes: [],
      cpr: [],
      practiceDirs: [],
      statutory: [],
    },
    sessionId: "",
    retrievalCount: 0,
    error: message,
  }
}
