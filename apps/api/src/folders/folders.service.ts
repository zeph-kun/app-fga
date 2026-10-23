import { randomUUID } from 'node:crypto';
import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Authorizer, type RolePermission, type Role, folderRef } from '../authorization/authorizer.js';
import type { Document } from '../documents/document.js';
import { DocumentRepository } from '../documents/document-repository.js';
import { ResourceLifecycle } from '../lifecycle/resource-lifecycle.js';
import { Sharing, type ShareEntry, type ShareInput } from '../sharing/sharing.js';
import type { Folder } from './folder.js';
import { FolderRepository } from './folder-repository.js';


/** A folder together with the strongest access the requesting user holds on it, and the documents they can see in it. */
export interface FolderView extends Folder {
  readonly access: Role;
  readonly documents: Document[];
}

/** A folder together with the strongest access the requesting user holds on it. */
export interface FolderSummary extends Folder {
  readonly access: Role;
}

export interface CreateFolderInput {
  readonly name: string;
}

/**
 * Folders and the rules about who can act on them. A role given on a folder also
 * applies to the documents in it (see the Authorizer).
 */
@Injectable()
export class FoldersService {
  constructor(
    private readonly authorizer: Authorizer,
    private readonly folders: FolderRepository,
    private readonly documents: DocumentRepository,
    private readonly sharing: Sharing,
    private readonly lifecycle: ResourceLifecycle,
  ) {}

  async create(userId: string, input: CreateFolderInput): Promise<Folder> {
    const folder: Folder = { id: randomUUID(), ownerId: userId, ...input };
    await this.lifecycle.createFolder(folder);
    return folder;
  }

  async list(userId: string): Promise<FolderSummary[]> {
    const roles = await this.authorizer.rolesOn(userId, 'folder');
    const folders = await this.folders.findByIds([...roles.keys()]);
    return folders.map((folder) => ({ ...folder, access: roles.get(folder.id) ?? 'viewer' }));
  }

  async get(userId: string, id: string): Promise<FolderView> {
    const folder = await this.require(userId, 'can_view', id);
    const ref = folderRef(id);
    const access: Role = (await this.authorizer.accessOn(userId, ref)) ?? 'viewer';
    const inside = await this.documents.findByFolder(id);
    const visible = new Set(await this.authorizer.resourcesWhere(userId, 'can_view', 'document'));
    return { ...folder, access, documents: inside.filter((d) => visible.has(d.id)) };
  }

  async rename(userId: string, id: string, { name }: CreateFolderInput): Promise<Folder> {
    const current = await this.require(userId, 'can_edit', id);
    const renamed: Folder = { ...current, name };
    await this.folders.save(renamed);
    return renamed;
  }

  /** Only an empty folder can be deleted: moving or deleting its documents first is the user's call. */
  async remove(userId: string, id: string): Promise<void> {
    await this.require(userId, 'can_delete', id);
    if ((await this.documents.findByFolder(id)).length > 0) {
      throw new ConflictException('The folder still contains documents');
    }
    await this.lifecycle.deleteFolder(id);
  }

  async share(userId: string, id: string, input: ShareInput): Promise<void> {
    const folder = await this.require(userId, 'can_share', id);
    await this.sharing.share(folderRef(id), folder.ownerId, input);
  }

  async shares(userId: string, id: string): Promise<ShareEntry[]> {
    await this.require(userId, 'can_share', id);
    return this.sharing.shares(folderRef(id));
  }

  async unshare(userId: string, id: string, subject: ShareInput['subject']): Promise<void> {
    const folder = await this.require(userId, 'can_share', id);
    await this.sharing.unshare(folderRef(id), folder.ownerId, subject);
  }

  /** Every user who can view this folder, Teams and membership resolved — for an access review. */
  async accessList(userId: string, id: string): Promise<string[]> {
    await this.require(userId, 'can_share', id);
    return this.sharing.accessList(folderRef(id));
  }

  /**
   * Returns the folder if the user holds `permission` on it.
   * Users who cannot even view it get a 404 so existence is not leaked;
   * users who can view it but lack `permission` get a 403.
   */
  private async require(userId: string, permission: RolePermission, id: string): Promise<Folder> {
    const folder = await this.folders.findById(id);
    const ref = folderRef(id);
    if (!folder || !(await this.authorizer.can(userId, 'can_view', ref))) {
      throw new NotFoundException('Folder not found');
    }
    if (permission !== 'can_view' && !(await this.authorizer.can(userId, permission, ref))) {
      throw new ForbiddenException(`Requires ${permission}`);
    }
    return folder;
  }
}
