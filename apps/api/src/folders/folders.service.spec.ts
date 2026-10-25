import { ActivityLog } from '../activity-log/activity-log.js';
import { InMemoryActivityLogRepository } from '../activity-log/in-memory-activity-log-repository.js';
import { randomUUID } from 'node:crypto';
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { folderRef, teamSubject, userSubject } from '../authorization/authorizer.js';
import { InMemoryAuthorizer } from '../authorization/in-memory-authorizer.js';
import { InMemoryManagers } from '../authorization/in-memory-managers.js';
import { InMemoryMembership } from '../authorization/in-memory-membership.js';
import { InMemoryDocumentRepository } from '../documents/in-memory-document-repository.js';
import { InMemoryTeamRepository } from '../teams/in-memory-team-repository.js';
import { ResourceLifecycle } from '../lifecycle/resource-lifecycle.js';
import { Sharing } from '../sharing/sharing.js';
import { TeamsService } from '../teams/teams.service.js';
import { InMemoryUserDirectory } from '../users/in-memory-user-directory.js';
import { FoldersService } from './folders.service.js';
import { InMemoryFolderRepository } from './in-memory-folder-repository.js';

function setup() {
  const membership = new InMemoryMembership();
  const authorizer = new InMemoryAuthorizer(membership, new InMemoryManagers(['alice']));
  const documents = new InMemoryDocumentRepository();
  const folders = new InMemoryFolderRepository();
  const users = new InMemoryUserDirectory(['alice', 'bob', 'carol']);
  const teams = new InMemoryTeamRepository();
  const activity = new ActivityLog(authorizer, new InMemoryActivityLogRepository());
  return {
    authorizer,
    documents,
    folders,
    activity,
    service: new FoldersService(
      authorizer,
      folders,
      documents,
      new Sharing(authorizer, users, teams),
      new ResourceLifecycle(authorizer, documents, folders, teams, membership),
      activity,
    ),
    teams: new TeamsService(
      authorizer,
      membership,
      teams,
      users,
      new ResourceLifecycle(authorizer, documents, folders, teams, membership),
    ),
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

  describe('recording in the Activity log', () => {
    it('notes who shared the folder with whom, and who was removed', async () => {
      const { service, activity } = setup();
      const folder = await service.create('alice', { name: 'Projects' });

      await service.share('alice', folder.id, { subject: userSubject('bob'), role: 'viewer' });
      await service.unshare('alice', folder.id, userSubject('bob'));

      const { entries } = await activity.forResource('alice', { type: 'folder', id: folder.id });
      expect(entries.map((e) => e.event)).toEqual([
        { kind: 'unshared', subject: { type: 'user', id: 'bob', name: 'bob' } },
        { kind: 'shared', subject: { type: 'user', id: 'bob', name: 'bob' }, role: 'viewer' },
      ]);
      expect(entries.every((e) => e.actorId === 'alice')).toBe(true);
    });

    it('notes nothing for a share that was refused', async () => {
      const { service, activity } = setup();
      const folder = await service.create('alice', { name: 'Projects' });

      await expect(service.share('alice', folder.id, { subject: userSubject('alice'), role: 'viewer' })).rejects.toBeInstanceOf(
        ForbiddenException,
      );

      expect((await activity.forResource('alice', { type: 'folder', id: folder.id })).entries).toEqual([]);
    });
  });

  describe('Folders in Folders', () => {
    /** A chain of `depth` Folders owned by alice, each in the previous one. */
    async function chain(service: ReturnType<typeof setup>['service'], depth: number) {
      const folders = [await service.create('alice', { name: 'Level 1' })];
      for (let level = 2; level <= depth; level++) {
        folders.push(await service.create('alice', { name: `Level ${level}`, parentId: folders[level - 2]?.id ?? null }));
      }
      return folders;
    }

    describe('creating', () => {
      it('puts the new Folder in its parent, makes its creator the Owner and gives it the roles of the parent', async () => {
        const { service } = setup();
        const parent = await service.create('alice', { name: 'Projects' });
        await service.share('alice', parent.id, { subject: userSubject('bob'), role: 'viewer' });

        const child = await service.create('alice', { name: 'Plans', parentId: parent.id });

        expect(child).toMatchObject({ name: 'Plans', ownerId: 'alice', parentId: parent.id });
        expect(await service.get('bob', child.id)).toMatchObject({ access: 'viewer', parentId: parent.id });
        expect(await service.get('alice', child.id)).toMatchObject({ access: 'owner' });
      });

      it('needs the right to edit the parent: 403 for a viewer, 404 for a User who cannot see it', async () => {
        const { service } = setup();
        const parent = await service.create('alice', { name: 'Projects' });
        await service.share('alice', parent.id, { subject: userSubject('bob'), role: 'viewer' });
        await service.share('alice', parent.id, { subject: userSubject('carol'), role: 'editor' });

        await expect(service.create('bob', { name: 'Plans', parentId: parent.id })).rejects.toBeInstanceOf(ForbiddenException);
        await expect(service.create('alice', { name: 'Plans', parentId: randomUUID() })).rejects.toBeInstanceOf(NotFoundException);
        expect(await service.create('carol', { name: 'Plans', parentId: parent.id })).toMatchObject({ ownerId: 'carol' });
      });

      it('allows 5 levels and refuses a 6th', async () => {
        const { service } = setup();
        const folders = await chain(service, 5);

        await expect(service.create('alice', { name: 'Level 6', parentId: folders[4]?.id ?? null })).rejects.toBeInstanceOf(
          BadRequestException,
        );
      });
    });

    describe('what a User sees of the tree', () => {
      it('lists the Folders directly in a Folder, and not those further down', async () => {
        const { service } = setup();
        const parent = await service.create('alice', { name: 'Projects' });
        const open = await service.create('alice', { name: 'Open', parentId: parent.id });
        await service.create('alice', { name: 'Plans', parentId: parent.id });
        await service.create('alice', { name: 'Deeper', parentId: open.id });
        await service.share('alice', parent.id, { subject: userSubject('bob'), role: 'viewer' });

        const view = await service.get('bob', parent.id);

        expect(view.folders.map((f) => f.name).sort()).toEqual(['Open', 'Plans']);
        expect(view.folders.every((f) => f.parentId === parent.id)).toBe(true);
      });

      it('gives the breadcrumb of the Folders above that the User can see, nearest last', async () => {
        const { service } = setup();
        const [top, middle, bottom] = await chain(service, 3);
        await service.share('alice', middle?.id ?? '', { subject: userSubject('bob'), role: 'viewer' });

        expect((await service.get('alice', bottom?.id ?? '')).breadcrumb.map((f) => f.name)).toEqual(['Level 1', 'Level 2']);
        const seenByBob = await service.get('bob', bottom?.id ?? '');

        expect(seenByBob.breadcrumb.map((f) => f.name)).toEqual(['Level 2']);
        expect(seenByBob.breadcrumb.map((f) => f.id)).not.toContain(top?.id);
      });

      it('shows a Folder whose parent the User cannot see at the top, without the parent', async () => {
        const { service } = setup();
        const [top, middle] = await chain(service, 2);
        await service.share('alice', middle?.id ?? '', { subject: userSubject('bob'), role: 'viewer' });

        const list = await service.list('bob');
        const view = await service.get('bob', middle?.id ?? '');

        expect(list).toEqual([expect.objectContaining({ id: middle?.id, parentId: null })]);
        expect(view.parentId).toBeNull();
        expect(JSON.stringify([list, view])).not.toContain(top?.id);
      });
    });

    describe('moving', () => {
      it('puts a Folder in another one, with everything in it, and out to the top with null', async () => {
        const { service } = setup();
        const target = await service.create('alice', { name: 'Archive' });
        const [top, middle] = await chain(service, 2);
        await service.share('alice', target.id, { subject: userSubject('bob'), role: 'viewer' });

        const moved = await service.move('alice', middle?.id ?? '', target.id);

        expect(moved).toMatchObject({ id: middle?.id, parentId: target.id });
        expect(await service.get('bob', middle?.id ?? '')).toMatchObject({ access: 'viewer' });
        expect((await service.get('alice', target.id)).folders.map((f) => f.id)).toEqual([middle?.id]);
        expect((await service.get('alice', top?.id ?? '')).folders).toEqual([]);

        await service.move('alice', middle?.id ?? '', null);

        await expect(service.get('bob', middle?.id ?? '')).rejects.toBeInstanceOf(NotFoundException);
      });

      it('is for the Owner of the Folder, into a Folder they can edit', async () => {
        const { service } = setup();
        const mine = await service.create('alice', { name: 'Mine' });
        const target = await service.create('alice', { name: 'Target' });
        await service.share('alice', mine.id, { subject: userSubject('bob'), role: 'editor' });
        await service.share('alice', target.id, { subject: userSubject('carol'), role: 'viewer' });
        const carols = await service.create('carol', { name: 'Carols' });

        await expect(service.move('bob', mine.id, target.id)).rejects.toBeInstanceOf(ForbiddenException);
        await expect(service.move('carol', carols.id, target.id)).rejects.toBeInstanceOf(ForbiddenException);
        await expect(service.move('alice', mine.id, randomUUID())).rejects.toBeInstanceOf(NotFoundException);
      });

      it('refuses to move a Folder into itself or into one of its own Folders', async () => {
        const { service } = setup();
        const [top, , bottom] = await chain(service, 3);

        await expect(service.move('alice', top?.id ?? '', top?.id ?? null)).rejects.toBeInstanceOf(BadRequestException);
        await expect(service.move('alice', top?.id ?? '', bottom?.id ?? null)).rejects.toBeInstanceOf(BadRequestException);
        expect(await service.get('alice', top?.id ?? '')).toMatchObject({ parentId: null });
      });

      it('refuses a move that would make the tree deeper than 5 levels, counting what is in the Folder', async () => {
        const { service } = setup();
        const deep = await chain(service, 4);
        const movable = await service.create('alice', { name: 'Movable' });
        await service.create('alice', { name: 'Below', parentId: movable.id });

        await expect(service.move('alice', movable.id, deep[3]?.id ?? null)).rejects.toBeInstanceOf(BadRequestException);
        expect(await service.move('alice', movable.id, deep[2]?.id ?? null)).toMatchObject({ parentId: deep[2]?.id });
      });

      it('is noted in the Activity log of the moved Folder, with the names of the Folders', async () => {
        const { service, activity } = setup();
        const target = await service.create('alice', { name: 'Archive' });
        const folder = await service.create('alice', { name: 'Plans' });

        await service.move('alice', folder.id, target.id);
        await service.move('alice', folder.id, null);

        const { entries } = await activity.forResource('alice', { type: 'folder', id: folder.id });
        expect(entries.map((e) => e.event)).toEqual([
          { kind: 'moved', from: { id: target.id, name: 'Archive' }, to: null },
          { kind: 'moved', from: null, to: { id: target.id, name: 'Archive' } },
        ]);
      });
    });

    describe('deleting', () => {
      it('refuses to delete a Folder that still has a Folder in it', async () => {
        const { service } = setup();
        const [top, middle] = await chain(service, 2);

        await expect(service.remove('alice', top?.id ?? '')).rejects.toBeInstanceOf(ConflictException);

        await service.remove('alice', middle?.id ?? '');
        await service.remove('alice', top?.id ?? '');
        await expect(service.get('alice', top?.id ?? '')).rejects.toBeInstanceOf(NotFoundException);
      });
    });
  });
});
