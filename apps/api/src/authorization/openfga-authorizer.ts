import { Injectable } from '@nestjs/common';
import type { OpenFgaClient } from '@openfga/sdk';
import { z } from 'zod';
import {
  Authorizer,
  type Grant,
  type Permission,
  type RolePermission,
  type Resource,
  type ResourceType,
  type Role,
  type Subject,
  teamSubject,
  userSubject,
} from './authorizer.js';
import { Membership } from './membership.js';
import { OpenFgaStore, type Tuple, ignoreDuplicateWrites, ignoreMissingDeletes } from './openfga-store.js';

const EXPIRY_CONDITION = 'non_expired';
const roleSchema = z.enum(['owner', 'editor', 'commenter', 'viewer']);

/** Strongest first: the first permission held tells the role. */
const ACCESS_PROBES = [
  { permission: 'can_delete', role: 'owner' },
  { permission: 'can_edit', role: 'editor' },
  { permission: 'can_comment', role: 'commenter' },
  { permission: 'can_view', role: 'viewer' },
] as const satisfies readonly { permission: RolePermission; role: Role }[];

@Injectable()
export class OpenFgaAuthorizer extends Authorizer {
  private readonly client: OpenFgaClient;

  constructor(
    private readonly store: OpenFgaStore,
    membership: Membership,
  ) {
    super(membership);
    this.client = store.client;
  }

  override async can(userId: string, permission: Permission, resource: Resource): Promise<boolean> {
    const { allowed } = await this.client.check({
      user: `user:${userId}`,
      relation: permission,
      object: objectOf(resource),
      context: nowContext(),
    });
    return allowed === true;
  }

  /** One BatchCheck round trip instead of up to three sequential Checks. */
  override async accessOn(userId: string, resource: Resource): Promise<Role | null> {
    const { result } = await this.client.batchCheck({
      checks: ACCESS_PROBES.map(({ permission }) => ({
        user: `user:${userId}`,
        relation: permission,
        object: objectOf(resource),
        context: nowContext(),
      })),
    });
    const failed = result.find((r) => r.error);
    if (failed?.error) throw new Error(`OpenFGA batch check failed: ${failed.error.message}`);
    const allowed = new Set(result.filter((r) => r.allowed).map((r) => r.request.relation));
    const held = ACCESS_PROBES.find(({ permission }) => allowed.has(permission));
    return held?.role ?? null;
  }

  override async grant(subject: Subject, role: Role, resource: Resource, expiresAt?: Date): Promise<void> {
    const key: Tuple = { user: subjectString(subject), relation: role, object: objectOf(resource) };
    const withCondition = expiresAt
      ? { ...key, condition: { name: EXPIRY_CONDITION, context: { expires_at: expiresAt.toISOString() } } }
      : key;
    // A tuple cannot be written over itself, so a grant given again (new expiry, say) starts by removing the old one.
    await this.client.write({ deletes: [key] }, ignoreMissingDeletes);
    await this.client.write({ writes: [withCondition] }, ignoreDuplicateWrites);
  }

  override async revoke(subject: Subject, role: Role, resource: Resource): Promise<void> {
    const key = { user: subjectString(subject), relation: role, object: objectOf(resource) };
    await this.client.write({ deletes: [key] }, ignoreMissingDeletes);
  }

  override async grantsOn(resource: Resource): Promise<Grant[]> {
    const grants: Grant[] = [];
    for (const tuple of await this.store.tuplesOn(objectOf(resource))) {
      const role = roleSchema.safeParse(tuple.relation);
      const subject = subjectOf(tuple.user);
      if (role.success && subject) {
        const expiresAt = expiryOf(tuple);
        grants.push({ subject, role: role.data, ...(expiresAt && { expiresAt }) });
      }
    }
    return grants;
  }

  override async revokeAll(resource: Resource): Promise<void> {
    const tuples = await this.store.tuplesOn(objectOf(resource));
    if (tuples.length === 0) return;
    await this.client.write({ deletes: tuples }, ignoreMissingDeletes);
  }

  override async revokeEverywhere(subject: Subject): Promise<void> {
    const user = subjectString(subject);
    for (const type of ['document', 'folder'] as const) {
      const tuples = await this.store.tuplesOfUser(user, type);
      if (tuples.length > 0) await this.client.write({ deletes: tuples }, ignoreMissingDeletes);
    }
  }

  override async resourcesWhere(
    userId: string,
    permission: RolePermission,
    type: ResourceType,
  ): Promise<string[]> {
    const { objects } = await this.client.listObjects({
      user: `user:${userId}`,
      relation: permission,
      type,
      context: nowContext(),
    });
    return objects.map((object) => object.slice(`${type}:`.length));
  }

  override resourcesWithGrants(type: ResourceType): Promise<string[]> {
    return this.store.objectIdsOfType(type);
  }

  override async setParent(documentId: string, folderId: string | null): Promise<void> {
    const object = objectOf({ type: 'document', id: documentId });
    const wanted = folderId === null ? undefined : `folder:${folderId}`;
    const current = (await this.store.tuplesOn(object)).filter((t) => t.relation === 'parent');

    const deletes = current.filter((t) => t.user !== wanted);
    const writes =
      wanted !== undefined && !current.some((t) => t.user === wanted)
        ? [{ user: wanted, relation: 'parent', object }]
        : [];
    if (deletes.length === 0 && writes.length === 0) return;
    await this.client.write({ writes, deletes }, ignoreMissingDeletes);
  }

  override async parentOf(documentId: string): Promise<string | null> {
    const tuples = await this.store.tuplesOn(objectOf({ type: 'document', id: documentId }));
    const parent = tuples.find((t) => t.relation === 'parent');
    return parent ? parent.user.slice('folder:'.length) : null;
  }

  override async usersWithAccess(resource: Resource, permission: RolePermission): Promise<string[]> {
    const { users } = await this.client.listUsers({
      object: objectRefOf(resource),
      relation: permission,
      user_filters: [{ type: 'user' }],
      context: nowContext(),
    });
    return users.flatMap((user) => (user.object?.id ? [user.object.id] : []));
  }
}

function objectOf({ type, id }: Resource): string {
  return `${type}:${id}`;
}

function objectRefOf({ type, id }: Resource): { type: string; id: string } {
  return { type, id };
}

function subjectString(subject: Subject): string {
  return subject.type === 'user' ? `user:${subject.id}` : `team:${subject.id}#member`;
}

function subjectOf(user: string): Subject | undefined {
  if (user.startsWith('user:')) return userSubject(user.slice('user:'.length));
  if (user.startsWith('team:') && user.endsWith('#member')) {
    return teamSubject(user.slice('team:'.length, -'#member'.length));
  }
  return undefined;
}

const conditionContextSchema = z.object({ expires_at: z.string() });

function expiryOf(tuple: Tuple): Date | undefined {
  const context = conditionContextSchema.safeParse(tuple.condition?.context);
  return context.success ? new Date(context.data.expires_at) : undefined;
}

/** Always sent so a Check/ListObjects/ListUsers can evaluate the `non_expired` condition. */
function nowContext(): { current_time: string } {
  return { current_time: new Date().toISOString() };
}
