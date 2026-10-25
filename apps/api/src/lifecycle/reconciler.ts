import { Injectable } from '@nestjs/common';
import { Authorizer, type Resource, documentRef, folderRef, teamSubject, userSubject } from '../authorization/authorizer.js';
import { Membership } from '../authorization/membership.js';
import { DocumentRepository } from '../documents/document-repository.js';
import type { Folder } from '../folders/folder.js';
import { FolderRepository } from '../folders/folder-repository.js';
import { TeamRepository } from '../teams/team-repository.js';

/** Something Postgres and OpenFGA disagree about. Postgres is right: the rows are the source of truth. */
export type Finding =
  /** The row exists but its Owner holds no `owner` grant: nobody can open it. */
  | { kind: 'missing-owner'; type: 'document' | 'folder'; id: string; ownerId: string }
  /** The Folder link in OpenFGA is not the one the Document row names. */
  | { kind: 'wrong-folder'; id: string; expected: string | null; actual: string | null }
  /** The parent link in OpenFGA is not the one the Folder row names. */
  | { kind: 'wrong-parent'; id: string; expected: string | null; actual: string | null }
  /** Folders whose rows put each of them in the next: access cannot be resolved. Reported, never repaired. */
  | { kind: 'parent-cycle'; ids: string[] }
  /** Grants (or a Folder link) on an id that has no row any more. */
  | { kind: 'orphan-grants'; type: 'document' | 'folder'; id: string }
  /** The Team exists but its owner is not a member, which creating a Team always makes them. */
  | { kind: 'owner-not-member'; id: string; ownerId: string }
  /** Members of a Team id that has no row: they would keep what was shared with that Team. */
  | { kind: 'orphan-members'; id: string }
  /** Grants given to a Team id that has no row: the resources would keep showing "Deleted team". */
  | { kind: 'orphan-team-grants'; id: string };

/**
 * Finds, and optionally repairs, what a crash between the two writes of `ResourceLifecycle`
 * can leave behind (see ADR 0002). Not safe to run while the API is creating things: a
 * Document saved but not yet granted looks the same as one whose grant was lost.
 */
@Injectable()
export class Reconciler {
  constructor(
    private readonly authorizer: Authorizer,
    private readonly documents: DocumentRepository,
    private readonly folders: FolderRepository,
    private readonly teams: TeamRepository,
    private readonly membership: Membership,
  ) {}

  /** The findings, in a stable order. With `apply`, each one is repaired too; repairs are safe to repeat. */
  async reconcile({ apply }: { apply: boolean }): Promise<Finding[]> {
    const findings: Finding[] = [];
    const [documents, folders, teams] = await Promise.all([
      this.documents.findAll(),
      this.folders.findAll(),
      this.teams.findAll(),
    ]);

    const cycles = parentCycles(folders);
    for (const ids of cycles) findings.push({ kind: 'parent-cycle', ids });
    const inCycle = new Set(cycles.flat());

    for (const { id, ownerId, parentId } of folders) {
      if (!(await this.ownerHolds(folderRef(id), ownerId))) {
        findings.push({ kind: 'missing-owner', type: 'folder', id, ownerId });
        if (apply) await this.authorizer.grant(userSubject(ownerId), 'owner', folderRef(id));
      }
      const actual = await this.authorizer.parentOf(folderRef(id));
      // A loop is not copied into OpenFGA, where it would break the access of everything in it.
      if (actual !== parentId && !inCycle.has(id)) {
        findings.push({ kind: 'wrong-parent', id, expected: parentId, actual });
        if (apply) await this.authorizer.setParent(folderRef(id), parentId);
      }
    }
    for (const { id, ownerId, folderId } of documents) {
      if (!(await this.ownerHolds(documentRef(id), ownerId))) {
        findings.push({ kind: 'missing-owner', type: 'document', id, ownerId });
        if (apply) await this.authorizer.grant(userSubject(ownerId), 'owner', documentRef(id));
      }
      const actual = await this.authorizer.parentOf(documentRef(id));
      if (actual !== folderId) {
        findings.push({ kind: 'wrong-folder', id, expected: folderId, actual });
        if (apply) await this.authorizer.setParent(documentRef(id), folderId);
      }
    }

    for (const [type, known] of [
      ['document', new Set(documents.map((d) => d.id))],
      ['folder', new Set(folders.map((f) => f.id))],
    ] as const) {
      for (const id of await this.authorizer.resourcesWithGrants(type)) {
        if (known.has(id)) continue;
        findings.push({ kind: 'orphan-grants', type, id });
        if (apply) await this.authorizer.revokeAll({ type, id } satisfies Resource);
      }
    }

    for (const { id, ownerId } of teams) {
      if (!(await this.membership.members(id)).includes(ownerId)) {
        findings.push({ kind: 'owner-not-member', id, ownerId });
        if (apply) await this.membership.add(id, ownerId);
      }
    }
    const knownTeams = new Set(teams.map((t) => t.id));
    for (const id of await this.membership.teamsWithMembers()) {
      if (knownTeams.has(id)) continue;
      findings.push({ kind: 'orphan-members', id });
      if (apply) for (const member of await this.membership.members(id)) await this.membership.remove(id, member);
    }
    const grantedTeams = new Set<string>();
    for (const type of ['document', 'folder'] as const) {
      for (const id of await this.authorizer.resourcesWithGrants(type)) {
        for (const { subject } of await this.authorizer.grantsOn({ type, id })) {
          if (subject.type === 'team' && !knownTeams.has(subject.id)) grantedTeams.add(subject.id);
        }
      }
    }
    for (const id of [...grantedTeams].sort()) {
      findings.push({ kind: 'orphan-team-grants', id });
      if (apply) await this.authorizer.revokeEverywhere(teamSubject(id));
    }
    return findings;
  }

  private async ownerHolds(resource: Resource, ownerId: string): Promise<boolean> {
    const grants = await this.authorizer.grantsOn(resource);
    return grants.some((g) => g.role === 'owner' && g.subject.type === 'user' && g.subject.id === ownerId);
  }
}

/** The sets of Folders that are each other's ancestors, each set once, ids in order. */
function parentCycles(folders: readonly Folder[]): string[][] {
  const parentOf = new Map(folders.map((f) => [f.id, f.parentId]));
  const found = new Map<string, string[]>();
  for (const { id } of folders) {
    const path: string[] = [];
    let current: string | null | undefined = id;
    while (current !== null && current !== undefined && !path.includes(current)) {
      path.push(current);
      current = parentOf.get(current);
    }
    if (current === null || current === undefined) continue;
    const loop = path.slice(path.indexOf(current)).sort();
    found.set(loop.join(','), loop);
  }
  return [...found.values()];
}
