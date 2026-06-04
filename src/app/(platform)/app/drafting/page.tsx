import { auth } from "@clerk/nextjs/server"
import Link from "next/link"

import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"

export default async function DraftingPage() {
  const { userId: clerkId } = auth()
  if (!clerkId) return null

  let matters: {
    id: string
    title: string
    clientName: string | null
    _count: { documents: number; researchSessions: number }
  }[] = []

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
          Drafting
        </p>
        <h1 className="mt-2 font-serif text-3xl tracking-tight text-white/[0.96] md:text-4xl">
          Drafting preparation
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-white/45">
          Prepare matter-grounded drafting work by confirming indexed sources and
          research traces before generating or reviewing language.
        </p>
      </div>

      <div className="rounded-[var(--aether-radius-panel)] border border-white/[0.06] bg-white/[0.015] p-6">
        <p className="text-[10px] uppercase tracking-[0.2em] text-white/40">
          Drafting readiness checklist
        </p>
        <div className="mt-5 grid gap-3 md:grid-cols-3">
          {[
            {
              label: "Source context",
              note: "Upload matter documents and wait for retrieval readiness.",
            },
            {
              label: "Research trace",
              note: "Run research queries to preserve supporting excerpts.",
            },
            {
              label: "Human review",
              note: "Treat generated text as counsel-reviewed draft material.",
            },
          ].map((item) => (
            <div
              key={item.label}
              className="rounded-lg border border-white/[0.05] bg-black/20 px-4 py-3"
            >
              <p className="text-sm text-white/62">{item.label}</p>
              <p className="mt-1 text-xs leading-relaxed text-white/28">{item.note}</p>
            </div>
          ))}
        </div>
      </div>

      {matters.length === 0 ? (
        <div className="rounded-[var(--aether-radius-panel)] border border-white/[0.06] bg-white/[0.01] px-8 py-16 text-center">
          <p className="font-serif text-lg text-white/45">No matters ready for drafting</p>
          <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-white/28">
            Create a matter, upload sources, and run research before preparing
            drafting work.
          </p>
          <Link
            href="/app/matters/new"
            className="mt-8 inline-flex rounded-lg border border-white/[0.1] bg-white/[0.03] px-5 py-2.5 text-sm text-white/55 transition-colors duration-200 hover:border-white/[0.16] hover:text-white/78"
          >
            Initialize matter
          </Link>
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {matters.map((matter) => (
            <Link
              key={matter.id}
              href={`/app/matters/${matter.id}`}
              className="rounded-[var(--aether-radius-panel)] border border-white/[0.06] bg-white/[0.015] p-5 transition-colors hover:bg-white/[0.03]"
            >
              <p className="font-serif text-lg text-white/78">{matter.title}</p>
              <p className="mt-1 text-sm text-white/35">{matter.clientName ?? "No client set"}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <span className="rounded-full border border-white/[0.07] px-2.5 py-0.5 text-[10px] text-white/32">
                  {matter._count.documents} source{matter._count.documents !== 1 ? "s" : ""}
                </span>
                <span className="rounded-full border border-white/[0.07] px-2.5 py-0.5 text-[10px] text-white/32">
                  {matter._count.researchSessions} research session
                  {matter._count.researchSessions !== 1 ? "s" : ""}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
