"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"

import {
  acceptInviteByToken,
  rejectInviteByToken,
} from "@/app/(platform)/app/settings/actions"

export function AcceptInviteClient({
  token,
  organizationName,
  role,
}: {
  token: string
  organizationName: string
  role: string
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [pendingAction, setPendingAction] = useState<"accept" | "decline" | null>(
    null
  )
  const [error, setError] = useState<string | null>(null)

  const statusText =
    isPending && pendingAction === "accept"
      ? "Accepting invite…"
      : isPending && pendingAction === "decline"
        ? "Declining invite…"
        : null

  return (
    <div className="rounded-[var(--aether-radius-panel)] border border-white/[0.07] bg-white/[0.015] px-5 py-5">
      <p className="text-sm leading-relaxed text-white/50">
        Accepting will add you to{" "}
        <span className="text-white/75">{organizationName}</span> with the{" "}
        <span className="text-white/75">{role}</span> role and switch your active
        workspace. Declining removes this invite so an admin can send a new one
        later if needed.
      </p>
      {statusText ? (
        <p
          role="status"
          aria-live="polite"
          className="mt-3 text-xs text-white/45"
        >
          {statusText}
        </p>
      ) : null}
      {error ? (
        <p
          role="alert"
          aria-live="polite"
          className="mt-3 text-xs text-amber-200/70"
        >
          {error}
        </p>
      ) : null}
      <div className="mt-5 flex flex-wrap gap-3">
        <button
          type="button"
          disabled={isPending}
          onClick={() => {
            setError(null)
            setPendingAction("accept")
            startTransition(async () => {
              try {
                const result = await acceptInviteByToken(token)
                if (result.error) {
                  setError(result.error)
                  setPendingAction(null)
                  return
                }
                router.push("/app/settings")
                router.refresh()
              } catch {
                setError("Unable to process invite. Please try again.")
                setPendingAction(null)
              }
            })
          }}
          className="rounded-lg border border-white/[0.12] bg-white/[0.06] px-4 py-2.5 text-sm text-white/80 transition-colors hover:border-white/[0.2] hover:bg-white/[0.09] disabled:opacity-40"
        >
          {isPending && pendingAction === "accept" ? "Working…" : "Accept invite"}
        </button>
        <button
          type="button"
          disabled={isPending}
          onClick={() => {
            setError(null)
            setPendingAction("decline")
            startTransition(async () => {
              try {
                const result = await rejectInviteByToken(token)
                if (result.error) {
                  setError(result.error)
                  setPendingAction(null)
                  return
                }
                router.push("/app")
                router.refresh()
              } catch {
                setError("Unable to process invite. Please try again.")
                setPendingAction(null)
              }
            })
          }}
          className="rounded-lg border border-white/[0.08] bg-transparent px-4 py-2.5 text-sm text-white/55 transition-colors hover:border-white/[0.14] hover:text-white/75 disabled:opacity-40"
        >
          {isPending && pendingAction === "decline" ? "Working…" : "Decline"}
        </button>
      </div>
    </div>
  )
}
