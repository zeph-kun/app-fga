import { Body, Controller, Delete, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import type { AuthUser } from '../auth/access-token-verifier.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { parse } from '../http/parse.js';
import { shareLinkSchema } from '../http/schemas.js';
import { RateLimited } from '../http/user-throttler.guard.js';
import { ShareLinks } from './share-links.js';

@Controller()
@UseGuards(JwtAuthGuard)
export class ShareLinksController {
  constructor(private readonly shareLinks: ShareLinks) {}

  @Post('documents/:id/share-links')
  @RateLimited('share')
  createForDocument(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: unknown) {
    return this.shareLinks.create(user.id, { type: 'document', id }, parse(shareLinkSchema, body));
  }

  @Get('documents/:id/share-links')
  @RateLimited('share')
  listForDocument(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.shareLinks.list(user.id, { type: 'document', id });
  }

  @Delete('documents/:id/share-links/:linkId')
  @HttpCode(204)
  @RateLimited('share')
  revokeForDocument(@CurrentUser() user: AuthUser, @Param('id') id: string, @Param('linkId') linkId: string) {
    return this.shareLinks.revoke(user.id, { type: 'document', id }, linkId);
  }

  @Post('folders/:id/share-links')
  @RateLimited('share')
  createForFolder(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: unknown) {
    return this.shareLinks.create(user.id, { type: 'folder', id }, parse(shareLinkSchema, body));
  }

  @Get('folders/:id/share-links')
  @RateLimited('share')
  listForFolder(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.shareLinks.list(user.id, { type: 'folder', id });
  }

  @Delete('folders/:id/share-links/:linkId')
  @HttpCode(204)
  @RateLimited('share')
  revokeForFolder(@CurrentUser() user: AuthUser, @Param('id') id: string, @Param('linkId') linkId: string) {
    return this.shareLinks.revoke(user.id, { type: 'folder', id }, linkId);
  }

  @Get('share-links/:token')
  @RateLimited('share')
  preview(@Param('token') token: string) {
    return this.shareLinks.preview(token);
  }

  @Post('share-links/:token/redeem')
  @HttpCode(200)
  @RateLimited('share')
  redeem(@CurrentUser() user: AuthUser, @Param('token') token: string) {
    return this.shareLinks.redeem(user.id, token);
  }
}
