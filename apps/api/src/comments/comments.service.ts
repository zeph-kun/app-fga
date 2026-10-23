import { randomUUID } from 'node:crypto';
import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Authorizer, type RolePermission, documentRef } from '../authorization/authorizer.js';
import { DocumentRepository } from '../documents/document-repository.js';
import type { Comment } from './comment.js';
import { CommentRepository } from './comment-repository.js';

export interface AddCommentInput {
  readonly text: string;
}

/**
 * Comments on a Document: everyone who can view it reads them, whoever can comment adds one,
 * and a comment is deleted by its author or by whoever can delete the Document.
 */
@Injectable()
export class CommentsService {
  constructor(
    private readonly authorizer: Authorizer,
    private readonly documents: DocumentRepository,
    private readonly comments: CommentRepository,
  ) {}

  async list(userId: string, documentId: string): Promise<Comment[]> {
    await this.require(userId, 'can_view', documentId);
    return this.comments.findByDocument(documentId);
  }

  async add(userId: string, documentId: string, { text }: AddCommentInput): Promise<Comment> {
    await this.require(userId, 'can_comment', documentId);
    const comment: Comment = { id: randomUUID(), documentId, authorId: userId, text, createdAt: new Date() };
    await this.comments.save(comment);
    return comment;
  }

  async remove(userId: string, documentId: string, commentId: string): Promise<void> {
    await this.require(userId, 'can_view', documentId);
    const comment = await this.comments.findById(commentId);
    if (!comment || comment.documentId !== documentId) throw new NotFoundException('Comment not found');
    if (comment.authorId !== userId && !(await this.authorizer.can(userId, 'can_delete', documentRef(documentId)))) {
      throw new ForbiddenException("Only the author or the document's owner can delete a comment");
    }
    await this.comments.delete(commentId);
  }

  /**
   * Users who cannot even view the document get a 404 so existence is not leaked;
   * users who can view it but lack `permission` get a 403.
   */
  private async require(userId: string, permission: RolePermission, documentId: string): Promise<void> {
    const ref = documentRef(documentId);
    if (!(await this.documents.findById(documentId)) || !(await this.authorizer.can(userId, 'can_view', ref))) {
      throw new NotFoundException('Document not found');
    }
    if (permission !== 'can_view' && !(await this.authorizer.can(userId, permission, ref))) {
      throw new ForbiddenException(`Requires ${permission}`);
    }
  }
}
