import { Module } from '@nestjs/common';
import { ActivityLogController } from './activity-log.controller.js';
import { ActivityLog } from './activity-log.js';

@Module({
  controllers: [ActivityLogController],
  providers: [ActivityLog],
  exports: [ActivityLog],
})
export class ActivityLogModule {}
