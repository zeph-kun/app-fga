import { randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { loadEnv } from '../config/env.js';
import { PrismaClient } from '../generated/prisma/client.js';
import { activityLogRepositoryContract, anEntry } from './activity-log-repository.contract.js';
import { PrismaActivityLogRepository } from './prisma-activity-log-repository.js';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: loadEnv().DATABASE_URL }),
});

async function newResourceId(type: 'document' | 'folder'): Promise<string> {
  if (type === 'folder') return (await prisma.folder.create({ data: { ownerId: 'alice', name: 'Projects' } })).id;
  return (await prisma.document.create({ data: { ownerId: 'alice', title: 'Plan', content: '', folderId: null } })).id;
}

beforeEach(async () => {
  await prisma.activityEntry.deleteMany();
  await prisma.shareLink.deleteMany();
  await prisma.document.deleteMany();
  await prisma.folder.deleteMany();
});

afterAll(async () => {
  await prisma.$disconnect();
});

activityLogRepositoryContract('prisma', () => ({ repository: new PrismaActivityLogRepository(prisma), newResourceId }));

describe('Activity entries in Postgres', () => {
  it('are removed with their Document or Folder', async () => {
    const repository = new PrismaActivityLogRepository(prisma);
    const document = { type: 'document', id: await newResourceId('document') } as const;
    const folder = { type: 'folder', id: await newResourceId('folder') } as const;
    await repository.add(anEntry(document));
    await repository.add(anEntry(folder));

    await prisma.document.delete({ where: { id: document.id } });
    await prisma.folder.delete({ where: { id: folder.id } });

    expect(await repository.findByResource(document, 50)).toEqual([]);
    expect(await repository.findByResource(folder, 50)).toEqual([]);
  });

  it('point to exactly one of a Document and a Folder', async () => {
    const documentId = await newResourceId('document');
    const folderId = await newResourceId('folder');
    const row = { actorId: 'alice', kind: 'unshared', details: {} };

    await expect(prisma.activityEntry.create({ data: { ...row, id: randomUUID() } })).rejects.toThrow();
    await expect(
      prisma.activityEntry.create({ data: { ...row, id: randomUUID(), documentId, folderId } }),
    ).rejects.toThrow();
  });
});
