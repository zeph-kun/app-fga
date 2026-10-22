import type { Folder } from './folder.js';

/**
 * Where Folders are stored. Like DocumentRepository, it knows nothing about who may
 * access them: that is the Authorizer's job.
 */
export abstract class FolderRepository {
  /** Inserts the folder, or replaces the one with the same id. */
  abstract save(folder: Folder): Promise<void>;

  abstract findById(id: string): Promise<Folder | undefined>;

  /** The folders that exist among `ids`; unknown ids are skipped. Order is not guaranteed. */
  abstract findByIds(ids: readonly string[]): Promise<Folder[]>;

  /** Deleting an unknown id is a no-op. */
  abstract delete(id: string): Promise<void>;
}
