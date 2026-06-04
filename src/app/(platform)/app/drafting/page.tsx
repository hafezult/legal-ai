import { auth } from "@clerk/nextjs/server"
import Link from "next/link"

import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"

function fmtDate(d: Date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(d)
}

export default async function DraftingPage() {
  const { userId: clerkId } = auth()
  if (!clerkId) return null

  type MatterDraftContext = {
    id: string
    title: string
    clientName: string | null
    updatedAt: Date
    _count: {
      documents: number
      researchSessions: number
    }
  }

  let matters: MatterDraftContext[] = []

  try {
    const user = await prisma.user.findUnique({ where: { clerkId } })
    if (user) {
      matters = await prisma.matter.findMany({
        where: { userId: user.id, status: { not: "archived" } },
        orderBy: { updatedAt: "desc" },
        take: 6,
        select: {
          id: true,
          title: true,
          clientName: true,
          updatedAt: true,
          _count: { select: { documents: true, researchSessions: true } },
        },
      })
    }
  } catch {
    /* DB unavailable */
  }

  return (
    <div className="space-y-8">
      <div>
        <p className="text-[11px] uppercase tracking-[0.22em] text-white/40">
          Drafting workbench
        </p>
        <h1 className="mt-2 font-serif text-3xl tracking-tight text-white/[0.96] md:text-4xl">
          Grounded drafting queue
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-white/45">
          Prepare drafting tasks from matter context, indexed sources, and saved
          research sessions before sending work product through review gates.
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.05fr_0.95fr]">
        <div className="rounded-[var(--aether-radius-panel)] border border-white/[0.07] bg-black/25 p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[10px] uppercase tracking-[0.2em] text-white/38">
                Draft packet
              </p>
              <p className="mt-3 font-serif text-xl text-white/72">
                Build from verified matter material
              </p>
            </div>
            <span className="rounded-full border border-white/[0.08] px-2.5 py-0.5 text-[10px] uppercase tracking-[0.12em] text-white/32">
              Review gated
            </span>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            {[
              { label: "1. Matter", note: "Choose the legal context and client boundary." },
              { label: "2. Sources", note: "Require indexed documents or saved research." },
              { label: "3. Output", note: "Prepare counsel-ready sections for review." },
            ].map((step) => (
              <div
                key={step.label}
                className="rounded-lg border border-white/[0.06] bg-white/[0.015] p-4"
              >
                <p className="text-[10px] uppercase tracking-[0.14em] text-white/42">
                  {step.label}
                </p>
                <p className="mt-2 text-xs leading-relaxed text-white/28">{step.note}</p>
              </div>
            ))}
          </div>

          <div className="mt-6 rounded-lg border border-white/[0.05] bg-white/[0.015] p-4">
            <p className="text-[10px] uppercase tracking-[0.16em] text-white/32">
              Available draft types
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {[
                "Research memorandum",
                "Chronology",
                "Issue list",
                "Disclosure summary",
                "Client update",
              ].map((item) => (
                <span
                  key={item}
                  className="rounded-full border border-white/[0.08] px-3 py-1 text-xs text-white/45"
                >
                  {item}
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="rounded-[var(--aether-radius-panel)] border border-white/[0.07] bg-white/[0.015] p-6">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[10px] uppercase tracking-[0.2em] text-white/38">
              Matter readiness
            </p>
            <Link
              href="/app/matters/new"
              className="text-[11px] text-white/35 transition-colors hover:text-white/65"
            >
              New matter
            </Link>
          </div>

          {matters.length === 0 ? (
            <div className="mt-8 rounded-lg border border-white/[0.05] bg-black/20 p-5">
              <p className="font-serif text-base text-white/50">No matter context yet</p>
              <p className="mt-2 text-sm leading-relaxed text-white/28">
                Initialize a matter and ingest sources before preparing drafting packets.
              </p>
            </div>
          ) : (
            <div className="mt-5 space-y-3">
              {matters.map((matter) => {
                const ready =
                  matter._count.documents > 0 || matter._count.researchSessions > 0
                return (
                  <Link
                    key={matter.id}
                    href={`/app/matters/${matter.id}`}
                    className="block rounded-lg border border-white/[0.055] bg-black/20 px-4 py-3 transition-colors hover:border-white/[0.1] hover:bg-white/[0.025]"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm text-white/72">{matter.title}</p>
                        <p className="mt-0.5 truncate text-xs text-white/30">
                          {matter.clientName ?? "No client"} - updated {fmtDate(matter.updatedAt)}
                        </p>
                      </div>
                      <span
                        className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.1em] ${
                          ready
                            ? "border-white/[0.14] text-white/56"
                            : "border-white/[0.06] text-white/24"
                        }`}
                      >
                        {ready ? "Ready" : "Needs sources"}
                      </span>
                    </div>
                    <div className="mt-3 flex gap-4 text-xs text-white/30">
                      <span>{matter._count.documents} docs</span>
                      <span>{matter._count.researchSessions} sessions</span>
                    </div>
                  </Link>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
