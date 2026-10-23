import { Module } from '@nestjs/common';
import { SharingModule } from '../sharing/sharing.module.js';
import { FoldersController } from './folders.controller.js';
import { FoldersService } from './folders.service.js';

@Module({
  imports: [SharingModule],
  controllers: [FoldersController],
  providers: [FoldersService],
})
export class FoldersModule {}
