import type { PrismaClient } from '../generated/prisma/client.js';
import type { Team } from './team.js';
import { TeamRepository } from './team-repository.js';

/** Postgres adapter, through Prisma. */
export class PrismaTeamRepository extends TeamRepository {
  constructor(private readonly prisma: PrismaClient) {
    super();
  }

  override async save({ id, name, ownerId }: Team): Promise<void> {
    await this.prisma.team.upsert({
      where: { id },
      create: { id, name, ownerId },
      update: { name },
    });
  }

  override async findById(id: string): Promise<Team | undefined> {
    const row = await this.prisma.team.findUnique({ where: { id } });
    return row ? toTeam(row) : undefined;
  }

  override async findByIds(ids: readonly string[]): Promise<Team[]> {
    const rows = await this.prisma.team.findMany({ where: { id: { in: [...ids] } } });
    return rows.map(toTeam);
  }

  override async findByOwner(ownerId: string): Promise<Team[]> {
    const rows = await this.prisma.team.findMany({ where: { ownerId } });
    return rows.map(toTeam);
  }

  override async delete(id: string): Promise<void> {
    await this.prisma.team.deleteMany({ where: { id } });
  }
}

function toTeam({ id, name, ownerId }: Team): Team {
  return { id, name, ownerId };
}
