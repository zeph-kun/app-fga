import { z } from 'zod';
import { SHARED_ROLES } from '../authorization/authorizer.js';
import type { PrismaClient } from '../generated/prisma/client.js';
import type { ShareLink } from './share-link.js';
import { ShareLinkRepository } from './share-link-repository.js';

const roleSchema = z.enum(SHARED_ROLES);

interface Row {
  readonly id: string;
  readonly documentId: string | null;
  readonly folderId: string | null;
  readonly role: string;
  readonly tokenHash: string;
  readonly tokenSuffix: string;
  readonly createdBy: string;
  readonly createdAt: Date;
  readonly expiresAt: Date | null;
}

/** Postgres adapter, through Prisma. */
export class PrismaShareLinkRepository extends ShareLinkRepository {
  constructor(private readonly prisma: PrismaClient) {
    super();
  }

  override async save({ resource, expiresAt, ...link }: ShareLink): Promise<void> {
    const data = {
      ...link,
      documentId: resource.type === 'document' ? resource.id : null,
      folderId: resource.type === 'folder' ? resource.id : null,
      expiresAt: expiresAt ?? null,
    };
    await this.prisma.shareLink.upsert({ where: { id: link.id }, create: data, update: data });
  }

  override async findById(id: string): Promise<ShareLink | undefined> {
    const row = await this.prisma.shareLink.findUnique({ where: { id } });
    return row ? toShareLink(row) : undefined;
  }

  override async findByTokenHash(tokenHash: string): Promise<ShareLink | undefined> {
    const row = await this.prisma.shareLink.findUnique({ where: { tokenHash } });
    return row ? toShareLink(row) : undefined;
  }

  override async findByResource({ type, id }: ShareLink['resource']): Promise<ShareLink[]> {
    const rows = await this.prisma.shareLink.findMany({
      where: type === 'document' ? { documentId: id } : { folderId: id },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map(toShareLink);
  }

  override async delete(id: string): Promise<void> {
    await this.prisma.shareLink.deleteMany({ where: { id } });
  }
}

function toShareLink({ documentId, folderId, role, expiresAt, ...row }: Row): ShareLink {
  const resource =
    documentId !== null
      ? ({ type: 'document', id: documentId } as const)
      : folderId !== null
        ? ({ type: 'folder', id: folderId } as const)
        : undefined;
  if (!resource) throw new Error(`Share link ${row.id} points to neither a Document nor a Folder`);
  return { ...row, resource, role: roleSchema.parse(role), ...(expiresAt && { expiresAt }) };
}
