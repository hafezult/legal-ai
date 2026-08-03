"use client"

import { useCallback, useState, useTransition } from "react"
import { useRouter } from "next/navigation"

import {
  MAX_MATTER_BILLING_CHARS,
  MAX_MATTER_CLIENT_CHARS,
  MAX_MATTER_DESCRIPTION_CHARS,
  MAX_MATTER_JURISDICTION_CHARS,
  MAX_MATTER_TITLE_CHARS,
} from "@/lib/matters/limits"

type MatterUpdateAction = (formData: FormData) => Promise<{
  error?: string
  success?: boolean
}>

const PRACTICE_AREAS = [
  { value: "", label: "Select practice area" },
  { value: "corporate", label: "Corporate" },
  { value: "litigation", label: "Litigation" },
  { value: "m_and_a", label: "M&A" },
  { value: "real_estate", label: "Real estate" },
  { value: "finance", label: "Finance" },
  { value: "intellectual_property", label: "Intellectual property" },
  { value: "tax", label: "Tax" },
  { value: "regulatory", label: "Regulatory" },
  { value: "employment", label: "Employment" },
  { value: "other", label: "Other" },
]

const RISK_LEVELS = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "critical", label: "Critical" },
]

const inputCls =
  "w-full rounded-lg border border-white/[0.08] bg-white/[0.02] px-3 py-2 text-sm text-white/85 placeholder:text-white/22 transition-colors duration-200 focus:border-white/[0.16] focus:bg-white/[0.04] focus:outline-none"

const selectCls =
  "w-full cursor-pointer appearance-none rounded-lg border border-white/[0.08] bg-zinc-950 px-3 py-2 text-sm text-white/85 transition-colors duration-200 focus:border-white/[0.16] focus:outline-none"

const labelCls = "mb-1.5 block text-[10px] uppercase tracking-[0.16em] text-white/36"

export type MatterEditValues = {
  title: string
  clientName: string | null
  practiceArea: string | null
  jurisdiction: string | null
  riskLevel: string
  billingCode: string | null
  description: string | null
}

export function MatterEditControls({
  matter,
  updateAction,
}: {
  matter: MatterEditValues
  updateAction: MatterUpdateAction
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [message, setMessage] = useState<{
    type: "success" | "error"
    text: string
  } | null>(null)

  const onSubmit = useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      const formData = new FormData(event.currentTarget)
      setMessage(null)
      startTransition(async () => {
        try {
          const result = await updateAction(formData)
          if (result.error) {
            setMessage({ type: "error", text: result.error })
            return
          }
          setMessage({ type: "success", text: "Matter details updated." })
          setOpen(false)
          router.refresh()
        } catch {
          setMessage({
            type: "error",
            text: "Unable to update matter details. Please try again.",
          })
        }
      })
    },
    [router, updateAction]
  )

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => {
          setMessage(null)
          setOpen(true)
        }}
        className="rounded-full border border-white/[0.08] bg-white/[0.02] px-2.5 py-1 text-[10px] uppercase tracking-[0.12em] text-white/35 transition-colors hover:border-white/[0.14] hover:text-white/62"
      >
        Edit details
      </button>
    )
  }

  return (
    <form
      onSubmit={onSubmit}
      className="w-full max-w-xl space-y-3 rounded-lg border border-white/[0.08] bg-black/30 p-4"
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-[10px] uppercase tracking-[0.16em] text-white/40">
          Edit matter details
        </p>
        <button
          type="button"
          onClick={() => setOpen(false)}
          disabled={isPending}
          className="text-[10px] uppercase tracking-[0.12em] text-white/32 hover:text-white/55 disabled:opacity-40"
        >
          Cancel
        </button>
      </div>

      <div>
        <label className={labelCls} htmlFor="matter-edit-title">
          Title
        </label>
        <input
          id="matter-edit-title"
          name="title"
          required
          maxLength={MAX_MATTER_TITLE_CHARS}
          defaultValue={matter.title}
          className={inputCls}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className={labelCls} htmlFor="matter-edit-client">
            Client
          </label>
          <input
            id="matter-edit-client"
            name="clientName"
            maxLength={MAX_MATTER_CLIENT_CHARS}
            defaultValue={matter.clientName ?? ""}
            className={inputCls}
          />
        </div>
        <div>
          <label className={labelCls} htmlFor="matter-edit-billing">
            Billing code
          </label>
          <input
            id="matter-edit-billing"
            name="billingCode"
            maxLength={MAX_MATTER_BILLING_CHARS}
            defaultValue={matter.billingCode ?? ""}
            className={inputCls}
          />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className={labelCls} htmlFor="matter-edit-practice">
            Practice area
          </label>
          <select
            id="matter-edit-practice"
            name="practiceArea"
            defaultValue={matter.practiceArea ?? ""}
            className={selectCls}
          >
            {PRACTICE_AREAS.map((option) => (
              <option key={option.value || "none"} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls} htmlFor="matter-edit-jurisdiction">
            Jurisdiction
          </label>
          <input
            id="matter-edit-jurisdiction"
            name="jurisdiction"
            maxLength={MAX_MATTER_JURISDICTION_CHARS}
            defaultValue={matter.jurisdiction ?? ""}
            className={inputCls}
          />
        </div>
      </div>

      <div>
        <label className={labelCls} htmlFor="matter-edit-risk">
          Risk level
        </label>
        <select
          id="matter-edit-risk"
          name="riskLevel"
          defaultValue={matter.riskLevel}
          className={selectCls}
        >
          {RISK_LEVELS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className={labelCls} htmlFor="matter-edit-description">
          Description
        </label>
        <textarea
          id="matter-edit-description"
          name="description"
          rows={3}
          maxLength={MAX_MATTER_DESCRIPTION_CHARS}
          defaultValue={matter.description ?? ""}
          className={`${inputCls} resize-none leading-relaxed`}
        />
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-white/[0.06] pt-3">
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
        ) : (
          <span />
        )}
        <button
          type="submit"
          disabled={isPending}
          className="rounded-lg border border-white/[0.12] bg-white/[0.05] px-4 py-2 text-xs text-white/75 transition-colors hover:border-white/[0.2] hover:text-white/95 disabled:pointer-events-none disabled:opacity-40"
        >
          {isPending ? "Saving…" : "Save changes"}
        </button>
      </div>
    </form>
  )
}
