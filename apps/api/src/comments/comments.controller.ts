import { Body, Controller, Delete, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import type { AuthUser } from '../auth/access-token-verifier.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { parse } from '../http/parse.js';
import { commentSchema } from '../http/schemas.js';
import { CommentsService } from './comments.service.js';

@Controller('documents/:documentId/comments')
@UseGuards(JwtAuthGuard)
export class CommentsController {
  constructor(private readonly comments: CommentsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Param('documentId') documentId: string) {
    return this.comments.list(user.id, documentId);
  }

  @Post()
  add(@CurrentUser() user: AuthUser, @Param('documentId') documentId: string, @Body() body: unknown) {
    return this.comments.add(user.id, documentId, parse(commentSchema, body));
  }

  @Delete(':commentId')
  @HttpCode(204)
  remove(
    @CurrentUser() user: AuthUser,
    @Param('documentId') documentId: string,
    @Param('commentId') commentId: string,
  ) {
    return this.comments.remove(user.id, documentId, commentId);
  }
}
