import type { UserDirectory } from './user-directory.js';

/**
 * Behavior every UserDirectory adapter must have. `knownUser` must be a username the
 * adapter will report as existing (e.g. a seeded one, or a real Keycloak user for the
 * integration spec) and at least two characters long; `unknownUser` must not exist
 * anywhere the adapter looks.
 */
export function userDirectoryContract(
  adapter: string,
  create: () => UserDirectory | Promise<UserDirectory>,
  knownUser: string,
  unknownUser: string,
): void {
  describe(`UserDirectory (${adapter})`, () => {
    it('reports a known user as existing', async () => {
      const directory = await create();

      expect(await directory.exists(knownUser)).toBe(true);
    });

    it('reports an unknown user as not existing', async () => {
      const directory = await create();

      expect(await directory.exists(unknownUser)).toBe(false);
    });

    it('finds a user by the start of their username, whatever the case', async () => {
      const directory = await create();

      expect(await directory.search(knownUser.slice(0, 2).toUpperCase(), 10)).toContain(knownUser);
    });

    it('finds nobody when no username starts with the text', async () => {
      const directory = await create();

      expect(await directory.search(unknownUser, 10)).toEqual([]);
    });

    it('returns at most the requested number of usernames, in alphabetical order', async () => {
      const directory = await create();

      const found = await directory.search('', 2);

      expect(found.length).toBeLessThanOrEqual(2);
      expect(found).toEqual([...found].sort());
    });
  });
}
