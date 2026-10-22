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
