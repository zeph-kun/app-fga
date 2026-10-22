/** What a User or Team is given on a resource. Roles are hierarchical: an owner is also an editor, and an editor is also a viewer. */
export type Role = 'owner' | 'editor' | 'viewer';

/** What the API asks about. Each permission is held by a role and the roles above it. */
export type Permission = 'can_view' | 'can_edit' | 'can_delete' | 'can_share';

export type ResourceType = 'document' | 'folder';

export interface Resource {
  readonly type: ResourceType;
  readonly id: string;
}

export const documentRef = (id: string): Resource => ({ type: 'document', id });
export const folderRef = (id: string): Resource => ({ type: 'folder', id });

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

  /** `expiresAt`, if given, makes the grant stop applying once that time passes. */
  abstract grant(subject: Subject, role: Role, resource: Resource, expiresAt?: Date): Promise<void>;

  /** Removes a direct grant. Revoking a grant that does not exist is a no-op. */
  abstract revoke(subject: Subject, role: Role, resource: Resource): Promise<void>;

  /** The direct grants on a resource (an Owner's grant is `owner`; inherited and implied access is not listed). */
  abstract grantsOn(resource: Resource): Promise<Grant[]>;

  /** Removes every grant on a resource, and for a document its link to a folder. */
  abstract revokeAll(resource: Resource): Promise<void>;

  /** Ids of every resource of `type` on which the user holds `permission`, inherited access included. */
  abstract resourcesWhere(
    userId: string,
    permission: Permission,
    type: ResourceType,
  ): Promise<string[]>;

  /** Puts the document in a folder, replacing its previous folder; `null` takes it out of any folder. */
  abstract setParent(documentId: string, folderId: string | null): Promise<void>;

  /** Direct members of a Team. */
  abstract teamMembers(teamId: string): Promise<string[]>;

  abstract addTeamMember(teamId: string, userId: string): Promise<void>;

  /** Removing a membership that does not exist is a no-op. */
  abstract removeTeamMember(teamId: string, userId: string): Promise<void>;

  /** Ids of every Team the user is a direct member of. */
  abstract teamsOf(userId: string): Promise<string[]>;

  /**
   * Every User who holds `permission` on `resource`, with Team membership and
   * folder inheritance already resolved — the "who has access" view.
   */
  abstract usersWithAccess(resource: Resource, permission: Permission): Promise<string[]>;
}
