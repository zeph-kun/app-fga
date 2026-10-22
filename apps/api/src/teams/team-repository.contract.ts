import { randomUUID } from 'node:crypto';
import type { Team } from './team.js';
import type { TeamRepository } from './team-repository.js';

function aTeam(overrides: Partial<Team> = {}): Team {
  return { id: randomUUID(), name: 'Design', ownerId: 'alice', ...overrides };
}

/** Behavior every TeamRepository adapter must have; see document-repository.contract.ts. */
export function teamRepositoryContract(
  adapter: string,
  create: () => TeamRepository | Promise<TeamRepository>,
): void {
  describe(`TeamRepository (${adapter})`, () => {
    it('returns a saved team by id, and nothing for an unknown id', async () => {
      const repository = await create();
      const team = aTeam();
      await repository.save(team);

      expect(await repository.findById(team.id)).toEqual(team);
      expect(await repository.findById(randomUUID())).toBeUndefined();
    });

    it('replaces a team saved again under the same id', async () => {
      const repository = await create();
      const team = aTeam();
      await repository.save(team);
      await repository.save({ ...team, name: 'Engineering' });

      expect(await repository.findById(team.id)).toEqual({ ...team, name: 'Engineering' });
    });

    it('returns only the requested teams that exist', async () => {
      const repository = await create();
      const [first, second, other] = [aTeam(), aTeam(), aTeam()];
      await Promise.all([first, second, other].map((t) => repository.save(t)));

      const found = await repository.findByIds([first.id, second.id, randomUUID()]);

      expect(found.map((t) => t.id).sort()).toEqual([first.id, second.id].sort());
    });

    it('lists the teams owned by a user', async () => {
      const repository = await create();
      const ownerId = randomUUID();
      const mine = aTeam({ ownerId });
      const other = aTeam();
      await Promise.all([mine, other].map((t) => repository.save(t)));

      const found = await repository.findByOwner(ownerId);

      expect(found.map((t) => t.id)).toEqual([mine.id]);
    });

    it('forgets a deleted team, and deleting an unknown one is a no-op', async () => {
      const repository = await create();
      const team = aTeam();
      await repository.save(team);
      await repository.delete(team.id);

      expect(await repository.findById(team.id)).toBeUndefined();
      await expect(repository.delete(team.id)).resolves.toBeUndefined();
    });
  });
}
