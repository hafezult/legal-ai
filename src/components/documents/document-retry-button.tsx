"use client"

import { useRouter } from "next/navigation"
import { useCallback, useState, useTransition } from "react"

import { reindexDocument } from "@/app/(platform)/app/matters/[matterId]/actions"

export function DocumentRetryButton({
  matterId,
  documentId,
}: {
  matterId: string
  documentId: string
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [warning, setWarning] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const onRetry = useCallback(
    (event: React.MouseEvent) => {
      event.preventDefault()
      event.stopPropagation()
      if (isPending) return
      setError(null)
      setWarning(null)
      setSuccess(null)

      startTransition(async () => {
        const result = await reindexDocument(matterId, documentId)
        if (result.error) {
          setError(result.error)
          return
        }
        if (result.warning) {
          setWarning(result.warning)
        } else {
          setSuccess("Retry queued.")
        }
        router.refresh()
      })
    },
    [documentId, isPending, matterId, router]
  )

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={onRetry}
        disabled={isPending}
        className="rounded border border-amber-400/20 bg-amber-400/[0.06] px-2.5 py-1 text-[10px] uppercase tracking-[0.12em] text-amber-200/65 transition-colors hover:border-amber-400/35 hover:text-amber-100/80 disabled:pointer-events-none disabled:opacity-45"
      >
        {isPending ? "Retrying…" : "Retry"}
      </button>
      {isPending ? (
        <p
          role="status"
          aria-live="polite"
          className="max-w-[9rem] text-right text-[10px] leading-snug text-white/40"
        >
          Retrying indexing…
        </p>
      ) : null}
      {error ? (
        <p
          role="alert"
          aria-live="polite"
          className="max-w-[9rem] text-right text-[10px] leading-snug text-red-300/60"
        >
          {error}
        </p>
      ) : null}
      {!error && warning ? (
        <p
          role="status"
          aria-live="polite"
          className="max-w-[9rem] text-right text-[10px] leading-snug text-amber-200/55"
        >
          {warning}
        </p>
      ) : null}
      {!error && !warning && success ? (
        <p
          role="status"
          aria-live="polite"
          className="max-w-[9rem] text-right text-[10px] leading-snug text-emerald-200/55"
        >
          {success}
        </p>
      ) : null}
    </div>
  )
}
