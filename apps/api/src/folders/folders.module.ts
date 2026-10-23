import { Module } from '@nestjs/common';
import { LifecycleModule } from '../lifecycle/lifecycle.module.js';
import { SharingModule } from '../sharing/sharing.module.js';
import { FoldersController } from './folders.controller.js';
import { FoldersService } from './folders.service.js';

@Module({
  imports: [LifecycleModule, SharingModule],
  controllers: [FoldersController],
  providers: [FoldersService],
})
export class FoldersModule {}
