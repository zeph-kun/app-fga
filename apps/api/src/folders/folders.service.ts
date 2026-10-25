import { ActivityLog } from '../activity-log/activity-log.js';
import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Authorizer, type RolePermission, type Role, folderRef } from '../authorization/authorizer.js';
import type { Document } from '../documents/document.js';
import { DocumentRepository } from '../documents/document-repository.js';
import { ResourceLifecycle } from '../lifecycle/resource-lifecycle.js';
import { Sharing, type ShareEntry, type ShareInput } from '../sharing/sharing.js';
import type { Folder } from './folder.js';
import { FolderRepository } from './folder-repository.js';


/** How many levels of Folders there can be: a Folder at the top is level 1 (see ADR 0009). */
export const MAX_FOLDER_DEPTH = 5;

/** A Folder as named in a breadcrumb. */
export interface FolderLink {
  readonly id: string;
  readonly name: string;
}

/**
 * A folder together with the strongest access the requesting user holds on it, the documents and
 * Folders directly in it, and the Folders above it that they can see (the highest first). Its
 * `parentId` is null when the user cannot see the parent: its name and id are not theirs to know.
 */
export interface FolderView extends Folder {
  readonly access: Role;
  readonly documents: Document[];
  readonly folders: Folder[];
  readonly breadcrumb: FolderLink[];
}

/** A folder together with the strongest access the requesting user holds on it. */
export interface FolderSummary extends Folder {
  readonly access: Role;
}

export interface CreateFolderInput {
  readonly name: string;
  /** The Folder to create it in, or none for the top. */
  readonly parentId?: string | null;
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
    private readonly activity: ActivityLog,
  ) {}

  async create(userId: string, { name, parentId = null }: CreateFolderInput): Promise<Folder> {
    if (parentId !== null) {
      await this.require(userId, 'can_edit', parentId);
      if ((await this.levelOf(parentId)) + 1 > MAX_FOLDER_DEPTH) throw tooDeep();
    }
    const folder: Folder = { id: randomUUID(), ownerId: userId, name, parentId };
    await this.lifecycle.createFolder(folder);
    return folder;
  }

  async list(userId: string): Promise<FolderSummary[]> {
    const roles = await this.authorizer.rolesOn(userId, 'folder');
    const folders = await this.folders.findByIds([...roles.keys()]);
    return folders.map((folder) => ({
      ...folder,
      // A parent the user cannot see is not theirs to know: the Folder shows at the top.
      parentId: folder.parentId !== null && roles.has(folder.parentId) ? folder.parentId : null,
      access: roles.get(folder.id) ?? 'viewer',
    }));
  }

  async get(userId: string, id: string): Promise<FolderView> {
    const folder = await this.require(userId, 'can_view', id);
    const ref = folderRef(id);
    const access: Role = (await this.authorizer.accessOn(userId, ref)) ?? 'viewer';
    const inside = await this.documents.findByFolder(id);
    const visible = new Set(await this.authorizer.resourcesWhere(userId, 'can_view', 'document'));
    const breadcrumb = await this.visibleAncestors(userId, folder);
    return {
      ...folder,
      parentId: breadcrumb.length > 0 ? folder.parentId : null,
      access,
      documents: inside.filter((d) => visible.has(d.id)),
      // Whoever sees a Folder sees what is in it: roles only add up.
      folders: await this.folders.findByParent(id),
      breadcrumb,
    };
  }

  async rename(userId: string, id: string, { name }: CreateFolderInput): Promise<Folder> {
    const current = await this.require(userId, 'can_edit', id);
    const renamed: Folder = { ...current, name };
    await this.folders.save(renamed);
    return renamed;
  }

  /**
   * Puts the Folder in another Folder (or at the top with `null`), with everything in it. Its roles
   * follow, so only its Owner may do it, and only into a Folder they can edit. A Folder cannot go
   * into itself or into one of its own, nor make the tree deeper than 5 levels.
   */
  async move(userId: string, id: string, parentId: string | null): Promise<Folder> {
    const current = await this.require(userId, 'can_share', id);
    if (parentId === current.parentId) return current;
    if (parentId !== null) {
      await this.require(userId, 'can_edit', parentId);
      if (parentId === id || (await this.isWithin(parentId, id))) {
        throw new BadRequestException('A folder cannot be moved into itself or into one of its own folders');
      }
      if ((await this.levelOf(parentId)) + (await this.heightOf(id)) > MAX_FOLDER_DEPTH) throw tooDeep();
    }
    const moved = await this.lifecycle.moveFolder(current, parentId);
    await this.activity.record(userId, { type: 'folder', id }, {
      kind: 'moved',
      from: await this.linkTo(current.parentId),
      to: await this.linkTo(parentId),
    });
    return moved;
  }

  /** Only an empty folder can be deleted: moving or deleting what is in it first is the user's call. */
  async remove(userId: string, id: string): Promise<void> {
    await this.require(userId, 'can_delete', id);
    if ((await this.documents.findByFolder(id)).length > 0) {
      throw new ConflictException('The folder still contains documents');
    }
    if ((await this.folders.findByParent(id)).length > 0) {
      throw new ConflictException('The folder still contains folders');
    }
    await this.lifecycle.deleteFolder(id);
  }

  async share(userId: string, id: string, input: ShareInput): Promise<void> {
    const folder = await this.require(userId, 'can_share', id);
    const { subject, name, role, expiresAt } = await this.sharing.share(folderRef(id), folder.ownerId, input);
    await this.activity.record(userId, { type: 'folder', id }, {
      kind: 'shared',
      subject: { type: subject.type, id: subject.id, name },
      role,
      ...(expiresAt && { expiresAt }),
    });
  }

  async shares(userId: string, id: string): Promise<ShareEntry[]> {
    await this.require(userId, 'can_share', id);
    return this.sharing.shares(folderRef(id));
  }

  async unshare(userId: string, id: string, subject: ShareInput['subject']): Promise<void> {
    const folder = await this.require(userId, 'can_share', id);
    const name = await this.sharing.unshare(folderRef(id), folder.ownerId, subject);
    await this.activity.record(userId, { type: 'folder', id }, {
      kind: 'unshared',
      subject: { type: subject.type, id: subject.id, name },
    });
  }

  /** Every user who can view this folder, Teams and membership resolved — for an access review. */
  async accessList(userId: string, id: string): Promise<string[]> {
    await this.require(userId, 'can_share', id);
    return this.sharing.accessList(folderRef(id));
  }

  /** The level of a Folder: 1 at the top. Stops counting past the limit, so a loop in the data cannot hang it. */
  private async levelOf(id: string): Promise<number> {
    let level = 1;
    for (let current = (await this.folders.findById(id))?.parentId; current && level <= MAX_FOLDER_DEPTH; level++) {
      current = (await this.folders.findById(current))?.parentId;
    }
    return level;
  }

  /** How many levels a Folder takes with everything below it: 1 for one with no Folder in it. */
  private async heightOf(id: string, from = 1): Promise<number> {
    if (from > MAX_FOLDER_DEPTH) return from;
    const children = await this.folders.findByParent(id);
    const heights = await Promise.all(children.map((child) => this.heightOf(child.id, from + 1)));
    return 1 + Math.max(0, ...heights);
  }

  /** Whether `id` is inside the Folder `ancestorId`, at any depth. */
  private async isWithin(id: string, ancestorId: string): Promise<boolean> {
    let current = (await this.folders.findById(id))?.parentId;
    for (let hops = 0; current && hops <= MAX_FOLDER_DEPTH; hops++) {
      if (current === ancestorId) return true;
      current = (await this.folders.findById(current))?.parentId;
    }
    return false;
  }

  /** The Folders above `folder` that the user can see, the highest first: where a breadcrumb stops. */
  private async visibleAncestors(userId: string, folder: Folder): Promise<FolderLink[]> {
    const links: FolderLink[] = [];
    for (let id = folder.parentId, hops = 0; id !== null && hops <= MAX_FOLDER_DEPTH; hops++) {
      const parent = await this.folders.findById(id);
      if (!parent || !(await this.authorizer.can(userId, 'can_view', folderRef(id)))) break;
      links.unshift({ id: parent.id, name: parent.name });
      id = parent.parentId;
    }
    return links;
  }

  private async linkTo(id: string | null): Promise<FolderLink | null> {
    const folder = id === null ? undefined : await this.folders.findById(id);
    return folder ? { id: folder.id, name: folder.name } : null;
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

const tooDeep = () => new BadRequestException(`Folders nest ${MAX_FOLDER_DEPTH} levels deep at most`);
