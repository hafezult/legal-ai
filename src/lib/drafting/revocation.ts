/** Message when mid-flight drafting loses write access before return. */
export const DRAFT_ACCESS_REVOKED_MESSAGE =
  "Access was revoked before the draft could be returned. Retrieved sources were discarded."

/** Message when mid-flight drafting loses write access before persistence. */
export const DRAFT_PERSIST_REVOKED_MESSAGE =
  "Access was revoked before the draft could be saved. Results were discarded."

export type DraftSensitivePayload = {
  draftId: string
  title: string
  /** Cleared on revoke so mid-flight returns do not leak matter labels. */
  matterTitle?: string
  /** Cleared on revoke so mid-flight returns do not echo the prompt. */
  instruction?: string
  content: string
  chunks: unknown[]
  retrievalCount: number
  error?: string
}

/**
 * Fail closed: strip retrieved/generated draft content after access is
 * revoked mid-flight so the caller never receives matter excerpts.
 */
export function redactDraftOnRevocation<T extends DraftSensitivePayload>(
  output: T,
  message: string = DRAFT_ACCESS_REVOKED_MESSAGE
): T {
  return {
    ...output,
    draftId: "",
    title: "",
    matterTitle: "",
    instruction: "",
    content: "",
    chunks: [],
    retrievalCount: 0,
    error: message,
  }
}
