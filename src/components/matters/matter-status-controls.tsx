"use client"

import { useCallback, useState, useTransition } from "react"
import { useRouter } from "next/navigation"

type MatterStatusAction = (status: string) => Promise<{
  error?: string
  success?: boolean
}>

const STATUS_OPTIONS = [
  { value: "active", label: "Active" },
  { value: "on_hold", label: "On hold" },
  { value: "closed", label: "Closed" },
  { value: "archived", label: "Archived" },
] as const

export function MatterStatusControls({
  currentStatus,
  updateAction,
}: {
  currentStatus: string
  updateAction: MatterStatusAction
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [message, setMessage] = useState<{
    type: "success" | "error"
    text: string
  } | null>(null)

  const runUpdate = useCallback(
    (status: string) => {
      if (status === currentStatus) return
      setMessage(null)
      startTransition(async () => {
        const result = await updateAction(status)
        if (result.error) {
          setMessage({ type: "error", text: result.error })
          return
        }
        setMessage({ type: "success", text: "Matter status updated." })
        router.refresh()
      })
    },
    [currentStatus, router, updateAction]
  )

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex flex-wrap justify-end gap-1.5">
        {STATUS_OPTIONS.map((option) => {
          const selected = option.value === currentStatus
          return (
            <button
              key={option.value}
              type="button"
              disabled={isPending || selected}
              onClick={() => runUpdate(option.value)}
              className={`rounded-full border px-2.5 py-1 text-[10px] uppercase tracking-[0.12em] transition-colors disabled:pointer-events-none ${
                selected
                  ? "border-white/[0.18] bg-white/[0.08] text-white/78"
                  : "border-white/[0.08] bg-white/[0.02] text-white/35 hover:border-white/[0.14] hover:text-white/62 disabled:opacity-45"
              }`}
            >
              {option.label}
            </button>
          )
        })}
      </div>
      {isPending ? (
        <p className="text-[10px] text-white/36">Updating...</p>
      ) : message ? (
        <p
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
