import { Module } from '@nestjs/common';
import { ResourceLifecycle } from './resource-lifecycle.js';

@Module({
  providers: [ResourceLifecycle],
  exports: [ResourceLifecycle],
})
export class LifecycleModule {}
