"use client"

import { useFormState, useFormStatus } from "react-dom"

import { createMatter } from "../actions"

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

const STATUS_OPTIONS = [
  { value: "active", label: "Active" },
  { value: "on_hold", label: "On hold" },
  { value: "closed", label: "Closed" },
  { value: "archived", label: "Archived" },
]

const inputCls =
  "w-full rounded-lg border border-white/[0.08] bg-white/[0.02] px-4 py-2.5 text-sm text-white/85 placeholder:text-white/22 transition-colors duration-200 focus:border-white/[0.16] focus:bg-white/[0.04] focus:outline-none"

const selectCls =
  "w-full cursor-pointer appearance-none rounded-lg border border-white/[0.08] bg-zinc-950 px-4 py-2.5 text-sm text-white/85 transition-colors duration-200 focus:border-white/[0.16] focus:outline-none"

const labelCls = "mb-2 block text-[10px] uppercase tracking-[0.18em] text-white/40"

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className={labelCls}>{label}</p>
      {children}
    </div>
  )
}

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg border border-white/[0.12] bg-white/[0.05] px-6 py-2.5 text-sm text-white/75 transition-colors duration-200 hover:border-white/[0.2] hover:bg-white/[0.09] hover:text-white/95 disabled:pointer-events-none disabled:opacity-40"
    >
      {pending ? "Initializing..." : "Initialize matter"}
    </button>
  )
}

export default function NewMatterPage() {
  const [state, action] = useFormState(createMatter, {})

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      {/* Header */}
      <div>
        <p className="text-[11px] uppercase tracking-[0.22em] text-white/40">
          Matter intake
        </p>
        <h1 className="mt-2 font-serif text-3xl tracking-tight text-white/[0.96] md:text-4xl">
          Initialize matter
        </h1>
        <p className="mt-3 max-w-lg text-sm leading-relaxed text-white/45">
          Each matter workspace establishes the operational boundary for AI research,
          document intelligence, and governed outputs.
        </p>
      </div>

      {/* Form surface */}
      <div className="rounded-[var(--aether-radius-panel)] border border-white/[0.08] bg-white/[0.015] p-6 sm:p-8">
        <form action={action} className="space-y-6">
          {state?.error && (
            <div className="rounded-lg border border-red-400/[0.18] bg-red-400/[0.05] px-4 py-3">
              <p className="text-sm text-red-400/75">{state.error}</p>
            </div>
          )}

          {/* Title */}
          <Field label="Matter title">
            <input
              type="text"
              name="title"
              placeholder="e.g. Henderson Trust — Estate Administration"
              autoComplete="off"
              className={inputCls}
            />
          </Field>

          {/* Client + Billing code */}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Client name">
              <input
                type="text"
                name="clientName"
                placeholder="Client or organization"
                autoComplete="off"
                className={inputCls}
              />
            </Field>
            <Field label="Billing code">
              <input
                type="text"
                name="billingCode"
                placeholder="e.g. EST-2024-001"
                autoComplete="off"
                className={inputCls}
              />
            </Field>
          </div>

          {/* Practice area + Jurisdiction */}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Practice area">
              <select name="practiceArea" className={selectCls}>
                {PRACTICE_AREAS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Jurisdiction">
              <input
                type="text"
                name="jurisdiction"
                placeholder="e.g. New York, Federal"
                autoComplete="off"
                className={inputCls}
              />
            </Field>
          </div>

          {/* Status + Risk level */}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Status">
              <select name="status" className={selectCls}>
                {STATUS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Risk level">
              <select name="riskLevel" defaultValue="medium" className={selectCls}>
                {RISK_LEVELS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          {/* Description */}
          <Field label="Matter description">
            <textarea
              name="description"
              rows={4}
              placeholder="Operational scope, key issues, and context relevant to AI research and document intelligence..."
              className={`${inputCls} resize-none leading-relaxed`}
            />
          </Field>

          {/* Footer */}
          <div className="flex items-center justify-between border-t border-white/[0.06] pt-5">
            <p className="text-[11px] text-white/28">
              Workspace initializes immediately. Fields may be updated after creation.
            </p>
            <SubmitButton />
          </div>
        </form>
      </div>
    </div>
  )
}
