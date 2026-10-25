import { ActivityLog } from '../activity-log/activity-log.js';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Authorizer, type Role, type SharedRole, documentRef, folderRef, userSubject } from '../authorization/authorizer.js';
import { DocumentRepository } from '../documents/document-repository.js';
import { FolderRepository } from '../folders/folder-repository.js';
import { Sharing } from '../sharing/sharing.js';
import type { ShareLink } from './share-link.js';
import { ShareLinkRepository } from './share-link-repository.js';

export type LinkedResource = ShareLink['resource'];

/** What an Owner chooses for a new link. */
export interface ShareLinkInput {
  readonly role: SharedRole;
  /** Omitted means the link never expires. */
  readonly expiresInHours?: number;
}

/** What someone sees before accepting a link. */
export interface ShareLinkPreview {
  readonly resource: LinkedResource & { readonly name: string };
  readonly role: SharedRole;
  readonly invitedBy: string;
  readonly expiresAt?: Date;
}

/** A link as shown to the Owner: never the token or its hash, only enough to tell links apart. */
export type ShareLinkEntry = Omit<ShareLink, 'resource' | 'tokenHash'>;

const STRENGTH: Record<Role, number> = { viewer: 1, commenter: 2, editor: 3, owner: 4 };

const hashOf = (token: string): string => createHash('sha256').update(token).digest('hex');

/**
 * Creating, listing, revoking and accepting Share links (see ADR 0007). A link gives nothing
 * until a signed-in User accepts it, which then gives them an ordinary Grant through `Sharing`.
 */
@Injectable()
export class ShareLinks {
  constructor(
    private readonly authorizer: Authorizer,
    private readonly documents: DocumentRepository,
    private readonly folders: FolderRepository,
    private readonly links: ShareLinkRepository,
    private readonly sharing: Sharing,
    private readonly activity: ActivityLog,
  ) {}

  /** Returns the token, which is not stored and cannot be read again. */
  async create(userId: string, resource: LinkedResource, input: ShareLinkInput): Promise<{ token: string }> {
    await this.requireShareable(userId, resource);
    const token = randomBytes(32).toString('base64url');
    const link: ShareLink = {
      id: randomUUID(),
      resource,
      role: input.role,
      tokenHash: hashOf(token),
      tokenSuffix: token.slice(-4),
      createdBy: userId,
      createdAt: new Date(),
      ...(input.expiresInHours !== undefined && { expiresAt: new Date(Date.now() + input.expiresInHours * 3_600_000) }),
    };
    await this.links.save(link);
    await this.activity.record(userId, resource, {
      kind: 'link-created',
      role: link.role,
      tokenSuffix: link.tokenSuffix,
      ...(link.expiresAt && { expiresAt: link.expiresAt }),
    });
    return { token };
  }

  /** The links on a resource, oldest first, expired ones included so they can be revoked. */
  async list(userId: string, resource: LinkedResource): Promise<ShareLinkEntry[]> {
    await this.requireShareable(userId, resource);
    const links = await this.links.findByResource(resource);
    return links.map(({ id, role, tokenSuffix, createdBy, createdAt, expiresAt }) => ({
      id,
      role,
      tokenSuffix,
      createdBy,
      createdAt,
      ...(expiresAt && { expiresAt }),
    }));
  }

  /** Revokes the link. The Grants it already gave stay: revoke them in the Shares list. */
  async revoke(userId: string, resource: LinkedResource, linkId: string): Promise<void> {
    await this.requireShareable(userId, resource);
    const link = await this.links.findById(linkId);
    if (link?.resource.type !== resource.type || link.resource.id !== resource.id) throw new NotFoundException();
    await this.links.delete(linkId);
    await this.activity.record(userId, resource, {
      kind: 'link-revoked',
      role: link.role,
      tokenSuffix: link.tokenSuffix,
      ...(link.expiresAt && { expiresAt: link.expiresAt }),
    });
  }

  /** What the link is for, without giving anything. 404 for a link that is unknown, expired or revoked. */
  async preview(token: string): Promise<ShareLinkPreview> {
    const link = await this.usable(token);
    const { name } = await this.describe(link.resource);
    return {
      resource: { ...link.resource, name },
      role: link.role,
      invitedBy: link.createdBy,
      ...(link.expiresAt && { expiresAt: link.expiresAt }),
    };
  }

  /** Gives `userId` the role of the link, and returns the resource they now can open. */
  async redeem(userId: string, token: string): Promise<LinkedResource> {
    const link = await this.usable(token);
    if (await this.alreadyCovers(userId, link)) return link.resource;
    const { ownerId } = await this.describe(link.resource);
    await this.sharing.share(refOf(link.resource), ownerId, {
      subject: userSubject(userId),
      role: link.role,
      expiresAt: link.expiresAt,
    });
    // Not recorded as a Share: that would note the same acceptance twice.
    await this.activity.record(userId, link.resource, {
      kind: 'link-accepted',
      role: link.role,
      tokenSuffix: link.tokenSuffix,
    });
    return link.resource;
  }

  /** 404 for a User who cannot see the resource (so its existence is not leaked), 403 for one who cannot share it. */
  private async requireShareable(userId: string, resource: LinkedResource): Promise<void> {
    const ref = refOf(resource);
    if (!(await this.authorizer.can(userId, 'can_view', ref))) throw new NotFoundException();
    if (!(await this.authorizer.can(userId, 'can_share', ref))) throw new ForbiddenException();
  }

  /** Accepting never lowers or shortens access: nothing to give when the User has the role for as long. */
  private async alreadyCovers(userId: string, link: ShareLink): Promise<boolean> {
    const resource = refOf(link.resource);
    const held = await this.authorizer.accessOn(userId, resource);
    if (held === null || STRENGTH[held] < STRENGTH[link.role]) return false;
    const ends = await this.authorizer.expiryOn(userId, resource);
    return ends === null || (link.expiresAt !== undefined && ends.getTime() >= link.expiresAt.getTime());
  }

  /** The link, or 404 whether the token is unknown, expired or revoked (so which one it was is not leaked). */
  private async usable(token: string): Promise<ShareLink> {
    const link = await this.links.findByTokenHash(hashOf(token));
    if (!link || (link.expiresAt && link.expiresAt.getTime() <= Date.now())) throw new NotFoundException();
    return link;
  }

  private async describe({ type, id }: LinkedResource): Promise<{ name: string; ownerId: string }> {
    if (type === 'document') {
      const document = await this.documents.findById(id);
      if (!document) throw new NotFoundException();
      return { name: document.title, ownerId: document.ownerId };
    }
    const folder = await this.folders.findById(id);
    if (!folder) throw new NotFoundException();
    return { name: folder.name, ownerId: folder.ownerId };
  }
}

const refOf = ({ type, id }: LinkedResource) => (type === 'document' ? documentRef(id) : folderRef(id));
