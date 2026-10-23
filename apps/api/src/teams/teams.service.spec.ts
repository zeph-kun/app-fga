import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { InMemoryAuthorizer } from '../authorization/in-memory-authorizer.js';
import { InMemoryMembership } from '../authorization/in-memory-membership.js';
import { InMemoryDocumentRepository } from '../documents/in-memory-document-repository.js';
import { InMemoryFolderRepository } from '../folders/in-memory-folder-repository.js';
import { ResourceLifecycle } from '../lifecycle/resource-lifecycle.js';
import { InMemoryUserDirectory } from '../users/in-memory-user-directory.js';
import { InMemoryTeamRepository } from './in-memory-team-repository.js';
import { TeamsService } from './teams.service.js';

function setup() {
  const membership = new InMemoryMembership();
  const teams = new InMemoryTeamRepository();
  const users = new InMemoryUserDirectory(['alice', 'bob', 'carol']);
  const lifecycle = new ResourceLifecycle(
    new InMemoryAuthorizer(membership),
    new InMemoryDocumentRepository(),
    new InMemoryFolderRepository(),
    teams,
    membership,
  );
  return { membership, teams, service: new TeamsService(membership, teams, users, lifecycle) };
}

describe('TeamsService', () => {
  it('creates a team with its creator as the only member', async () => {
    const { service } = setup();

    const team = await service.create('alice', { name: 'Design' });

    expect(team).toMatchObject({ name: 'Design', ownerId: 'alice' });
    expect(await service.get('alice', team.id)).toMatchObject({
      name: 'Design',
      role: 'owner',
      members: ['alice'],
    });
  });

  it('hides a team from users with no access, as if it did not exist', async () => {
    const { service } = setup();
    const team = await service.create('alice', { name: 'Design' });

    await expect(service.get('bob', team.id)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('lets the owner add and remove members, who can then see the team as members', async () => {
    const { service } = setup();
    const team = await service.create('alice', { name: 'Design' });

    await service.addMember('alice', team.id, 'bob');
    expect(await service.get('bob', team.id)).toMatchObject({ role: 'member' });

    await service.removeMember('alice', team.id, 'bob');
    await expect(service.get('bob', team.id)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('refuses to add an unknown username as a member', async () => {
    const { service } = setup();
    const team = await service.create('alice', { name: 'Design' });

    await expect(service.addMember('alice', team.id, 'mallory')).rejects.toThrow();
  });

  it('refuses management actions to a non-owner member', async () => {
    const { service } = setup();
    const team = await service.create('alice', { name: 'Design' });
    await service.addMember('alice', team.id, 'bob');

    await expect(service.addMember('bob', team.id, 'carol')).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.rename('bob', team.id, { name: 'x' })).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.remove('bob', team.id)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('never lets the owner be removed from their own team', async () => {
    const { service } = setup();
    const team = await service.create('alice', { name: 'Design' });

    await expect(service.removeMember('alice', team.id, 'alice')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('renames a team', async () => {
    const { service } = setup();
    const team = await service.create('alice', { name: 'Design' });

    await service.rename('alice', team.id, { name: 'Product Design' });

    expect(await service.get('alice', team.id)).toMatchObject({ name: 'Product Design' });
  });

  it('deletes a team and forgets its membership', async () => {
    const { membership, service } = setup();
    const team = await service.create('alice', { name: 'Design' });
    await service.addMember('alice', team.id, 'bob');

    await service.remove('alice', team.id);

    await expect(service.get('alice', team.id)).rejects.toBeInstanceOf(NotFoundException);
    expect(await membership.members(team.id)).toEqual([]);
  });

  it('lists the teams a user owns or belongs to', async () => {
    const { service } = setup();
    const owned = await service.create('alice', { name: 'Design' });
    const memberOf = await service.create('bob', { name: 'Engineering' });
    await service.addMember('bob', memberOf.id, 'alice');
    const unrelated = await service.create('bob', { name: 'Sales' });

    const list = await service.list('alice');

    expect(list.map((t) => t.id).sort()).toEqual([owned.id, memberOf.id].sort());
    expect(list.map((t) => t.id)).not.toContain(unrelated.id);
  });
});
