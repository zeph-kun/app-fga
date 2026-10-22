import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import type { AuthUser } from '../auth/access-token-verifier.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { parse } from '../http/parse.js';
import { usernameSchema } from '../http/schemas.js';
import { TeamsService } from './teams.service.js';

const nameSchema = z.object({ name: z.string().trim().min(1).max(200) });
const addMemberSchema = z.object({ userId: usernameSchema });

@Controller('teams')
@UseGuards(JwtAuthGuard)
export class TeamsController {
  constructor(private readonly teams: TeamsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.teams.list(user.id);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.teams.create(user.id, parse(nameSchema, body));
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.teams.get(user.id, id);
  }

  @Patch(':id')
  rename(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: unknown) {
    return this.teams.rename(user.id, id, parse(nameSchema, body));
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.teams.remove(user.id, id);
  }

  @Post(':id/members')
  @HttpCode(204)
  addMember(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: unknown) {
    return this.teams.addMember(user.id, id, parse(addMemberSchema, body).userId);
  }

  @Delete(':id/members/:userId')
  @HttpCode(204)
  removeMember(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('userId') target: string,
  ) {
    return this.teams.removeMember(user.id, id, parse(usernameSchema, target));
  }
}
