import { Module } from '@nestjs/common';
import { LifecycleModule } from '../lifecycle/lifecycle.module.js';
import { TeamsController } from './teams.controller.js';
import { TeamsService } from './teams.service.js';

@Module({
  imports: [LifecycleModule],
  controllers: [TeamsController],
  providers: [TeamsService],
})
export class TeamsModule {}
