import { randomUUID } from 'node:crypto';
import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Authorizer, type Permission, type Role, folderRef, userSubject } from '../authorization/authorizer.js';
import type { Document } from '../documents/document.js';
import { DocumentRepository } from '../documents/document-repository.js';
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
import type { Folder } from './folder.js';
import { FolderRepository } from './folder-repository.js';

export type { ShareInput } from '../sharing/sharing.js';

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
    private readonly users: UserDirectory,
    private readonly teams: TeamRepository,
  ) {}

  async create(userId: string, input: CreateFolderInput): Promise<Folder> {
    const folder: Folder = { id: randomUUID(), ownerId: userId, ...input };
    await this.folders.save(folder);
    try {
      await this.authorizer.grant(userSubject(userId), 'owner', folderRef(folder.id));
    } catch (error) {
      // Without its Owner grant nobody could ever open the folder: do not keep it.
      await this.folders.delete(folder.id);
      throw error;
    }
    return folder;
  }

  async list(userId: string): Promise<FolderSummary[]> {
    const [visible, editable, owned] = await Promise.all(
      (['can_view', 'can_edit', 'can_delete'] as const).map(async (permission) =>
        this.authorizer.resourcesWhere(userId, permission, 'folder'),
      ),
    );
    const canEdit = new Set(editable);
    const canDelete = new Set(owned);
    const folders = await this.folders.findByIds(visible ?? []);
    return folders.map((folder) => ({
      ...folder,
      access: canDelete.has(folder.id) ? 'owner' : canEdit.has(folder.id) ? 'editor' : 'viewer',
    }));
  }

  async get(userId: string, id: string): Promise<FolderView> {
    const folder = await this.require(userId, 'can_view', id);
    const ref = folderRef(id);
    const access: Role = (await this.authorizer.can(userId, 'can_delete', ref))
      ? 'owner'
      : (await this.authorizer.can(userId, 'can_edit', ref))
        ? 'editor'
        : 'viewer';
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
    await this.folders.delete(id);
    await this.authorizer.revokeAll(folderRef(id));
  }

  async share(userId: string, id: string, { subject, role, expiresInHours }: ShareInput): Promise<void> {
    const folder = await this.require(userId, 'can_share', id);
    if (subject.type === 'user' && subject.id === folder.ownerId) {
      throw new ForbiddenException('The owner already has full access');
    }
    await requireSubjectExists(subject, this.users, this.teams);
    const ref = folderRef(id);
    await this.authorizer.revoke(subject, role === 'editor' ? 'viewer' : 'editor', ref);
    await this.authorizer.grant(subject, role, ref, expiresAtFrom(expiresInHours));
  }

  async shares(userId: string, id: string): Promise<ShareEntry[]> {
    await this.require(userId, 'can_share', id);
    const grants = await this.authorizer.grantsOn(folderRef(id));
    const entries = await Promise.all(
      grants
        .filter(isSharedRole)
        .map(async (g) => ({ ...g, name: await nameOfSubject(g.subject, this.teams) })),
    );
    return entries;
  }

  async unshare(userId: string, id: string, subject: ShareInput['subject']): Promise<void> {
    const folder = await this.require(userId, 'can_share', id);
    if (subject.type === 'user' && subject.id === folder.ownerId) {
      throw new ForbiddenException('The owner cannot be removed');
    }
    const ref = folderRef(id);
    await this.authorizer.revoke(subject, 'editor', ref);
    await this.authorizer.revoke(subject, 'viewer', ref);
  }

  /** Every user who can view this folder, Teams and membership resolved — for an access review. */
  async accessList(userId: string, id: string): Promise<string[]> {
    await this.require(userId, 'can_share', id);
    return this.authorizer.usersWithAccess(folderRef(id), 'can_view');
  }

  /**
   * Returns the folder if the user holds `permission` on it.
   * Users who cannot even view it get a 404 so existence is not leaked;
   * users who can view it but lack `permission` get a 403.
   */
  private async require(userId: string, permission: Permission, id: string): Promise<Folder> {
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
