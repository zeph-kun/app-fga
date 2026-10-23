import { randomUUID } from 'node:crypto';
import type { Managers } from './managers.js';

/**
 * Behavior every Managers adapter must have. There is one list of Managers per adapter,
 * so tests use fresh usernames and only `sync` looks at the whole list.
 */
export function managersContract(adapter: string, create: () => Managers | Promise<Managers>): void {
  describe(`Managers (${adapter})`, () => {
    it('lists the Managers it was given', async () => {
      const managers = await create();
      const [alice, bob] = [`alice-${randomUUID()}`, `bob-${randomUUID()}`];
      await managers.add(alice);
      await managers.add(bob);

      expect(await managers.all()).toEqual(expect.arrayContaining([alice, bob]));
    });

    it('adds a Manager, and adding one twice is a no-op', async () => {
      const managers = await create();
      const alice = `alice-${randomUUID()}`;
      await managers.add(alice);

      await expect(managers.add(alice)).resolves.toBeUndefined();
      expect((await managers.all()).filter((name) => name === alice)).toEqual([alice]);
    });

    it('removes a Manager, and removing one twice is a no-op', async () => {
      const managers = await create();
      const alice = `alice-${randomUUID()}`;
      await managers.add(alice);
      await managers.remove(alice);

      expect(await managers.all()).not.toContain(alice);
      await expect(managers.remove(alice)).resolves.toBeUndefined();
    });

    it('syncs the list to exactly the usernames given, and says what changed', async () => {
      const managers = await create();
      const [keep, drop, join] = [`keep-${randomUUID()}`, `drop-${randomUUID()}`, `join-${randomUUID()}`];
      await managers.sync([keep, drop]);

      const changes = await managers.sync([keep, join]);

      expect(changes).toEqual({ added: [join], removed: [drop] });
      expect((await managers.all()).sort()).toEqual([join, keep].sort());
    });

    it('changes nothing when synced to the list it already has', async () => {
      const managers = await create();
      const alice = `alice-${randomUUID()}`;
      await managers.sync([alice]);

      expect(await managers.sync([alice])).toEqual({ added: [], removed: [] });
    });
  });
}
