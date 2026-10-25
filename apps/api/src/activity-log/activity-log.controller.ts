import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import type { AuthUser } from '../auth/access-token-verifier.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { RateLimited } from '../http/user-throttler.guard.js';
import type { ActivityEntry } from './activity-entry.js';
import { ActivityLog } from './activity-log.js';

/** What the API tells: the resource is in the address already. */
const view = ({ id, actorId, at, event }: ActivityEntry) => ({ id, actorId, at, event });

@Controller()
@UseGuards(JwtAuthGuard)
export class ActivityLogController {
  constructor(private readonly activityLog: ActivityLog) {}

  @Get('documents/:id/activity')
  @RateLimited('share')
  async forDocument(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    const { entries, more } = await this.activityLog.forResource(user.id, { type: 'document', id });
    return { entries: entries.map(view), more };
  }

  @Get('folders/:id/activity')
  @RateLimited('share')
  async forFolder(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    const { entries, more } = await this.activityLog.forResource(user.id, { type: 'folder', id });
    return { entries: entries.map(view), more };
  }
}
