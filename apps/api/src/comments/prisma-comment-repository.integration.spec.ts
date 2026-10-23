import { randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { loadEnv } from '../config/env.js';
import { PrismaClient } from '../generated/prisma/client.js';
import { commentRepositoryContract } from './comment-repository.contract.js';
import { PrismaCommentRepository } from './prisma-comment-repository.js';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: loadEnv().DATABASE_URL }),
});

async function newDocumentId(): Promise<string> {
  const { id } = await prisma.document.create({
    data: { ownerId: 'alice', title: 'Plan', content: '', folderId: null },
  });
  return id;
}

beforeEach(async () => {
  await prisma.comment.deleteMany();
  await prisma.document.deleteMany();
});

afterAll(async () => {
  await prisma.$disconnect();
});

commentRepositoryContract('prisma', () => ({ repository: new PrismaCommentRepository(prisma), newDocumentId }));

describe('Comments in Postgres', () => {
  it('are removed with their document', async () => {
    const repository = new PrismaCommentRepository(prisma);
    const documentId = await newDocumentId();
    await repository.save({ id: randomUUID(), documentId, authorId: 'bob', text: 'Hi', createdAt: new Date() });

    await prisma.document.delete({ where: { id: documentId } });

    expect(await repository.findByDocument(documentId)).toEqual([]);
  });
});
