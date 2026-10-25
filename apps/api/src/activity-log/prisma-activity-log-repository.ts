import { z } from 'zod';
import { SHARED_ROLES } from '../authorization/authorizer.js';
import type { PrismaClient } from '../generated/prisma/client.js';
import type { ActivityEntry, ActivityEvent } from './activity-entry.js';
import { ActivityLogRepository } from './activity-log-repository.js';

const role = z.enum(SHARED_ROLES);
const subject = z.object({ type: z.enum(['user', 'team']), id: z.string(), name: z.string() });
const folder = z.object({ id: z.string(), name: z.string() }).nullable();
// Dates went through JSON as ISO strings.
const expiresAt = z.coerce.date().optional();

/** The shape of `details` for each `kind`: what `ActivityEvent` holds besides its kind. */
const eventSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('shared'), subject, role, expiresAt }),
  z.object({ kind: z.literal('unshared'), subject }),
  z.object({ kind: z.literal('link-created'), role, tokenSuffix: z.string(), expiresAt }),
  z.object({ kind: z.literal('link-revoked'), role, tokenSuffix: z.string(), expiresAt }),
  z.object({ kind: z.literal('link-accepted'), role, tokenSuffix: z.string() }),
  z.object({ kind: z.literal('moved'), from: folder, to: folder }),
]);

/** Postgres adapter, through Prisma. */
export class PrismaActivityLogRepository extends ActivityLogRepository {
  constructor(private readonly prisma: PrismaClient) {
    super();
  }

  override async add({ id, resource, actorId, at, event }: ActivityEntry): Promise<void> {
    const { kind, ...details } = event;
    await this.prisma.activityEntry.create({
      data: {
        id,
        documentId: resource.type === 'document' ? resource.id : null,
        folderId: resource.type === 'folder' ? resource.id : null,
        actorId,
        kind,
        details: z.record(z.string(), z.json()).parse(JSON.parse(JSON.stringify(details))),
        createdAt: at,
      },
    });
  }

  override async findByResource({ type, id }: ActivityEntry['resource'], limit: number): Promise<ActivityEntry[]> {
    const rows = await this.prisma.activityEntry.findMany({
      where: type === 'document' ? { documentId: id } : { folderId: id },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return rows.map((row) => ({
      id: row.id,
      resource: { type, id },
      actorId: row.actorId,
      at: row.createdAt,
      event: toEvent(row.id, row.kind, row.details),
    }));
  }
}

function toEvent(id: string, kind: string, details: unknown): ActivityEvent {
  const parsed = eventSchema.safeParse({ ...z.record(z.string(), z.unknown()).parse(details), kind });
  if (!parsed.success) throw new Error(`Activity entry ${id} is of an unknown shape (${kind})`);
  return parsed.data;
}
