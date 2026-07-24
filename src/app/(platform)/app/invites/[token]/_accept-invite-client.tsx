"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"

import { acceptInviteByToken } from "@/app/(platform)/app/settings/actions"

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
  const [error, setError] = useState<string | null>(null)

  return (
    <div className="rounded-[var(--aether-radius-panel)] border border-white/[0.07] bg-white/[0.015] px-5 py-5">
      <p className="text-sm leading-relaxed text-white/50">
        Accepting will add you to{" "}
        <span className="text-white/75">{organizationName}</span> with the{" "}
        <span className="text-white/75">{role}</span> role and switch your active
        workspace.
      </p>
      {error ? <p className="mt-3 text-xs text-amber-200/70">{error}</p> : null}
      <button
        type="button"
        disabled={isPending}
        onClick={() => {
          setError(null)
          startTransition(async () => {
            const result = await acceptInviteByToken(token)
            if (result.error) {
              setError(result.error)
              return
            }
            router.push("/app/settings")
            router.refresh()
          })
        }}
        className="mt-5 rounded-lg border border-white/[0.12] bg-white/[0.06] px-4 py-2.5 text-sm text-white/80 transition-colors hover:border-white/[0.2] hover:bg-white/[0.09] disabled:opacity-40"
      >
        {isPending ? "Accepting…" : "Accept invite"}
      </button>
    </div>
  )
}
