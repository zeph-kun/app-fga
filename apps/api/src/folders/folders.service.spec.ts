import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { folderRef, teamSubject, userSubject } from '../authorization/authorizer.js';
import { InMemoryAuthorizer } from '../authorization/in-memory-authorizer.js';
import { InMemoryDocumentRepository } from '../documents/in-memory-document-repository.js';
import { InMemoryTeamRepository } from '../teams/in-memory-team-repository.js';
import { TeamsService } from '../teams/teams.service.js';
import { InMemoryUserDirectory } from '../users/in-memory-user-directory.js';
import { FoldersService } from './folders.service.js';
import { InMemoryFolderRepository } from './in-memory-folder-repository.js';

function setup() {
  const authorizer = new InMemoryAuthorizer();
  const documents = new InMemoryDocumentRepository();
  const folders = new InMemoryFolderRepository();
  const users = new InMemoryUserDirectory(['alice', 'bob', 'carol']);
  const teams = new InMemoryTeamRepository();
  return {
    authorizer,
    documents,
    folders,
    service: new FoldersService(authorizer, folders, documents, users, teams),
    teams: new TeamsService(authorizer, teams, users),
  };
}

describe('FoldersService', () => {
  it('lets the creator read and list their folder', async () => {
    const { service } = setup();
    const folder = await service.create('alice', { name: 'Projects' });

    expect(await service.get('alice', folder.id)).toMatchObject({
      name: 'Projects',
      ownerId: 'alice',
      access: 'owner',
      documents: [],
    });
    expect((await service.list('alice')).map((f) => f.id)).toEqual([folder.id]);
  });

  it('hides a folder from users with no access, as if it did not exist', async () => {
    const { service } = setup();
    const folder = await service.create('alice', { name: 'Projects' });

    await expect(service.get('bob', folder.id)).rejects.toBeInstanceOf(NotFoundException);
    expect(await service.list('bob')).toEqual([]);
  });

  it('gives a viewer read access but not the right to rename', async () => {
    const { service } = setup();
    const folder = await service.create('alice', { name: 'Projects' });
    await service.share('alice', folder.id, { subject: userSubject('bob'), role: 'viewer' });

    expect(await service.get('bob', folder.id)).toMatchObject({ access: 'viewer' });
    await expect(service.rename('bob', folder.id, { name: 'Mine' })).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('deletes an empty folder for its owner and removes every grant on it', async () => {
    const { authorizer, service } = setup();
    const folder = await service.create('alice', { name: 'Projects' });
    await service.share('alice', folder.id, { subject: userSubject('bob'), role: 'editor' });
    await service.remove('alice', folder.id);

    await expect(service.get('alice', folder.id)).rejects.toBeInstanceOf(NotFoundException);
    expect(await authorizer.grantsOn(folderRef(folder.id))).toEqual([]);
  });

  it('refuses to delete a folder that still holds documents', async () => {
    const { documents, service } = setup();
    const folder = await service.create('alice', { name: 'Projects' });
    await documents.save({ id: crypto.randomUUID(), ownerId: 'alice', folderId: folder.id, title: 'Plan', content: '' });

    await expect(service.remove('alice', folder.id)).rejects.toBeInstanceOf(ConflictException);
    expect(await service.get('alice', folder.id)).toMatchObject({ name: 'Projects' });
  });

  it('lets only the owner delete a folder', async () => {
    const { service } = setup();
    const folder = await service.create('alice', { name: 'Projects' });
    await service.share('alice', folder.id, { subject: userSubject('bob'), role: 'editor' });

    await expect(service.remove('bob', folder.id)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('lets the owner list and revoke shares, but never remove the owner', async () => {
    const { service } = setup();
    const folder = await service.create('alice', { name: 'Projects' });
    await service.share('alice', folder.id, { subject: userSubject('bob'), role: 'editor' });
    await service.share('alice', folder.id, { subject: userSubject('carol'), role: 'viewer' });

    expect(await service.shares('alice', folder.id)).toHaveLength(2);
    await expect(service.shares('bob', folder.id)).rejects.toBeInstanceOf(ForbiddenException);

    await service.unshare('alice', folder.id, userSubject('bob'));
    await expect(service.get('bob', folder.id)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.unshare('alice', folder.id, userSubject('alice'))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it("lists each folder with the requester's role on it", async () => {
    const { service } = setup();
    const mine = await service.create('alice', { name: 'Mine' });
    const editable = await service.create('bob', { name: 'Editable' });
    const readOnly = await service.create('bob', { name: 'Read only' });
    await service.share('bob', editable.id, { subject: userSubject('alice'), role: 'editor' });
    await service.share('bob', readOnly.id, { subject: userSubject('alice'), role: 'viewer' });

    const folders = await service.list('alice');

    expect(folders.map(({ id, access }) => ({ id, access })).sort((a, b) => a.id.localeCompare(b.id))).toEqual(
      [
        { id: mine.id, access: 'owner' },
        { id: editable.id, access: 'editor' },
        { id: readOnly.id, access: 'viewer' },
      ].sort((a, b) => a.id.localeCompare(b.id)),
    );
  });

  it('refuses to share a folder with its own owner', async () => {
    const { service } = setup();
    const folder = await service.create('alice', { name: 'Projects' });

    await expect(
      service.share('alice', folder.id, { subject: userSubject('alice'), role: 'viewer' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('refuses to share a folder with an unknown username', async () => {
    const { service } = setup();
    const folder = await service.create('alice', { name: 'Projects' });

    await expect(
      service.share('alice', folder.id, { subject: userSubject('mallory'), role: 'viewer' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  describe('sharing with a team', () => {
    it('gives every team member access to the folder and its documents', async () => {
      const { service, documents, teams } = setup();
      const team = await teams.create('alice', { name: 'Reviewers' });
      await teams.addMember('alice', team.id, 'bob');
      const folder = await service.create('alice', { name: 'Projects' });
      await documents.save({ id: crypto.randomUUID(), ownerId: 'alice', folderId: folder.id, title: 'Plan', content: '' });

      await service.share('alice', folder.id, { subject: teamSubject(team.id), role: 'viewer' });

      expect(await service.get('bob', folder.id)).toMatchObject({ access: 'viewer' });
      expect(await service.shares('alice', folder.id)).toEqual([
        { subject: teamSubject(team.id), name: 'Reviewers', role: 'viewer' },
      ]);
    });

    it('refuses to share with a team that does not exist', async () => {
      const { service } = setup();
      const folder = await service.create('alice', { name: 'Projects' });

      await expect(
        service.share('alice', folder.id, { subject: teamSubject('00000000-0000-0000-0000-000000000000'), role: 'viewer' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('time-bound sharing', () => {
    it('denies access once the share has expired', async () => {
      const { service } = setup();
      const folder = await service.create('alice', { name: 'Projects' });

      await service.share('alice', folder.id, { subject: userSubject('bob'), role: 'viewer', expiresInHours: -1 });

      await expect(service.get('bob', folder.id)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('accessList', () => {
    it('resolves team membership into a flat list of who can view', async () => {
      const { service, teams } = setup();
      const team = await teams.create('alice', { name: 'Reviewers' });
      await teams.addMember('alice', team.id, 'bob');
      const folder = await service.create('alice', { name: 'Projects' });
      await service.share('alice', folder.id, { subject: teamSubject(team.id), role: 'viewer' });

      expect(await service.accessList('alice', folder.id)).toEqual(expect.arrayContaining(['alice', 'bob']));
    });
  });
});
