import { randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { loadEnv } from '../config/env.js';
import { PrismaClient } from '../generated/prisma/client.js';
import { folderRepositoryContract } from './folder-repository.contract.js';
import { PrismaFolderRepository } from './prisma-folder-repository.js';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: loadEnv().DATABASE_URL }),
});

beforeEach(async () => {
  await prisma.folder.deleteMany();
});

afterAll(async () => {
  await prisma.$disconnect();
});

folderRepositoryContract('prisma', () => new PrismaFolderRepository(prisma));

describe('Folders in Folders, in Postgres', () => {
  const repository = new PrismaFolderRepository(prisma);

  it('refuses to delete a folder that still has folders in it', async () => {
    const parent = { id: randomUUID(), ownerId: 'alice', name: 'Parent', parentId: null };
    await repository.save(parent);
    await repository.save({ id: randomUUID(), ownerId: 'alice', name: 'Child', parentId: parent.id });

    await expect(repository.delete(parent.id)).rejects.toThrow();

    expect(await repository.findById(parent.id)).toEqual(parent);
  });

  it('refuses a folder whose parent does not exist', async () => {
    await expect(
      repository.save({ id: randomUUID(), ownerId: 'alice', name: 'Lost', parentId: randomUUID() }),
    ).rejects.toThrow();
  });
});
