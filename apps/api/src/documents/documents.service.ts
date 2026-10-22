import { randomUUID } from 'node:crypto';
import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  Authorizer,
  type Permission,
  type Role,
  documentRef,
  folderRef,
  userSubject,
} from '../authorization/authorizer.js';
import { FolderRepository } from '../folders/folder-repository.js';
import {
  expiresAtFrom,
  isSharedRole,
  nameOfSubject,
  requireSubjectExists,
  type ShareEntry,
  type ShareInput,
} from '../sharing/sharing.js';
import { TeamRepository } from '../teams/team-repository.js';
import { UserDirectory } from '../users/user-directory.js';
import type { Document } from './document.js';
import { DocumentRepository } from './document-repository.js';

export type { Document } from './document.js';
export type { ShareInput } from '../sharing/sharing.js';

/** A document together with the strongest access the requesting user holds on it. */
export interface DocumentView extends Document {
  readonly access: Role;
}

export interface CreateDocumentInput {
  readonly title: string;
  readonly content: string;
  /** The Folder to create the Document in; omitted or null for the root. */
  readonly folderId?: string | null;
}

export interface UpdateDocumentInput {
  readonly title?: string;
  readonly content?: string;
}

/**
 * Documents and the rules about who can act on them.
 * Storage is delegated to the DocumentRepository, authorization to the Authorizer.
 */
@Injectable()
export class DocumentsService {
  constructor(
    private readonly authorizer: Authorizer,
    private readonly repository: DocumentRepository,
    private readonly folders: FolderRepository,
    private readonly users: UserDirectory,
    private readonly teams: TeamRepository,
  ) {}

  async create(userId: string, { folderId = null, ...input }: CreateDocumentInput): Promise<Document> {
    if (folderId !== null) await this.requireFolder(userId, 'can_edit', folderId);
    const document: Document = { id: randomUUID(), ownerId: userId, folderId, ...input };
    await this.repository.save(document);
    try {
      await this.authorizer.grant(userSubject(userId), 'owner', documentRef(document.id));
      if (folderId !== null) await this.authorizer.setParent(document.id, folderId);
    } catch (error) {
      // Without its Owner grant nobody could ever open the document: do not keep it.
      await this.repository.delete(document.id);
      // Best effort: the original error is the one worth reporting.
      await this.authorizer.revokeAll(documentRef(document.id)).catch(() => undefined);
      throw error;
    }
    return document;
  }

  async list(userId: string): Promise<DocumentView[]> {
    const roles = await this.authorizer.rolesOn(userId, 'document');
    const documents = await this.repository.findByIds([...roles.keys()]);
    return documents.map((document) => ({ ...document, access: roles.get(document.id) ?? 'viewer' }));
  }

  async get(userId: string, id: string): Promise<DocumentView> {
    const document = await this.require(userId, 'can_view', id);
    const ref = documentRef(id);
    const access: Role = (await this.authorizer.accessOn(userId, ref)) ?? 'viewer';
    return { ...document, access };
  }

  async update(userId: string, id: string, patch: UpdateDocumentInput): Promise<Document> {
    const current = await this.require(userId, 'can_edit', id);
    const updated: Document = {
      ...current,
      ...(patch.title !== undefined && { title: patch.title }),
      ...(patch.content !== undefined && { content: patch.content }),
    };
    await this.repository.save(updated);
    return updated;
  }

  /**
   * Moves the document into a folder (or out of any folder with `null`). Its access follows:
   * the folder's roles replace those of the previous folder, so only the owner may do it,
   * and only into a folder they can edit.
   */
  async move(userId: string, id: string, folderId: string | null): Promise<Document> {
    const current = await this.require(userId, 'can_share', id);
    if (folderId !== null) await this.requireFolder(userId, 'can_edit', folderId);
    const moved: Document = { ...current, folderId };
    await this.repository.save(moved);
    try {
      await this.authorizer.setParent(id, folderId);
    } catch (error) {
      await this.repository.save(current);
      throw error;
    }
    return moved;
  }

  async remove(userId: string, id: string): Promise<void> {
    await this.require(userId, 'can_delete', id);
    await this.repository.delete(id);
    await this.authorizer.revokeAll(documentRef(id));
  }

  async share(userId: string, id: string, { subject, role, expiresInHours }: ShareInput): Promise<void> {
    const document = await this.require(userId, 'can_share', id);
    if (subject.type === 'user' && subject.id === document.ownerId) {
      throw new ForbiddenException('The owner already has full access');
    }
    await requireSubjectExists(subject, this.users, this.teams);
    const ref = documentRef(id);
    await this.authorizer.revoke(subject, role === 'editor' ? 'viewer' : 'editor', ref);
    await this.authorizer.grant(subject, role, ref, expiresAtFrom(expiresInHours));
  }

  async shares(userId: string, id: string): Promise<ShareEntry[]> {
    await this.require(userId, 'can_share', id);
    const grants = await this.authorizer.grantsOn(documentRef(id));
    const entries = await Promise.all(
      grants
        .filter(isSharedRole)
        .map(async (g) => ({ ...g, name: await nameOfSubject(g.subject, this.teams) })),
    );
    return entries;
  }

  async unshare(userId: string, id: string, subject: ShareInput['subject']): Promise<void> {
    const document = await this.require(userId, 'can_share', id);
    if (subject.type === 'user' && subject.id === document.ownerId) {
      throw new ForbiddenException('The owner cannot be removed');
    }
    const ref = documentRef(id);
    await this.authorizer.revoke(subject, 'editor', ref);
    await this.authorizer.revoke(subject, 'viewer', ref);
  }

  /** Every user who can view this document, Teams and folder inheritance resolved — for an access review. */
  async accessList(userId: string, id: string): Promise<string[]> {
    await this.require(userId, 'can_share', id);
    return this.authorizer.usersWithAccess(documentRef(id), 'can_view');
  }

  /** Same 404/403 rules as `require`, for the Folder a Document is created in or moved to. */
  private async requireFolder(userId: string, permission: Permission, id: string): Promise<void> {
    const ref = folderRef(id);
    if (!(await this.folders.findById(id)) || !(await this.authorizer.can(userId, 'can_view', ref))) {
      throw new NotFoundException('Folder not found');
    }
    if (permission !== 'can_view' && !(await this.authorizer.can(userId, permission, ref))) {
      throw new ForbiddenException(`Requires ${permission} on the folder`);
    }
  }

  /**
   * Returns the document if the user holds `permission` on it.
   * Users who cannot even view it get a 404 so existence is not leaked;
   * users who can view it but lack `permission` get a 403.
   */
  private async require(userId: string, permission: Permission, id: string): Promise<Document> {
    const document = await this.repository.findById(id);
    const ref = documentRef(id);
    if (!document || !(await this.authorizer.can(userId, 'can_view', ref))) {
      throw new NotFoundException('Document not found');
    }
    if (permission !== 'can_view' && !(await this.authorizer.can(userId, permission, ref))) {
      throw new ForbiddenException(`Requires ${permission}`);
    }
    return document;
  }
}
