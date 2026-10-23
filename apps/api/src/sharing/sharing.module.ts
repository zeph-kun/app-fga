import { Module } from '@nestjs/common';
import { Sharing } from './sharing.js';

@Module({
  providers: [Sharing],
  exports: [Sharing],
})
export class SharingModule {}
