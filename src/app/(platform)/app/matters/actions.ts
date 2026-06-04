"use server"

import { redirect } from "next/navigation"

import { ensureAppUser } from "@/lib/auth/ensure-user"
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
const STATUS_OPTIONS = new Set(["active", "on_hold", "closed", "archived"])

function textField(formData: FormData, key: string, max = 240): string | null {
  const value = (formData.get(key) as string | null)?.trim()
  return value ? value.slice(0, max) : null
}

function allowedValue(
  formData: FormData,
  key: string,
  allowed: Set<string>,
  fallback: string | null = null
): string | null {
  const value = (formData.get(key) as string | null)?.trim()
  return value && allowed.has(value) ? value : fallback
}

export async function createMatter(
  _prev: MatterFormState,
  formData: FormData
): Promise<MatterFormState> {
  const title = textField(formData, "title", 160)
  if (!title) {
    return { error: "Matter title is required to initialize the workspace." }
  }

  let user: { id: string } | null = null
  try {
    user = await ensureAppUser()
  } catch {
    return { error: "Unable to reach the data layer. Please try again." }
  }

  if (!user) redirect("/sign-in")

  let matter: { id: string }
  try {
    matter = await prisma.matter.create({
      data: {
        title,
        clientName: textField(formData, "clientName"),
        practiceArea: allowedValue(formData, "practiceArea", PRACTICE_AREAS),
        jurisdiction: textField(formData, "jurisdiction"),
        riskLevel: allowedValue(formData, "riskLevel", RISK_LEVELS, "medium") ?? "medium",
        billingCode: textField(formData, "billingCode", 80),
        status: allowedValue(formData, "status", STATUS_OPTIONS, "active") ?? "active",
        description: textField(formData, "description", 4000),
        userId: user.id,
      },
    })
  } catch {
    return { error: "Matter initialization failed. Please try again." }
  }

  redirect(`/app/matters/${matter.id}`)
}
