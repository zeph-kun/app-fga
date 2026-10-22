import type { PrismaClient } from '../generated/prisma/client.js';
import type { Document } from './document.js';
import { DocumentRepository } from './document-repository.js';

/** Postgres adapter, through Prisma. */
export class PrismaDocumentRepository extends DocumentRepository {
  constructor(private readonly prisma: PrismaClient) {
    super();
  }

  override async save({ id, ownerId, folderId, title, content }: Document): Promise<void> {
    await this.prisma.document.upsert({
      where: { id },
      create: { id, ownerId, folderId, title, content },
      update: { folderId, title, content },
    });
  }

  override async findById(id: string): Promise<Document | undefined> {
    const row = await this.prisma.document.findUnique({ where: { id } });
    return row ? toDocument(row) : undefined;
  }

  override async findByIds(ids: readonly string[]): Promise<Document[]> {
    const rows = await this.prisma.document.findMany({ where: { id: { in: [...ids] } } });
    return rows.map(toDocument);
  }

  override async findByFolder(folderId: string): Promise<Document[]> {
    const rows = await this.prisma.document.findMany({ where: { folderId } });
    return rows.map(toDocument);
  }

  override async delete(id: string): Promise<void> {
    await this.prisma.document.deleteMany({ where: { id } });
  }
}

function toDocument({ id, ownerId, folderId, title, content }: Document): Document {
  return { id, ownerId, folderId, title, content };
}
