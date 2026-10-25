import { Module } from '@nestjs/common';
import { ActivityLogModule } from '../activity-log/activity-log.module.js';
import { SharingModule } from '../sharing/sharing.module.js';
import { ShareLinksController } from './share-links.controller.js';
import { ShareLinks } from './share-links.js';

@Module({
  imports: [ActivityLogModule, SharingModule],
  controllers: [ShareLinksController],
  providers: [ShareLinks],
})
export class ShareLinksModule {}
