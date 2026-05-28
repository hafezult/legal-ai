"use client"

import { useCallback, useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"

import { cn } from "@/lib/utils"
import type { DocumentUploadState } from "@/app/(platform)/app/matters/[matterId]/actions"

type UploadFn = (
  prev: DocumentUploadState,
  formData: FormData
) => Promise<DocumentUploadState>

type Props = {
  uploadAction: UploadFn
}

const ALLOWED = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
]
const FORMAT_LABEL = "PDF · DOCX · TXT"
const MAX_BYTES = 50 * 1024 * 1024

function fmtBytes(n: number) {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

type Phase = "idle" | "selected" | "uploading" | "success" | "error"

export function DocumentUploadZone({ uploadAction }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [phase, setPhase] = useState<Phase>("idle")
  const [file, setFile] = useState<File | null>(null)
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const pick = useCallback((f: File) => {
    setError(null)
    if (!ALLOWED.includes(f.type)) {
      setError(`Unsupported format. Accepted: ${FORMAT_LABEL}.`)
      setPhase("error")
      return
    }
    if (f.size > MAX_BYTES) {
      setError("File exceeds the 50 MB ingestion limit.")
      setPhase("error")
      return
    }
    setFile(f)
    setPhase("selected")
  }, [])

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setDragging(false)
      const f = e.dataTransfer.files[0]
      if (f) pick(f)
    },
    [pick]
  )

  const onInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0]
      if (f) pick(f)
    },
    [pick]
  )

  const reset = useCallback(() => {
    setFile(null)
    setPhase("idle")
    setError(null)
    if (inputRef.current) inputRef.current.value = ""
  }, [])

  const ingest = useCallback(() => {
    if (!file) return
    const fd = new FormData()
    fd.append("file", file)
    setPhase("uploading")
    setError(null)

    startTransition(async () => {
      const result = await uploadAction({}, fd)
      if (result.error) {
        setError(result.error)
        setPhase("error")
      } else {
        setPhase("success")
        setFile(null)
        if (inputRef.current) inputRef.current.value = ""
        router.refresh()
        setTimeout(() => setPhase("idle"), 4000)
      }
    })
  }, [file, uploadAction, router])

  if (phase === "success") {
    return (
      <div className="rounded-lg border border-white/[0.1] bg-white/[0.025] px-5 py-4">
        <p className="text-[10px] uppercase tracking-[0.16em] text-white/38">
          Ingestion status
        </p>
        <p className="mt-1 text-sm text-white/72">
          Source ingestion initialized.
        </p>
        <p className="mt-0.5 text-xs text-white/32">
          Document queued for indexing. Registry updated below.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* Drop zone surface */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => phase === "idle" || phase === "error" ? inputRef.current?.click() : undefined}
        className={cn(
          "relative rounded-lg border transition-colors duration-200",
          phase === "uploading"
            ? "cursor-wait border-white/[0.08] bg-white/[0.02]"
            : phase === "selected"
            ? "cursor-default border-white/[0.12] bg-white/[0.025]"
            : dragging
            ? "cursor-copy border-white/[0.2] bg-white/[0.04]"
            : "cursor-pointer border-white/[0.07] bg-white/[0.01] hover:border-white/[0.12] hover:bg-white/[0.02]"
        )}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
          onChange={onInputChange}
          className="sr-only"
          tabIndex={-1}
        />

        {phase === "uploading" ? (
          <div className="flex items-center gap-4 px-5 py-4">
            <div className="h-px flex-1 overflow-hidden bg-white/[0.06]">
              <div className="h-full w-2/3 animate-pulse bg-white/[0.18]" />
            </div>
            <p className="shrink-0 text-xs text-white/35">
              Initializing ingestion...
            </p>
          </div>
        ) : phase === "selected" && file ? (
          <div className="flex items-center justify-between gap-4 px-5 py-4">
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-[0.14em] text-white/32">
                Selected source
              </p>
              <p className="mt-0.5 truncate text-sm text-white/80">{file.name}</p>
              <p className="mt-0.5 text-xs text-white/28">{fmtBytes(file.size)}</p>
            </div>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); reset() }}
              className="shrink-0 text-xs text-white/28 transition-colors hover:text-white/55"
            >
              Remove
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center px-6 py-10 text-center">
            <div className="mb-3 rounded-full border border-white/[0.08] bg-white/[0.02] p-3">
              <ArrowUpIcon />
            </div>
            <p className="text-sm text-white/52">
              Drag a document here, or{" "}
              <span className="text-white/72 underline-offset-2 hover:underline">
                select file
              </span>
            </p>
            <p className="mt-1.5 text-xs text-white/28">{FORMAT_LABEL} · max 50 MB</p>
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-red-400/[0.15] bg-red-400/[0.04] px-4 py-3">
          <p className="text-sm text-red-400/68">{error}</p>
        </div>
      )}

      {/* Ingest CTA */}
      {phase === "selected" && (
        <button
          type="button"
          onClick={ingest}
          disabled={isPending}
          className="rounded-lg border border-white/[0.12] bg-white/[0.05] px-5 py-2.5 text-sm text-white/70 transition-colors duration-200 hover:border-white/[0.2] hover:bg-white/[0.09] hover:text-white/92 disabled:pointer-events-none disabled:opacity-40"
        >
          Ingest document
        </button>
      )}
    </div>
  )
}

function ArrowUpIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 15 15"
      fill="none"
      className="text-white/35"
    >
      <path
        d="M7.5 1.5v10M7.5 1.5L3.5 5.5M7.5 1.5L11.5 5.5M1.5 12.5h12"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
