import { randomUUID } from 'node:crypto';
import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Authorizer, type RolePermission, type Role, documentRef, folderRef } from '../authorization/authorizer.js';
import { FolderRepository } from '../folders/folder-repository.js';
import { ResourceLifecycle } from '../lifecycle/resource-lifecycle.js';
import { Sharing, type ShareEntry, type ShareInput } from '../sharing/sharing.js';
import type { Document } from './document.js';
import { DocumentRepository } from './document-repository.js';

export type { Document } from './document.js';

/** A document together with the strongest access the requesting user holds on it. */
export interface DocumentView extends Document {
  readonly access: Role;
  /** When the requesting user's access ends; absent if it never does. */
  readonly accessExpiresAt?: Date;
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
    private readonly sharing: Sharing,
    private readonly lifecycle: ResourceLifecycle,
  ) {}

  async create(userId: string, { folderId = null, ...input }: CreateDocumentInput): Promise<Document> {
    if (folderId !== null) await this.requireFolder(userId, 'can_edit', folderId);
    const document: Document = { id: randomUUID(), ownerId: userId, folderId, ...input };
    await this.lifecycle.createDocument(document);
    return document;
  }

  async list(userId: string): Promise<DocumentView[]> {
    const roles = await this.authorizer.rolesOn(userId, 'document');
    const documents = await this.repository.findByIds([...roles.keys()]);
    return Promise.all(
      documents.map(async (document) => {
        const access = roles.get(document.id) ?? 'viewer';
        return { ...document, access, ...(await this.expiryFor(userId, document.id, access)) };
      }),
    );
  }

  async get(userId: string, id: string): Promise<DocumentView> {
    const document = await this.require(userId, 'can_view', id);
    const ref = documentRef(id);
    const access: Role = (await this.authorizer.accessOn(userId, ref)) ?? 'viewer';
    return { ...document, access, ...(await this.expiryFor(userId, id, access)) };
  }

  /** Owners never lose access, so skip the lookup for them. */
  private async expiryFor(userId: string, id: string, access: Role): Promise<{ accessExpiresAt?: Date }> {
    if (access === 'owner') return {};
    const accessExpiresAt = await this.authorizer.expiryOn(userId, documentRef(id));
    return accessExpiresAt ? { accessExpiresAt } : {};
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
    return this.lifecycle.moveDocument(current, folderId);
  }

  async remove(userId: string, id: string): Promise<void> {
    await this.require(userId, 'can_delete', id);
    await this.lifecycle.deleteDocument(id);
  }

  async share(userId: string, id: string, input: ShareInput): Promise<void> {
    const document = await this.require(userId, 'can_share', id);
    await this.sharing.share(documentRef(id), document.ownerId, input);
  }

  async shares(userId: string, id: string): Promise<ShareEntry[]> {
    await this.require(userId, 'can_share', id);
    return this.sharing.shares(documentRef(id));
  }

  async unshare(userId: string, id: string, subject: ShareInput['subject']): Promise<void> {
    const document = await this.require(userId, 'can_share', id);
    await this.sharing.unshare(documentRef(id), document.ownerId, subject);
  }

  /** Every user who can view this document, Teams and folder inheritance resolved — for an access review. */
  async accessList(userId: string, id: string): Promise<string[]> {
    await this.require(userId, 'can_share', id);
    return this.sharing.accessList(documentRef(id));
  }

  /** Same 404/403 rules as `require`, for the Folder a Document is created in or moved to. */
  private async requireFolder(userId: string, permission: RolePermission, id: string): Promise<void> {
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
  private async require(userId: string, permission: RolePermission, id: string): Promise<Document> {
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
