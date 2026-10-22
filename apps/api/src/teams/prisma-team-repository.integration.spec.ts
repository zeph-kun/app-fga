import { PrismaPg } from '@prisma/adapter-pg';
import { loadEnv } from '../config/env.js';
import { PrismaClient } from '../generated/prisma/client.js';
import { PrismaTeamRepository } from './prisma-team-repository.js';
import { teamRepositoryContract } from './team-repository.contract.js';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: loadEnv().DATABASE_URL }),
});

beforeEach(async () => {
  await prisma.team.deleteMany();
});

afterAll(async () => {
  await prisma.$disconnect();
});

teamRepositoryContract('prisma', () => new PrismaTeamRepository(prisma));
