import { documentRef, folderRef, teamSubject, userSubject } from '../authorization/authorizer.js';
import { InMemoryAuthorizer } from '../authorization/in-memory-authorizer.js';
import { InMemoryMembership } from '../authorization/in-memory-membership.js';
import type { Document } from '../documents/document.js';
import { InMemoryDocumentRepository } from '../documents/in-memory-document-repository.js';
import type { Folder } from '../folders/folder.js';
import { InMemoryFolderRepository } from '../folders/in-memory-folder-repository.js';
import { InMemoryTeamRepository } from '../teams/in-memory-team-repository.js';
import type { Team } from '../teams/team.js';
import { Reconciler } from './reconciler.js';
import { ResourceLifecycle } from './resource-lifecycle.js';

const document: Document = { id: 'doc-1', title: 'Plan', content: '', ownerId: 'alice', folderId: null };
const folder: Folder = { id: 'folder-1', name: 'Projects', ownerId: 'alice' };
const team: Team = { id: 'team-1', name: 'Design', ownerId: 'alice' };

function setup() {
  const membership = new InMemoryMembership();
  const authorizer = new InMemoryAuthorizer(membership);
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
    reconciler: new Reconciler(authorizer, documents, folders, teams, membership),
  };
}

describe('Reconciler', () => {
  it('finds nothing wrong in a consistent state', async () => {
    const { lifecycle, reconciler } = setup();
    await lifecycle.createFolder(folder);
    await lifecycle.createDocument({ ...document, folderId: folder.id });
    await lifecycle.createTeam(team);

    expect(await reconciler.reconcile({ apply: true })).toEqual([]);
  });

  describe('a Document or Folder whose Owner grant was never written', () => {
    it('reports it without changing anything when not applying', async () => {
      const { authorizer, documents, folders, reconciler } = setup();
      await documents.save(document);
      await folders.save(folder);

      const findings = await reconciler.reconcile({ apply: false });

      expect(findings).toEqual(
        expect.arrayContaining([
          { kind: 'missing-owner', type: 'document', id: document.id, ownerId: 'alice' },
          { kind: 'missing-owner', type: 'folder', id: folder.id, ownerId: 'alice' },
        ]),
      );
      expect(findings).toHaveLength(2);
      expect(await authorizer.can('alice', 'can_delete', documentRef(document.id))).toBe(false);
    });

    it('gives the Owner back their grant when applying, and then finds nothing', async () => {
      const { authorizer, documents, folders, reconciler } = setup();
      await documents.save(document);
      await folders.save(folder);

      await reconciler.reconcile({ apply: true });

      expect(await authorizer.can('alice', 'can_delete', documentRef(document.id))).toBe(true);
      expect(await authorizer.can('alice', 'can_delete', folderRef(folder.id))).toBe(true);
      expect(await reconciler.reconcile({ apply: false })).toEqual([]);
    });
  });

  describe('a Document whose Folder link differs from its row', () => {
    it('links a Document to the Folder its row says', async () => {
      const { authorizer, documents, lifecycle, reconciler } = setup();
      await lifecycle.createFolder(folder);
      await lifecycle.createDocument(document);
      await documents.save({ ...document, folderId: folder.id });

      expect(await reconciler.reconcile({ apply: false })).toEqual([
        { kind: 'wrong-folder', id: document.id, expected: folder.id, actual: null },
      ]);
      await reconciler.reconcile({ apply: true });

      expect(await authorizer.parentOf(documentRef(document.id))).toBe(folder.id);
    });

    it('takes a Document out of a Folder its row no longer names', async () => {
      const { authorizer, lifecycle, reconciler } = setup();
      await lifecycle.createFolder(folder);
      await lifecycle.createDocument({ ...document, folderId: folder.id });
      await lifecycle.moveDocument({ ...document, folderId: folder.id }, null);
      await authorizer.setParent(documentRef(document.id), folder.id);

      await reconciler.reconcile({ apply: true });

      expect(await authorizer.parentOf(documentRef(document.id))).toBeNull();
    });
  });

  describe('grants left behind by a deleted Document or Folder', () => {
    it('removes them when applying and keeps the grants of existing ones', async () => {
      const { authorizer, documents, folders, lifecycle, reconciler } = setup();
      await lifecycle.createDocument(document);
      await authorizer.grant(userSubject('bob'), 'viewer', documentRef(document.id));
      await lifecycle.createFolder(folder);
      await authorizer.grant(userSubject('bob'), 'editor', documentRef('gone-doc'));
      await authorizer.grant(userSubject('alice'), 'owner', folderRef('gone-folder'));

      expect(await reconciler.reconcile({ apply: false })).toEqual(
        expect.arrayContaining([
          { kind: 'orphan-grants', type: 'document', id: 'gone-doc' },
          { kind: 'orphan-grants', type: 'folder', id: 'gone-folder' },
        ]),
      );
      await reconciler.reconcile({ apply: true });

      expect(await authorizer.grantsOn(documentRef('gone-doc'))).toEqual([]);
      expect(await authorizer.grantsOn(folderRef('gone-folder'))).toEqual([]);
      expect(await authorizer.can('bob', 'can_view', documentRef(document.id))).toBe(true);
      expect(await documents.findById(document.id)).toBeDefined();
      expect(await folders.findById(folder.id)).toBeDefined();
      expect(await reconciler.reconcile({ apply: false })).toEqual([]);
    });
  });

  describe('a Team whose owner was never added as a member', () => {
    it('reports it, and adds the owner back when applying', async () => {
      const { membership, teams, reconciler } = setup();
      await teams.save(team);

      expect(await reconciler.reconcile({ apply: false })).toEqual([
        { kind: 'owner-not-member', id: team.id, ownerId: 'alice' },
      ]);
      expect(await membership.members(team.id)).toEqual([]);
      await reconciler.reconcile({ apply: true });

      expect(await membership.members(team.id)).toEqual(['alice']);
      expect(await reconciler.reconcile({ apply: false })).toEqual([]);
    });
  });

  describe('members left behind by a Team that no longer exists', () => {
    it('removes them when applying and keeps the members of existing Teams', async () => {
      const { membership, lifecycle, reconciler } = setup();
      await lifecycle.createTeam(team);
      await membership.add(team.id, 'bob');
      await membership.add('gone-team', 'bob');
      await membership.add('gone-team', 'carol');

      expect(await reconciler.reconcile({ apply: false })).toEqual([{ kind: 'orphan-members', id: 'gone-team' }]);
      await reconciler.reconcile({ apply: true });

      expect(await membership.members('gone-team')).toEqual([]);
      expect((await membership.members(team.id)).sort()).toEqual(['alice', 'bob']);
      expect(await reconciler.reconcile({ apply: false })).toEqual([]);
    });
  });

  describe('grants left behind by a Team that no longer exists', () => {
    it('removes them when applying and keeps the grants of existing Teams and Users', async () => {
      const { authorizer, lifecycle, reconciler } = setup();
      await lifecycle.createTeam(team);
      await lifecycle.createDocument(document);
      await lifecycle.createFolder(folder);
      await authorizer.grant(teamSubject(team.id), 'editor', documentRef(document.id));
      await authorizer.grant(userSubject('bob'), 'viewer', documentRef(document.id));
      await authorizer.grant(teamSubject('gone-team'), 'viewer', documentRef(document.id));
      await authorizer.grant(teamSubject('gone-team'), 'editor', folderRef(folder.id));

      expect(await reconciler.reconcile({ apply: false })).toEqual([
        { kind: 'orphan-team-grants', id: 'gone-team' },
      ]);
      await reconciler.reconcile({ apply: true });

      expect(await authorizer.grantsOn(folderRef(folder.id))).toEqual([
        { subject: userSubject('alice'), role: 'owner' },
      ]);
      expect(await authorizer.grantsOn(documentRef(document.id))).toHaveLength(3);
      expect(await reconciler.reconcile({ apply: false })).toEqual([]);
    });
  });
});
