import { randomUUID } from 'node:crypto';
import { type Authorizer, documentRef, folderRef, teamSubject, userSubject } from './authorizer.js';

const inThePast = new Date(Date.now() - 60_000);
const inAnHour = new Date(Date.now() + 3_600_000);

/**
 * Behavior every Authorizer adapter must have. Run it against each adapter so the
 * in-memory one used by service tests cannot drift from the OpenFGA model.
 * Each test uses fresh ids, so adapters need no cleanup between tests.
 */
export function authorizerContract(
  adapter: string,
  create: () => Authorizer | Promise<Authorizer>,
): void {
  describe(`Authorizer (${adapter})`, () => {
    it('denies a user with no grant', async () => {
      const authorizer = await create();

      expect(await authorizer.can('alice', 'can_view', documentRef(randomUUID()))).toBe(false);
    });

    it('turns roles into permissions: owner implies editor implies viewer', async () => {
      const authorizer = await create();
      const asOwner = documentRef(randomUUID());
      const asEditor = documentRef(randomUUID());
      const asViewer = documentRef(randomUUID());
      await authorizer.grant(userSubject('alice'), 'owner', asOwner);
      await authorizer.grant(userSubject('alice'), 'editor', asEditor);
      await authorizer.grant(userSubject('alice'), 'viewer', asViewer);

      for (const permission of ['can_view', 'can_edit', 'can_delete', 'can_share'] as const) {
        expect(await authorizer.can('alice', permission, asOwner)).toBe(true);
      }
      expect(await authorizer.can('alice', 'can_view', asEditor)).toBe(true);
      expect(await authorizer.can('alice', 'can_edit', asEditor)).toBe(true);
      expect(await authorizer.can('alice', 'can_delete', asEditor)).toBe(false);
      expect(await authorizer.can('alice', 'can_share', asEditor)).toBe(false);
      expect(await authorizer.can('alice', 'can_view', asViewer)).toBe(true);
      expect(await authorizer.can('alice', 'can_edit', asViewer)).toBe(false);
    });

    it('reports the strongest access a user holds, or null without any', async () => {
      const authorizer = await create();
      const asOwner = documentRef(randomUUID());
      const asEditor = documentRef(randomUUID());
      const asViewer = documentRef(randomUUID());
      await authorizer.grant(userSubject('alice'), 'owner', asOwner);
      await authorizer.grant(userSubject('alice'), 'editor', asEditor);
      await authorizer.grant(userSubject('alice'), 'viewer', asViewer);

      expect(await authorizer.accessOn('alice', asOwner)).toBe('owner');
      expect(await authorizer.accessOn('alice', asEditor)).toBe('editor');
      expect(await authorizer.accessOn('alice', asViewer)).toBe('viewer');
      expect(await authorizer.accessOn('bob', asOwner)).toBeNull();
    });

    it('reports access inherited from a folder, given to a team, and not an expired one', async () => {
      const authorizer = await create();
      const folder = folderRef(randomUUID());
      const doc = documentRef(randomUUID());
      const team = randomUUID();
      await authorizer.grant(userSubject('alice'), 'owner', folder);
      await authorizer.setParent(doc.id, folder.id);
      await authorizer.addTeamMember(team, 'carol');
      await authorizer.grant(teamSubject(team), 'viewer', doc);
      await authorizer.grant(userSubject('bob'), 'editor', doc, inThePast);

      expect(await authorizer.accessOn('alice', doc)).toBe('owner');
      expect(await authorizer.accessOn('carol', doc)).toBe('viewer');
      expect(await authorizer.accessOn('bob', doc)).toBeNull();
    });

    it('maps every resource of a type to the strongest role the user holds on it', async () => {
      const authorizer = await create();
      const folder = folderRef(randomUUID());
      const owned = documentRef(randomUUID());
      const edited = documentRef(randomUUID());
      const viewed = documentRef(randomUUID());
      const inherited = documentRef(randomUUID());
      const expired = documentRef(randomUUID());
      const others = documentRef(randomUUID());
      await authorizer.grant(userSubject('alice'), 'owner', owned);
      await authorizer.grant(userSubject('alice'), 'editor', edited);
      await authorizer.grant(userSubject('alice'), 'viewer', viewed);
      await authorizer.grant(userSubject('alice'), 'editor', folder);
      await authorizer.setParent(inherited.id, folder.id);
      await authorizer.grant(userSubject('alice'), 'viewer', expired, inThePast);
      await authorizer.grant(userSubject('bob'), 'owner', others);

      const roles = await authorizer.rolesOn('alice', 'document');

      expect(roles.get(owned.id)).toBe('owner');
      expect(roles.get(edited.id)).toBe('editor');
      expect(roles.get(viewed.id)).toBe('viewer');
      expect(roles.get(inherited.id)).toBe('editor');
      expect(roles.has(expired.id)).toBe(false);
      expect(roles.has(others.id)).toBe(false);
      expect((await authorizer.rolesOn('alice', 'folder')).get(folder.id)).toBe('editor');
    });

    it('applies the same roles to folders', async () => {
      const authorizer = await create();
      const shared = folderRef(randomUUID());
      await authorizer.grant(userSubject('bob'), 'editor', shared);

      expect(await authorizer.can('bob', 'can_edit', shared)).toBe(true);
      expect(await authorizer.can('bob', 'can_delete', shared)).toBe(false);
      expect(await authorizer.can('bob', 'can_view', folderRef(randomUUID()))).toBe(false);
    });

    it('removes a revoked grant, and revoking a missing one is a no-op', async () => {
      const authorizer = await create();
      const doc = documentRef(randomUUID());
      await authorizer.grant(userSubject('bob'), 'editor', doc);
      await authorizer.revoke(userSubject('bob'), 'editor', doc);

      expect(await authorizer.can('bob', 'can_view', doc)).toBe(false);
      await expect(authorizer.revoke(userSubject('bob'), 'editor', doc)).resolves.toBeUndefined();
    });

    it('lists the resources of a type a user holds a permission on', async () => {
      const authorizer = await create();
      const mine = randomUUID();
      const shared = randomUUID();
      const other = randomUUID();
      const aFolder = randomUUID();
      await authorizer.grant(userSubject('alice'), 'owner', documentRef(mine));
      await authorizer.grant(userSubject('alice'), 'viewer', documentRef(shared));
      await authorizer.grant(userSubject('bob'), 'owner', documentRef(other));
      await authorizer.grant(userSubject('alice'), 'viewer', folderRef(aFolder));

      const documents = await authorizer.resourcesWhere('alice', 'can_view', 'document');
      const folders = await authorizer.resourcesWhere('alice', 'can_view', 'folder');

      expect(documents).toEqual(expect.arrayContaining([mine, shared]));
      expect(documents).not.toContain(other);
      expect(documents).not.toContain(aFolder);
      expect(folders).toContain(aFolder);
      expect(await authorizer.resourcesWhere('alice', 'can_edit', 'document')).toEqual(
        expect.arrayContaining([mine]),
      );
      expect(await authorizer.resourcesWhere('alice', 'can_edit', 'document')).not.toContain(shared);
    });

    it('lists the direct grants on a resource', async () => {
      const authorizer = await create();
      const doc = documentRef(randomUUID());
      await authorizer.grant(userSubject('alice'), 'owner', doc);
      await authorizer.grant(userSubject('bob'), 'viewer', doc);
      await authorizer.grant(userSubject('carol'), 'editor', documentRef(randomUUID()));

      const grants = await authorizer.grantsOn(doc);

      expect(grants).toHaveLength(2);
      expect(grants).toEqual(
        expect.arrayContaining([
          { subject: userSubject('alice'), role: 'owner' },
          { subject: userSubject('bob'), role: 'viewer' },
        ]),
      );
    });

    it('revokes every grant on a resource and leaves others alone', async () => {
      const authorizer = await create();
      const doc = documentRef(randomUUID());
      const kept = documentRef(randomUUID());
      await authorizer.grant(userSubject('alice'), 'owner', doc);
      await authorizer.grant(userSubject('bob'), 'viewer', doc);
      await authorizer.grant(userSubject('bob'), 'viewer', kept);

      await authorizer.revokeAll(doc);

      expect(await authorizer.grantsOn(doc)).toEqual([]);
      expect(await authorizer.can('bob', 'can_view', kept)).toBe(true);
      await expect(authorizer.revokeAll(documentRef(randomUUID()))).resolves.toBeUndefined();
    });

    describe('documents in a folder', () => {
      async function setup() {
        const authorizer = await create();
        const aFolder = folderRef(randomUUID());
        const doc = documentRef(randomUUID());
        await authorizer.setParent(doc.id, aFolder.id);
        return { authorizer, aFolder, doc };
      }

      it('inherits the roles given on the folder', async () => {
        const { authorizer, aFolder, doc } = await setup();
        await authorizer.grant(userSubject('viewer-user'), 'viewer', aFolder);
        await authorizer.grant(userSubject('editor-user'), 'editor', aFolder);
        await authorizer.grant(userSubject('owner-user'), 'owner', aFolder);

        expect(await authorizer.can('viewer-user', 'can_view', doc)).toBe(true);
        expect(await authorizer.can('viewer-user', 'can_edit', doc)).toBe(false);
        expect(await authorizer.can('editor-user', 'can_edit', doc)).toBe(true);
        expect(await authorizer.can('editor-user', 'can_delete', doc)).toBe(false);
        expect(await authorizer.can('owner-user', 'can_delete', doc)).toBe(true);
        expect(await authorizer.can('owner-user', 'can_share', doc)).toBe(true);
      });

      it('includes inherited documents when listing, and does not leak to other documents', async () => {
        const { authorizer, aFolder, doc } = await setup();
        const outside = documentRef(randomUUID());
        await authorizer.grant(userSubject('bob'), 'viewer', aFolder);

        const ids = await authorizer.resourcesWhere('bob', 'can_view', 'document');

        expect(ids).toContain(doc.id);
        expect(ids).not.toContain(outside.id);
        expect(await authorizer.can('bob', 'can_view', outside)).toBe(false);
      });

      it('keeps the direct grants of the document next to the inherited ones', async () => {
        const { authorizer, aFolder, doc } = await setup();
        await authorizer.grant(userSubject('bob'), 'viewer', aFolder);
        await authorizer.grant(userSubject('bob'), 'editor', doc);

        expect(await authorizer.can('bob', 'can_edit', doc)).toBe(true);
        expect(await authorizer.grantsOn(doc)).toEqual([{ subject: userSubject('bob'), role: 'editor' }]);
      });

      it('stops inheriting when the document leaves the folder', async () => {
        const { authorizer, aFolder, doc } = await setup();
        await authorizer.grant(userSubject('bob'), 'viewer', aFolder);
        await authorizer.setParent(doc.id, null);

        expect(await authorizer.can('bob', 'can_view', doc)).toBe(false);
      });

      it('inherits from the new folder only when the document is moved', async () => {
        const { authorizer, aFolder, doc } = await setup();
        const other = folderRef(randomUUID());
        await authorizer.grant(userSubject('old-viewer'), 'viewer', aFolder);
        await authorizer.grant(userSubject('new-viewer'), 'viewer', other);
        await authorizer.setParent(doc.id, other.id);

        expect(await authorizer.can('old-viewer', 'can_view', doc)).toBe(false);
        expect(await authorizer.can('new-viewer', 'can_view', doc)).toBe(true);
      });

      it('forgets the folder link when every grant on the document is revoked', async () => {
        const { authorizer, aFolder, doc } = await setup();
        await authorizer.grant(userSubject('bob'), 'viewer', aFolder);
        await authorizer.revokeAll(doc);

        expect(await authorizer.can('bob', 'can_view', doc)).toBe(false);
      });

      it('takes a document out of a folder it was never in without failing', async () => {
        const authorizer = await create();

        await expect(authorizer.setParent(randomUUID(), null)).resolves.toBeUndefined();
      });
    });

    describe('teams', () => {
      it('gives every member of a team the role shared with the team', async () => {
        const authorizer = await create();
        const teamId = randomUUID();
        const doc = documentRef(randomUUID());
        await authorizer.addTeamMember(teamId, 'alice');
        await authorizer.addTeamMember(teamId, 'bob');
        await authorizer.grant(teamSubject(teamId), 'editor', doc);

        expect(await authorizer.can('alice', 'can_edit', doc)).toBe(true);
        expect(await authorizer.can('bob', 'can_edit', doc)).toBe(true);
        expect(await authorizer.can('carol', 'can_edit', doc)).toBe(false);
      });

      it('lists the direct members of a team', async () => {
        const authorizer = await create();
        const teamId = randomUUID();
        await authorizer.addTeamMember(teamId, 'alice');
        await authorizer.addTeamMember(teamId, 'bob');

        expect(await authorizer.teamMembers(teamId)).toEqual(expect.arrayContaining(['alice', 'bob']));
      });

      it('removes a team member, and removing one twice is a no-op', async () => {
        const authorizer = await create();
        const teamId = randomUUID();
        const doc = documentRef(randomUUID());
        await authorizer.addTeamMember(teamId, 'alice');
        await authorizer.grant(teamSubject(teamId), 'viewer', doc);
        await authorizer.removeTeamMember(teamId, 'alice');

        expect(await authorizer.can('alice', 'can_view', doc)).toBe(false);
        await expect(authorizer.removeTeamMember(teamId, 'alice')).resolves.toBeUndefined();
      });

      it('lists the teams a user is a member of', async () => {
        const authorizer = await create();
        const [member, bystander] = [randomUUID(), randomUUID()];
        const mine = randomUUID();
        const other = randomUUID();
        await authorizer.addTeamMember(mine, member);
        await authorizer.addTeamMember(other, bystander);

        expect(await authorizer.teamsOf(member)).toEqual([mine]);
        expect(await authorizer.teamsOf(randomUUID())).toEqual([]);
      });

      it('inherits a team grant on a folder into its documents', async () => {
        const authorizer = await create();
        const teamId = randomUUID();
        const aFolder = folderRef(randomUUID());
        const doc = documentRef(randomUUID());
        await authorizer.setParent(doc.id, aFolder.id);
        await authorizer.addTeamMember(teamId, 'alice');
        await authorizer.grant(teamSubject(teamId), 'viewer', aFolder);

        expect(await authorizer.can('alice', 'can_view', doc)).toBe(true);
      });
    });

    describe('expiring grants', () => {
      it('allows access before the expiry and denies it after', async () => {
        const authorizer = await create();
        const stillValid = documentRef(randomUUID());
        const alreadyExpired = documentRef(randomUUID());
        await authorizer.grant(userSubject('alice'), 'viewer', stillValid, inAnHour);
        await authorizer.grant(userSubject('alice'), 'viewer', alreadyExpired, inThePast);

        expect(await authorizer.can('alice', 'can_view', stillValid)).toBe(true);
        expect(await authorizer.can('alice', 'can_view', alreadyExpired)).toBe(false);
      });

      it('leaves an expired resource out of the list a user can access', async () => {
        const authorizer = await create();
        const expired = documentRef(randomUUID());
        await authorizer.grant(userSubject('alice'), 'viewer', expired, inThePast);

        expect(await authorizer.resourcesWhere('alice', 'can_view', 'document')).not.toContain(expired.id);
      });

      it('expires a grant given to a team the same way', async () => {
        const authorizer = await create();
        const teamId = randomUUID();
        const doc = documentRef(randomUUID());
        await authorizer.addTeamMember(teamId, 'alice');
        await authorizer.grant(teamSubject(teamId), 'viewer', doc, inThePast);

        expect(await authorizer.can('alice', 'can_view', doc)).toBe(false);
      });

      it('reports the expiry on grantsOn', async () => {
        const authorizer = await create();
        const doc = documentRef(randomUUID());
        await authorizer.grant(userSubject('alice'), 'viewer', doc, inAnHour);

        const [grant] = await authorizer.grantsOn(doc);
        expect(grant?.expiresAt?.getTime()).toBe(inAnHour.getTime());
      });
    });

    describe('usersWithAccess', () => {
      it('resolves direct grants, team membership, and folder inheritance into a flat list', async () => {
        const authorizer = await create();
        const teamId = randomUUID();
        const aFolder = folderRef(randomUUID());
        const doc = documentRef(randomUUID());
        await authorizer.setParent(doc.id, aFolder.id);
        await authorizer.addTeamMember(teamId, 'carol');
        await authorizer.grant(userSubject('alice'), 'owner', doc);
        await authorizer.grant(userSubject('bob'), 'viewer', aFolder);
        await authorizer.grant(teamSubject(teamId), 'viewer', doc);

        const users = await authorizer.usersWithAccess(doc, 'can_view');

        expect(users).toEqual(expect.arrayContaining(['alice', 'bob', 'carol']));
      });

      it('excludes a user whose only grant has expired', async () => {
        const authorizer = await create();
        const doc = documentRef(randomUUID());
        await authorizer.grant(userSubject('alice'), 'owner', doc);
        await authorizer.grant(userSubject('bob'), 'viewer', doc, inThePast);

        expect(await authorizer.usersWithAccess(doc, 'can_view')).toEqual(['alice']);
      });
    });
  });
}
