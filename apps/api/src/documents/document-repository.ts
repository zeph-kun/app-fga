import type { Document } from './document.js';

/**
 * Where Documents are stored. It knows nothing about who may access them:
 * that is the Authorizer's job.
 */
export abstract class DocumentRepository {
  /** Inserts the document, or replaces the one with the same id. */
  abstract save(document: Document): Promise<void>;

  abstract findById(id: string): Promise<Document | undefined>;

  /** The documents that exist among `ids`; unknown ids are skipped. Order is not guaranteed. */
  abstract findByIds(ids: readonly string[]): Promise<Document[]>;

  abstract findByFolder(folderId: string): Promise<Document[]>;

  /** Deleting an unknown id is a no-op. */
  abstract delete(id: string): Promise<void>;
}
