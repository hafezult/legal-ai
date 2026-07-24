import { prisma } from "@/lib/prisma"

export type AuditEventInput = {
  userId: string
  action: string
  entityType: string
  entityId?: string | null
  matterId?: string | null
  organizationId?: string | null
  summary: string
  metadata?: Record<string, unknown>
}

/**
 * Persist a workspace audit event. Failures are non-fatal so primary mutations
 * are not blocked by trail write issues.
 *
 * When organizationId is omitted but matterId is present, the matter's
 * organization is resolved so org-scoped activity feeds stay accurate.
 */
export async function recordAuditEvent(input: AuditEventInput): Promise<void> {
  try {
    let organizationId = input.organizationId ?? null

    if (organizationId === null && input.matterId) {
      const matter = await prisma.matter.findUnique({
        where: { id: input.matterId },
        select: { organizationId: true },
      })
      organizationId = matter?.organizationId ?? null
    }

    // Org-level entity ids are often the organization itself.
    if (
      organizationId === null &&
      input.entityType.startsWith("organization") &&
      input.entityId
    ) {
      const org = await prisma.organization.findUnique({
        where: { id: input.entityId },
        select: { id: true },
      })
      organizationId = org?.id ?? null
    }

    await prisma.auditEvent.create({
      data: {
        userId: input.userId,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId ?? null,
        matterId: input.matterId ?? null,
        organizationId,
        summary: input.summary.slice(0, 500),
        metadata: input.metadata ? JSON.stringify(input.metadata) : null,
      },
    })
  } catch {
    /* Non-fatal — audit trail must not break primary workflows */
  }
}
