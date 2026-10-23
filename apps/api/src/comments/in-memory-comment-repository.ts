import type { Comment } from './comment.js';
import { CommentRepository } from './comment-repository.js';

/** Test adapter: same behavior as the Postgres one, no database (and no cascade from Documents). */
export class InMemoryCommentRepository extends CommentRepository {
  private readonly comments = new Map<string, Comment>();

  override save(comment: Comment): Promise<void> {
    this.comments.set(comment.id, comment);
    return Promise.resolve();
  }

  override findById(id: string): Promise<Comment | undefined> {
    return Promise.resolve(this.comments.get(id));
  }

  override findByDocument(documentId: string): Promise<Comment[]> {
    const found = [...this.comments.values()].filter((c) => c.documentId === documentId);
    return Promise.resolve(found.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()));
  }

  override delete(id: string): Promise<void> {
    this.comments.delete(id);
    return Promise.resolve();
  }
}
