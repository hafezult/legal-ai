"use client"

import { useCallback, useState, useTransition } from "react"
import { useRouter } from "next/navigation"

type MatterDeleteAction = () => Promise<{
  error?: string
  success?: boolean
  warning?: string
}>

export function MatterDeleteControls({
  matterTitle,
  deleteAction,
}: {
  matterTitle: string
  deleteAction: MatterDeleteAction
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [confirming, setConfirming] = useState(false)
  const [message, setMessage] = useState<{
    type: "success" | "error"
    text: string
  } | null>(null)

  const runDelete = useCallback(() => {
    setMessage(null)
    startTransition(async () => {
      try {
        const result = await deleteAction()
        if (result.error) {
          setMessage({ type: "error", text: result.error })
          setConfirming(false)
          return
        }
        if (result.warning) {
          window.alert(result.warning)
        }
        router.push("/app/matters")
        router.refresh()
      } catch {
        setMessage({
          type: "error",
          text: "Unable to delete matter. Please try again.",
        })
        setConfirming(false)
      }
    })
  }, [deleteAction, router])

  return (
    <div className="flex flex-col items-end gap-2 border-t border-white/[0.05] pt-3">
      {confirming ? (
        <div className="max-w-xs text-right">
          <p className="text-[11px] leading-relaxed text-white/40">
            Delete <span className="text-white/62">{matterTitle}</span>? Documents,
            chunks, conversations, and research sessions will be removed.
          </p>
          <div className="mt-2 flex justify-end gap-2">
            <button
              type="button"
              disabled={isPending}
              onClick={() => setConfirming(false)}
              className="rounded-lg border border-white/[0.08] bg-white/[0.02] px-3 py-1.5 text-[11px] text-white/45 transition-colors hover:border-white/[0.14] hover:text-white/68 disabled:opacity-45"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={isPending}
              onClick={runDelete}
              className="rounded-lg border border-red-400/25 bg-red-400/10 px-3 py-1.5 text-[11px] text-red-200/75 transition-colors hover:border-red-400/40 hover:bg-red-400/15 disabled:opacity-45"
            >
              {isPending ? "Deleting..." : "Confirm delete"}
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          disabled={isPending}
          onClick={() => {
            setMessage(null)
            setConfirming(true)
          }}
          className="rounded-lg border border-white/[0.08] bg-white/[0.02] px-3 py-1.5 text-[11px] text-white/35 transition-colors hover:border-red-400/25 hover:bg-red-400/10 hover:text-red-200/70 disabled:opacity-45"
        >
          Delete matter
        </button>
      )}
      {message ? (
        <p
          role={message.type === "error" ? "alert" : "status"}
          aria-live="polite"
          className={`text-[10px] ${
            message.type === "error" ? "text-red-300/60" : "text-white/36"
          }`}
        >
          {message.text}
        </p>
      ) : null}
    </div>
  )
}
