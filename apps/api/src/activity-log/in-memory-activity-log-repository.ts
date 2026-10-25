import type { ActivityEntry } from './activity-entry.js';
import { ActivityLogRepository } from './activity-log-repository.js';

/** Test adapter: same behavior as the Postgres one, no database (and no cascade from Documents and Folders). */
export class InMemoryActivityLogRepository extends ActivityLogRepository {
  private readonly entries: ActivityEntry[] = [];

  override add(entry: ActivityEntry): Promise<void> {
    this.entries.push(entry);
    return Promise.resolve();
  }

  override findByResource({ type, id }: ActivityEntry['resource'], limit: number): Promise<ActivityEntry[]> {
    const found = this.entries.filter((e) => e.resource.type === type && e.resource.id === id);
    return Promise.resolve(found.sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, limit));
  }
}
