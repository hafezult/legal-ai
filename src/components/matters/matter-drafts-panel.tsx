import Link from "next/link"

export type MatterDraftPreview = {
  id: string
  title: string
  draftType: string
  createdAt: Date
}

function fmtShortDate(d: Date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(d)
}

function draftTypeLabel(draftType: string) {
  return draftType
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

export function MatterDraftsPanel({
  matterId,
  drafts,
  totalCount,
  canWrite = false,
}: {
  matterId: string
  drafts: MatterDraftPreview[]
  totalCount: number
  canWrite?: boolean
}) {
  const hasDrafts = totalCount > 0

  return (
    <div className="rounded-[var(--aether-radius-panel)] border border-white/[0.07] bg-black/20 p-6">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[10px] uppercase tracking-[0.2em] text-white/40">
          Grounded drafting
        </p>
        <span className="rounded-full border border-white/[0.06] px-2.5 py-0.5 text-[10px] text-white/22">
          {hasDrafts ? "Active" : canWrite ? "Available" : "Read only"}
        </span>
      </div>
      <p className="mt-4 font-serif text-[14px] text-white/42">
        {hasDrafts
          ? `${totalCount} draft${totalCount !== 1 ? "s" : ""} prepared`
          : "No drafts prepared yet"}
      </p>
      <p className="mt-1.5 text-xs leading-relaxed text-white/25">
        {hasDrafts
          ? "Advice notes, skeletons, memos, and clause analyses generated from matter sources."
          : canWrite
            ? "Open the drafting workspace to generate evidence-bound work product for this matter."
            : "Your organization role is read-only for this matter. Draft history remains available when present."}
      </p>

      {hasDrafts ? (
        <div className="mt-5 space-y-2">
          {drafts.map((draft) => (
            <Link
              key={draft.id}
              href={`/app/drafting?matter=${matterId}&draft=${draft.id}`}
              className="block rounded-lg border border-white/[0.04] bg-white/[0.01] px-3.5 py-3 transition-colors hover:border-white/[0.1] hover:bg-white/[0.02]"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[10px] uppercase tracking-[0.12em] text-white/28">
                  {draftTypeLabel(draft.draftType)}
                </p>
                <p className="text-[10px] text-white/22">{fmtShortDate(draft.createdAt)}</p>
              </div>
              <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-white/42">
                {draft.title}
              </p>
            </Link>
          ))}
        </div>
      ) : null}

      <Link
        href={`/app/drafting?matter=${matterId}`}
        className="mt-4 inline-flex text-[11px] text-white/30 transition-colors hover:text-white/55"
      >
        {canWrite ? "Open drafting workspace →" : "Review drafting history →"}
      </Link>
    </div>
  )
}
