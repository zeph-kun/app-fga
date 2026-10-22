import type { Team } from './team.js';
import { TeamRepository } from './team-repository.js';

/** Test adapter: same behavior as the Postgres one, no database. */
export class InMemoryTeamRepository extends TeamRepository {
  private readonly teams = new Map<string, Team>();

  override save(team: Team): Promise<void> {
    this.teams.set(team.id, team);
    return Promise.resolve();
  }

  override findById(id: string): Promise<Team | undefined> {
    return Promise.resolve(this.teams.get(id));
  }

  override findByIds(ids: readonly string[]): Promise<Team[]> {
    return Promise.resolve(ids.flatMap((id) => this.teams.get(id) ?? []));
  }

  override findByOwner(ownerId: string): Promise<Team[]> {
    return Promise.resolve([...this.teams.values()].filter((t) => t.ownerId === ownerId));
  }

  override delete(id: string): Promise<void> {
    this.teams.delete(id);
    return Promise.resolve();
  }
}
