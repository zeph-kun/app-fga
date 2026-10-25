import { documentRef, folderRef, teamSubject, userSubject } from '../authorization/authorizer.js';
import { InMemoryAuthorizer } from '../authorization/in-memory-authorizer.js';
import { InMemoryMembership } from '../authorization/in-memory-membership.js';
import type { Document } from '../documents/document.js';
import { InMemoryDocumentRepository } from '../documents/in-memory-document-repository.js';
import type { Folder } from '../folders/folder.js';
import { InMemoryFolderRepository } from '../folders/in-memory-folder-repository.js';
import { InMemoryTeamRepository } from '../teams/in-memory-team-repository.js';
import type { Team } from '../teams/team.js';
import { ResourceLifecycle } from './resource-lifecycle.js';

const document: Document = { id: 'doc-1', title: 'Plan', content: 'v1', ownerId: 'alice', folderId: null };
const folder: Folder = { id: 'folder-1', name: 'Projects', ownerId: 'alice', parentId: null };
const team: Team = { id: 'team-1', name: 'Design', ownerId: 'alice' };

/** An InMemoryAuthorizer whose named operations fail, as OpenFGA does when it is down. */
function setup(failing: ('grant' | 'setParent' | 'revokeAll' | 'revokeEverywhere' | 'addMember' | 'removeMember')[] = []) {
  class Flaky extends InMemoryAuthorizer {
    override grant(...args: Parameters<InMemoryAuthorizer['grant']>): Promise<void> {
      return failing.includes('grant') ? Promise.reject(new Error('OpenFGA unavailable')) : super.grant(...args);
    }
    override setParent(...args: Parameters<InMemoryAuthorizer['setParent']>): Promise<void> {
      return failing.includes('setParent')
        ? Promise.reject(new Error('OpenFGA unavailable'))
        : super.setParent(...args);
    }
    override revokeAll(...args: Parameters<InMemoryAuthorizer['revokeAll']>): Promise<void> {
      return failing.includes('revokeAll')
        ? Promise.reject(new Error('OpenFGA unavailable'))
        : super.revokeAll(...args);
    }
    override revokeEverywhere(...args: Parameters<InMemoryAuthorizer['revokeEverywhere']>): Promise<void> {
      return failing.includes('revokeEverywhere')
        ? Promise.reject(new Error('OpenFGA unavailable'))
        : super.revokeEverywhere(...args);
    }
  }
  class FlakyMembership extends InMemoryMembership {
    override add(...args: Parameters<InMemoryMembership['add']>): Promise<void> {
      return failing.includes('addMember') ? Promise.reject(new Error('OpenFGA unavailable')) : super.add(...args);
    }
    override remove(...args: Parameters<InMemoryMembership['remove']>): Promise<void> {
      return failing.includes('removeMember')
        ? Promise.reject(new Error('OpenFGA unavailable'))
        : super.remove(...args);
    }
  }
  const membership = new FlakyMembership();
  const authorizer = new Flaky(membership);
  const documents = new InMemoryDocumentRepository();
  const folders = new InMemoryFolderRepository();
  const teams = new InMemoryTeamRepository();
  return {
    authorizer,
    membership,
    documents,
    folders,
    teams,
    lifecycle: new ResourceLifecycle(authorizer, documents, folders, teams, membership),
  };
}

describe('ResourceLifecycle', () => {
  describe('createDocument', () => {
    it('stores the Document and makes its creator the Owner', async () => {
      const { authorizer, documents, lifecycle } = setup();

      await lifecycle.createDocument(document);

      expect(await documents.findById(document.id)).toEqual(document);
      expect(await authorizer.can('alice', 'can_delete', documentRef(document.id))).toBe(true);
    });

    it('puts the Document in its Folder, so it gets the Folder roles', async () => {
      const { authorizer, lifecycle } = setup();
      await authorizer.grant(userSubject('bob'), 'viewer', folderRef(folder.id));

      await lifecycle.createDocument({ ...document, folderId: folder.id });

      expect(await authorizer.can('bob', 'can_view', documentRef(document.id))).toBe(true);
    });

    it('keeps nothing when the Owner grant cannot be written', async () => {
      const { authorizer, documents, lifecycle } = setup(['grant']);

      await expect(lifecycle.createDocument(document)).rejects.toThrow('OpenFGA unavailable');

      expect(await documents.findById(document.id)).toBeUndefined();
      expect(await authorizer.grantsOn(documentRef(document.id))).toEqual([]);
    });

    it('keeps nothing when the Folder link cannot be written, and reports that error', async () => {
      const { documents, lifecycle } = setup(['setParent', 'revokeAll']);

      await expect(lifecycle.createDocument({ ...document, folderId: folder.id })).rejects.toThrow(
        'OpenFGA unavailable',
      );

      expect(await documents.findById(document.id)).toBeUndefined();
    });
  });

  describe('deleteDocument', () => {
    it('removes the Document and every grant on it', async () => {
      const { authorizer, documents, lifecycle } = setup();
      await lifecycle.createDocument(document);
      await authorizer.grant(userSubject('bob'), 'viewer', documentRef(document.id));

      await lifecycle.deleteDocument(document.id);

      expect(await documents.findById(document.id)).toBeUndefined();
      expect(await authorizer.grantsOn(documentRef(document.id))).toEqual([]);
    });

    it('still succeeds when the grants cannot be removed: the Document is gone for everyone', async () => {
      const { documents, lifecycle } = setup(['revokeAll']);
      await lifecycle.createDocument(document);

      await expect(lifecycle.deleteDocument(document.id)).resolves.toBeUndefined();

      expect(await documents.findById(document.id)).toBeUndefined();
    });
  });

  describe('moveDocument', () => {
    it('stores the new Folder and gives the Document its roles', async () => {
      const { authorizer, documents, lifecycle } = setup();
      await lifecycle.createDocument(document);
      await authorizer.grant(userSubject('bob'), 'viewer', folderRef(folder.id));

      const moved = await lifecycle.moveDocument(document, folder.id);

      expect(moved).toEqual({ ...document, folderId: folder.id });
      expect(await documents.findById(document.id)).toEqual(moved);
      expect(await authorizer.can('bob', 'can_view', documentRef(document.id))).toBe(true);
    });

    it('takes the Document out of its Folder with null', async () => {
      const { authorizer, lifecycle } = setup();
      await lifecycle.createDocument({ ...document, folderId: folder.id });
      await authorizer.grant(userSubject('bob'), 'viewer', folderRef(folder.id));

      await lifecycle.moveDocument({ ...document, folderId: folder.id }, null);

      expect(await authorizer.can('bob', 'can_view', documentRef(document.id))).toBe(false);
    });

    it('keeps the Document where it was when the Folder link cannot be written', async () => {
      const { documents, lifecycle } = setup(['setParent']);
      await documents.save(document);

      await expect(lifecycle.moveDocument(document, folder.id)).rejects.toThrow('OpenFGA unavailable');

      expect(await documents.findById(document.id)).toEqual(document);
    });
  });

  describe('createFolder', () => {
    it('stores the Folder and makes its creator the Owner', async () => {
      const { authorizer, folders, lifecycle } = setup();

      await lifecycle.createFolder(folder);

      expect(await folders.findById(folder.id)).toEqual(folder);
      expect(await authorizer.can('alice', 'can_delete', folderRef(folder.id))).toBe(true);
    });

    it('keeps nothing when the Owner grant cannot be written', async () => {
      const { folders, lifecycle } = setup(['grant']);

      await expect(lifecycle.createFolder(folder)).rejects.toThrow('OpenFGA unavailable');

      expect(await folders.findById(folder.id)).toBeUndefined();
    });
  });

  describe('deleteFolder', () => {
    it('removes the Folder and every grant on it', async () => {
      const { authorizer, folders, lifecycle } = setup();
      await lifecycle.createFolder(folder);

      await lifecycle.deleteFolder(folder.id);

      expect(await folders.findById(folder.id)).toBeUndefined();
      expect(await authorizer.grantsOn(folderRef(folder.id))).toEqual([]);
    });

    it('still succeeds when the grants cannot be removed', async () => {
      const { folders, lifecycle } = setup(['revokeAll']);
      await lifecycle.createFolder(folder);

      await expect(lifecycle.deleteFolder(folder.id)).resolves.toBeUndefined();

      expect(await folders.findById(folder.id)).toBeUndefined();
    });
  });

  describe('createTeam', () => {
    it('stores the Team and makes its creator its first member', async () => {
      const { membership, teams, lifecycle } = setup();

      await lifecycle.createTeam(team);

      expect(await teams.findById(team.id)).toEqual(team);
      expect(await membership.members(team.id)).toEqual(['alice']);
    });

    it('keeps nothing when the creator cannot be added', async () => {
      const { teams, lifecycle } = setup(['addMember']);

      await expect(lifecycle.createTeam(team)).rejects.toThrow('OpenFGA unavailable');

      expect(await teams.findById(team.id)).toBeUndefined();
    });
  });

  describe('deleteTeam', () => {
    it('removes the grants given to the Team and leaves the other grants alone', async () => {
      const { authorizer, lifecycle } = setup();
      await lifecycle.createTeam(team);
      await authorizer.grant(teamSubject(team.id), 'editor', documentRef(document.id));
      await authorizer.grant(teamSubject(team.id), 'viewer', folderRef(folder.id));
      await authorizer.grant(userSubject('bob'), 'viewer', documentRef(document.id));

      await lifecycle.deleteTeam(team.id);

      expect(await authorizer.grantsOn(documentRef(document.id))).toEqual([
        { subject: userSubject('bob'), role: 'viewer' },
      ]);
      expect(await authorizer.grantsOn(folderRef(folder.id))).toEqual([]);
    });

    it('keeps the Team, so the delete can be retried, when its grants cannot be removed', async () => {
      const { authorizer, teams, lifecycle } = setup(['revokeEverywhere']);
      await lifecycle.createTeam(team);
      await authorizer.grant(teamSubject(team.id), 'editor', documentRef(document.id));

      await expect(lifecycle.deleteTeam(team.id)).rejects.toThrow('OpenFGA unavailable');

      expect(await teams.findById(team.id)).toEqual(team);
    });

    it('removes every member and then the Team', async () => {
      const { membership, teams, lifecycle } = setup();
      await lifecycle.createTeam(team);
      await membership.add(team.id, 'bob');

      await lifecycle.deleteTeam(team.id);

      expect(await membership.members(team.id)).toEqual([]);
      expect(await teams.findById(team.id)).toBeUndefined();
    });

    it('keeps the Team, so the delete can be retried, when a member cannot be removed', async () => {
      const { teams, lifecycle } = setup(['removeMember']);
      await lifecycle.createTeam(team);

      await expect(lifecycle.deleteTeam(team.id)).rejects.toThrow('OpenFGA unavailable');

      expect(await teams.findById(team.id)).toEqual(team);
    });
  });
});
