import { BadRequestException } from '@nestjs/common';
import type { Grant, Subject } from '../authorization/authorizer.js';
import type { TeamRepository } from '../teams/team-repository.js';
import type { UserDirectory } from '../users/user-directory.js';

/** What the API takes to create or replace a Share: who, which role, for how long. */
export interface ShareInput {
  readonly subject: Subject;
  readonly role: 'editor' | 'viewer';
  /** Omitted or absent means the Share never expires. */
  readonly expiresInHours?: number;
}

/** A Share as shown to the Owner: who it is for, by name, and when (if ever) it expires. */
export interface ShareEntry {
  readonly subject: Subject;
  readonly name: string;
  readonly role: 'editor' | 'viewer';
  readonly expiresAt?: Date;
}

/** Throws 400 if the User or Team named by `subject` does not exist. */
export async function requireSubjectExists(
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
export async function nameOfSubject(subject: Subject, teams: TeamRepository): Promise<string> {
  if (subject.type === 'user') return subject.id;
  const team = await teams.findById(subject.id);
  return team?.name ?? 'Deleted team';
}

export function expiresAtFrom(expiresInHours: number | undefined): Date | undefined {
  return expiresInHours === undefined ? undefined : new Date(Date.now() + expiresInHours * 3_600_000);
}

/** The Owner's grant is never listed as a Share. */
export function isSharedRole(grant: Grant): grant is Grant & { role: 'editor' | 'viewer' } {
  return grant.role !== 'owner';
}
