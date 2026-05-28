"use server"

import { auth } from "@clerk/nextjs/server"
import { redirect } from "next/navigation"

import { prisma } from "@/lib/prisma"

export type MatterFormState = {
  error?: string
}

export async function createMatter(
  _prev: MatterFormState,
  formData: FormData
): Promise<MatterFormState> {
  const { userId: clerkId } = auth()
  if (!clerkId) redirect("/sign-in")

  const title = (formData.get("title") as string | null)?.trim()
  if (!title) {
    return { error: "Matter title is required to initialize the workspace." }
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
        practiceArea: (formData.get("practiceArea") as string | null) || null,
        jurisdiction: (formData.get("jurisdiction") as string | null)?.trim() || null,
        riskLevel: (formData.get("riskLevel") as string | null) || "medium",
        billingCode: (formData.get("billingCode") as string | null)?.trim() || null,
        status: (formData.get("status") as string | null) || "active",
        description: (formData.get("description") as string | null)?.trim() || null,
        userId: user.id,
      },
    })
  } catch {
    return { error: "Matter initialization failed. Please try again." }
  }

  redirect(`/app/matters/${matter.id}`)
}
