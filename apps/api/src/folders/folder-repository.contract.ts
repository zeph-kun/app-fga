import { randomUUID } from 'node:crypto';
import type { Folder } from './folder.js';
import type { FolderRepository } from './folder-repository.js';

function aFolder(overrides: Partial<Folder> = {}): Folder {
  return { id: randomUUID(), ownerId: 'alice', name: 'Projects', parentId: null, ...overrides };
}

/** Behavior every FolderRepository adapter must have; see document-repository.contract.ts. */
export function folderRepositoryContract(
  adapter: string,
  create: () => FolderRepository | Promise<FolderRepository>,
): void {
  describe(`FolderRepository (${adapter})`, () => {
    it('returns a saved folder by id, and nothing for an unknown id', async () => {
      const repository = await create();
      const folder = aFolder();
      await repository.save(folder);

      expect(await repository.findById(folder.id)).toEqual(folder);
      expect(await repository.findById(randomUUID())).toBeUndefined();
    });

    it('lists every stored folder, and no longer one that was deleted', async () => {
      const repository = await create();
      const [kept, deleted] = [aFolder(), aFolder()];
      await repository.save(kept);
      await repository.save(deleted);
      await repository.delete(deleted.id);

      const all = await repository.findAll();

      expect(all).toContainEqual(kept);
      expect(all.map((f) => f.id)).not.toContain(deleted.id);
    });

    it('replaces a folder saved again under the same id', async () => {
      const repository = await create();
      const folder = aFolder();
      await repository.save(folder);
      await repository.save({ ...folder, name: 'Archive' });

      expect(await repository.findById(folder.id)).toEqual({ ...folder, name: 'Archive' });
    });

    it('returns only the requested folders that exist', async () => {
      const repository = await create();
      const [first, second, other] = [aFolder(), aFolder(), aFolder()];
      await Promise.all([first, second, other].map((f) => repository.save(f)));

      const found = await repository.findByIds([first.id, second.id, randomUUID()]);

      expect(found.map((f) => f.id).sort()).toEqual([first.id, second.id].sort());
    });

    it('forgets a deleted folder, and deleting an unknown one is a no-op', async () => {
      const repository = await create();
      const folder = aFolder();
      await repository.save(folder);
      await repository.delete(folder.id);

      expect(await repository.findById(folder.id)).toBeUndefined();
      await expect(repository.delete(folder.id)).resolves.toBeUndefined();
    });

    it('keeps the parent of a folder, and a folder moved out of it', async () => {
      const repository = await create();
      const parent = aFolder();
      await repository.save(parent);
      const child = aFolder({ parentId: parent.id });
      await repository.save(child);

      expect(await repository.findById(child.id)).toEqual(child);

      await repository.save({ ...child, parentId: null });

      expect(await repository.findById(child.id)).toEqual({ ...child, parentId: null });
    });

    it('lists the folders directly in a folder, and not those further down', async () => {
      const repository = await create();
      const parent = aFolder();
      await repository.save(parent);
      const [first, second] = [aFolder({ parentId: parent.id }), aFolder({ parentId: parent.id })];
      await repository.save(first);
      await repository.save(second);
      await repository.save(aFolder({ parentId: first.id }));
      await repository.save(aFolder());

      const found = await repository.findByParent(parent.id);

      expect(found.map((f) => f.id).sort()).toEqual([first.id, second.id].sort());
      expect(await repository.findByParent(second.id)).toEqual([]);
    });
  });
}
