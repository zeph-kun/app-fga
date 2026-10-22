import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import type { AuthUser } from '../auth/access-token-verifier.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { parse } from '../http/parse.js';
import { shareSchema, usernameSchema } from '../http/schemas.js';
import { FoldersService } from './folders.service.js';

const nameSchema = z.object({ name: z.string().trim().min(1).max(200) });

@Controller('folders')
@UseGuards(JwtAuthGuard)
export class FoldersController {
  constructor(private readonly folders: FoldersService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.folders.list(user.id);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.folders.create(user.id, parse(nameSchema, body));
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.folders.get(user.id, id);
  }

  @Patch(':id')
  rename(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: unknown) {
    return this.folders.rename(user.id, id, parse(nameSchema, body));
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.folders.remove(user.id, id);
  }

  @Get(':id/shares')
  shares(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.folders.shares(user.id, id);
  }

  @Get(':id/access')
  accessList(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.folders.accessList(user.id, id);
  }

  @Post(':id/shares')
  @HttpCode(204)
  share(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: unknown) {
    return this.folders.share(user.id, id, parse(shareSchema, body));
  }

  @Delete(':id/shares/users/:userId')
  @HttpCode(204)
  unshareUser(@CurrentUser() user: AuthUser, @Param('id') id: string, @Param('userId') target: string) {
    return this.folders.unshare(user.id, id, { type: 'user', id: parse(usernameSchema, target) });
  }

  @Delete(':id/shares/teams/:teamId')
  @HttpCode(204)
  unshareTeam(@CurrentUser() user: AuthUser, @Param('id') id: string, @Param('teamId') teamId: string) {
    return this.folders.unshare(user.id, id, { type: 'team', id: teamId });
  }
}
