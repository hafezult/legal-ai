import { prisma } from "@/lib/prisma"

export type AuditEventInput = {
  userId: string
  action: string
  entityType: string
  entityId?: string | null
  matterId?: string | null
  summary: string
  metadata?: Record<string, unknown>
}

/**
 * Persist a workspace audit event. Failures are non-fatal so primary mutations
 * are not blocked by trail write issues.
 */
export async function recordAuditEvent(input: AuditEventInput): Promise<void> {
  try {
    await prisma.auditEvent.create({
      data: {
        userId: input.userId,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId ?? null,
        matterId: input.matterId ?? null,
        summary: input.summary.slice(0, 500),
        metadata: input.metadata ? JSON.stringify(input.metadata) : null,
      },
    })
  } catch {
    /* Non-fatal — audit trail must not break primary workflows */
  }
}
