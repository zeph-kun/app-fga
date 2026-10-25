import type { ActivityEntry } from './activity-entry.js';

/**
 * Where Activity log entries are stored. It knows nothing about who may read them: that is
 * `ActivityLog`'s job. Deleting a Document or Folder removes its entries in Postgres.
 */
export abstract class ActivityLogRepository {
  abstract add(entry: ActivityEntry): Promise<void>;

  /** The latest `limit` entries on a Document or Folder, newest first. */
  abstract findByResource(resource: ActivityEntry['resource'], limit: number): Promise<ActivityEntry[]>;
}
