import { Module } from '@nestjs/common';
import { Reconciler } from './reconciler.js';
import { ResourceLifecycle } from './resource-lifecycle.js';

@Module({
  providers: [ResourceLifecycle, Reconciler],
  exports: [ResourceLifecycle, Reconciler],
})
export class LifecycleModule {}
