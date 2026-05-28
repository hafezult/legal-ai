import { auth } from "@clerk/nextjs/server"
import Link from "next/link"

import { MatterStatusPill } from "@/components/matters/matter-status-pill"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date)
}

function practiceAreaLabel(value: string | null) {
  if (!value) return "—"
  return value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
}

export default async function MattersPage() {
  const { userId: clerkId } = auth()
  if (!clerkId) return null

  type MatterRow = {
    id: string
    title: string
    clientName: string | null
    practiceArea: string | null
    jurisdiction: string | null
    status: string
    updatedAt: Date
  }

  let matters: MatterRow[] = []

  try {
    const user = await prisma.user.findUnique({ where: { clerkId } })
    if (user) {
      matters = await prisma.matter.findMany({
        where: { userId: user.id },
        orderBy: { updatedAt: "desc" },
        select: {
          id: true,
          title: true,
          clientName: true,
          practiceArea: true,
          jurisdiction: true,
          status: true,
          updatedAt: true,
        },
      })
    }
  } catch {
    /* DB unavailable */
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] uppercase tracking-[0.22em] text-white/40">
            Legal operations
          </p>
          <h1 className="mt-2 font-serif text-3xl tracking-tight text-white/[0.96] md:text-4xl">
            Matter registry
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-white/45">
            Governed matter workspaces with privilege boundaries and AI research scope.
          </p>
        </div>
        <Link
          href="/app/matters/new"
          className="mt-1 shrink-0 rounded-lg border border-white/[0.1] bg-white/[0.04] px-4 py-2 text-[13px] text-white/65 transition-colors duration-200 hover:border-white/[0.18] hover:bg-white/[0.07] hover:text-white/88"
        >
          New matter
        </Link>
      </div>

      {matters.length === 0 ? (
        /* Empty state */
        <div className="rounded-[var(--aether-radius-panel)] border border-white/[0.06] bg-white/[0.01] px-8 py-20 text-center">
          <p className="font-serif text-xl text-white/50">No matters registered</p>
          <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-white/28">
            Legal operations initialize through governed matter workspaces. Each matter
            establishes privilege boundaries, AI research scope, and document intelligence
            context for the platform.
          </p>
          <Link
            href="/app/matters/new"
            className="mt-8 inline-flex rounded-lg border border-white/[0.1] bg-white/[0.03] px-5 py-2.5 text-sm text-white/55 transition-colors duration-200 hover:border-white/[0.16] hover:text-white/78"
          >
            Initialize first matter
          </Link>
        </div>
      ) : (
        /* Matter list */
        <div className="overflow-hidden rounded-[var(--aether-radius-panel)] border border-white/[0.07] bg-white/[0.015]">
          {/* Column headers */}
          <div className="flex items-center gap-6 border-b border-white/[0.06] px-5 py-3">
            <span className="min-w-0 flex-1 text-[10px] uppercase tracking-[0.16em] text-white/32">
              Title
            </span>
            <span className="hidden w-36 shrink-0 text-[10px] uppercase tracking-[0.16em] text-white/32 sm:block">
              Client
            </span>
            <span className="hidden w-36 shrink-0 text-[10px] uppercase tracking-[0.16em] text-white/32 md:block">
              Practice
            </span>
            <span className="w-20 shrink-0 text-[10px] uppercase tracking-[0.16em] text-white/32">
              Status
            </span>
            <span className="hidden w-24 shrink-0 text-right text-[10px] uppercase tracking-[0.16em] text-white/32 lg:block">
              Updated
            </span>
          </div>

          {/* Rows */}
          {matters.map((matter) => (
            <Link
              key={matter.id}
              href={`/app/matters/${matter.id}`}
              className="group flex items-center gap-6 border-t border-white/[0.04] px-5 py-4 transition-colors duration-150 first:border-t-0 hover:bg-white/[0.025]"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-serif text-[15px] text-white/82 transition-colors group-hover:text-white/95">
                  {matter.title}
                </p>
                {matter.jurisdiction && (
                  <p className="mt-0.5 truncate text-xs text-white/30">
                    {matter.jurisdiction}
                  </p>
                )}
              </div>
              <span className="hidden w-36 shrink-0 truncate text-sm text-white/42 sm:block">
                {matter.clientName ?? "—"}
              </span>
              <span className="hidden w-36 shrink-0 truncate text-sm text-white/42 md:block">
                {practiceAreaLabel(matter.practiceArea)}
              </span>
              <div className="w-20 shrink-0">
                <MatterStatusPill status={matter.status} />
              </div>
              <span className="hidden w-24 shrink-0 text-right text-xs text-white/28 lg:block">
                {formatDate(matter.updatedAt)}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
