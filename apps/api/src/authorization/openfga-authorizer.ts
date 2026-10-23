import { readFile } from 'node:fs/promises';
import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import {
  ClientWriteRequestOnDuplicateWrites,
  ClientWriteRequestOnMissingDeletes,
  CredentialsMethod,
  OpenFgaClient,
} from '@openfga/sdk';
import { transformer } from '@openfga/syntax-transformer';
import { z } from 'zod';
import { ENV, type Env } from '../config/env.js';
import {
  Authorizer,
  type Grant,
  type Permission,
  type Resource,
  type ResourceType,
  type Role,
  type Subject,
  teamSubject,
  userSubject,
} from './authorizer.js';

const EXPIRY_CONDITION = 'non_expired';
const roleSchema = z.enum(['owner', 'editor', 'viewer']);
const ignoreMissingDeletes = {
  conflict: { onMissingDeletes: ClientWriteRequestOnMissingDeletes.Ignore },
};
const ignoreDuplicateWrites = {
  conflict: { onDuplicateWrites: ClientWriteRequestOnDuplicateWrites.Ignore },
};

/** Strongest first: the first permission held tells the role. */
const ACCESS_PROBES = [
  { permission: 'can_delete', role: 'owner' },
  { permission: 'can_edit', role: 'editor' },
  { permission: 'can_view', role: 'viewer' },
] as const satisfies readonly { permission: Permission; role: Role }[];

interface Tuple {
  readonly user: string;
  readonly relation: string;
  readonly object: string;
  readonly condition?: { readonly name: string; readonly context?: object };
}

@Injectable()
export class OpenFgaAuthorizer extends Authorizer implements OnModuleInit {
  private readonly logger = new Logger(OpenFgaAuthorizer.name);
  private readonly client: OpenFgaClient;

  constructor(@Inject(ENV) private readonly env: Env) {
    super();
    this.client = new OpenFgaClient({
      apiUrl: env.OPENFGA_API_URL,
      credentials: {
        method: CredentialsMethod.ApiToken,
        config: { token: env.OPENFGA_API_TOKEN },
      },
    });
  }

  /** Finds (or creates) the store and publishes the authorization model. */
  async onModuleInit(): Promise<void> {
    const { stores } = await this.client.listStores();
    const existing = stores.find((s) => s.name === this.env.OPENFGA_STORE_NAME);
    const storeId =
      existing?.id ?? (await this.client.createStore({ name: this.env.OPENFGA_STORE_NAME })).id;
    this.client.storeId = storeId;

    const dsl = await readFile(this.env.OPENFGA_MODEL_PATH, 'utf8');
    const model = await this.client.writeAuthorizationModel(
      transformer.transformDSLToJSONObject(dsl),
    );
    this.client.authorizationModelId = model.authorization_model_id;
    this.logger.log(`OpenFGA store ${storeId}, model ${model.authorization_model_id}`);
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
    for (const tuple of await this.tuplesOn(objectOf(resource))) {
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
    const tuples = await this.tuplesOn(objectOf(resource));
    if (tuples.length === 0) return;
    await this.client.write({ deletes: tuples }, ignoreMissingDeletes);
  }

  override async resourcesWhere(
    userId: string,
    permission: Permission,
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

  override async setParent(documentId: string, folderId: string | null): Promise<void> {
    const object = objectOf({ type: 'document', id: documentId });
    const wanted = folderId === null ? undefined : `folder:${folderId}`;
    const current = (await this.tuplesOn(object)).filter((t) => t.relation === 'parent');

    const deletes = current.filter((t) => t.user !== wanted);
    const writes =
      wanted !== undefined && !current.some((t) => t.user === wanted)
        ? [{ user: wanted, relation: 'parent', object }]
        : [];
    if (deletes.length === 0 && writes.length === 0) return;
    await this.client.write({ writes, deletes }, ignoreMissingDeletes);
  }

  override async parentOf(documentId: string): Promise<string | null> {
    const tuples = await this.tuplesOn(objectOf({ type: 'document', id: documentId }));
    const parent = tuples.find((t) => t.relation === 'parent');
    return parent ? parent.user.slice('folder:'.length) : null;
  }

  override async teamMembers(teamId: string): Promise<string[]> {
    const tuples = await this.tuplesOn(`team:${teamId}`);
    return tuples
      .filter((t) => t.relation === 'member' && t.user.startsWith('user:'))
      .map((t) => t.user.slice('user:'.length));
  }

  override async addTeamMember(teamId: string, userId: string): Promise<void> {
    await this.client.write({ writes: [memberTuple(teamId, userId)] }, ignoreDuplicateWrites);
  }

  override async removeTeamMember(teamId: string, userId: string): Promise<void> {
    await this.client.write({ deletes: [memberTuple(teamId, userId)] }, ignoreMissingDeletes);
  }

  override async teamsOf(userId: string): Promise<string[]> {
    const { objects } = await this.client.listObjects({
      user: `user:${userId}`,
      relation: 'member',
      type: 'team',
    });
    return objects.map((object) => object.slice('team:'.length));
  }

  override async usersWithAccess(resource: Resource, permission: Permission): Promise<string[]> {
    const { users } = await this.client.listUsers({
      object: objectRefOf(resource),
      relation: permission,
      user_filters: [{ type: 'user' }],
      context: nowContext(),
    });
    return users.flatMap((user) => (user.object?.id ? [user.object.id] : []));
  }

  /** Every tuple stored on `object`, whatever its relation. */
  private async tuplesOn(object: string): Promise<Tuple[]> {
    const tuples: Tuple[] = [];
    let continuationToken: string | undefined;
    do {
      const page = await this.client.read({ object }, { continuationToken });
      tuples.push(...page.tuples.map(({ key }) => key));
      continuationToken = page.continuation_token || undefined;
    } while (continuationToken);
    return tuples;
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

function memberTuple(teamId: string, userId: string): Tuple {
  return { user: `user:${userId}`, relation: 'member', object: `team:${teamId}` };
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
