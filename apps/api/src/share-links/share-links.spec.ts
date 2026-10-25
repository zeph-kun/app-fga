import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { documentRef, folderRef, userSubject } from '../authorization/authorizer.js';
import { InMemoryAuthorizer } from '../authorization/in-memory-authorizer.js';
import { InMemoryMembership } from '../authorization/in-memory-membership.js';
import type { Document } from '../documents/document.js';
import { InMemoryDocumentRepository } from '../documents/in-memory-document-repository.js';
import type { Folder } from '../folders/folder.js';
import { InMemoryFolderRepository } from '../folders/in-memory-folder-repository.js';
import { ResourceLifecycle } from '../lifecycle/resource-lifecycle.js';
import { Sharing } from '../sharing/sharing.js';
import { InMemoryTeamRepository } from '../teams/in-memory-team-repository.js';
import { InMemoryUserDirectory } from '../users/in-memory-user-directory.js';
import { InMemoryShareLinkRepository } from './in-memory-share-link-repository.js';
import { ShareLinks } from './share-links.js';

const document: Document = { id: 'doc-1', title: 'Plan', content: '', ownerId: 'alice', folderId: null };
const folder: Folder = { id: 'folder-1', name: 'Projects', ownerId: 'alice' };
const doc = { type: 'document', id: document.id } as const;

/** alice owns `document` and `folder`; bob, carol and dave are Users who know nothing yet. */
async function setup() {
  const membership = new InMemoryMembership();
  const authorizer = new InMemoryAuthorizer(membership);
  const documents = new InMemoryDocumentRepository();
  const folders = new InMemoryFolderRepository();
  const teams = new InMemoryTeamRepository();
  const lifecycle = new ResourceLifecycle(authorizer, documents, folders, teams, membership);
  await lifecycle.createDocument(document);
  await lifecycle.createFolder(folder);
  const sharing = new Sharing(authorizer, new InMemoryUserDirectory(['alice', 'bob', 'carol', 'dave']), teams);
  const shareLinks = new ShareLinks(authorizer, documents, folders, new InMemoryShareLinkRepository(), sharing);
  return { authorizer, lifecycle, sharing, shareLinks };
}

afterEach(() => {
  vi.useRealTimers();
});

const inHours = (hours: number) => new Date(Date.now() + hours * 3_600_000);

describe('ShareLinks', () => {
  it('gives the User who accepts a link its role on the resource', async () => {
    const { authorizer, shareLinks } = await setup();
    const { token } = await shareLinks.create('alice', doc, { role: 'editor' });

    const joined = await shareLinks.redeem('bob', token);

    expect(joined).toEqual(doc);
    expect(await authorizer.can('bob', 'can_edit', documentRef(document.id))).toBe(true);
    expect(await authorizer.can('bob', 'can_delete', documentRef(document.id))).toBe(false);
  });

  it('answers 404 to a token that no link has', async () => {
    const { shareLinks } = await setup();

    await expect(shareLinks.redeem('bob', 'no-such-token')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('answers 404 once the link has expired', async () => {
    const { authorizer, shareLinks } = await setup();
    const { token } = await shareLinks.create('alice', doc, { role: 'viewer', expiresInHours: 1 });
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(inHours(2));

    await expect(shareLinks.redeem('bob', token)).rejects.toBeInstanceOf(NotFoundException);
    expect(await authorizer.can('bob', 'can_view', documentRef(document.id))).toBe(false);
  });

  it('gives a Grant that ends when the link would have', async () => {
    const { authorizer, shareLinks } = await setup();
    const { token } = await shareLinks.create('alice', doc, { role: 'viewer', expiresInHours: 1 });
    const expiresAt = inHours(1).getTime();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(inHours(0.5));

    await shareLinks.redeem('bob', token);

    const ends = await authorizer.expiryOn('bob', documentRef(document.id));
    expect(Math.abs((ends?.getTime() ?? 0) - expiresAt)).toBeLessThan(1000);
  });

  it('gives access to the Documents of a Folder through a Folder link', async () => {
    const { authorizer, lifecycle, shareLinks } = await setup();
    await lifecycle.moveDocument(document, folder.id);
    const { token } = await shareLinks.create('alice', { type: 'folder', id: folder.id }, { role: 'viewer' });

    expect(await shareLinks.redeem('bob', token)).toEqual({ type: 'folder', id: folder.id });

    expect(await authorizer.can('bob', 'can_view', documentRef(document.id))).toBe(true);
    expect(await authorizer.can('bob', 'can_edit', documentRef(document.id))).toBe(false);
  });

  describe('when the User already has access', () => {
    it('leaves the Owner alone', async () => {
      const { shareLinks, sharing } = await setup();
      const { token } = await shareLinks.create('alice', doc, { role: 'viewer' });

      expect(await shareLinks.redeem('alice', token)).toEqual(doc);
      expect(await sharing.shares(documentRef(document.id))).toEqual([]);
    });

    it('does not lower a stronger role', async () => {
      const { authorizer, shareLinks, sharing } = await setup();
      await sharing.share(documentRef(document.id), 'alice', { subject: userSubject('bob'), role: 'editor' });
      const { token } = await shareLinks.create('alice', doc, { role: 'viewer' });

      await shareLinks.redeem('bob', token);

      expect(await authorizer.can('bob', 'can_edit', documentRef(document.id))).toBe(true);
    });

    it('raises a weaker role', async () => {
      const { authorizer, shareLinks, sharing } = await setup();
      await sharing.share(documentRef(document.id), 'alice', { subject: userSubject('bob'), role: 'viewer' });
      const { token } = await shareLinks.create('alice', doc, { role: 'editor' });

      await shareLinks.redeem('bob', token);

      expect(await authorizer.can('bob', 'can_edit', documentRef(document.id))).toBe(true);
    });

    it('does not shorten an access that never ends', async () => {
      const { authorizer, shareLinks, sharing } = await setup();
      await sharing.share(documentRef(document.id), 'alice', { subject: userSubject('bob'), role: 'viewer' });
      const { token } = await shareLinks.create('alice', doc, { role: 'viewer', expiresInHours: 1 });

      await shareLinks.redeem('bob', token);

      expect(await authorizer.expiryOn('bob', documentRef(document.id))).toBeNull();
    });

    it('makes an access that ends sooner last as long as the link does', async () => {
      const { authorizer, shareLinks, sharing } = await setup();
      await sharing.share(documentRef(document.id), 'alice', {
        subject: userSubject('bob'),
        role: 'viewer',
        expiresInHours: 1,
      });
      const { token } = await shareLinks.create('alice', doc, { role: 'viewer' });

      await shareLinks.redeem('bob', token);

      expect(await authorizer.expiryOn('bob', documentRef(document.id))).toBeNull();
    });

    it('gives no Grant to a User who has the role through the Folder', async () => {
      const { lifecycle, sharing, shareLinks } = await setup();
      await lifecycle.moveDocument(document, folder.id);
      await sharing.share(folderRef(folder.id), 'alice', { subject: userSubject('bob'), role: 'editor' });
      const { token } = await shareLinks.create('alice', doc, { role: 'viewer' });

      await shareLinks.redeem('bob', token);

      expect(await sharing.shares(documentRef(document.id))).toEqual([]);
    });
  });

  describe('who may manage the links of a resource', () => {
    it('lets whoever may share it create, list and revoke them, and nobody else', async () => {
      const { sharing, shareLinks } = await setup();
      await sharing.share(documentRef(document.id), 'alice', { subject: userSubject('bob'), role: 'editor' });
      await shareLinks.create('alice', doc, { role: 'viewer' });
      const id = (await shareLinks.list('alice', doc))[0]?.id ?? '';

      // bob can edit the Document but not share it: 403. carol cannot even see it: 404.
      for (const act of [
        (user: string) => shareLinks.create(user, doc, { role: 'viewer' }),
        (user: string) => shareLinks.list(user, doc),
        (user: string) => shareLinks.revoke(user, doc, id),
      ]) {
        await expect(act('bob')).rejects.toBeInstanceOf(ForbiddenException);
        await expect(act('carol')).rejects.toBeInstanceOf(NotFoundException);
      }
    });

    it('lists the links oldest first without their token', async () => {
      const { shareLinks } = await setup();
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date('2026-01-01T10:00:00Z'));
      const first = await shareLinks.create('alice', doc, { role: 'viewer' });
      vi.setSystemTime(new Date('2026-01-01T11:00:00Z'));
      await shareLinks.create('alice', doc, { role: 'editor', expiresInHours: 3 });

      const entries = await shareLinks.list('alice', doc);

      expect(entries.map((e) => e.role)).toEqual(['viewer', 'editor']);
      expect(entries[0]).toEqual({
        id: entries[0]?.id,
        role: 'viewer',
        tokenSuffix: first.token.slice(-4),
        createdBy: 'alice',
        createdAt: new Date('2026-01-01T10:00:00Z'),
      });
      expect(entries[1]?.expiresAt).toEqual(new Date('2026-01-01T14:00:00Z'));
    });

    it('lists only the links of the resource asked for', async () => {
      const { shareLinks } = await setup();
      await shareLinks.create('alice', { type: 'folder', id: folder.id }, { role: 'viewer' });

      expect(await shareLinks.list('alice', doc)).toEqual([]);
    });

    it('stops a revoked link working but keeps the Grants it gave', async () => {
      const { authorizer, shareLinks } = await setup();
      const { token } = await shareLinks.create('alice', doc, { role: 'viewer' });
      await shareLinks.redeem('bob', token);
      const [link] = await shareLinks.list('alice', doc);

      await shareLinks.revoke('alice', doc, link?.id ?? '');

      await expect(shareLinks.redeem('carol', token)).rejects.toBeInstanceOf(NotFoundException);
      expect(await shareLinks.list('alice', doc)).toEqual([]);
      expect(await authorizer.can('bob', 'can_view', documentRef(document.id))).toBe(true);
    });

    it("does not revoke another resource's link", async () => {
      const { shareLinks } = await setup();
      const folderRes = { type: 'folder', id: folder.id } as const;
      await shareLinks.create('alice', folderRes, { role: 'viewer' });
      const [link] = await shareLinks.list('alice', folderRes);

      await expect(shareLinks.revoke('alice', doc, link?.id ?? '')).rejects.toBeInstanceOf(NotFoundException);
      expect(await shareLinks.list('alice', folderRes)).toHaveLength(1);
    });
  });

  describe('previewing a link', () => {
    it('tells what a link is for, who sent it and what it would give', async () => {
      const { shareLinks } = await setup();
      const { token } = await shareLinks.create('alice', doc, { role: 'commenter', expiresInHours: 2 });
      const folderToken = (await shareLinks.create('alice', { type: 'folder', id: folder.id }, { role: 'viewer' })).token;

      expect(await shareLinks.preview(token)).toEqual({
        resource: { type: 'document', id: document.id, name: 'Plan' },
        role: 'commenter',
        invitedBy: 'alice',
        expiresAt: expect.any(Date),
      });
      expect(await shareLinks.preview(folderToken)).toEqual({
        resource: { type: 'folder', id: folder.id, name: 'Projects' },
        role: 'viewer',
        invitedBy: 'alice',
      });
    });

    it('answers 404 to an unknown, expired or revoked link, and gives nothing', async () => {
      const { authorizer, shareLinks } = await setup();
      const expiring = await shareLinks.create('alice', doc, { role: 'viewer', expiresInHours: 1 });
      const revoked = await shareLinks.create('alice', doc, { role: 'viewer' });
      const [, link] = await shareLinks.list('alice', doc);
      await shareLinks.revoke('alice', doc, link?.id ?? '');
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(inHours(2));

      for (const token of ['no-such-token', expiring.token, revoked.token]) {
        await expect(shareLinks.preview(token)).rejects.toBeInstanceOf(NotFoundException);
      }
      expect(await authorizer.can('bob', 'can_view', documentRef(document.id))).toBe(false);
    });
  });
});
