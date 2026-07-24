"use server"

import { auth } from "@clerk/nextjs/server"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { prisma } from "@/lib/prisma"

export type MatterFormState = {
  error?: string
}

const PRACTICE_AREAS = new Set([
  "corporate",
  "litigation",
  "m_and_a",
  "real_estate",
  "finance",
  "intellectual_property",
  "tax",
  "regulatory",
  "employment",
  "other",
])

const RISK_LEVELS = new Set(["low", "medium", "high", "critical"])
const STATUSES = new Set(["active", "on_hold", "closed", "archived"])

function optionalEnum(value: FormDataEntryValue | null, allowed: Set<string>): string | null {
  if (typeof value !== "string" || !value) return null
  return allowed.has(value) ? value : "__invalid__"
}

function requiredEnum(
  value: FormDataEntryValue | null,
  allowed: Set<string>,
  fallback: string
): string | null {
  if (typeof value !== "string" || !value) return fallback
  return allowed.has(value) ? value : null
}

export async function createMatter(
  _prev: MatterFormState,
  formData: FormData
): Promise<MatterFormState> {
  const { userId: clerkId } = await auth()
  if (!clerkId) redirect("/sign-in")

  const title = (formData.get("title") as string | null)?.trim()
  if (!title) {
    return { error: "Matter title is required to initialize the workspace." }
  }

  const practiceArea = optionalEnum(formData.get("practiceArea"), PRACTICE_AREAS)
  const riskLevel = requiredEnum(formData.get("riskLevel"), RISK_LEVELS, "medium")
  const status = requiredEnum(formData.get("status"), STATUSES, "active")

  if (practiceArea === "__invalid__" || !riskLevel || !status) {
    return { error: "Matter metadata contains an unsupported option." }
  }

  let user: { id: string } | null = null
  try {
    user = await prisma.user.findUnique({ where: { clerkId } })
  } catch {
    return { error: "Unable to reach the data layer. Please try again." }
  }

  if (!user) redirect("/sign-in")

  let matter: { id: string }
  try {
    matter = await prisma.matter.create({
      data: {
        title,
        clientName: (formData.get("clientName") as string | null)?.trim() || null,
        practiceArea,
        jurisdiction: (formData.get("jurisdiction") as string | null)?.trim() || null,
        riskLevel,
        billingCode: (formData.get("billingCode") as string | null)?.trim() || null,
        status,
        description: (formData.get("description") as string | null)?.trim() || null,
        userId: user.id,
      },
    })
  } catch {
    return { error: "Matter initialization failed. Please try again." }
  }

  redirect(`/app/matters/${matter.id}`)
}

export type MatterStatusState = {
  error?: string
  success?: boolean
}

export async function updateMatterStatus(
  matterId: string,
  status: string
): Promise<MatterStatusState> {
  const { userId: clerkId } = await auth()
  if (!clerkId) return { error: "Authentication required." }

  if (!STATUSES.has(status)) {
    return { error: "Unsupported matter status." }
  }

  try {
    const user = await prisma.user.findUnique({
      where: { clerkId },
      select: { id: true },
    })
    if (!user) return { error: "Session not found. Please sign in again." }

    const matter = await prisma.matter.findFirst({
      where: { id: matterId, userId: user.id },
      select: { id: true },
    })
    if (!matter) return { error: "Matter not found or access denied." }

    await prisma.matter.update({
      where: { id: matter.id },
      data: { status },
    })
  } catch {
    return { error: "Unable to update matter status. Please try again." }
  }

  revalidatePath(`/app/matters/${matterId}`)
  revalidatePath("/app/matters")
  revalidatePath("/app/research")
  revalidatePath("/app")

  return { success: true }
}
