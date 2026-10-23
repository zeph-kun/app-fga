import { Injectable } from '@nestjs/common';
import { Authorizer, type Resource, documentRef, folderRef, userSubject } from '../authorization/authorizer.js';
import { DocumentRepository } from '../documents/document-repository.js';
import { FolderRepository } from '../folders/folder-repository.js';

/** Something Postgres and OpenFGA disagree about. Postgres is right: the rows are the source of truth. */
export type Finding =
  /** The row exists but its Owner holds no `owner` grant: nobody can open it. */
  | { kind: 'missing-owner'; type: 'document' | 'folder'; id: string; ownerId: string }
  /** The Folder link in OpenFGA is not the one the Document row names. */
  | { kind: 'wrong-folder'; id: string; expected: string | null; actual: string | null }
  /** Grants (or a Folder link) on an id that has no row any more. */
  | { kind: 'orphan-grants'; type: 'document' | 'folder'; id: string };

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
  ) {}

  /** The findings, in a stable order. With `apply`, each one is repaired too; repairs are safe to repeat. */
  async reconcile({ apply }: { apply: boolean }): Promise<Finding[]> {
    const findings: Finding[] = [];
    const [documents, folders] = await Promise.all([this.documents.findAll(), this.folders.findAll()]);

    for (const { id, ownerId } of folders) {
      if (!(await this.ownerHolds(folderRef(id), ownerId))) {
        findings.push({ kind: 'missing-owner', type: 'folder', id, ownerId });
        if (apply) await this.authorizer.grant(userSubject(ownerId), 'owner', folderRef(id));
      }
    }
    for (const { id, ownerId, folderId } of documents) {
      if (!(await this.ownerHolds(documentRef(id), ownerId))) {
        findings.push({ kind: 'missing-owner', type: 'document', id, ownerId });
        if (apply) await this.authorizer.grant(userSubject(ownerId), 'owner', documentRef(id));
      }
      const actual = await this.authorizer.parentOf(id);
      if (actual !== folderId) {
        findings.push({ kind: 'wrong-folder', id, expected: folderId, actual });
        if (apply) await this.authorizer.setParent(id, folderId);
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
    return findings;
  }

  private async ownerHolds(resource: Resource, ownerId: string): Promise<boolean> {
    const grants = await this.authorizer.grantsOn(resource);
    return grants.some((g) => g.role === 'owner' && g.subject.type === 'user' && g.subject.id === ownerId);
  }
}
