import { PrismaPg } from '@prisma/adapter-pg';
import { loadEnv } from '../config/env.js';
import { PrismaClient } from '../generated/prisma/client.js';
import { documentRepositoryContract } from './document-repository.contract.js';
import { PrismaDocumentRepository } from './prisma-document-repository.js';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: loadEnv().DATABASE_URL }),
});

beforeEach(async () => {
  await prisma.document.deleteMany();
});

afterAll(async () => {
  await prisma.$disconnect();
});

documentRepositoryContract('prisma', () => new PrismaDocumentRepository(prisma));
