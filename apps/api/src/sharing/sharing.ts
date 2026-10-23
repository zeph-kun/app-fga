import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { Authorizer, SHARED_ROLES, type Grant, type Resource, type SharedRole, type Subject } from '../authorization/authorizer.js';
import { TeamRepository } from '../teams/team-repository.js';
import { UserDirectory } from '../users/user-directory.js';

/** What the API takes to create or replace a Share: who, which role, for how long. */
export interface ShareInput {
  readonly subject: Subject;
  readonly role: SharedRole;
  /** Omitted or absent means the Share never expires. */
  readonly expiresInHours?: number;
}

/** A Share as shown to the Owner: who it is for, by name, and when (if ever) it expires. */
export interface ShareEntry {
  readonly subject: Subject;
  readonly name: string;
  readonly role: SharedRole;
  readonly expiresAt?: Date;
}

/** Throws 400 if the User or Team named by `subject` does not exist. */
async function requireSubjectExists(
  subject: Subject,
  users: UserDirectory,
  teams: TeamRepository,
): Promise<void> {
  if (subject.type === 'user') {
    if (!(await users.exists(subject.id))) {
      throw new BadRequestException(`No user named "${subject.id}"`);
    }
  } else if (!(await teams.findById(subject.id))) {
    throw new BadRequestException('No such team');
  }
}

/** The name to show for a Share's subject: the username, or the Team's name. */
async function nameOfSubject(subject: Subject, teams: TeamRepository): Promise<string> {
  if (subject.type === 'user') return subject.id;
  const team = await teams.findById(subject.id);
  return team?.name ?? 'Deleted team';
}

function expiresAtFrom(expiresInHours: number | undefined): Date | undefined {
  return expiresInHours === undefined ? undefined : new Date(Date.now() + expiresInHours * 3_600_000);
}

/** The Owner's grant is never listed as a Share. */
function isSharedRole(grant: Grant): grant is Grant & { role: SharedRole } {
  return grant.role !== 'owner';
}

/**
 * Giving, listing and taking away Grants on a Document or Folder. The caller has
 * already checked that the requester may share `resource` and passes its Owner.
 */
@Injectable()
export class Sharing {
  constructor(
    private readonly authorizer: Authorizer,
    private readonly users: UserDirectory,
    private readonly teams: TeamRepository,
  ) {}

  async share(resource: Resource, ownerId: string, { subject, role, expiresInHours }: ShareInput): Promise<void> {
    if (subject.type === 'user' && subject.id === ownerId) {
      throw new ForbiddenException('The owner already has full access');
    }
    await requireSubjectExists(subject, this.users, this.teams);
    for (const other of SHARED_ROLES.filter((r) => r !== role)) await this.authorizer.revoke(subject, other, resource);
    await this.authorizer.grant(subject, role, resource, expiresAtFrom(expiresInHours));
  }

  async shares(resource: Resource): Promise<ShareEntry[]> {
    const grants = await this.authorizer.grantsOn(resource);
    return Promise.all(
      grants
        .filter(isSharedRole)
        .map(async (g) => ({ ...g, name: await nameOfSubject(g.subject, this.teams) })),
    );
  }

  /** Removes the Grant of `subject` whatever its role. */
  async unshare(resource: Resource, ownerId: string, subject: Subject): Promise<void> {
    if (subject.type === 'user' && subject.id === ownerId) {
      throw new ForbiddenException('The owner cannot be removed');
    }
    for (const role of SHARED_ROLES) await this.authorizer.revoke(subject, role, resource);
  }

  /** Every User who can view `resource`, Teams and folder inheritance resolved — for an access review. */
  accessList(resource: Resource): Promise<string[]> {
    return this.authorizer.usersWithAccess(resource, 'can_view');
  }
}
