import { Module } from '@nestjs/common';
import { ActivityLogModule } from '../activity-log/activity-log.module.js';
import { LifecycleModule } from '../lifecycle/lifecycle.module.js';
import { SharingModule } from '../sharing/sharing.module.js';
import { DocumentsController } from './documents.controller.js';
import { DocumentsService } from './documents.service.js';

@Module({
  imports: [ActivityLogModule, LifecycleModule, SharingModule],
  controllers: [DocumentsController],
  providers: [DocumentsService],
})
export class DocumentsModule {}
