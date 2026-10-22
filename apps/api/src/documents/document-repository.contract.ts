import { randomUUID } from 'node:crypto';
import type { Document } from './document.js';
import type { DocumentRepository } from './document-repository.js';

function aDocument(overrides: Partial<Document> = {}): Document {
  return { id: randomUUID(), ownerId: 'alice', title: 'Plan', content: 'v1', folderId: null, ...overrides };
}

/**
 * Behavior every DocumentRepository adapter must have. Run it against each adapter
 * so the in-memory one used by service tests cannot drift from the real one.
 */
export function documentRepositoryContract(
  adapter: string,
  create: () => DocumentRepository | Promise<DocumentRepository>,
): void {
  describe(`DocumentRepository (${adapter})`, () => {
    it('returns a saved document by id', async () => {
      const repository = await create();
      const document = aDocument();
      await repository.save(document);

      expect(await repository.findById(document.id)).toEqual(document);
    });

    it('remembers the folder of a document, and lets it move out of it', async () => {
      const repository = await create();
      const folderId = randomUUID();
      const document = aDocument({ folderId });
      await repository.save(document);
      expect((await repository.findById(document.id))?.folderId).toBe(folderId);

      await repository.save({ ...document, folderId: null });
      expect((await repository.findById(document.id))?.folderId).toBeNull();
    });

    it('lists the documents of a folder', async () => {
      const repository = await create();
      const folderId = randomUUID();
      const [inside, alsoInside, outside] = [
        aDocument({ folderId }),
        aDocument({ folderId }),
        aDocument(),
      ];
      await Promise.all([inside, alsoInside, outside].map((d) => repository.save(d)));

      const found = await repository.findByFolder(folderId);

      expect(found.map((d) => d.id).sort()).toEqual([inside.id, alsoInside.id].sort());
      expect(await repository.findByFolder(randomUUID())).toEqual([]);
    });

    it('replaces a document saved again under the same id', async () => {
      const repository = await create();
      const document = aDocument();
      await repository.save(document);
      await repository.save({ ...document, title: 'Renamed', content: 'v2' });

      expect(await repository.findById(document.id)).toEqual({ ...document, title: 'Renamed', content: 'v2' });
    });

    it('finds nothing for an unknown id', async () => {
      const repository = await create();

      expect(await repository.findById(randomUUID())).toBeUndefined();
    });

    it('forgets a deleted document, and deleting an unknown one is a no-op', async () => {
      const repository = await create();
      const document = aDocument();
      await repository.save(document);
      await repository.delete(document.id);

      expect(await repository.findById(document.id)).toBeUndefined();
      await expect(repository.delete(document.id)).resolves.toBeUndefined();
    });

    it('returns only the requested documents that exist', async () => {
      const repository = await create();
      const [first, second, other] = [aDocument(), aDocument(), aDocument()];
      await Promise.all([first, second, other].map((d) => repository.save(d)));

      const found = await repository.findByIds([first.id, second.id, randomUUID()]);

      expect(found.map((d) => d.id).sort()).toEqual([first.id, second.id].sort());
    });
  });
}
