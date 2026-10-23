import type { PrismaClient } from '../generated/prisma/client.js';
import type { Comment } from './comment.js';
import { CommentRepository } from './comment-repository.js';

/** Postgres adapter, through Prisma. */
export class PrismaCommentRepository extends CommentRepository {
  constructor(private readonly prisma: PrismaClient) {
    super();
  }

  override async save({ id, documentId, authorId, text, createdAt }: Comment): Promise<void> {
    await this.prisma.comment.upsert({
      where: { id },
      create: { id, documentId, authorId, text, createdAt },
      update: { text },
    });
  }

  override async findById(id: string): Promise<Comment | undefined> {
    const row = await this.prisma.comment.findUnique({ where: { id } });
    return row ? toComment(row) : undefined;
  }

  override async findByDocument(documentId: string): Promise<Comment[]> {
    const rows = await this.prisma.comment.findMany({ where: { documentId }, orderBy: { createdAt: 'asc' } });
    return rows.map(toComment);
  }

  override async delete(id: string): Promise<void> {
    await this.prisma.comment.deleteMany({ where: { id } });
  }
}

function toComment({ id, documentId, authorId, text, createdAt }: Comment): Comment {
  return { id, documentId, authorId, text, createdAt };
}
