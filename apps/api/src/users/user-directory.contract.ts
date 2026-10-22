import type { UserDirectory } from './user-directory.js';

/**
 * Behavior every UserDirectory adapter must have. `knownUser` must be a username the
 * adapter will report as existing (e.g. a seeded one, or a real Keycloak user for the
 * integration spec); `unknownUser` must not exist anywhere the adapter looks.
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
  });
}
