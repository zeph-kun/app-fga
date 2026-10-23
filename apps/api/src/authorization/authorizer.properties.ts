import { randomUUID } from 'node:crypto';
import fc from 'fast-check';
import type { Wired } from './authorizer.contract.js';
import {
  type Permission,
  type Resource,
  type Role,
  type Subject,
  documentRef,
  folderRef,
  teamSubject,
  userSubject,
} from './authorizer.js';

const USERS = ['u1', 'u2', 'u3'] as const;
const TEAMS = ['t1', 't2'] as const;
const FOLDERS = ['f1', 'f2'] as const;
const DOCUMENTS = ['d1', 'd2'] as const;
const PERMISSIONS = ['can_view', 'can_edit', 'can_delete', 'can_share'] as const;

/** Two distinct futures, so "the latest end" has something to choose between. */
const EXPIRIES = { past: -3_600_000, soon: 3_600_000, later: 7_200_000 } as const;

/** An operation on the Authorizer, over the small fixed universe above. */
type Operation =
  | { kind: 'grant'; subject: Subject; role: Role; resource: Resource; expiry: 'none' | keyof typeof EXPIRIES }
  | { kind: 'revoke'; subject: Subject; role: Role; resource: Resource }
  | { kind: 'revokeAll'; resource: Resource }
  | { kind: 'setParent'; documentId: string; folderId: string | null }
  | { kind: 'addMember'; team: string; user: string }
  | { kind: 'removeMember'; team: string; user: string };

const resourceArb: fc.Arbitrary<Resource> = fc.oneof(
  fc.constantFrom(...FOLDERS).map(folderRef),
  fc.constantFrom(...DOCUMENTS).map(documentRef),
);
const userArb = fc.constantFrom(...USERS);
const teamArb = fc.constantFrom(...TEAMS);
const subjectArb: fc.Arbitrary<Subject> = fc.oneof(userArb.map(userSubject), teamArb.map(teamSubject));

const operationArb: fc.Arbitrary<Operation> = fc.oneof(
  // An Owner is always a User and never expires (see model.fga).
  fc.record({
    kind: fc.constant('grant' as const),
    subject: userArb.map(userSubject),
    role: fc.constant('owner' as const),
    resource: resourceArb,
    expiry: fc.constant('none' as const),
  }),
  fc.record({
    kind: fc.constant('grant' as const),
    subject: subjectArb,
    role: fc.constantFrom('editor' as const, 'viewer' as const),
    resource: resourceArb,
    expiry: fc.constantFrom('none' as const, 'past' as const, 'soon' as const, 'later' as const),
  }),
  fc.record({
    kind: fc.constant('revoke' as const),
    subject: subjectArb,
    role: fc.constantFrom('owner' as const, 'editor' as const, 'viewer' as const),
    resource: resourceArb,
  }),
  fc.record({ kind: fc.constant('revokeAll' as const), resource: resourceArb }),
  fc.record({
    kind: fc.constant('setParent' as const),
    documentId: fc.constantFrom(...DOCUMENTS),
    folderId: fc.option(fc.constantFrom(...FOLDERS), { nil: null }),
  }),
  fc.record({ kind: fc.constant('addMember' as const), team: teamArb, user: userArb }),
  fc.record({ kind: fc.constant('removeMember' as const), team: teamArb, user: userArb }),
);

const ROLES_GRANTING: Record<Role, readonly Role[]> = {
  owner: ['owner'],
  editor: ['editor', 'owner'],
  viewer: ['viewer', 'editor', 'owner'],
};
const ROLE_FOR: Record<Permission, Role> = {
  can_view: 'viewer',
  can_edit: 'editor',
  can_delete: 'owner',
  can_share: 'owner',
};

/**
 * What `infra/openfga/model.fga` says, written as plainly as possible and
 * independently of both adapters: the oracle they are compared with.
 */
class Model {
  private readonly grants = new Map<
    string,
    { subject: Subject; role: Role; resource: Resource; expiresAt: Date | undefined }
  >();
  private readonly parents = new Map<string, string>();
  private readonly members = new Map<string, Set<string>>();

  apply(op: Operation, expiresAt: Date | undefined): void {
    switch (op.kind) {
      case 'grant':
        this.grants.set(keyOf(op.subject, op.role, op.resource), {
          subject: op.subject,
          role: op.role,
          resource: op.resource,
          expiresAt,
        });
        return;
      case 'revoke':
        this.grants.delete(keyOf(op.subject, op.role, op.resource));
        return;
      case 'revokeAll':
        for (const [key, g] of this.grants) {
          if (g.resource.type === op.resource.type && g.resource.id === op.resource.id) this.grants.delete(key);
        }
        if (op.resource.type === 'document') this.parents.delete(op.resource.id);
        return;
      case 'setParent':
        if (op.folderId === null) this.parents.delete(op.documentId);
        else this.parents.set(op.documentId, op.folderId);
        return;
      case 'addMember':
        this.members.set(op.team, (this.members.get(op.team) ?? new Set()).add(op.user));
        return;
      case 'removeMember':
        this.members.get(op.team)?.delete(op.user);
        return;
    }
  }

  can(user: string, permission: Permission, resource: Resource): boolean {
    const role = ROLE_FOR[permission];
    if (this.holdsOn(user, role, resource)) return true;
    const folder = resource.type === 'document' ? this.parents.get(resource.id) : undefined;
    return folder !== undefined && this.holdsOn(user, role, folderRef(folder));
  }

  /**
   * When the user's access ends: the latest end among every unexpired grant that reaches them
   * (their own, their Teams', on the resource or its Folder), or null if one of them never ends.
   */
  expiryOn(user: string, resource: Resource): Date | null {
    const folder = resource.type === 'document' ? this.parents.get(resource.id) : undefined;
    const reaching = [...this.grants.values()].filter(
      (g) =>
        !isExpired(g.expiresAt) &&
        [resource, ...(folder === undefined ? [] : [folderRef(folder)])].some(
          (r) => r.type === g.resource.type && r.id === g.resource.id,
        ) &&
        (g.subject.type === 'user' ? g.subject.id === user : this.members.get(g.subject.id)?.has(user) === true),
    );
    if (reaching.some((g) => g.expiresAt === undefined)) return null;
    const ends = reaching.map((g) => g.expiresAt?.getTime() ?? 0);
    return ends.length === 0 ? null : new Date(Math.max(...ends));
  }

  /** Resources of `type` with at least one grant (expired or not) or, for a document, a folder link. */
  withGrants(type: 'document' | 'folder'): string[] {
    const ids = new Set([...this.grants.values()].filter((g) => g.resource.type === type).map((g) => g.resource.id));
    if (type === 'document') for (const id of this.parents.keys()) ids.add(id);
    return [...ids];
  }

  teamsOf(user: string): string[] {
    return [...this.members].filter(([, users]) => users.has(user)).map(([team]) => team);
  }

  teamMembers(team: string): string[] {
    return [...(this.members.get(team) ?? [])];
  }

  parentOf(documentId: string): string | null {
    return this.parents.get(documentId) ?? null;
  }

  /** The direct, unexpired grants on a resource. */
  grantsOn(resource: Resource): string[] {
    return [...this.grants.values()]
      .filter((g) => !isExpired(g.expiresAt) && g.resource.type === resource.type && g.resource.id === resource.id)
      .map((g) => `${g.subject.type}:${g.subject.id}:${g.role}`);
  }

  private holdsOn(user: string, role: Role, resource: Resource): boolean {
    return [...this.grants.values()].some(
      (g) =>
        !isExpired(g.expiresAt) &&
        g.resource.type === resource.type &&
        g.resource.id === resource.id &&
        ROLES_GRANTING[role].includes(g.role) &&
        (g.subject.type === 'user' ? g.subject.id === user : this.members.get(g.subject.id)?.has(user) === true),
    );
  }
}

function isExpired(expiresAt: Date | undefined): boolean {
  return expiresAt !== undefined && expiresAt.getTime() <= Date.now();
}

function keyOf(subject: Subject, role: Role, { type, id }: Resource): string {
  return `${subject.type}:${subject.id}|${role}|${type}|${id}`;
}

/** The universe's ids get a fresh prefix per run, so adapters sharing a store need no cleanup. */
function prefixed(run: string, op: Operation): Operation {
  const subject = (s: Subject): Subject => ({ type: s.type, id: `${run}-${s.id}` });
  const resource = (r: Resource): Resource => ({ type: r.type, id: `${run}-${r.id}` });
  switch (op.kind) {
    case 'grant':
    case 'revoke':
      return { ...op, subject: subject(op.subject), resource: resource(op.resource) };
    case 'revokeAll':
      return { ...op, resource: resource(op.resource) };
    case 'setParent':
      return {
        ...op,
        documentId: `${run}-${op.documentId}`,
        folderId: op.folderId === null ? null : `${run}-${op.folderId}`,
      };
    case 'addMember':
    case 'removeMember':
      return { ...op, team: `${run}-${op.team}`, user: `${run}-${op.user}` };
  }
}

async function perform({ authorizer, membership }: Wired, op: Operation, expiresAt: Date | undefined): Promise<void> {
  switch (op.kind) {
    case 'grant': {
      return authorizer.grant(op.subject, op.role, op.resource, expiresAt);
    }
    case 'revoke':
      return authorizer.revoke(op.subject, op.role, op.resource);
    case 'revokeAll':
      return authorizer.revokeAll(op.resource);
    case 'setParent':
      return authorizer.setParent(op.documentId, op.folderId);
    case 'addMember':
      return membership.add(op.team, op.user);
    case 'removeMember':
      return membership.remove(op.team, op.user);
  }
}

const sorted = (values: string[]) => [...values].sort();

/**
 * Random sequences of grants, revokes, moves and team changes, with the
 * Authorizer compared to a plain model of `model.fga` after each sequence.
 * `runs` is small for adapters that call a server.
 */
export function authorizerPropertyContract(
  adapter: string,
  create: () => Wired | Promise<Wired>,
  runs: number,
): void {
  describe(`Authorizer properties (${adapter})`, () => {
    it(
      'answers like model.fga after any sequence of changes',
      async () => {
        await fc.assert(
          fc.asyncProperty(fc.array(operationArb, { maxLength: 14 }), async (operations) => {
            const wired = await create();
            const { authorizer, membership } = wired;
            const run = randomUUID().slice(0, 8);
            const model = new Model();
            for (const op of operations) {
              const real = prefixed(run, op);
              const expiresAt =
                real.kind === 'grant' && real.expiry !== 'none' ? new Date(Date.now() + EXPIRIES[real.expiry]) : undefined;
              await perform(wired, real, expiresAt);
              model.apply(real, expiresAt);
            }

            const id = (name: string) => `${run}-${name}`;
            const resources = [...FOLDERS.map((f) => folderRef(id(f))), ...DOCUMENTS.map((d) => documentRef(id(d)))];
            for (const user of USERS.map(id)) {
              for (const resource of resources) {
                for (const permission of PERMISSIONS) {
                  expect(await authorizer.can(user, permission, resource), `${user} ${permission} ${resource.type}:${resource.id}`).toBe(
                    model.can(user, permission, resource),
                  );
                }
              }
              for (const resource of resources) {
                expect((await authorizer.expiryOn(user, resource))?.getTime(), `${user} expiry on ${resource.type}:${resource.id}`).toBe(
                  model.expiryOn(user, resource)?.getTime(),
                );
              }
              expect(sorted(await membership.teamsOf(user))).toEqual(sorted(model.teamsOf(user)));
              for (const permission of PERMISSIONS) {
                for (const type of ['document', 'folder'] as const) {
                  const expected = resources
                    .filter((r) => r.type === type && model.can(user, permission, r))
                    .map((r) => r.id);
                  const found = (await authorizer.resourcesWhere(user, permission, type)).filter((rid) =>
                    rid.startsWith(run),
                  );
                  expect(sorted(found), `${user} ${permission} ${type} list`).toEqual(sorted(expected));
                }
              }
            }
            for (const resource of resources) {
              for (const permission of PERMISSIONS) {
                expect(sorted(await authorizer.usersWithAccess(resource, permission))).toEqual(
                  sorted(USERS.map(id).filter((user) => model.can(user, permission, resource))),
                );
              }
              const grants = (await authorizer.grantsOn(resource))
                .filter((g) => g.expiresAt === undefined || g.expiresAt.getTime() > Date.now())
                .map((g) => `${g.subject.type}:${g.subject.id}:${g.role}`);
              expect(sorted(grants)).toEqual(sorted(model.grantsOn(resource)));
            }
            for (const type of ['document', 'folder'] as const) {
              const found = (await authorizer.resourcesWithGrants(type)).filter((rid) => rid.startsWith(run));
              expect(sorted(found), `${type} with grants`).toEqual(sorted(model.withGrants(type)));
            }
            for (const team of TEAMS.map(id)) {
              expect(sorted(await membership.members(team))).toEqual(sorted(model.teamMembers(team)));
            }
            for (const document of DOCUMENTS.map(id)) {
              expect(await authorizer.parentOf(document)).toBe(model.parentOf(document));
            }
          }),
          { numRuns: runs },
        );
      },
      120_000,
    );
  });
}
