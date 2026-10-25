import { randomUUID } from 'node:crypto';
import type { ShareLink } from './share-link.js';
import type { ShareLinkRepository } from './share-link-repository.js';

/** A repository and a way to get the id of a Document or Folder a link may point to (a real row, for Postgres). */
export interface ShareLinkStore {
  readonly repository: ShareLinkRepository;
  readonly newResourceId: (type: 'document' | 'folder') => Promise<string>;
}

export function aShareLink(
  resource: { type: 'document' | 'folder'; id: string },
  overrides: Partial<ShareLink> = {},
): ShareLink {
  const id = randomUUID();
  return {
    id,
    resource,
    role: 'viewer',
    tokenHash: `hash-${id}`,
    tokenSuffix: 'abcd',
    createdBy: 'alice',
    createdAt: new Date(),
    ...overrides,
  };
}

/**
 * Behavior every ShareLinkRepository adapter must have. Each test uses fresh ids, so adapters
 * need no cleanup between tests.
 */
export function shareLinkRepositoryContract(
  adapter: string,
  create: () => ShareLinkStore | Promise<ShareLinkStore>,
): void {
  describe(`ShareLinkRepository (${adapter})`, () => {
    it('returns a saved link by id and by the hash of its token', async () => {
      const { repository, newResourceId } = await create();
      const link = aShareLink(
        { type: 'folder', id: await newResourceId('folder') },
        { role: 'editor', expiresAt: new Date('2030-01-01T00:00:00Z') },
      );
      await repository.save(link);

      expect(await repository.findById(link.id)).toEqual(link);
      expect(await repository.findByTokenHash(link.tokenHash)).toEqual(link);
      expect(await repository.findById(randomUUID())).toBeUndefined();
      expect(await repository.findByTokenHash('unknown')).toBeUndefined();
    });

    it("lists a resource's links, oldest first, and no other resource's", async () => {
      const { repository, newResourceId } = await create();
      const documentId = await newResourceId('document');
      const document = { type: 'document', id: documentId } as const;
      const folder = { type: 'folder', id: await newResourceId('folder') } as const;
      const [first, second, third] = [
        aShareLink(document, { createdAt: new Date('2026-01-01T10:00:00Z') }),
        aShareLink(document, { createdAt: new Date('2026-01-01T10:05:00Z') }),
        aShareLink(document, { createdAt: new Date('2026-01-01T10:10:00Z') }),
      ];
      for (const link of [third, first, aShareLink(folder), second]) await repository.save(link);

      expect(await repository.findByResource(document)).toEqual([first, second, third]);
      expect(await repository.findByResource({ type: 'document', id: await newResourceId('document') })).toEqual([]);
    });

    it('deletes a link, and deleting an unknown one is a no-op', async () => {
      const { repository, newResourceId } = await create();
      const document = { type: 'document', id: await newResourceId('document') } as const;
      const [kept, deleted] = [aShareLink(document), aShareLink(document)];
      await repository.save(kept);
      await repository.save(deleted);

      await repository.delete(deleted.id);

      expect(await repository.findByResource(document)).toEqual([kept]);
      expect(await repository.findByTokenHash(deleted.tokenHash)).toBeUndefined();
      await expect(repository.delete(randomUUID())).resolves.toBeUndefined();
    });
  });
}

