import { ActivityLog } from '../activity-log/activity-log.js';
import { InMemoryActivityLogRepository } from '../activity-log/in-memory-activity-log-repository.js';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { type Authorizer, documentRef, teamSubject, userSubject } from '../authorization/authorizer.js';
import { InMemoryAuthorizer } from '../authorization/in-memory-authorizer.js';
import { InMemoryManagers } from '../authorization/in-memory-managers.js';
import { InMemoryMembership } from '../authorization/in-memory-membership.js';
import type { FolderRepository } from '../folders/folder-repository.js';
import { InMemoryFolderRepository } from '../folders/in-memory-folder-repository.js';
import { FoldersService } from '../folders/folders.service.js';
import { InMemoryTeamRepository } from '../teams/in-memory-team-repository.js';
import { ResourceLifecycle } from '../lifecycle/resource-lifecycle.js';
import { Sharing } from '../sharing/sharing.js';
import { TeamsService } from '../teams/teams.service.js';
import { InMemoryUserDirectory } from '../users/in-memory-user-directory.js';
import type { Document } from './document.js';
import type { DocumentRepository } from './document-repository.js';
import { DocumentsService } from './documents.service.js';
import { InMemoryDocumentRepository } from './in-memory-document-repository.js';

// These two never create or delete a Team, so their lifecycle gets Team storage of its own.
const lifecycleFor = (authorizer: Authorizer, documents: DocumentRepository, folders: FolderRepository) =>
  new ResourceLifecycle(authorizer, documents, folders, new InMemoryTeamRepository(), new InMemoryMembership());

const activityFor = (authorizer: Authorizer) => new ActivityLog(authorizer, new InMemoryActivityLogRepository());

const documentsService = (
  authorizer: Authorizer,
  documents: DocumentRepository,
  folders: FolderRepository,
  sharing: Sharing,
  activity = activityFor(authorizer),
) => new DocumentsService(authorizer, documents, folders, sharing, lifecycleFor(authorizer, documents, folders), activity);

const foldersService = (
  authorizer: Authorizer,
  folders: FolderRepository,
  documents: DocumentRepository,
  sharing: Sharing,
  activity = activityFor(authorizer),
) => new FoldersService(authorizer, folders, documents, sharing, lifecycleFor(authorizer, documents, folders), activity);

/** Documents, Folders and Teams wired to the same storage and Authorizer, as in the app. */
function setupWithFolders() {
  const membership = new InMemoryMembership();
  const authorizer = new InMemoryAuthorizer(membership, new InMemoryManagers(['alice']));
  const documents = new InMemoryDocumentRepository();
  const folders = new InMemoryFolderRepository();
  const users = new InMemoryUserDirectory(['alice', 'bob', 'carol']);
  const teams = new InMemoryTeamRepository();
  const activity = activityFor(authorizer);
  return {
    authorizer,
    activity,
    documents: documentsService(authorizer, documents, folders, new Sharing(authorizer, users, teams), activity),
    folders: foldersService(authorizer, folders, documents, new Sharing(authorizer, users, teams), activity),
    teams: new TeamsService(
      authorizer,
      membership,
      teams,
      users,
      new ResourceLifecycle(authorizer, documents, folders, teams, membership),
    ),
  };
}

function setup() {
  const authorizer = new InMemoryAuthorizer(new InMemoryMembership());
  return documentsService(
    authorizer,
    new InMemoryDocumentRepository(),
    new InMemoryFolderRepository(),
    new Sharing(authorizer, new InMemoryUserDirectory(['alice', 'bob', 'carol']), new InMemoryTeamRepository()),
  );
}

describe('DocumentsService', () => {
  it('lets the creator read and list their document', async () => {
    const service = setup();
    const doc = await service.create('alice', { title: 'Plan', content: 'v1' });

    expect(await service.get('alice', doc.id)).toMatchObject({ title: 'Plan', ownerId: 'alice', access: 'owner' });
    expect((await service.list('alice')).map((d) => d.id)).toEqual([doc.id]);
  });

  it('hides a document from users with no access, as if it did not exist', async () => {
    const service = setup();
    const doc = await service.create('alice', { title: 'Plan', content: '' });

    await expect(service.get('bob', doc.id)).rejects.toBeInstanceOf(NotFoundException);
    expect(await service.list('bob')).toEqual([]);
  });

  it('gives a viewer read access but not write access', async () => {
    const service = setup();
    const doc = await service.create('alice', { title: 'Plan', content: '' });
    await service.share('alice', doc.id, { subject: userSubject('bob'), role: 'viewer' });

    expect(await service.get('bob', doc.id)).toMatchObject({ id: doc.id, access: 'viewer' });
    await expect(service.update('bob', doc.id, { content: 'x' })).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('lets an editor update but not delete or share', async () => {
    const service = setup();
    const doc = await service.create('alice', { title: 'Plan', content: '' });
    await service.share('alice', doc.id, { subject: userSubject('bob'), role: 'editor' });

    expect(await service.update('bob', doc.id, { content: 'edited' })).toMatchObject({
      content: 'edited',
    });
    await expect(service.remove('bob', doc.id)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.share('bob', doc.id, { subject: userSubject('carol'), role: 'viewer' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('removes access once a share is revoked', async () => {
    const service = setup();
    const doc = await service.create('alice', { title: 'Plan', content: '' });
    await service.share('alice', doc.id, { subject: userSubject('bob'), role: 'editor' });
    await service.unshare('alice', doc.id, userSubject('bob'));

    await expect(service.get('bob', doc.id)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('deletes a document for its owner', async () => {
    const service = setup();
    const doc = await service.create('alice', { title: 'Plan', content: '' });
    await service.remove('alice', doc.id);

    await expect(service.get('alice', doc.id)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('keeps documents when the service restarts on the same storage', async () => {
    const authorizer = new InMemoryAuthorizer(new InMemoryMembership());
    const repository = new InMemoryDocumentRepository();
    const teams = new InMemoryTeamRepository();
    const users = new InMemoryUserDirectory();
    const doc = await documentsService(
      authorizer,
      repository,
      new InMemoryFolderRepository(),
      new Sharing(authorizer, users, teams),
    ).create('alice', { title: 'Plan', content: 'v1' });

    const restarted = documentsService(
      authorizer,
      repository,
      new InMemoryFolderRepository(),
      new Sharing(authorizer, users, teams),
    );

    expect(await restarted.get('alice', doc.id)).toMatchObject({ title: 'Plan', content: 'v1' });
    expect((await restarted.list('alice')).map((d) => d.id)).toEqual([doc.id]);
  });

  it('removes every grant on a document when it is deleted', async () => {
    const authorizer = new InMemoryAuthorizer(new InMemoryMembership());
    const service = documentsService(
      authorizer,
      new InMemoryDocumentRepository(),
      new InMemoryFolderRepository(),
      new Sharing(authorizer, new InMemoryUserDirectory(['bob']), new InMemoryTeamRepository()),
    );
    const doc = await service.create('alice', { title: 'Plan', content: '' });
    await service.share('alice', doc.id, { subject: userSubject('bob'), role: 'editor' });
    await service.remove('alice', doc.id);

    expect(await authorizer.grantsOn(documentRef(doc.id))).toEqual([]);
  });

  it('lets the owner list who a document is shared with, without listing the owner', async () => {
    const service = setup();
    const doc = await service.create('alice', { title: 'Plan', content: '' });
    await service.share('alice', doc.id, { subject: userSubject('bob'), role: 'editor' });
    await service.share('alice', doc.id, { subject: userSubject('carol'), role: 'viewer' });
    await service.share('alice', doc.id, { subject: userSubject('bob'), role: 'viewer' });

    const shares = await service.shares('alice', doc.id);

    expect(shares).toHaveLength(2);
    expect(shares).toEqual(
      expect.arrayContaining([
        { subject: userSubject('bob'), name: 'bob', role: 'viewer' },
        { subject: userSubject('carol'), name: 'carol', role: 'viewer' },
      ]),
    );
  });

  it('keeps the list of shares from anyone but the owner', async () => {
    const service = setup();
    const doc = await service.create('alice', { title: 'Plan', content: '' });
    await service.share('alice', doc.id, { subject: userSubject('bob'), role: 'editor' });

    await expect(service.shares('bob', doc.id)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.shares('mallory', doc.id)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('leaves no document behind when the Owner grant cannot be written', async () => {
    class UnavailableAuthorizer extends InMemoryAuthorizer {
      override grant(): Promise<void> {
        return Promise.reject(new Error('OpenFGA unavailable'));
      }
    }
    const saved: string[] = [];
    class RecordingRepository extends InMemoryDocumentRepository {
      override async save(document: Document): Promise<void> {
        saved.push(document.id);
        await super.save(document);
      }
    }
    const repository = new RecordingRepository();
    const authorizer = new UnavailableAuthorizer(new InMemoryMembership());
    const service = documentsService(
      authorizer,
      repository,
      new InMemoryFolderRepository(),
      new Sharing(authorizer, new InMemoryUserDirectory(), new InMemoryTeamRepository()),
    );

    await expect(service.create('alice', { title: 'Plan', content: '' })).rejects.toThrow(
      'OpenFGA unavailable',
    );

    expect(saved).toHaveLength(1);
    expect(await repository.findByIds(saved)).toEqual([]);
  });

  describe('in a folder', () => {
    it('creates a document in a folder, which the folder viewers can then read', async () => {
      const { documents, folders } = setupWithFolders();
      const folder = await folders.create('alice', { name: 'Projects' });
      await folders.share('alice', folder.id, { subject: userSubject('bob'), role: 'viewer' });

      const doc = await documents.create('alice', { title: 'Plan', content: '', folderId: folder.id });

      expect(doc.folderId).toBe(folder.id);
      expect(await documents.get('bob', doc.id)).toMatchObject({ access: 'viewer' });
      expect((await folders.get('bob', folder.id)).documents.map((d) => d.id)).toEqual([doc.id]);
    });

    it('lets a folder editor create documents, but not a folder viewer', async () => {
      const { documents, folders } = setupWithFolders();
      const folder = await folders.create('alice', { name: 'Projects' });
      await folders.share('alice', folder.id, { subject: userSubject('bob'), role: 'editor' });
      await folders.share('alice', folder.id, { subject: userSubject('carol'), role: 'viewer' });

      await expect(
        documents.create('bob', { title: 'Mine', content: '', folderId: folder.id }),
      ).resolves.toMatchObject({ ownerId: 'bob', folderId: folder.id });
      await expect(
        documents.create('carol', { title: 'Nope', content: '', folderId: folder.id }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      await expect(
        documents.create('mallory', { title: 'Nope', content: '', folderId: folder.id }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('lets the folder owner act as owner of its documents', async () => {
      const { documents, folders } = setupWithFolders();
      const folder = await folders.create('alice', { name: 'Projects' });
      await folders.share('alice', folder.id, { subject: userSubject('bob'), role: 'editor' });
      const doc = await documents.create('bob', { title: 'Plan', content: '', folderId: folder.id });

      expect(await documents.get('alice', doc.id)).toMatchObject({ access: 'owner' });
      await expect(documents.remove('alice', doc.id)).resolves.toBeUndefined();
    });
  });

  describe('moving', () => {
    it('gives the access of the new folder, and takes it away on leaving', async () => {
      const { documents, folders } = setupWithFolders();
      const folder = await folders.create('alice', { name: 'Projects' });
      await folders.share('alice', folder.id, { subject: userSubject('bob'), role: 'viewer' });
      const doc = await documents.create('alice', { title: 'Plan', content: '' });
      await expect(documents.get('bob', doc.id)).rejects.toBeInstanceOf(NotFoundException);

      expect(await documents.move('alice', doc.id, folder.id)).toMatchObject({ folderId: folder.id });
      expect(await documents.get('bob', doc.id)).toMatchObject({ access: 'viewer', folderId: folder.id });

      await documents.move('alice', doc.id, null);
      await expect(documents.get('bob', doc.id)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('is reserved to the owner of the document, who must be able to edit the target folder', async () => {
      const { documents, folders } = setupWithFolders();
      const mine = await folders.create('alice', { name: 'Mine' });
      const readOnly = await folders.create('bob', { name: 'Read only' });
      await folders.share('bob', readOnly.id, { subject: userSubject('alice'), role: 'viewer' });
      const hidden = await folders.create('bob', { name: 'Hidden' });
      const doc = await documents.create('alice', { title: 'Plan', content: '' });
      await documents.share('alice', doc.id, { subject: userSubject('bob'), role: 'editor' });

      await expect(documents.move('bob', doc.id, mine.id)).rejects.toBeInstanceOf(ForbiddenException);
      await expect(documents.move('alice', doc.id, readOnly.id)).rejects.toBeInstanceOf(ForbiddenException);
      await expect(documents.move('alice', doc.id, hidden.id)).rejects.toBeInstanceOf(NotFoundException);
      expect(await documents.get('alice', doc.id)).toMatchObject({ folderId: null });
    });

    it('keeps the document where it was when the folder link cannot be written', async () => {
      class UnavailableAuthorizer extends InMemoryAuthorizer {
        override setParent(): Promise<void> {
          return Promise.reject(new Error('OpenFGA unavailable'));
        }
      }
      const authorizer = new UnavailableAuthorizer(new InMemoryMembership());
      const documentRepository = new InMemoryDocumentRepository();
      const folderRepository = new InMemoryFolderRepository();
      const users = new InMemoryUserDirectory();
      const teams = new InMemoryTeamRepository();
      const documents = documentsService(authorizer, documentRepository, folderRepository, new Sharing(authorizer, users, teams));
      const folders = foldersService(authorizer, folderRepository, documentRepository, new Sharing(authorizer, users, teams));
      const folder = await folders.create('alice', { name: 'Projects' });
      const doc = await documents.create('alice', { title: 'Plan', content: '' });

      await expect(documents.move('alice', doc.id, folder.id)).rejects.toThrow('OpenFGA unavailable');

      expect(await documents.get('alice', doc.id)).toMatchObject({ folderId: null });
    });
  });

  it("lists each document with the requester's role on it", async () => {
    const service = setup();
    const mine = await service.create('alice', { title: 'Mine', content: '' });
    const editable = await service.create('bob', { title: 'Editable', content: '' });
    const readOnly = await service.create('bob', { title: 'Read only', content: '' });
    await service.share('bob', editable.id, { subject: userSubject('alice'), role: 'editor' });
    await service.share('bob', readOnly.id, { subject: userSubject('alice'), role: 'viewer' });

    const listed = await service.list('alice');
    const accessOf = (id: string) => listed.find((d) => d.id === id)?.access;

    expect(listed).toHaveLength(3);
    expect(accessOf(mine.id)).toBe('owner');
    expect(accessOf(editable.id)).toBe('editor');
    expect(accessOf(readOnly.id)).toBe('viewer');
  });

  it('refuses to share a document with its own owner', async () => {
    const service = setup();
    const doc = await service.create('alice', { title: 'Plan', content: '' });

    await expect(
      service.share('alice', doc.id, { subject: userSubject('alice'), role: 'viewer' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('refuses to share a document with an unknown username', async () => {
    const service = setup();
    const doc = await service.create('alice', { title: 'Plan', content: '' });

    await expect(
      service.share('alice', doc.id, { subject: userSubject('mallory'), role: 'viewer' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  describe('sharing with a team', () => {
    it('gives every team member access, and lists the team (not its members) as the share', async () => {
      const { documents, teams } = setupWithFolders();
      const team = await teams.create('alice', { name: 'Reviewers' });
      await teams.addMember('alice', team.id, 'bob');
      const doc = await documents.create('alice', { title: 'Plan', content: '' });

      await documents.share('alice', doc.id, { subject: teamSubject(team.id), role: 'viewer' });

      expect(await documents.get('bob', doc.id)).toMatchObject({ access: 'viewer' });
      expect(await documents.shares('alice', doc.id)).toEqual([
        { subject: teamSubject(team.id), name: 'Reviewers', role: 'viewer' },
      ]);
    });

    it('refuses to share with a team that does not exist', async () => {
      const { documents } = setupWithFolders();
      const doc = await documents.create('alice', { title: 'Plan', content: '' });

      await expect(
        documents.share('alice', doc.id, { subject: teamSubject('00000000-0000-0000-0000-000000000000'), role: 'viewer' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('takes access away once the team share is revoked', async () => {
      const { documents, teams } = setupWithFolders();
      const team = await teams.create('alice', { name: 'Reviewers' });
      await teams.addMember('alice', team.id, 'bob');
      const doc = await documents.create('alice', { title: 'Plan', content: '' });
      await documents.share('alice', doc.id, { subject: teamSubject(team.id), role: 'viewer' });

      await documents.unshare('alice', doc.id, teamSubject(team.id));

      await expect(documents.get('bob', doc.id)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('time-bound sharing', () => {
    it('grants access that is still valid right after sharing', async () => {
      const service = setup();
      const doc = await service.create('alice', { title: 'Plan', content: '' });

      await service.share('alice', doc.id, { subject: userSubject('bob'), role: 'viewer', expiresInHours: 24 });

      expect(await service.get('bob', doc.id)).toMatchObject({ access: 'viewer' });
    });

    it('denies access once the share has expired', async () => {
      const service = setup();
      const doc = await service.create('alice', { title: 'Plan', content: '' });

      await service.share('alice', doc.id, { subject: userSubject('bob'), role: 'viewer', expiresInHours: -1 });

      await expect(service.get('bob', doc.id)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('reports when a share expires', async () => {
      const service = setup();
      const doc = await service.create('alice', { title: 'Plan', content: '' });
      await service.share('alice', doc.id, { subject: userSubject('bob'), role: 'viewer', expiresInHours: 24 });

      const [share] = await service.shares('alice', doc.id);

      expect(share?.expiresAt).toBeInstanceOf(Date);
    });
  });

  describe('accessList', () => {
    it("resolves teams and folder inheritance into a flat list of who can view", async () => {
      const { documents, folders, teams } = setupWithFolders();
      const team = await teams.create('alice', { name: 'Reviewers' });
      await teams.addMember('alice', team.id, 'carol');
      const folder = await folders.create('alice', { name: 'Projects' });
      await folders.share('alice', folder.id, { subject: userSubject('bob'), role: 'viewer' });
      const doc = await documents.create('alice', { title: 'Plan', content: '', folderId: folder.id });
      await documents.share('alice', doc.id, { subject: teamSubject(team.id), role: 'viewer' });

      const access = await documents.accessList('alice', doc.id);

      expect(access).toEqual(expect.arrayContaining(['alice', 'bob', 'carol']));
    });

    it('is reserved to someone who can share the document', async () => {
      const { documents } = setupWithFolders();
      const doc = await documents.create('alice', { title: 'Plan', content: '' });

      await expect(documents.accessList('bob', doc.id)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('recording in the Activity log', () => {
    it('notes who shared the document with whom, for how long, and who was removed', async () => {
      const { documents, activity } = setupWithFolders();
      const doc = await documents.create('alice', { title: 'Plan', content: '' });
      const resource = { type: 'document', id: doc.id } as const;

      await documents.share('alice', doc.id, { subject: userSubject('bob'), role: 'editor', expiresInHours: 2 });
      await documents.unshare('alice', doc.id, userSubject('bob'));

      const { entries } = await activity.forResource('alice', resource);
      expect(entries.map((e) => [e.actorId, e.event.kind])).toEqual([
        ['alice', 'unshared'],
        ['alice', 'shared'],
      ]);
      expect(entries[0]?.event).toEqual({ kind: 'unshared', subject: { type: 'user', id: 'bob', name: 'bob' } });
      expect(entries[1]?.event).toMatchObject({
        kind: 'shared',
        subject: { type: 'user', id: 'bob', name: 'bob' },
        role: 'editor',
        expiresAt: expect.any(Date),
      });
    });

    it('keeps the name a Team had when it was shared with, even once renamed', async () => {
      const { documents, teams, activity } = setupWithFolders();
      const team = await teams.create('alice', { name: 'Reviewers' });
      const doc = await documents.create('alice', { title: 'Plan', content: '' });
      await documents.share('alice', doc.id, { subject: teamSubject(team.id), role: 'viewer' });

      await teams.rename('alice', team.id, { name: 'Editors' });

      const { entries } = await activity.forResource('alice', { type: 'document', id: doc.id });
      expect(entries[0]?.event).toMatchObject({ subject: { type: 'team', id: team.id, name: 'Reviewers' } });
    });

    it('notes a Move with the names of the Folders it leaves and enters', async () => {
      const { documents, folders, activity } = setupWithFolders();
      const folder = await folders.create('alice', { name: 'Projects' });
      const doc = await documents.create('alice', { title: 'Plan', content: '' });

      await documents.move('alice', doc.id, folder.id);
      await documents.move('alice', doc.id, null);

      const { entries } = await activity.forResource('alice', { type: 'document', id: doc.id });
      expect(entries.map((e) => e.event)).toEqual([
        { kind: 'moved', from: { id: folder.id, name: 'Projects' }, to: null },
        { kind: 'moved', from: null, to: { id: folder.id, name: 'Projects' } },
      ]);
    });

    it('notes nothing for a change that was refused', async () => {
      const { documents, activity } = setupWithFolders();
      const doc = await documents.create('alice', { title: 'Plan', content: '' });
      await documents.share('alice', doc.id, { subject: userSubject('bob'), role: 'viewer' });
      const resource = { type: 'document', id: doc.id } as const;
      const before = (await activity.forResource('alice', resource)).entries.length;

      await expect(documents.share('bob', doc.id, { subject: userSubject('carol'), role: 'viewer' })).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      await expect(documents.share('alice', doc.id, { subject: userSubject('alice'), role: 'viewer' })).rejects.toBeInstanceOf(
        ForbiddenException,
      );

      expect((await activity.forResource('alice', resource)).entries).toHaveLength(before);
    });
  });
});
