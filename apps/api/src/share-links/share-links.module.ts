import { Module } from '@nestjs/common';
import { SharingModule } from '../sharing/sharing.module.js';
import { ShareLinksController } from './share-links.controller.js';
import { ShareLinks } from './share-links.js';

@Module({
  imports: [SharingModule],
  controllers: [ShareLinksController],
  providers: [ShareLinks],
})
export class ShareLinksModule {}
