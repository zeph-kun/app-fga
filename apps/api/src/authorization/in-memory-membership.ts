import { Membership } from './membership.js';

/** Test adapter. Share one instance with the `InMemoryAuthorizer` that must see the same Teams. */
export class InMemoryMembership extends Membership {
  private readonly teams = new Map<string, Set<string>>();

  override members(teamId: string): Promise<string[]> {
    return Promise.resolve([...(this.teams.get(teamId) ?? [])]);
  }

  override add(teamId: string, userId: string): Promise<void> {
    this.teams.set(teamId, (this.teams.get(teamId) ?? new Set<string>()).add(userId));
    return Promise.resolve();
  }

  override remove(teamId: string, userId: string): Promise<void> {
    this.teams.get(teamId)?.delete(userId);
    return Promise.resolve();
  }

  override teamsOf(userId: string): Promise<string[]> {
    const ids = [...this.teams.entries()].filter(([, members]) => members.has(userId)).map(([id]) => id);
    return Promise.resolve(ids);
  }
}
