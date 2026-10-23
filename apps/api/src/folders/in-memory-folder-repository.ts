import type { Folder } from './folder.js';
import { FolderRepository } from './folder-repository.js';

/** Test adapter: same behavior as the Postgres one, no database. */
export class InMemoryFolderRepository extends FolderRepository {
  private readonly folders = new Map<string, Folder>();

  override save(folder: Folder): Promise<void> {
    this.folders.set(folder.id, folder);
    return Promise.resolve();
  }

  override findById(id: string): Promise<Folder | undefined> {
    return Promise.resolve(this.folders.get(id));
  }

  override findByIds(ids: readonly string[]): Promise<Folder[]> {
    return Promise.resolve(ids.flatMap((id) => this.folders.get(id) ?? []));
  }

  override findAll(): Promise<Folder[]> {
    return Promise.resolve([...this.folders.values()]);
  }

  override delete(id: string): Promise<void> {
    this.folders.delete(id);
    return Promise.resolve();
  }
}
