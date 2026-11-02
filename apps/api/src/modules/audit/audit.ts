import type { ActorType, DbExecutor, Prisma } from '@dz/db';

/** One audit entry (ARCHITECTURE §6). Never put personal data in `meta`. */
export interface AuditEntry {
  actorType: ActorType;
  actorUserId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  storeId?: string | null;
  ipPrefix?: string | null;
  before?: Prisma.InputJsonValue;
  after?: Prisma.InputJsonValue;
  meta?: Prisma.InputJsonValue;
}

export async function recordAudit(db: DbExecutor, entry: AuditEntry): Promise<void> {
  await db.auditLog.create({
    data: {
      actorType: entry.actorType,
      actorUserId: entry.actorUserId ?? null,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId ?? null,
      storeId: entry.storeId ?? null,
      ipPrefix: entry.ipPrefix ?? null,
      ...(entry.before === undefined ? {} : { before: entry.before }),
      ...(entry.after === undefined ? {} : { after: entry.after }),
      ...(entry.meta === undefined ? {} : { meta: entry.meta }),
    },
  });
}
