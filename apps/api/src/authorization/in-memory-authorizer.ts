import {
  Authorizer,
  type Grant,
  type Permission,
  type RolePermission,
  type Resource,
  type ResourceType,
  type Role,
  type Subject,
} from './authorizer.js';
import { InMemoryManagers } from './in-memory-managers.js';
import type { Managers } from './managers.js';
import type { Membership } from './membership.js';

const IMPLIED_BY: Record<Role, readonly Role[]> = {
  owner: ['owner'],
  editor: ['editor', 'owner'],
  commenter: ['commenter', 'editor', 'owner'],
  viewer: ['viewer', 'commenter', 'editor', 'owner'],
};

const ROLE_OF: Record<RolePermission, Role> = {
  can_view: 'viewer',
  can_comment: 'commenter',
  can_edit: 'editor',
  can_delete: 'owner',
  can_share: 'owner',
};

interface StoredGrant extends Grant {
  readonly resource: Resource;
}

/** Test adapter mirroring infra/openfga/model.fga. */
export class InMemoryAuthorizer extends Authorizer {
  private readonly grants = new Map<string, StoredGrant>();
  /** `type:id` of a Document or Folder to the id of the Folder it is in. */
  private readonly parents = new Map<string, string>();

  constructor(
    membership: Membership,
    private readonly managers: Managers = new InMemoryManagers(),
  ) {
    super(membership);
  }

  override async can(userId: string, permission: Permission, resource: Resource): Promise<boolean> {
    if (permission === 'can_create_team') return (await this.managers.all()).includes(userId);
    return this.holds(userId, await this.membership.teamsOf(userId), ROLE_OF[permission], resource);
  }

  override grant(subject: Subject, role: Role, resource: Resource, expiresAt?: Date): Promise<void> {
    this.grants.set(key(subject, role, resource), { subject, role, resource, expiresAt });
    return Promise.resolve();
  }

  override revoke(subject: Subject, role: Role, resource: Resource): Promise<void> {
    this.grants.delete(key(subject, role, resource));
    return Promise.resolve();
  }

  override grantsOn(resource: Resource): Promise<Grant[]> {
    const grants = [...this.grants.values()]
      .filter((g) => sameResource(g.resource, resource) && !isExpired(g))
      .map(({ subject, role, expiresAt }) => ({ subject, role, ...(expiresAt && { expiresAt }) }));
    return Promise.resolve(grants);
  }

  override revokeAll(resource: Resource): Promise<void> {
    for (const [k, g] of this.grants) {
      if (sameResource(g.resource, resource)) this.grants.delete(k);
    }
    this.parents.delete(parentKey(resource));
    return Promise.resolve();
  }

  override revokeEverywhere(subject: Subject): Promise<void> {
    for (const [k, g] of this.grants) {
      if (g.subject.type === subject.type && g.subject.id === subject.id) this.grants.delete(k);
    }
    return Promise.resolve();
  }

  override async resourcesWhere(
    userId: string,
    permission: RolePermission,
    type: ResourceType,
  ): Promise<string[]> {
    const ids = new Set<string>();
    for (const { resource } of this.grants.values()) {
      if (resource.type === type) ids.add(resource.id);
    }
    for (const id of this.withParent(type)) ids.add(id);
    const teams = await this.membership.teamsOf(userId);
    return [...ids].filter((id) => this.holds(userId, teams, ROLE_OF[permission], { type, id }));
  }

  override resourcesWithGrants(type: ResourceType): Promise<string[]> {
    const ids = new Set<string>();
    for (const { resource } of this.grants.values()) {
      if (resource.type === type) ids.add(resource.id);
    }
    for (const id of this.withParent(type)) ids.add(id);
    return Promise.resolve([...ids]);
  }

  override setParent(child: Resource, parentId: string | null): Promise<void> {
    if (parentId === null) this.parents.delete(parentKey(child));
    else this.parents.set(parentKey(child), parentId);
    return Promise.resolve();
  }

  override parentOf(child: Resource): Promise<string | null> {
    return Promise.resolve(this.parents.get(parentKey(child)) ?? null);
  }

  override async usersWithAccess(resource: Resource, permission: RolePermission): Promise<string[]> {
    const role = ROLE_OF[permission];
    const users = new Set<string>();
    const scan = async (target: Resource) => {
      for (const g of this.grants.values()) {
        if (!sameResource(g.resource, target) || !IMPLIED_BY[role].includes(g.role) || isExpired(g)) {
          continue;
        }
        if (g.subject.type === 'user') users.add(g.subject.id);
        else for (const member of await this.membership.members(g.subject.id)) users.add(member);
      }
    };
    for (let target: Resource | undefined = resource; target; target = this.parentFolder(target)) await scan(target);
    return [...users];
  }

  /** The Folder a Document or Folder is in. */
  private parentFolder(child: Resource): Resource | undefined {
    const id = this.parents.get(parentKey(child));
    return id === undefined ? undefined : { type: 'folder', id };
  }

  /** Ids of the resources of `type` that sit in a Folder. */
  private withParent(type: ResourceType): string[] {
    return [...this.parents.keys()].filter((key) => key.startsWith(`${type}:`)).map((key) => key.slice(type.length + 1));
  }

  /** A role is held directly (or through a higher role, or via team membership), or inherited from the document's folder. */
  private holds(userId: string, teams: readonly string[], role: Role, resource: Resource): boolean {
    for (const g of this.grants.values()) {
      if (!sameResource(g.resource, resource) || !IMPLIED_BY[role].includes(g.role) || isExpired(g)) {
        continue;
      }
      const matches = g.subject.type === 'user' ? g.subject.id === userId : teams.includes(g.subject.id);
      if (matches) return true;
    }
    const parent = this.parentFolder(resource);
    return parent !== undefined && this.holds(userId, teams, role, parent);
  }
}

function key(subject: Subject, role: Role, { type, id }: Resource): string {
  return `${subject.type}:${subject.id}|${role}|${type}|${id}`;
}

function sameResource(a: Resource, b: Resource): boolean {
  return a.type === b.type && a.id === b.id;
}

function isExpired(grant: Grant): boolean {
  return grant.expiresAt !== undefined && grant.expiresAt.getTime() <= Date.now();
}

function parentKey({ type, id }: Resource): string {
  return `${type}:${id}`;
}
