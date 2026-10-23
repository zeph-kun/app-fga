import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import { Authorizer, organizationRef } from '../authorization/authorizer.js';
import type { AuthUser } from '../auth/access-token-verifier.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { parse } from '../http/parse.js';
import { shareSchema, usernameSchema } from '../http/schemas.js';
import { DocumentsService } from './documents.service.js';

const createSchema = z.object({
  title: z.string().min(1).max(200),
  content: z.string().max(50_000),
  folderId: z.string().uuid().nullish(),
});
const updateSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  content: z.string().max(50_000).optional(),
});
const moveSchema = z.object({ folderId: z.string().uuid().nullable() });

@Controller()
@UseGuards(JwtAuthGuard)
export class DocumentsController {
  constructor(
    private readonly documents: DocumentsService,
    private readonly authorizer: Authorizer,
  ) {}

  @Get('me')
  async me(@CurrentUser() user: AuthUser): Promise<AuthUser & { canCreateTeam: boolean }> {
    return { ...user, canCreateTeam: await this.authorizer.can(user.id, 'can_create_team', organizationRef()) };
  }

  @Get('documents')
  list(@CurrentUser() user: AuthUser) {
    return this.documents.list(user.id);
  }

  @Post('documents')
  create(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.documents.create(user.id, parse(createSchema, body));
  }

  @Get('documents/:id')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.documents.get(user.id, id);
  }

  @Patch('documents/:id')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: unknown) {
    return this.documents.update(user.id, id, parse(updateSchema, body));
  }

  @Put('documents/:id/folder')
  move(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: unknown) {
    return this.documents.move(user.id, id, parse(moveSchema, body).folderId);
  }

  @Delete('documents/:id')
  @HttpCode(204)
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.documents.remove(user.id, id);
  }

  @Get('documents/:id/shares')
  shares(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.documents.shares(user.id, id);
  }

  @Get('documents/:id/access')
  accessList(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.documents.accessList(user.id, id);
  }

  @Post('documents/:id/shares')
  @HttpCode(204)
  share(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: unknown) {
    return this.documents.share(user.id, id, parse(shareSchema, body));
  }

  @Delete('documents/:id/shares/users/:userId')
  @HttpCode(204)
  unshareUser(@CurrentUser() user: AuthUser, @Param('id') id: string, @Param('userId') target: string) {
    return this.documents.unshare(user.id, id, { type: 'user', id: parse(usernameSchema, target) });
  }

  @Delete('documents/:id/shares/teams/:teamId')
  @HttpCode(204)
  unshareTeam(@CurrentUser() user: AuthUser, @Param('id') id: string, @Param('teamId') teamId: string) {
    return this.documents.unshare(user.id, id, { type: 'team', id: teamId });
  }
}
