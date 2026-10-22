import type { Document } from './document.js';
import { DocumentRepository } from './document-repository.js';

/** Test adapter: same behavior as the Postgres one, no database. */
export class InMemoryDocumentRepository extends DocumentRepository {
  private readonly documents = new Map<string, Document>();

  override save(document: Document): Promise<void> {
    this.documents.set(document.id, document);
    return Promise.resolve();
  }

  override findById(id: string): Promise<Document | undefined> {
    return Promise.resolve(this.documents.get(id));
  }

  override findByIds(ids: readonly string[]): Promise<Document[]> {
    return Promise.resolve(ids.flatMap((id) => this.documents.get(id) ?? []));
  }

  override findByFolder(folderId: string): Promise<Document[]> {
    return Promise.resolve([...this.documents.values()].filter((d) => d.folderId === folderId));
  }

  override delete(id: string): Promise<void> {
    this.documents.delete(id);
    return Promise.resolve();
  }
}
