import type { Membership } from './membership.js';

/** What a User or Team is given on a resource. Roles are hierarchical: an owner is also an editor, and an editor is also a viewer. */
export type Role = 'owner' | 'editor' | 'viewer';

/** What the API asks about. Each permission is held by a role and the roles above it. */
export type RolePermission = 'can_view' | 'can_edit' | 'can_delete' | 'can_share';

/** What the API asks about: a role-based permission on a Document or Folder, or what only Managers may do. */
export type Permission = RolePermission | 'can_create_team';

/** `organization` is the single object that holds what applies to the whole app, such as who may create Teams. */
export type ResourceType = 'document' | 'folder' | 'organization';

export interface Resource {
  readonly type: ResourceType;
  readonly id: string;
}

export const documentRef = (id: string): Resource => ({ type: 'document', id });
export const folderRef = (id: string): Resource => ({ type: 'folder', id });
export const organizationRef = (): Resource => ({ type: 'organization', id: 'main' });

/** Who a role is given to: a single User, or every member of a Team. */
export type Subject = { readonly type: 'user'; readonly id: string } | { readonly type: 'team'; readonly id: string };

export const userSubject = (id: string): Subject => ({ type: 'user', id });
export const teamSubject = (id: string): Subject => ({ type: 'team', id });

export interface Grant {
  readonly subject: Subject;
  readonly role: Role;
  /** When this grant stops applying. Absent means it never expires. */
  readonly expiresAt?: Date;
}

/**
 * Who may do what on which resource. A document in a folder also gets the roles
 * given on that folder. A role may be given to a Team instead of a single User,
 * and may be time-bound.
 */
export abstract class Authorizer {
  constructor(protected readonly membership: Membership) {}

  abstract can(userId: string, permission: Permission, resource: Resource): Promise<boolean>;

  /**
   * The strongest role the user effectively holds on a resource (inherited, team and
   * unexpired access included), or `null` without any. For display: guard actions with `can`.
   */
  async accessOn(userId: string, resource: Resource): Promise<Role | null> {
    if (await this.can(userId, 'can_delete', resource)) return 'owner';
    if (await this.can(userId, 'can_edit', resource)) return 'editor';
    if (await this.can(userId, 'can_view', resource)) return 'viewer';
    return null;
  }

  /**
   * When the user's access to a resource ends, or `null` if it never does (or they have none).
   * For display: guard actions with `can`.
   */
  async expiryOn(userId: string, resource: Resource): Promise<Date | null> {
    const parent = resource.type === 'document' ? await this.parentOf(resource.id) : null;
    const [teams, ...grantLists] = await Promise.all([
      this.membership.teamsOf(userId),
      this.grantsOn(resource),
      ...(parent === null ? [] : [this.grantsOn(folderRef(parent))]),
    ]);
    const now = Date.now();
    let latest: Date | null = null;
    for (const { subject, expiresAt } of grantLists.flat()) {
      const mine = subject.type === 'user' ? subject.id === userId : teams?.includes(subject.id);
      if (!mine) continue;
      if (!expiresAt) return null;
      if (expiresAt.getTime() > now && (!latest || expiresAt > latest)) latest = expiresAt;
    }
    return latest;
  }

  /** The folder a document is in, or `null`. */
  abstract parentOf(documentId: string): Promise<string | null>;

  /** `expiresAt`, if given, makes the grant stop applying once that time passes. */
  abstract grant(subject: Subject, role: Role, resource: Resource, expiresAt?: Date): Promise<void>;

  /**
   * The strongest role the user holds on every resource of `type` they can view, keyed by
   * id (what `accessOn` answers for one). For display: guard actions with `can`.
   */
  async rolesOn(userId: string, type: ResourceType): Promise<Map<string, Role>> {
    const [viewable, editable, deletable] = await Promise.all(
      (['can_view', 'can_edit', 'can_delete'] as const).map((permission) =>
        this.resourcesWhere(userId, permission, type),
      ),
    );
    const roles = new Map<string, Role>();
    for (const id of viewable ?? []) roles.set(id, 'viewer');
    for (const id of editable ?? []) roles.set(id, 'editor');
    for (const id of deletable ?? []) roles.set(id, 'owner');
    return roles;
  }

  /** Removes a direct grant. Revoking a grant that does not exist is a no-op. */
  abstract revoke(subject: Subject, role: Role, resource: Resource): Promise<void>;

  /** The direct grants on a resource (an Owner's grant is `owner`; inherited and implied access is not listed). */
  abstract grantsOn(resource: Resource): Promise<Grant[]>;

  /** Removes every grant on a resource, and for a document its link to a folder. */
  abstract revokeAll(resource: Resource): Promise<void>;

  /** Ids of every resource of `type` on which the user holds `permission`, inherited access included. */
  abstract resourcesWhere(
    userId: string,
    permission: RolePermission,
    type: ResourceType,
  ): Promise<string[]>;

  /**
   * Ids of every resource of `type` that holds at least one grant or folder link, whoever
   * it is for. For maintenance (see `Reconciler`); unlike `resourcesWhere` it is not about a user.
   */
  abstract resourcesWithGrants(type: ResourceType): Promise<string[]>;

  /** Puts the document in a folder, replacing its previous folder; `null` takes it out of any folder. */
  abstract setParent(documentId: string, folderId: string | null): Promise<void>;

  /**
   * Every User who holds `permission` on `resource`, with Team membership and
   * folder inheritance already resolved — the "who has access" view.
   */
  abstract usersWithAccess(resource: Resource, permission: RolePermission): Promise<string[]>;
}
