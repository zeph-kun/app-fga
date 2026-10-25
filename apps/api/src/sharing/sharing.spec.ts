import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { documentRef, teamSubject, userSubject } from '../authorization/authorizer.js';
import { InMemoryAuthorizer } from '../authorization/in-memory-authorizer.js';
import { InMemoryMembership } from '../authorization/in-memory-membership.js';
import { InMemoryTeamRepository } from '../teams/in-memory-team-repository.js';
import { InMemoryUserDirectory } from '../users/in-memory-user-directory.js';
import { Sharing } from './sharing.js';

const doc = documentRef('doc-1');

/** An Owner (alice) holding `doc`, with bob and carol known to the directory. */
async function setup() {
  const membership = new InMemoryMembership();
  const authorizer = new InMemoryAuthorizer(membership);
  const teams = new InMemoryTeamRepository();
  await authorizer.grant(userSubject('alice'), 'owner', doc);
  const sharing = new Sharing(authorizer, new InMemoryUserDirectory(['alice', 'bob', 'carol']), teams);
  return { authorizer, membership, teams, sharing };
}

describe('Sharing', () => {
  describe('share and shares', () => {
    it('gives a User a role and lists it without the Owner', async () => {
      const { authorizer, sharing } = await setup();

      await sharing.share(doc, 'alice', { subject: userSubject('bob'), role: 'viewer' });

      expect(await authorizer.can('bob', 'can_view', doc)).toBe(true);
      expect(await authorizer.can('bob', 'can_edit', doc)).toBe(false);
      expect(await sharing.shares(doc)).toEqual([
        { subject: userSubject('bob'), name: 'bob', role: 'viewer' },
      ]);
    });

    it('replaces the previous role when sharing again with a different one', async () => {
      const { sharing } = await setup();
      await sharing.share(doc, 'alice', { subject: userSubject('bob'), role: 'viewer' });

      await sharing.share(doc, 'alice', { subject: userSubject('bob'), role: 'editor' });

      expect(await sharing.shares(doc)).toEqual([
        { subject: userSubject('bob'), name: 'bob', role: 'editor' },
      ]);
    });

    it('gives a User the Commenter role: they can comment but not edit', async () => {
      const { authorizer, sharing } = await setup();

      await sharing.share(doc, 'alice', { subject: userSubject('bob'), role: 'commenter' });

      expect(await authorizer.can('bob', 'can_comment', doc)).toBe(true);
      expect(await authorizer.can('bob', 'can_edit', doc)).toBe(false);
      expect(await sharing.shares(doc)).toEqual([
        { subject: userSubject('bob'), name: 'bob', role: 'commenter' },
      ]);
    });

    it('leaves a single Grant whichever role the User is moved between', async () => {
      const { sharing } = await setup();
      await sharing.share(doc, 'alice', { subject: userSubject('bob'), role: 'editor' });

      await sharing.share(doc, 'alice', { subject: userSubject('bob'), role: 'commenter' });
      expect(await sharing.shares(doc)).toEqual([
        { subject: userSubject('bob'), name: 'bob', role: 'commenter' },
      ]);

      await sharing.share(doc, 'alice', { subject: userSubject('bob'), role: 'viewer' });
      expect(await sharing.shares(doc)).toEqual([
        { subject: userSubject('bob'), name: 'bob', role: 'viewer' },
      ]);
    });

    it('makes a Grant expire after the given number of hours', async () => {
      vi.useFakeTimers({ now: new Date('2026-01-01T10:00:00Z') });
      try {
        const { sharing } = await setup();

        await sharing.share(doc, 'alice', { subject: userSubject('bob'), role: 'viewer', expiresInHours: 2 });

        expect((await sharing.shares(doc))[0]?.expiresAt).toEqual(new Date('2026-01-01T12:00:00Z'));
      } finally {
        vi.useRealTimers();
      }
    });

    it('makes a Grant expire at the given moment', async () => {
      const { sharing } = await setup();
      const expiresAt = new Date(Date.now() + 5 * 3_600_000);

      await sharing.share(doc, 'alice', { subject: userSubject('bob'), role: 'viewer', expiresAt });

      expect((await sharing.shares(doc))[0]?.expiresAt).toEqual(expiresAt);
    });

    it('answers with the Share it gave, named as it is listed', async () => {
      const { teams, membership, sharing } = await setup();
      await teams.save({ id: 't1', name: 'Design', ownerId: 'bob' });
      await membership.add('t1', 'carol');
      const expiresAt = new Date(Date.now() + 5 * 3_600_000);

      expect(await sharing.share(doc, 'alice', { subject: userSubject('bob'), role: 'viewer' })).toEqual({
        subject: userSubject('bob'),
        name: 'bob',
        role: 'viewer',
      });
      expect(await sharing.share(doc, 'alice', { subject: teamSubject('t1'), role: 'editor', expiresAt })).toEqual({
        subject: teamSubject('t1'),
        name: 'Design',
        role: 'editor',
        expiresAt,
      });
    });

    it('shares with a Team and lists it by the Team name', async () => {
      const { teams, authorizer, membership, sharing } = await setup();
      await teams.save({ id: 't1', name: 'Design', ownerId: 'bob' });
      await membership.add('t1', 'carol');

      await sharing.share(doc, 'alice', { subject: teamSubject('t1'), role: 'editor' });

      expect(await authorizer.can('carol', 'can_edit', doc)).toBe(true);
      expect(await sharing.shares(doc)).toEqual([
        { subject: teamSubject('t1'), name: 'Design', role: 'editor' },
      ]);
    });

    it('rejects sharing with the Owner', async () => {
      const { sharing } = await setup();

      await expect(
        sharing.share(doc, 'alice', { subject: userSubject('alice'), role: 'viewer' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('rejects an unknown User or Team', async () => {
      const { sharing } = await setup();

      await expect(
        sharing.share(doc, 'alice', { subject: userSubject('mallory'), role: 'viewer' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        sharing.share(doc, 'alice', { subject: teamSubject('nope'), role: 'viewer' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('unshare', () => {
    it('removes a User\'s Grant whatever its role', async () => {
      const { authorizer, sharing } = await setup();
      await sharing.share(doc, 'alice', { subject: userSubject('bob'), role: 'editor' });

      await sharing.unshare(doc, 'alice', userSubject('bob'));

      expect(await authorizer.can('bob', 'can_view', doc)).toBe(false);
      expect(await sharing.shares(doc)).toEqual([]);
    });

    it('removes a Commenter Grant too', async () => {
      const { authorizer, sharing } = await setup();
      await sharing.share(doc, 'alice', { subject: userSubject('bob'), role: 'commenter' });

      await sharing.unshare(doc, 'alice', userSubject('bob'));

      expect(await authorizer.can('bob', 'can_view', doc)).toBe(false);
      expect(await sharing.shares(doc)).toEqual([]);
    });

    it('answers with the name of whom it removed, even when the Team no longer exists', async () => {
      const { teams, sharing } = await setup();
      await teams.save({ id: 't1', name: 'Design', ownerId: 'bob' });

      expect(await sharing.unshare(doc, 'alice', userSubject('bob'))).toBe('bob');
      expect(await sharing.unshare(doc, 'alice', teamSubject('t1'))).toBe('Design');
      expect(await sharing.unshare(doc, 'alice', teamSubject('gone'))).toBe('Deleted team');
    });

    it('refuses to remove the Owner', async () => {
      const { sharing } = await setup();

      await expect(sharing.unshare(doc, 'alice', userSubject('alice'))).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });
  });

  describe('accessList', () => {
    it('lists every User who can view, Team members included', async () => {
      const { teams, authorizer, membership, sharing } = await setup();
      await teams.save({ id: 't1', name: 'Design', ownerId: 'bob' });
      await membership.add('t1', 'carol');
      await sharing.share(doc, 'alice', { subject: teamSubject('t1'), role: 'viewer' });
      await sharing.share(doc, 'alice', { subject: userSubject('bob'), role: 'viewer' });

      expect((await sharing.accessList(doc)).sort()).toEqual(['alice', 'bob', 'carol']);
    });
  });
});
