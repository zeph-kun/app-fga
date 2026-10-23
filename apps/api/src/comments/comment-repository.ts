import type { Comment } from './comment.js';

/**
 * Where Comments are stored. It knows nothing about who may read or write them:
 * that is the Authorizer's job. Deleting a Document removes its Comments in Postgres.
 */
export abstract class CommentRepository {
  abstract save(comment: Comment): Promise<void>;

  abstract findById(id: string): Promise<Comment | undefined>;

  /** The comments on a document, oldest first. */
  abstract findByDocument(documentId: string): Promise<Comment[]>;

  /** Deleting an unknown id is a no-op. */
  abstract delete(id: string): Promise<void>;
}
