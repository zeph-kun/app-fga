import type { ShareLink } from './share-link.js';
import { ShareLinkRepository } from './share-link-repository.js';

/** Test adapter: same behavior as the Postgres one, no database (and no cascade from Documents and Folders). */
export class InMemoryShareLinkRepository extends ShareLinkRepository {
  private readonly links = new Map<string, ShareLink>();

  override save(link: ShareLink): Promise<void> {
    this.links.set(link.id, link);
    return Promise.resolve();
  }

  override findById(id: string): Promise<ShareLink | undefined> {
    return Promise.resolve(this.links.get(id));
  }

  override findByTokenHash(tokenHash: string): Promise<ShareLink | undefined> {
    return Promise.resolve([...this.links.values()].find((l) => l.tokenHash === tokenHash));
  }

  override findByResource({ type, id }: ShareLink['resource']): Promise<ShareLink[]> {
    const found = [...this.links.values()].filter((l) => l.resource.type === type && l.resource.id === id);
    return Promise.resolve(found.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()));
  }

  override delete(id: string): Promise<void> {
    this.links.delete(id);
    return Promise.resolve();
  }
}
