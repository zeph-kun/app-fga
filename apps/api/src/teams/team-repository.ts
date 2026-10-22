import type { Team } from './team.js';

/**
 * Where Teams are stored. Membership lives in the Authorizer, not here: this only
 * knows a Team's name and who owns it (who may rename it, delete it, and manage
 * its members).
 */
export abstract class TeamRepository {
  /** Inserts the team, or replaces the one with the same id. */
  abstract save(team: Team): Promise<void>;

  abstract findById(id: string): Promise<Team | undefined>;

  /** The teams that exist among `ids`; unknown ids are skipped. Order is not guaranteed. */
  abstract findByIds(ids: readonly string[]): Promise<Team[]>;

  abstract findByOwner(ownerId: string): Promise<Team[]>;

  /** Deleting an unknown id is a no-op. */
  abstract delete(id: string): Promise<void>;
}
