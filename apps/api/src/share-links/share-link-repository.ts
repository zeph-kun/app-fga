import type { ShareLink } from './share-link.js';

/**
 * Where Share links are stored. It knows nothing about who may create or use them: that is
 * `ShareLinks`' job. Deleting a Document or Folder removes its links in Postgres.
 */
export abstract class ShareLinkRepository {
  abstract save(link: ShareLink): Promise<void>;

  abstract findById(id: string): Promise<ShareLink | undefined>;

  abstract findByTokenHash(tokenHash: string): Promise<ShareLink | undefined>;

  /** The links on a Document or Folder, oldest first. */
  abstract findByResource(resource: ShareLink['resource']): Promise<ShareLink[]>;

  /** Deleting an unknown id is a no-op. */
  abstract delete(id: string): Promise<void>;
}
