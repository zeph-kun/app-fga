import { Injectable, Logger } from '@nestjs/common';
import { Authorizer, documentRef, folderRef, teamSubject, userSubject } from '../authorization/authorizer.js';
import { Membership } from '../authorization/membership.js';
import type { Document } from '../documents/document.js';
import { DocumentRepository } from '../documents/document-repository.js';
import type { Folder } from '../folders/folder.js';
import { FolderRepository } from '../folders/folder-repository.js';
import type { Team } from '../teams/team.js';
import { TeamRepository } from '../teams/team-repository.js';

/**
 * Creating, moving and deleting Documents, Folders and Teams, which spans Postgres (the
 * row) and OpenFGA (the grants or the members) with no transaction between them. It owns the
 * order of the writes and what to undo when one fails, so the services only
 * apply business rules. The caller has already checked who may do what.
 *
 * What a crash can still leave behind is repaired by `Reconciler`.
 */
@Injectable()
export class ResourceLifecycle {
  private readonly logger = new Logger(ResourceLifecycle.name);

  constructor(
    private readonly authorizer: Authorizer,
    private readonly documents: DocumentRepository,
    private readonly folders: FolderRepository,
    private readonly teams: TeamRepository,
    private readonly membership: Membership,
  ) {}

  /** Stores the Document, makes its `ownerId` the Owner and puts it in its Folder, or keeps nothing. */
  async createDocument(document: Document): Promise<void> {
    await this.documents.save(document);
    try {
      await this.authorizer.grant(userSubject(document.ownerId), 'owner', documentRef(document.id));
      if (document.folderId !== null) await this.authorizer.setParent(documentRef(document.id), document.folderId);
    } catch (error) {
      // Without its Owner grant nobody could ever open the document: do not keep it.
      await this.documents.delete(document.id);
      // Best effort: the original error is the one worth reporting.
      await this.authorizer.revokeAll(documentRef(document.id)).catch(() => undefined);
      throw error;
    }
  }

  /**
   * Removes the row, then every grant. In that order: the other way round a failure would leave
   * a Document nobody can open. If the grants cannot be removed they point at an id that no
   * longer exists (a 404 for everyone), so the delete still succeeds.
   */
  async deleteDocument(id: string): Promise<void> {
    await this.documents.delete(id);
    await this.authorizer.revokeAll(documentRef(id)).catch((error: unknown) => this.leftBehind('document', id, error));
  }

  /** Puts the Document in a Folder (or takes it out with `null`); its roles follow. Returns the moved Document. */
  async moveDocument(current: Document, folderId: string | null): Promise<Document> {
    const moved: Document = { ...current, folderId };
    await this.documents.save(moved);
    try {
      await this.authorizer.setParent(documentRef(current.id), folderId);
    } catch (error) {
      await this.documents.save(current);
      throw error;
    }
    return moved;
  }

  /** Stores the Folder and makes its `ownerId` the Owner, or keeps nothing. */
  async createFolder(folder: Folder): Promise<void> {
    await this.folders.save(folder);
    try {
      await this.authorizer.grant(userSubject(folder.ownerId), 'owner', folderRef(folder.id));
    } catch (error) {
      // Without its Owner grant nobody could ever open the folder: do not keep it.
      await this.folders.delete(folder.id);
      throw error;
    }
  }

  /** Same order and same leniency as `deleteDocument`. */
  async deleteFolder(id: string): Promise<void> {
    await this.folders.delete(id);
    await this.authorizer.revokeAll(folderRef(id)).catch((error: unknown) => this.leftBehind('folder', id, error));
  }

  /** Stores the Team and makes its `ownerId` its first member, or keeps nothing. */
  async createTeam(team: Team): Promise<void> {
    await this.teams.save(team);
    try {
      await this.membership.add(team.id, team.ownerId);
    } catch (error) {
      await this.teams.delete(team.id);
      throw error;
    }
  }

  /**
   * Removes every member and every grant given to the Team, then the row. The other way round
   * from a Document: members must lose their membership first or a failure here would leave
   * people with access through a Team that no longer exists. A failure keeps the row, so the
   * delete can simply be retried.
   */
  async deleteTeam(id: string): Promise<void> {
    for (const member of await this.membership.members(id)) {
      await this.membership.remove(id, member);
    }
    await this.authorizer.revokeEverywhere(teamSubject(id));
    await this.teams.delete(id);
  }

  private leftBehind(type: string, id: string, error: unknown): void {
    const reason = error instanceof Error ? error.message : String(error);
    this.logger.warn(`Deleted ${type} ${id} but could not remove its grants (${reason}); run the reconciler`);
  }
}
