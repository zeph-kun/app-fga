import { randomUUID } from 'node:crypto';
import type { Folder } from './folder.js';
import type { FolderRepository } from './folder-repository.js';

function aFolder(overrides: Partial<Folder> = {}): Folder {
  return { id: randomUUID(), ownerId: 'alice', name: 'Projects', ...overrides };
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
  });
}
