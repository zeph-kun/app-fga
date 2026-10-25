import { randomUUID } from 'node:crypto';
import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Authorizer, documentRef, folderRef } from '../authorization/authorizer.js';
import type { ActivityEntry, ActivityEvent } from './activity-entry.js';
import { ActivityLogRepository } from './activity-log-repository.js';

/** How many entries the Owner reads; there is no pagination. */
const LATEST = 50;

/**
 * Recording and reading the changes to who has access to a Document or Folder (see ADR 0008).
 * Recording is best effort, so a change never fails because its entry could not be written.
 */
@Injectable()
export class ActivityLog {
  private readonly logger = new Logger(ActivityLog.name);

  constructor(
    private readonly authorizer: Authorizer,
    private readonly entries: ActivityLogRepository,
  ) {}

  /** Call it once the change has succeeded. `actorId` is the User who made it. */
  async record(actorId: string, resource: ActivityEntry['resource'], event: ActivityEvent): Promise<void> {
    try {
      await this.entries.add({ id: randomUUID(), resource, actorId, at: new Date(), event });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.error(`Could not record ${event.kind} on ${resource.type} ${resource.id}: ${reason}`);
    }
  }

  /** The latest entries, newest first. 404 for a User who cannot see the resource, 403 for one who cannot share it. */
  async forResource(
    userId: string,
    resource: ActivityEntry['resource'],
  ): Promise<{ entries: ActivityEntry[]; more: boolean }> {
    const ref = resource.type === 'document' ? documentRef(resource.id) : folderRef(resource.id);
    if (!(await this.authorizer.can(userId, 'can_view', ref))) throw new NotFoundException();
    if (!(await this.authorizer.can(userId, 'can_share', ref))) throw new ForbiddenException();
    // One more than shown tells whether there is more.
    const found = await this.entries.findByResource(resource, LATEST + 1);
    return { entries: found.slice(0, LATEST), more: found.length > LATEST };
  }
}
