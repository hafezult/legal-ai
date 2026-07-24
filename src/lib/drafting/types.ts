export const DRAFT_TYPES = [
  "advice",
  "brief",
  "memo",
  "clause",
] as const

export type DraftType = (typeof DRAFT_TYPES)[number]

export const DRAFT_TYPE_LABELS: Record<DraftType, string> = {
  advice: "Counsel's advice note",
  brief: "Skeleton / brief outline",
  memo: "Internal research memo",
  clause: "Clause analysis note",
}

/** Server and client max length for drafting instructions. */
export const MAX_DRAFT_INSTRUCTION_CHARS = 8_000
