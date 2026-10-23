import { randomUUID } from 'node:crypto';
import type { Comment } from './comment.js';
import type { CommentRepository } from './comment-repository.js';

/** A repository and a way to get the id of a Document it may attach comments to (a real row, for Postgres). */
export interface CommentStore {
  readonly repository: CommentRepository;
  readonly newDocumentId: () => Promise<string>;
}

function aComment(documentId: string, overrides: Partial<Comment> = {}): Comment {
  return { id: randomUUID(), documentId, authorId: 'bob', text: 'Looks good', createdAt: new Date(), ...overrides };
}

/**
 * Behavior every CommentRepository adapter must have. Each test uses fresh ids, so adapters
 * need no cleanup between tests.
 */
export function commentRepositoryContract(adapter: string, create: () => CommentStore | Promise<CommentStore>): void {
  describe(`CommentRepository (${adapter})`, () => {
    it('returns a saved comment by id', async () => {
      const { repository, newDocumentId } = await create();
      const comment = aComment(await newDocumentId());
      await repository.save(comment);

      expect(await repository.findById(comment.id)).toEqual(comment);
      expect(await repository.findById(randomUUID())).toBeUndefined();
    });

    it("lists a document's comments, oldest first, and no other document's", async () => {
      const { repository, newDocumentId } = await create();
      const [documentId, otherId] = [await newDocumentId(), await newDocumentId()];
      const [first, second, third] = [
        aComment(documentId, { text: 'first', createdAt: new Date('2026-01-01T10:00:00Z') }),
        aComment(documentId, { text: 'second', createdAt: new Date('2026-01-01T10:05:00Z') }),
        aComment(documentId, { text: 'third', createdAt: new Date('2026-01-01T10:10:00Z') }),
      ];
      for (const comment of [third, first, aComment(otherId), second]) await repository.save(comment);

      expect(await repository.findByDocument(documentId)).toEqual([first, second, third]);
      expect(await repository.findByDocument(await newDocumentId())).toEqual([]);
    });

    it('deletes a comment, and deleting an unknown one is a no-op', async () => {
      const { repository, newDocumentId } = await create();
      const documentId = await newDocumentId();
      const [kept, deleted] = [aComment(documentId), aComment(documentId)];
      await repository.save(kept);
      await repository.save(deleted);

      await repository.delete(deleted.id);

      expect(await repository.findByDocument(documentId)).toEqual([kept]);
      await expect(repository.delete(randomUUID())).resolves.toBeUndefined();
    });
  });
}
