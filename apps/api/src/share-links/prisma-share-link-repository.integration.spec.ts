import { randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { loadEnv } from '../config/env.js';
import { PrismaClient } from '../generated/prisma/client.js';
import { PrismaShareLinkRepository } from './prisma-share-link-repository.js';
import { aShareLink, shareLinkRepositoryContract } from './share-link-repository.contract.js';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: loadEnv().DATABASE_URL }),
});

async function newResourceId(type: 'document' | 'folder'): Promise<string> {
  if (type === 'folder') return (await prisma.folder.create({ data: { ownerId: 'alice', name: 'Projects' } })).id;
  return (await prisma.document.create({ data: { ownerId: 'alice', title: 'Plan', content: '', folderId: null } })).id;
}

beforeEach(async () => {
  await prisma.shareLink.deleteMany();
  await prisma.document.deleteMany();
  await prisma.folder.deleteMany();
});

afterAll(async () => {
  await prisma.$disconnect();
});

shareLinkRepositoryContract('prisma', () => ({ repository: new PrismaShareLinkRepository(prisma), newResourceId }));

describe('Share links in Postgres', () => {
  it('are removed with their Document or Folder', async () => {
    const repository = new PrismaShareLinkRepository(prisma);
    const document = { type: 'document', id: await newResourceId('document') } as const;
    const folder = { type: 'folder', id: await newResourceId('folder') } as const;
    await repository.save(aShareLink(document));
    await repository.save(aShareLink(folder));

    await prisma.document.delete({ where: { id: document.id } });
    await prisma.folder.delete({ where: { id: folder.id } });

    expect(await repository.findByResource(document)).toEqual([]);
    expect(await repository.findByResource(folder)).toEqual([]);
  });

  it('point to exactly one of a Document and a Folder', async () => {
    const documentId = await newResourceId('document');
    const folderId = await newResourceId('folder');
    const row = { role: 'viewer', tokenSuffix: 'abcd', createdBy: 'alice' };

    await expect(
      prisma.shareLink.create({ data: { ...row, id: randomUUID(), tokenHash: 'none' } }),
    ).rejects.toThrow();
    await expect(
      prisma.shareLink.create({ data: { ...row, id: randomUUID(), tokenHash: 'both', documentId, folderId } }),
    ).rejects.toThrow();
  });
});
