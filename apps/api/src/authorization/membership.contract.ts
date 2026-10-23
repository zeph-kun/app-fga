import { randomUUID } from 'node:crypto';
import type { Membership } from './membership.js';

/**
 * Behavior every Membership adapter must have. Each test uses fresh ids, so adapters
 * need no cleanup between tests.
 */
export function membershipContract(adapter: string, create: () => Membership | Promise<Membership>): void {
  describe(`Membership (${adapter})`, () => {
    it('lists the direct members of a team', async () => {
      const membership = await create();
      const team = randomUUID();
      await membership.add(team, 'alice');
      await membership.add(team, 'bob');

      expect(await membership.members(team)).toEqual(expect.arrayContaining(['alice', 'bob']));
      expect(await membership.members(randomUUID())).toEqual([]);
    });

    it('adds a member, and adding one twice is a no-op', async () => {
      const membership = await create();
      const team = randomUUID();
      await membership.add(team, 'alice');

      await expect(membership.add(team, 'alice')).resolves.toBeUndefined();
      expect(await membership.members(team)).toEqual(['alice']);
    });

    it('removes a member, and removing one twice is a no-op', async () => {
      const membership = await create();
      const team = randomUUID();
      await membership.add(team, 'alice');
      await membership.add(team, 'bob');
      await membership.remove(team, 'alice');

      expect(await membership.members(team)).toEqual(['bob']);
      await expect(membership.remove(team, 'alice')).resolves.toBeUndefined();
    });

    it('lists the teams that have at least one member', async () => {
      const membership = await create();
      const [withMembers, emptied] = [randomUUID(), randomUUID()];
      await membership.add(withMembers, 'alice');
      await membership.add(emptied, 'alice');
      await membership.remove(emptied, 'alice');

      const teams = await membership.teamsWithMembers();

      expect(teams).toContain(withMembers);
      expect(teams).not.toContain(emptied);
    });

    it('lists the teams a user is a member of', async () => {
      const membership = await create();
      const [member, bystander] = [randomUUID(), randomUUID()];
      const mine = randomUUID();
      const other = randomUUID();
      await membership.add(mine, member);
      await membership.add(other, bystander);

      expect(await membership.teamsOf(member)).toEqual([mine]);
      expect(await membership.teamsOf(randomUUID())).toEqual([]);
    });
  });
}
